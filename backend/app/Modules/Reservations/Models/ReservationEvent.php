<?php

namespace App\Modules\Reservations\Models;

use App\Modules\Reservations\Domain\OrganizerType;
use App\Modules\Reservations\DTO\EventData;
use Illuminate\Database\Eloquent\Model;

/**
 * Informations d'une réservation de salle de conférence (D-072), une ligne par réservation. Ce
 * n'est pas une entité adressée par l'API : elle est lue et écrite avec sa réservation.
 *
 * @property int $id
 * @property int $reservation_id
 * @property string $event_name
 * @property OrganizerType $organizer_type
 * @property string|null $organizer_type_other
 * @property string|null $organization_name
 * @property string|null $contact_name
 * @property string|null $contact_phone
 */
class ReservationEvent extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'reservation_id',
        'event_name',
        'organizer_type',
        'organizer_type_other',
        'organization_name',
        'contact_name',
        'contact_phone',
    ];

    /** @var array<string, mixed> */
    protected $attributes = [
        'organizer_type_other' => null,
        'organization_name' => null,
        'contact_name' => null,
        'contact_phone' => null,
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['organizer_type' => OrganizerType::class];
    }

    public function toData(): EventData
    {
        return new EventData(
            name: $this->event_name,
            organizerType: $this->organizer_type,
            organizerTypeOther: $this->organizer_type_other,
            organizationName: $this->organization_name,
            contactName: $this->contact_name,
            contactPhone: $this->contact_phone,
        );
    }

    /** @return array<string, mixed> Représentation JSON (fiche, listes, devis de la facture). */
    public function toPublicArray(): array
    {
        return [
            'name' => $this->event_name,
            'organizer_type' => $this->organizer_type->value,
            'organizer_type_label' => $this->toData()->organizerLabel(),
            'organizer_type_other' => $this->organizer_type_other,
            'organization_name' => $this->organization_name,
            'contact_name' => $this->contact_name,
            'contact_phone' => $this->contact_phone,
        ];
    }
}
