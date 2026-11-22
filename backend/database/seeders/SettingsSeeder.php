<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Paramètres par défaut. `insertOrIgnore` : une valeur déjà modifiée par l'administrateur
 * n'est jamais écrasée. Les valeurs « PROVISOIRE » doivent être validées par l'hôtel
 * (docs/QUESTIONS.md) avant la mise en production.
 */
class SettingsSeeder extends Seeder
{
    /** @var array<string, array{value: mixed, description: string}> */
    public const DEFAULTS = [
        'billing.half_day_max_hours' => [
            'value' => 12,
            'description' => 'Durée maximale couverte par le forfait demi-journée, en heures (validé, D-007).',
        ],
        'reservations.missing_time_policy' => [
            'value' => 'FULL_DAY',
            'description' => 'PROVISOIRE (D-009, Q-02) : heure absente = blocage de 00:00 du début à la fin du jour de fin.',
        ],
        'discounts.cashier_max_percent' => [
            'value' => 10,
            'description' => 'PROVISOIRE (D-016, Q-06) : plafond de réduction de la caissière, en % du montant brut.',
        ],
        'discounts.percent_rounding' => [
            'value' => 'HALF_UP',
            'description' => 'PROVISOIRE (D-008, Q-05) : arrondi de la remise en pourcentage au FCFA le plus proche.',
        ],
        'billing.allow_overpayment' => [
            'value' => false,
            'description' => 'PROVISOIRE (D-014) : les paiements nets ne peuvent pas dépasser le montant dû.',
        ],
        'billing.invoice_number_prefix' => [
            'value' => 'FAC',
            'description' => 'PROVISOIRE (D-015, Q-09) : préfixe des numéros de facture (FAC-AAAA-NNNNNN).',
        ],
        'billing.credit_note_prefix' => [
            'value' => 'AV',
            'description' => 'PROVISOIRE (Q-09) : préfixe des numéros d’avoir (AV-AAAA-NNNNNN).',
        ],
        'billing.receipt_number_prefix' => [
            'value' => 'REC',
            'description' => 'PROVISOIRE : préfixe des numéros de reçu (REC-AAAA-NNNNNN).',
        ],
        'payments.methods' => [
            'value' => ['CASH', 'MOBILE_MONEY', 'CARD', 'BANK_TRANSFER'],
            'description' => 'PROVISOIRE (Q-11) : moyens de paiement acceptés.',
        ],
        'workstations.enforce_main_post' => [
            'value' => false,
            'description' => 'PROVISOIRE (D-062) : réservations et encaissements réservés au poste principal (désactivé tant que l’administrateur ne l’active pas).',
        ],
        'workstations.silent_after_minutes' => [
            'value' => 5,
            'description' => 'PROVISOIRE (D-062) : délai sans signal après lequel le poste principal est considéré hors ligne ; un transfert devient alors forcé.',
        ],
        'offline.allowed_operations' => [
            'value' => ['payment.record', 'reservation.create', 'customer.create', 'reservation.confirm', 'reservation.check-in', 'reservation.check-out', 'reservation.extend', 'reservation.cancel', 'reservation.modify', 'reservation.occupants', 'invoice.issue'],
            'description' => 'PROVISOIRE (N-02, D-064) : opérations permises sans Internet, toutes par défaut.',
        ],
        'offline.lock_after_minutes' => [
            'value' => 15,
            'description' => 'PROVISOIRE (N-05, D-064) : verrouillage de l’écran après ce délai d’inactivité hors ligne.',
        ],
        'offline.backup_reminder_minutes' => [
            'value' => 60,
            'description' => 'PROVISOIRE (N-06, D-064) : rappel d’exporter une sauvegarde quand une opération attend depuis ce délai.',
        ],
        'offline.provisional_prefix' => [
            'value' => 'LOC',
            'description' => 'PROVISOIRE (N-03, D-064) : préfixe des numéros provisoires (LOC-<poste>-<séquence>).',
        ],
    ];

    public function run(): void
    {
        $now = now();

        DB::table('settings')->insertOrIgnore(array_map(
            fn (string $key, array $setting) => [
                'key' => $key,
                'value' => json_encode($setting['value'], JSON_THROW_ON_ERROR),
                'description' => $setting['description'],
                'created_at' => $now,
                'updated_at' => $now,
            ],
            array_keys(self::DEFAULTS),
            self::DEFAULTS,
        ));
    }
}
