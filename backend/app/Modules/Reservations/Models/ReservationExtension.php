<?php

namespace App\Modules\Reservations\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use LogicException;

/**
 * Prolongation enregistrée d'un séjour (D-053) : période ajoutée, quantité, prix unitaire figé et
 * auteur. Sert à détailler la facture (séjour initial puis chaque prolongation). Ligne interne,
 * jamais exposée par son identifiant ; elle ne peut être ni modifiée ni supprimée.
 *
 * @property int $id
 * @property int $reservation_id
 * @property Carbon $previous_end_date
 * @property string|null $previous_end_time
 * @property Carbon $previous_blocked_until
 * @property Carbon $end_date
 * @property string|null $end_time
 * @property Carbon $blocked_until
 * @property int $added_quantity
 * @property int $unit_price_fcfa
 * @property int $amount_fcfa
 * @property int $previous_net_fcfa
 * @property int $net_fcfa
 * @property int $extended_by
 * @property Carbon $extended_at
 */
class ReservationExtension extends Model
{
    /** @var list<string> */
    protected $guarded = ['id'];

    /** @var array<string, mixed> */
    protected $attributes = ['previous_end_time' => null, 'end_time' => null];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'previous_end_date' => 'date',
            'previous_blocked_until' => 'datetime',
            'end_date' => 'date',
            'blocked_until' => 'datetime',
            'added_quantity' => 'integer',
            'unit_price_fcfa' => 'integer',
            'amount_fcfa' => 'integer',
            'previous_net_fcfa' => 'integer',
            'net_fcfa' => 'integer',
            'extended_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Une prolongation enregistrée ne peut pas être modifiée.'));
        static::deleting(fn () => throw new LogicException('Une prolongation enregistrée ne peut pas être supprimée.'));
    }
}
