<?php

namespace App\Shared\Offline;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Opération faite hors ligne et rejouée par un poste (lot 4A, D-064) : en-tête `X-Offline-Replay`,
 * base64 (URL) d'un JSON {kind, label, created_at}. Lue par le journal des rejeus et par le calcul
 * du prix (N-09 : tarif en vigueur au moment où l'opération a été faite sur le poste).
 */
final readonly class OfflineReplay
{
    public const HEADER = 'X-Offline-Replay';

    /** Ancienneté maximale admise pour le moment de l'opération (coupure d'un mois, avec marge). */
    public const MAX_AGE_DAYS = 62;

    private function __construct(
        public string $kind,
        public string $label,
        public ?Carbon $createdAt,
    ) {}

    public static function fromRequest(?Request $request): ?self
    {
        return $request === null ? null : self::decode((string) $request->header(self::HEADER, ''));
    }

    public static function decode(string $header): ?self
    {
        if ($header === '' || strlen($header) > 2000) {
            return null;
        }
        $json = base64_decode(strtr($header, '-_', '+/'), true);
        $data = $json === false ? null : json_decode($json, true);
        if (! is_array($data) || ! is_string($data['kind'] ?? null) || ! preg_match('/^[a-z][a-z.-]{2,39}$/', $data['kind'])) {
            return null;
        }
        $label = is_string($data['label'] ?? null) && trim($data['label']) !== '' ? $data['label'] : $data['kind'];
        $created = null;
        if (is_string($data['created_at'] ?? null)) {
            try {
                $created = Carbon::parse($data['created_at'])->setTimezone((string) config('app.timezone'));
            } catch (\Throwable) {
                $created = null;
            }
        }

        return new self($data['kind'], mb_substr($label, 0, 255), $created);
    }

    /**
     * Moment retenu pour le prix (N-09) : celui de l'opération sur le poste, borné ; `null` hors
     * rejeu, ou si la date est dans le futur ou trop ancienne (le prix suit alors l'heure du serveur).
     */
    public function pricedAt(?Carbon $now = null): ?Carbon
    {
        $now ??= now();
        if ($this->createdAt === null || $this->createdAt->gt($now) || $this->createdAt->lt($now->copy()->subDays(self::MAX_AGE_DAYS))) {
            return null;
        }

        return $this->createdAt;
    }
}
