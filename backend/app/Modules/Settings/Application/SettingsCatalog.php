<?php

namespace App\Modules\Settings\Application;

use App\Modules\Cashier\Domain\PaymentMethods;

/**
 * Catalogue des paramètres affichés à l'administrateur (D-042).
 *
 * Seuls les paramètres **provisoires** que le code applique sans risque sont modifiables depuis
 * l'écran. Les règles validées, la numérotation des documents (continuité des numéros) et
 * l'interdiction du trop-perçu (règle de caisse) restent en lecture seule : les changer demande
 * une décision de l'hôtel puis une évolution contrôlée.
 */
final class SettingsCatalog
{
    /** Opérations possibles hors ligne (N-02), dans l'ordre d'affichage. */
    public const OFFLINE_OPERATIONS = [
        'payment.record' => 'Encaissement',
        'reservation.create' => 'Nouvelle réservation',
        'customer.create' => 'Nouveau client',
        'reservation.confirm' => 'Confirmation d’une réservation',
        'reservation.check-in' => 'Arrivée',
        'reservation.check-out' => 'Départ',
        'reservation.extend' => 'Prolongation',
        'reservation.cancel' => 'Annulation',
        'reservation.modify' => 'Modification d’une réservation',
        'reservation.occupants' => 'Occupants',
        'invoice.issue' => 'Facture provisoire (FAC-LOC-…)',
    ];

    /**
     * @var array<string, array{label: string, status: 'VALIDATED'|'PROVISIONAL', reference: string, type: 'integer'|'methods'|'choices'|'text'|'boolean'|'choice', editable: bool, unit?: string, min?: int, max?: int, options?: array<string, string>, help: string}>
     */
    public const DEFINITIONS = [
        'discounts.cashier_max_percent' => [
            'label' => 'Plafond de remise de la caissière',
            'status' => 'PROVISIONAL',
            'reference' => 'D-016 · Q-06',
            'type' => 'integer',
            'editable' => true,
            'unit' => '%',
            'min' => 0,
            'max' => 100,
            'help' => 'Au-delà, la remise exige le droit « dépasser le plafond de remise » (administrateur).',
        ],
        'payments.methods' => [
            'label' => 'Moyens de paiement acceptés',
            'status' => 'PROVISIONAL',
            'reference' => 'Q-11',
            'type' => 'methods',
            'editable' => true,
            'options' => PaymentMethods::LABELS,
            'help' => 'Proposés à l’encaissement. Les encaissements déjà enregistrés gardent leur moyen.',
        ],
        'billing.half_day_max_hours' => [
            'label' => 'Durée maximale du forfait demi-journée',
            'status' => 'VALIDATED',
            'reference' => 'D-007',
            'type' => 'integer',
            'editable' => false,
            'unit' => 'h',
            'help' => 'Règle validée : jusqu’à 12 h incluses, puis alerte et prolongation explicite.',
        ],
        'reservations.missing_time_policy' => [
            'label' => 'Période bloquée sans heure saisie',
            'status' => 'PROVISIONAL',
            'reference' => 'D-009 · Q-02',
            'type' => 'choice',
            'editable' => false,
            'options' => ['FULL_DAY' => 'Journée entière (de 00:00 au soir du dernier jour)'],
            'help' => 'Seule politique disponible tant que l’hôtel n’a pas tranché (Q-02, Q-03).',
        ],
        'discounts.percent_rounding' => [
            'label' => 'Arrondi des remises en pourcentage',
            'status' => 'PROVISIONAL',
            'reference' => 'D-008 · Q-05',
            'type' => 'choice',
            'editable' => false,
            'options' => ['HALF_UP' => 'Au FCFA le plus proche'],
            'help' => 'Les montants sont toujours des FCFA entiers.',
        ],
        'billing.allow_overpayment' => [
            'label' => 'Trop-perçu autorisé',
            'status' => 'PROVISIONAL',
            'reference' => 'D-014',
            'type' => 'boolean',
            'editable' => false,
            'help' => 'Non : l’encaissé net ne peut jamais dépasser le montant dû (règle de caisse).',
        ],
        'billing.invoice_number_prefix' => [
            'label' => 'Préfixe des factures',
            'status' => 'PROVISIONAL',
            'reference' => 'D-015 · Q-09',
            'type' => 'text',
            'editable' => false,
            'help' => 'Fixe pour garantir une numérotation continue (FAC-AAAA-NNNNNN).',
        ],
        'billing.credit_note_prefix' => [
            'label' => 'Préfixe des avoirs',
            'status' => 'PROVISIONAL',
            'reference' => 'Q-09',
            'type' => 'text',
            'editable' => false,
            'help' => 'Fixe pour garantir une numérotation continue (AV-AAAA-NNNNNN).',
        ],
        'billing.receipt_number_prefix' => [
            'label' => 'Préfixe des reçus',
            'status' => 'PROVISIONAL',
            'reference' => 'D-035',
            'type' => 'text',
            'editable' => false,
            'help' => 'Fixe pour garantir une numérotation continue (REC-AAAA-NNNNNN).',
        ],
        'workstations.enforce_main_post' => [
            'label' => 'Écritures réservées au poste principal',
            'status' => 'PROVISIONAL',
            'reference' => 'D-062',
            'type' => 'boolean',
            'editable' => true,
            'help' => 'Oui : réservations et encaissements refusés sur les autres postes. Sans effet tant qu’aucun poste principal n’est désigné.',
        ],
        'workstations.silent_after_minutes' => [
            'label' => 'Poste principal silencieux après',
            'status' => 'PROVISIONAL',
            'reference' => 'D-062',
            'type' => 'integer',
            'editable' => true,
            'unit' => 'min',
            'min' => 1,
            'max' => 120,
            'help' => 'Sans signal depuis ce délai, le poste principal est affiché hors ligne et son remplacement devient un transfert forcé, avec motif.',
        ],
        'offline.allowed_operations' => [
            'label' => 'Opérations permises sans Internet',
            'status' => 'PROVISIONAL',
            'reference' => 'N-02 · D-064',
            'type' => 'choices',
            'editable' => true,
            'options' => self::OFFLINE_OPERATIONS,
            'help' => 'Hors ligne, les opérations décochées sont refusées sur le poste avec un message clair ; en ligne, rien ne change. Le serveur revérifie toujours tout à l’envoi.',
        ],
        'offline.lock_after_minutes' => [
            'label' => 'Verrouillage hors ligne après',
            'status' => 'PROVISIONAL',
            'reference' => 'N-05 · D-064',
            'type' => 'integer',
            'editable' => true,
            'unit' => 'min',
            'min' => 1,
            'max' => 240,
            'help' => 'Sans activité pendant ce délai hors ligne, l’écran se verrouille et le mot de passe est redemandé. Aucune durée maximale hors ligne (décision du 22/11/2026).',
        ],
        'offline.backup_reminder_minutes' => [
            'label' => 'Rappel de sauvegarde après',
            'status' => 'PROVISIONAL',
            'reference' => 'N-06 · D-064',
            'type' => 'integer',
            'editable' => true,
            'unit' => 'min',
            'min' => 15,
            'max' => 1440,
            'help' => 'Quand une opération attend l’envoi depuis ce délai sans figurer dans une sauvegarde, le poste rappelle d’exporter une sauvegarde chiffrée.',
        ],
        'offline.provisional_prefix' => [
            'label' => 'Préfixe des numéros provisoires',
            'status' => 'PROVISIONAL',
            'reference' => 'N-03 · D-064',
            'type' => 'text',
            'editable' => true,
            'help' => 'Reçus et factures émis hors ligne : <préfixe>-<poste>-<séquence>, puis FAC-<préfixe>-… pour une facture. 2 à 5 lettres majuscules.',
        ],
    ];

