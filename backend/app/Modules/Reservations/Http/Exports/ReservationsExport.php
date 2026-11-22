<?php

namespace App\Modules\Reservations\Http\Exports;

use App\Modules\Reservations\Application\Queries\ReservationSearch;
use App\Modules\Reservations\Domain\ReservationStatus;
use App\Modules\Reservations\DTO\ReservationFilters;
use App\Modules\Reservations\Http\ReservationPresenter;
use App\Shared\Export\ExportContext;
use App\Shared\Export\Workbook;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Classeur Excel des réservations (filtres de l'écran) : tableau de bord (indicateurs et
 * graphiques), feuille des séjours et feuille des occupants. Rendu seulement : la recherche est
 * celle de l'écran (`ReservationSearch`), les lignes celles du présentateur JSON.
 */
final class ReservationsExport
{
    public const MODULE = 'reservations';

    /** Au-delà, l'export demande de restreindre les filtres (classeur trop lourd à ouvrir). */
    public const MAX_ROWS = 20000;

    public function __construct(
        private readonly ReservationSearch $search,
        private readonly ReservationPresenter $presenter,
    ) {}

    public function build(ReservationFilters $filters, ?Authenticatable $actor): Workbook
    {
        $query = $this->search->filtered($filters);
        /** @var list<array<string, mixed>> $stays */
        $stays = $query === null ? [] : $this->presenter->many($query->limit(self::MAX_ROWS)->get()->all());

        $book = new Workbook('Réservations', ExportContext::of($actor, [
            'Statut' => $filters->status?->label(),
            'Du' => $filters->from?->format('d/m/Y'),
            'Au' => $filters->to?->format('d/m/Y'),
            'Recherche' => $filters->search,
            'Forfait' => $filters->billingUnit?->label(),
        ]));
        $active = array_values(array_filter($stays, fn (array $s) => $s['status'] !== ReservationStatus::Cancelled->value));
        $sum = fn (array $list, string $key) => array_sum(array_map(fn (array $s) => (int) ($s['price'][$key] ?? 0), $list));
        $count = fn (string $value) => count(array_filter($stays, fn (array $s) => $s['status'] === $value));
        $cancelled = $count(ReservationStatus::Cancelled->value);

        $book->kpis([
            ['label' => 'Réservations', 'value' => count($stays), 'format' => Workbook::INTEGER, 'hint' => 'Selon les filtres de l’écran'],
            ['label' => 'Montant net des séjours', 'value' => $sum($active, 'net_fcfa'), 'format' => Workbook::FCFA, 'hint' => 'Hors réservations annulées'],
            ['label' => 'Remises accordées', 'value' => $sum($active, 'discount_fcfa'), 'format' => Workbook::FCFA, 'hint' => 'Sur les séjours non annulés', 'tone' => Workbook::GOLD],
            ['label' => 'Forfaits vendus', 'value' => $sum($active, 'quantity'), 'format' => Workbook::INTEGER, 'hint' => 'Journées et demi-journées'],
            ['label' => 'En cours', 'value' => $count(ReservationStatus::InProgress->value), 'format' => Workbook::INTEGER, 'hint' => 'Clients présents', 'tone' => 'C93644'],
            ['label' => 'À venir', 'value' => $count(ReservationStatus::Confirmed->value) + $count(ReservationStatus::Pending->value), 'format' => Workbook::INTEGER, 'hint' => 'Confirmées ou en attente', 'tone' => '2A78D6'],
            ['label' => 'Terminées', 'value' => $count(ReservationStatus::Completed->value), 'format' => Workbook::INTEGER, 'hint' => 'Départ enregistré'],
            ['label' => 'Taux d’annulation', 'value' => $stays === [] ? 0 : $cancelled / count($stays), 'format' => Workbook::PERCENT, 'hint' => "{$cancelled} annulée(s)", 'tone' => 'EDA100'],
        ]);

        $book->summary('Réservations par statut', 'Réservations', Workbook::group($stays, fn (array $s) => (string) $s['status_label']), 'pie');
        $book->summary(
            'Montant net par catégorie de chambre',
            'Montant net',
            Workbook::group($active, fn (array $s) => (string) ($s['room']['room_type']['label'] ?? 'Sans chambre'), fn (array $s) => (int) $s['price']['net_fcfa']),
            'bar',
            Workbook::FCFA,
        );
        $book->summary('Arrivées par mois', 'Réservations', Workbook::monthly($stays, fn (array $s) => (string) $s['period']['start_date']), 'column');
        $book->note('Montants en FCFA entiers, tels qu’enregistrés à la confirmation (tarif figé). Une réservation annulée ne doit plus rien.');

        $book->sheet('Réservations', [
            ['label' => 'Client', 'width' => 26],
            ['label' => 'Téléphone', 'width' => 16],
            ['label' => 'Chambre', 'width' => 10],
            ['label' => 'Catégorie', 'width' => 14],
            ['label' => 'Arrivée', 'type' => 'date'],
            ['label' => 'Heure d’arrivée', 'width' => 10],
            ['label' => 'Départ', 'type' => 'date'],
            ['label' => 'Heure de départ', 'width' => 10],
            ['label' => 'Forfait', 'width' => 14],
            ['label' => 'Quantité', 'type' => 'int'],
            ['label' => 'Prix unitaire', 'type' => 'fcfa', 'total' => false],
            ['label' => 'Brut', 'type' => 'fcfa'],
            ['label' => 'Remise', 'type' => 'fcfa'],
            ['label' => 'Motif de la remise', 'width' => 24],
            ['label' => 'Net', 'type' => 'fcfa'],
            ['label' => 'Montant dû', 'type' => 'fcfa'],
            ['label' => 'Statut', 'width' => 14],
            ['label' => 'Arrivée réelle', 'type' => 'datetime'],
            ['label' => 'Départ réel', 'type' => 'datetime'],
            ['label' => 'Créée le', 'type' => 'datetime'],
            ['label' => 'Motif d’annulation', 'width' => 26],
        ], array_map(fn (array $s) => [
            $s['customer']['full_name'] ?? '—',
            $s['customer']['phone'] ?? null,
            $s['room']['number'] ?? null,
            $s['room']['room_type']['label'] ?? null,
            $s['period']['start_date'],
            $s['period']['start_time'],
            $s['period']['end_date'],
            $s['period']['end_time'],
            $s['price']['billing_unit_label'],
            (int) $s['price']['quantity'],
            (int) $s['price']['unit_price_fcfa'],
            (int) $s['price']['gross_fcfa'],
            (int) $s['price']['discount_fcfa'],
            $s['price']['discount']['reason'] ?? null,
            (int) $s['price']['net_fcfa'],
            (int) $s['price']['amount_due_fcfa'],
            $s['status_label'],
            $s['checked_in_at'],
            $s['checked_out_at'],
            $s['created_at'],
            $s['cancellation_reason'],
        ], $stays), 'Un séjour par ligne ; filtres et totaux automatiques');

        $occupants = [];
        foreach ($stays as $s) {
            foreach ((array) ($s['occupants'] ?? []) as $occupant) {
                $occupants[] = [
                    $occupant['name'] ?? '',
                    ($occupant['is_primary'] ?? false) ? 'Titulaire' : 'Occupant',
                    $s['customer']['full_name'] ?? '—',
                    $s['room']['number'] ?? null,
                    $s['period']['start_date'],
                    $s['period']['end_date'],
                    $s['status_label'],
                ];
            }
        }
        $book->sheet('Occupants', [
            ['label' => 'Occupant', 'width' => 26],
            ['label' => 'Rôle', 'width' => 12],
            ['label' => 'Client du séjour', 'width' => 26],
            ['label' => 'Chambre', 'width' => 10],
            ['label' => 'Arrivée', 'type' => 'date'],
            ['label' => 'Départ', 'type' => 'date'],
            ['label' => 'Statut', 'width' => 14],
        ], $occupants, 'Personnes hébergées par séjour');

        return $book;
    }
}
