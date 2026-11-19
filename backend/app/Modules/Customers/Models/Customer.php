<?php

namespace App\Modules\Customers\Models;

use App\Shared\Models\HasPublicUuid;
use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Attributes\UseFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Fiche client (Décisions V6). Jamais supprimée : elle porte l'historique des réservations.
 * Collecte minimale : seuls le nom et le téléphone sont exigés (Q-10, provisoire).
 *
 * @property int $id
 * @property string $name
 * @property string|null $first_name
 * @property string|null $phone
 * @property string|null $email
 * @property bool $email_notifications
 * @property string|null $origin_city
 * @property string|null $origin_country
 * @property string|null $address
 * @property string|null $identification_type
 * @property string|null $identification_number
 * @property string|null $notes
 * @property int|null $created_by
 * @property Carbon|null $created_at
 */
#[UseFactory(CustomerFactory::class)]
class Customer extends Model
{
    /** @use HasFactory<CustomerFactory> */
    use HasFactory, HasPublicUuid;

    public const FIELDS = [
        'name', 'first_name', 'phone', 'email', 'origin_city', 'origin_country',
        'address', 'identification_type', 'identification_number', 'notes',
    ];

    /** @var list<string> */
    protected $fillable = [...self::FIELDS, 'email_notifications', 'created_by'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['email_notifications' => 'boolean'];
    }

    /** @var array<string, mixed> */
    protected $attributes = [
        'first_name' => null, 'phone' => null, 'email' => null, 'origin_city' => null, 'origin_country' => null,
        'address' => null, 'identification_type' => null, 'identification_number' => null, 'notes' => null,
        'email_notifications' => true,
    ];

    /** « NOM Prénoms », tel qu'affiché sur les écrans et les factures. */
    /**
     * Recherche d'un client (nom, prénoms, téléphone, e-mail, pièce), commune au répertoire et
     * aux filtres « client » des autres modules (contrat CustomerDirectory::searchIds).
     *
     * @param  Builder<Customer>  $query
     */
    public function scopeMatching(Builder $query, string $term): void
    {
        $like = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term).'%';
        $query->where(fn (Builder $q) => $q
            ->where('name', 'like', $like)
            ->orWhere('first_name', 'like', $like)
            ->orWhere('phone', 'like', $like)
            ->orWhere('email', 'like', $like)
            ->orWhere('identification_number', 'like', $like));
    }

    public function fullName(): string
    {
        return trim($this->name.' '.($this->first_name ?? ''));
    }
}
