<?php

namespace Tests\Unit\Reservations;

use App\Modules\Reservations\Domain\Billing\HalfDayPolicy;
use App\Modules\Reservations\Domain\Discount;
use App\Modules\Reservations\Domain\PriceCalculator;
use App\Shared\Exceptions\BusinessRuleException;
use PHPUnit\Framework\TestCase;

class PricingTest extends TestCase
{
    public function test_price_is_unit_price_times_quantity_in_integers(): void
    {
        $price = (new PriceCalculator)->compute(30000, 3, null);

        $this->assertSame(90000, $price->grossFcfa);
        $this->assertSame(0, $price->discountFcfa);
        $this->assertSame(90000, $price->netFcfa);
    }

    public function test_percent_discount_rounds_half_up_to_the_fcfa(): void
    {
        $calculator = new PriceCalculator;

        $this->assertSame(45000, $calculator->compute(50000, 1, Discount::percent('10', 'x'))->netFcfa);
        $this->assertSame(2250, $calculator->compute(30000, 1, Discount::percent('7.5', 'x'))->discountFcfa);
        // 33,33 % de 10 001 = 3 333,333… → 3 333 ; 2,5 % de 33 = 0,825 → 1.
        $this->assertSame(3333, $calculator->compute(10001, 1, Discount::percent('33.33', 'x'))->discountFcfa);
        $this->assertSame(1, $calculator->compute(33, 1, Discount::percent('2,5', 'x'))->discountFcfa);
        $this->assertSame(0, $calculator->compute(50000, 1, Discount::percent('100', 'x'))->netFcfa);
    }

    public function test_fixed_discount_cannot_exceed_the_gross_amount(): void
    {
        $this->assertSame(45000, (new PriceCalculator)->compute(50000, 1, Discount::fixed(5000, 'x'))->netFcfa);

        $this->expectException(BusinessRuleException::class);
        (new PriceCalculator)->compute(50000, 1, Discount::fixed(50001, 'x'));
    }

    public function test_discount_storage_round_trip_and_labels(): void
    {
        $percent = Discount::percent('7.5', 'Promo');
        $this->assertSame('7.50', $percent->storedValue());
        $this->assertSame('7,50 %', $percent->describe());
        $this->assertSame('10 %', Discount::percent('10', 'x')->describe());
        $this->assertSame('5 000 FCFA', Discount::fixed(5000, 'x')->describe());
        $this->assertEquals($percent, Discount::fromStored($percent->type, $percent->storedValue(), 'Promo'));
    }

    public function test_half_day_policy_covers_up_to_12_hours_per_unit(): void
    {
        $policy = new HalfDayPolicy(12);

        $this->assertSame(720, $policy->maxCoveredMinutes(1));
        $this->assertSame(1, $policy->requiredQuantity(720));
        $this->assertSame(2, $policy->requiredQuantity(721));
        $this->assertSame(3, $policy->requiredQuantity(26 * 60));
    }
}
