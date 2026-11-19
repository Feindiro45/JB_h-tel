<?php

namespace App\Modules\Identity\Domain;

/**
 * Rôles V1 : administrateur et caissière (cahier des charges, « Acteurs »).
 * Un utilisateur a un seul rôle.
 */
enum RoleName: string
{
    case Admin = 'admin';
    case Cashier = 'caissiere';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Administrateur',
            self::Cashier => 'Caissière',
        };
    }

    /**
     * Permissions attribuées à la création du rôle. L'administrateur a toujours tout ;
     * celles de la caissière restent modifiables par l'administrateur.
     *
     * Provisoire (Q-08, Q-14) : remboursements et annulations d'encaissement réservés à l'administrateur.
     *
     * @return list<PermissionName>
     */
    public function defaultPermissions(): array
    {
        return match ($this) {
            self::Admin => PermissionName::cases(),
            self::Cashier => [
                PermissionName::CustomersView,
                PermissionName::CustomersManage,
                PermissionName::RoomsView,
                PermissionName::RatesView,
                PermissionName::ReservationsView,
                PermissionName::ReservationsCreate,
                PermissionName::ReservationsUpdate,
                PermissionName::ReservationsCancel,
                PermissionName::ReservationsCheckInOut,
                PermissionName::DiscountsApply,
                PermissionName::PaymentsView,
                PermissionName::PaymentsRecord,
                PermissionName::InvoicesView,
                PermissionName::InvoicesIssue,
                PermissionName::ReportsView,
            ],
        };
    }
}
