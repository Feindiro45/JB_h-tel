<?php

namespace App\Modules\Reservations\Domain;

use InvalidArgumentException;

/**
 * Remise demandée. Pourcentage en points de base (10,5 % = 1050), pour éviter tout calcul en
 * virgule flottante, ou montant fixe entier en FCFA.
 */
final readonly class Discount
{
    private function __construct(
        public DiscountType $type,
        public int $value,
        public string $reason,
    ) {}

    /** @param  string  $percent  Ex. « 10 », « 7.5 », « 33.33 » (2 décimales au plus). */
    public static function percent(string $percent, string $reason): self
    {
        if (! preg_match('/^(\d{1,3})(?:[.,](\d{1,2}))?$/', trim($percent), $m)) {
            throw new InvalidArgumentException("Pourcentage invalide : {$percent}");
        }
        $basisPoints = ((int) $m[1]) * 100 + (int) str_pad($m[2] ?? '0', 2, '0');

        return new self(DiscountType::Percent, $basisPoints, $reason);
    }

    public static function fixed(int $amountFcfa, string $reason): self
    {
        return new self(DiscountType::Fixed, $amountFcfa, $reason);
    }

    /** Valeur stockée dans `discount_value` (DECIMAL(12,2)) : pourcentage ou montant. */
    public function storedValue(): string
    {
        return $this->type === DiscountType::Percent
            ? sprintf('%d.%02d', intdiv($this->value, 100), $this->value % 100)
            : $this->value.'.00';
    }

    public static function fromStored(DiscountType $type, string $storedValue, string $reason): self
    {
        return $type === DiscountType::Percent
            ? self::percent($storedValue, $reason)
            : self::fixed((int) round((float) $storedValue), $reason);
    }

    /** « 10 % » ou « 5 000 FCFA ». */
    public function describe(): string
    {
        if ($this->type === DiscountType::Fixed) {
            return number_format($this->value, 0, ',', ' ').' FCFA';
        }
        $decimals = $this->value % 100 === 0 ? 0 : 2;

        return number_format($this->value / 100, $decimals, ',', ' ').' %';
    }
}
