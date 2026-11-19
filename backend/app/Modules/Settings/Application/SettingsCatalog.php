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
    /**
     * @var array<string, array{label: string, status: 'VALIDATED'|'PROVISIONAL', reference: string, type: 'integer'|'methods'|'text'|'boolean'|'choice', editable: bool, unit?: string, min?: int, max?: int, options?: array<string, string>, help: string}>
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
    ];

    /** @return array{label: string, status: 'VALIDATED'|'PROVISIONAL', reference: string, type: 'integer'|'methods'|'text'|'boolean'|'choice', editable: bool, unit?: string, min?: int, max?: int, options?: array<string, string>, help: string}|null */
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
            'payments.methods' => [
                'value' => ['required', 'array', 'min:1'],
                'value.*' => ['string', 'distinct', 'in:'.implode(',', array_keys(PaymentMethods::LABELS))],
            ],
            default => [],
        };
    }
}
