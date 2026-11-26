<?php

namespace App\Modules\Sync\Domain;

use App\Modules\Identity\Domain\PermissionName;
use App\Modules\Identity\Models\User;

/**
 * Données suivies par le journal des changements (D-069) et droit nécessaire pour voir qu'elles
 * ont changé. La table d'origine est lue sur l'événement Eloquent, sans dépendre des modules.
 */
enum SyncEntity: string
{
    case Customer = 'customer';
    case Room = 'room';
    case RoomType = 'room_type';
    case RoomRate = 'room_rate';
    case Reservation = 'reservation';
    case ReservationExtension = 'reservation_extension';
    case ReservationOccupant = 'reservation_occupant';
    case Payment = 'payment';
    case Refund = 'refund';
    case Invoice = 'invoice';
    case User = 'user';
    case Workstation = 'workstation';
    case Setting = 'setting';
    case Role = 'role';

    private const TABLES = [
        'customers' => 'customer',
        'rooms' => 'room',
        'room_types' => 'room_type',
        'room_rates' => 'room_rate',
        'reservations' => 'reservation',
        'reservation_extensions' => 'reservation_extension',
        'reservation_occupants' => 'reservation_occupant',
        'payments' => 'payment',
        'refunds' => 'refund',
        'invoices' => 'invoice',
        'users' => 'user',
        'workstation_assignments' => 'workstation',
    ];

    /** Paramètres et droits des rôles : écrits hors Eloquent, repérés par leur ligne d'audit. */
    private const AUDITED = ['setting' => 'setting', 'role' => 'role'];

    public static function forTable(string $table): ?self
    {
        $entity = self::TABLES[$table] ?? null;

        return $entity === null ? null : self::from($entity);
    }

    public static function forAuditedType(string $type): ?self
    {
        $entity = self::AUDITED[$type] ?? null;

        return $entity === null ? null : self::from($entity);
    }

    /** `null` : visible de tout utilisateur connecté (ses propres droits peuvent avoir changé). */
    public function permission(): ?PermissionName
    {
        return match ($this) {
            self::Customer => PermissionName::CustomersView,
            self::Room, self::RoomType => PermissionName::RoomsView,
            self::RoomRate => PermissionName::RatesView,
            self::Reservation, self::ReservationExtension, self::ReservationOccupant => PermissionName::ReservationsView,
            self::Payment, self::Refund => PermissionName::PaymentsView,
            self::Invoice => PermissionName::InvoicesView,
            self::User => PermissionName::UsersView,
            self::Workstation => PermissionName::WorkstationsManage,
            self::Setting => PermissionName::SettingsManage,
            self::Role => null,
        };
    }

    /** @return list<string> */
    public static function visibleTo(User $user): array
    {
        $visible = [];
        foreach (self::cases() as $entity) {
            $permission = $entity->permission();
            if ($permission === null || $user->can($permission->value)) {
                $visible[] = $entity->value;
            }
        }

        return $visible;
    }
}
