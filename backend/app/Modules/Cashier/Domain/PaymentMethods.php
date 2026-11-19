<?php

namespace App\Modules\Cashier\Domain;

use App\Shared\Settings\SettingsRepository;

/**
 * Moyens de paiement acceptés : liste paramétrable `payments.methods` (provisoire, Q-11).
 * Les codes inconnus du référentiel gardent leur code comme libellé.
 */
final class PaymentMethods
{
    public const LABELS = [
        'CASH' => 'Espèces',
        'MOBILE_MONEY' => 'Mobile money',
        'CARD' => 'Carte bancaire',
        'BANK_TRANSFER' => 'Virement',
    ];

    public function __construct(private readonly SettingsRepository $settings) {}

    /** @return list<string> */
    public function accepted(): array
    {
        $methods = $this->settings->get('payments.methods', array_keys(self::LABELS));

        return is_array($methods) ? array_values(array_filter($methods, 'is_string')) : array_keys(self::LABELS);
    }

    public static function label(string $method): string
    {
        return self::LABELS[$method] ?? $method;
    }
}
