<?php

namespace App\Shared\Settings;

use Throwable;

/**
 * Informations de l'établissement (D-073, demande de l'utilisateur du 25/11/2026) : nom, ville,
 * adresse, téléphone, e-mail, NIF et RCCM, imprimés en tête des factures et reçus et repris dans
 * les e-mails. L'administrateur les modifie dans Paramètres (clés `hotel.*`) ; à défaut, ce sont
 * les valeurs du serveur (`config/jbhotel.php`, `.env`). Une facture fige ces valeurs à son
 * émission : les modifier ne change pas les factures déjà émises.
 */
final class HotelIdentity
{
    public const FIELDS = ['name', 'address', 'city', 'phone', 'email', 'tax_id', 'trade_register'];

    public function __construct(private readonly SettingsRepository $settings) {}

    /** @return array<string, string|null> */
    public function toArray(): array
    {
        $config = (array) config('jbhotel.hotel');
        $identity = [];
        foreach (self::FIELDS as $field) {
            $fallback = is_string($config[$field] ?? null) && trim($config[$field]) !== '' ? trim($config[$field]) : null;
            try {
                $value = $this->settings->get("hotel.{$field}", $fallback);
            } catch (Throwable) {
                // Base indisponible (page d'erreur, maintenance) : valeurs du serveur.
                $value = $fallback;
            }
            $identity[$field] = is_string($value) && trim($value) !== '' ? trim($value) : null;
        }
        $identity['name'] ??= 'JB Hôtel';

        return $identity;
    }

    public function name(): string
    {
        return $this->toArray()['name'] ?? 'JB Hôtel';
    }
}