    /** @return array{label: string, status: 'VALIDATED'|'PROVISIONAL', reference: string, type: 'integer'|'methods'|'choices'|'text'|'boolean'|'choice', editable: bool, unit?: string, min?: int, max?: int, options?: array<string, string>, help: string}|null */
    public static function definition(string $key): ?array
    {
        return self::DEFINITIONS[$key] ?? null;
    }

    /**
     * Règles de validation de la nouvelle valeur d'un paramètre modifiable.
     *
     * @return array<string, list<mixed>>
     */
    public static function rules(string $key): array
    {
        return match ($key) {
            'discounts.cashier_max_percent' => ['value' => ['required', 'integer', 'min:0', 'max:100']],
            'workstations.enforce_main_post' => ['value' => ['required', 'boolean']],
            'workstations.silent_after_minutes' => ['value' => ['required', 'integer', 'min:1', 'max:120']],
            'offline.allowed_operations' => [
                'value' => ['present', 'array'],
                'value.*' => ['string', 'distinct', 'in:'.implode(',', array_keys(self::OFFLINE_OPERATIONS))],
            ],
            'offline.lock_after_minutes' => ['value' => ['required', 'integer', 'min:1', 'max:240']],
            'offline.backup_reminder_minutes' => ['value' => ['required', 'integer', 'min:15', 'max:1440']],
            'offline.provisional_prefix' => ['value' => ['required', 'string', 'regex:/^[A-Z]{2,5}$/']],
            'payments.methods' => [
                'value' => ['required', 'array', 'min:1'],
                'value.*' => ['string', 'distinct', 'in:'.implode(',', array_keys(PaymentMethods::LABELS))],
            ],
            default => [],
        };
    }
}
