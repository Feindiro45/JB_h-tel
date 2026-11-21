<?php

namespace App\Modules\Identity\Domain;

/**
 * Catalogue des permissions (spatie/laravel-permission, garde `web`).
 * Les autorisations sont toujours vérifiées côté serveur ; l'interface ne fait que les refléter.
 */
enum PermissionName: string
{
    case UsersView = 'users.view';
    case UsersManage = 'users.manage';
    case RolesManage = 'roles.manage';
    case CustomersView = 'customers.view';
    case CustomersManage = 'customers.manage';
    case RoomsView = 'rooms.view';
    case RoomsManage = 'rooms.manage';
    case RatesView = 'rates.view';
    case RatesManage = 'rates.manage';
    case ReservationsView = 'reservations.view';
    case ReservationsCreate = 'reservations.create';
    case ReservationsUpdate = 'reservations.update';
    case ReservationsCancel = 'reservations.cancel';
    case ReservationsCheckInOut = 'reservations.check_in_out';
    case DiscountsApply = 'discounts.apply';
    case DiscountsOverrideCap = 'discounts.override_cap';
    case PaymentsView = 'payments.view';
    case PaymentsRecord = 'payments.record';
    case PaymentsCancel = 'payments.cancel';
    case RefundsCreate = 'refunds.create';
    case InvoicesView = 'invoices.view';
    case InvoicesIssue = 'invoices.issue';
    case InvoicesCredit = 'invoices.credit';
    case ReportsView = 'reports.view';
    case ReportsExport = 'reports.export';
    case SettingsManage = 'settings.manage';
    case AuditView = 'audit.view';
    case RecordsDelete = 'records.delete';
    case WorkstationsManage = 'workstations.manage';

    public function label(): string
    {
        return match ($this) {
            self::UsersView => 'Consulter les utilisateurs',
            self::UsersManage => 'Créer et modifier les utilisateurs',
            self::RolesManage => 'Gérer les rôles et permissions',
            self::CustomersView => 'Consulter les clients',
            self::CustomersManage => 'Créer et modifier les clients',
            self::RoomsView => 'Consulter les chambres',
            self::RoomsManage => 'Gérer les chambres et types de chambre',
            self::RatesView => 'Consulter les tarifs',
            self::RatesManage => 'Modifier les tarifs',
            self::ReservationsView => 'Consulter les réservations',
            self::ReservationsCreate => 'Créer des réservations',
            self::ReservationsUpdate => 'Modifier et prolonger des réservations',
            self::ReservationsCancel => 'Annuler des réservations',
            self::ReservationsCheckInOut => 'Enregistrer les arrivées et départs',
            self::DiscountsApply => 'Appliquer une réduction (dans le plafond)',
            self::DiscountsOverrideCap => 'Appliquer une réduction au-delà du plafond',
            self::PaymentsView => 'Consulter les encaissements',
            self::PaymentsRecord => 'Enregistrer des encaissements',
            self::PaymentsCancel => 'Annuler un encaissement',
            self::RefundsCreate => 'Effectuer des remboursements',
            self::InvoicesView => 'Consulter les factures et reçus',
            self::InvoicesIssue => 'Émettre des factures',
            self::InvoicesCredit => 'Émettre des avoirs',
            self::ReportsView => 'Consulter le tableau de bord et les rapports',
            self::ReportsExport => 'Exporter les rapports',
            self::SettingsManage => 'Modifier les paramètres',
            self::AuditView => "Consulter le journal d'audit",
            self::RecordsDelete => 'Supprimer définitivement des saisies',
            self::WorkstationsManage => 'Gérer les postes de caisse et désigner le poste principal',
        };
    }

    /**
     * Réservées au rôle administrateur, jamais attribuables à un autre rôle (D-058).
     *
     * @return list<self>
     */
    public static function adminOnly(): array
    {
        return [self::RecordsDelete, self::WorkstationsManage];
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $permission) => $permission->value, self::cases());
    }
}
