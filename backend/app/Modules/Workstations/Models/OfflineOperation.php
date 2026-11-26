<?php

namespace App\Modules\Workstations\Models;

use App\Modules\Identity\Models\User;
use App\Shared\Models\HasPublicUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Opération faite hors ligne puis reçue par le serveur (lot 4A.4, D-064) : acceptée, doublon
 * (clé d'idempotence déjà enregistrée, rien de créé deux fois) ou refusée avec sa cause. Les refus
 * sont « à examiner » par l'administrateur, qui note s'il a ressaisi l'opération ou confirmé le
 * rejet. Jamais supprimée.
 *
 * @property int $id
 * @property string $uuid
 * @property string $idempotency_key
 * @property int $user_id
 * @property int|null $workstation_id
 * @property string $kind
 * @property string $label
 * @property string $method
 * @property string $path
 * @property Carbon|null $created_offline_at
 * @property Carbon $received_at
 * @property int $attempts
 * @property string $outcome
 * @property int $http_status
 * @property string|null $reason_title
 * @property string|null $reason
 * @property string|null $reason_code
 * @property string|null $review_status
 * @property int|null $reviewed_by
 * @property Carbon|null $reviewed_at
 * @property string|null $review_reason
 */
class OfflineOperation extends Model
{
    use HasPublicUuid;

    public const ACCEPTED = 'ACCEPTED';

    public const DUPLICATE = 'DUPLICATE';

    public const REJECTED = 'REJECTED';

    public const TO_REVIEW = 'TO_REVIEW';

    public const REENTERED = 'REENTERED';

    public const REJECTION_CONFIRMED = 'REJECTED';

    public const OUTCOME_LABELS = [
        self::ACCEPTED => 'Acceptée',
        self::DUPLICATE => 'Doublon évité',
        self::REJECTED => 'Refusée',
    ];

    public const REVIEW_LABELS = [
        self::TO_REVIEW => 'À examiner',
        self::REENTERED => 'Ressaisie',
        self::REJECTION_CONFIRMED => 'Rejet confirmé',
    ];

    /**
     * Opérations possibles hors ligne (N-02) ; même liste que le paramètre
     * `offline.allowed_operations` du module Paramètres.
     */
    public const KIND_LABELS = [
        'payment.record' => 'Encaissement',
        'reservation.create' => 'Nouvelle réservation',
        'customer.create' => 'Nouveau client',
        'reservation.confirm' => 'Confirmation d’une réservation',
        'reservation.check-in' => 'Arrivée',
        'reservation.check-out' => 'Départ',
        'reservation.extend' => 'Prolongation',
        'reservation.cancel' => 'Annulation',
        'reservation.modify' => 'Modification d’une réservation',
        'reservation.occupants' => 'Occupants',
        'invoice.issue' => 'Facture provisoire',
    ];

    /** @var list<string> */
    protected $guarded = ['id'];

    /** @var array<string, mixed> */
    protected $attributes = [
        'workstation_id' => null,
        'created_offline_at' => null,
        'attempts' => 1,
        'reason_title' => null,
        'reason' => null,
        'reason_code' => null,
        'review_status' => null,
        'reviewed_by' => null,
        'reviewed_at' => null,
        'review_reason' => null,
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'created_offline_at' => 'datetime',
            'received_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'attempts' => 'integer',
            'http_status' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Workstation, $this> */
    public function workstation(): BelongsTo
    {
        return $this->belongsTo(Workstation::class);
    }

    /** @return BelongsTo<User, $this> */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
