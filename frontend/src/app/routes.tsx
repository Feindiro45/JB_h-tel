import type { ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import {
  ForgotPasswordPage,
  LoginPage,
  RequireAuth,
  RequirePermission,
  SetPasswordPage,
} from '../features/auth'
import { CashierPage, ReceiptTicketPage } from '../features/cashier'
import { CustomerDetailPage, CustomersPage } from '../features/customers'
import { DashboardPage } from '../features/dashboard'
import { DocumentsPage, InvoiceTicketPage } from '../features/invoices'
import {
  AlertsPage,
  PlanningPage,
  ReservationDetailPage,
  ReservationsPage,
} from '../features/reservations'
import { StatusPage } from '../features/system'
import { RoomsPage, RatesPage, UsersPage, SettingsPage, AuditPage } from '../features/admin'
import { ReportsPage } from '../features/reports'
import { WorkstationsPage } from '../features/workstations'
import { OfflineAdminPage, SyncPage } from '../features/offline'
import { AppShell } from './AppShell'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { GuestOnly, Landing } from './routeGuards'
import { NoAccessPage } from './pages/UpcomingPage'

const guarded = (permission: string, element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
)

/** Toutes les routes métier utilisent l'UUID public dans `:id` (D-026). */
export const routes: RouteObject[] = [
  {
    path: '/connexion',
    errorElement: <RouteErrorPage />,
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  // Lien de l'invitation reçue par e-mail (6M) : accessible sans connexion.
  { path: '/mot-de-passe', errorElement: <RouteErrorPage />, element: <SetPasswordPage /> },
  // Mot de passe oublié (D-059) : demande d'un lien, sans connexion.
  {
    path: '/mot-de-passe-oublie',
    errorElement: <RouteErrorPage />,
    element: (
      <GuestOnly>
        <ForgotPasswordPage />
      </GuestOnly>
    ),
  },
  {
    path: '/',
    errorElement: <RouteErrorPage />,
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Landing /> },
      { path: 'tableau-de-bord', element: guarded('reports.view', <DashboardPage />) },
      { path: 'reservations', element: guarded('reservations.view', <ReservationsPage />) },
      { path: 'alertes', element: guarded('reservations.view', <AlertsPage />) },
      {
        path: 'reservations/:id',
        element: guarded('reservations.view', <ReservationDetailPage />),
      },
      { path: 'disponibilites', element: guarded('reservations.view', <PlanningPage />) },
      { path: 'clients', element: guarded('customers.view', <CustomersPage />) },
      { path: 'clients/:id', element: guarded('customers.view', <CustomerDetailPage />) },
      { path: 'synchronisation', element: guarded('reservations.view', <SyncPage />) },
      { path: 'caisse', element: guarded('payments.view', <CashierPage />) },
      { path: 'documents', element: guarded('invoices.view', <DocumentsPage />) },
      // L'ancien reçu A4 n'existe plus (D-065) : son adresse ouvre le ticket.
      { path: 'documents/recus/:id', element: <Navigate to="ticket" replace /> },
      {
        path: 'documents/recus/:id/ticket',
        element: guarded('payments.view', <ReceiptTicketPage />),
      },
      {
        path: 'documents/factures/:id/ticket',
        element: guarded('invoices.view', <InvoiceTicketPage />),
      },
      { path: 'rapports', element: guarded('reports.view', <ReportsPage />) },
      { path: 'admin/chambres', element: guarded('rooms.manage', <RoomsPage />) },
      { path: 'admin/tarifs', element: guarded('rates.manage', <RatesPage />) },
      { path: 'admin/utilisateurs', element: guarded('users.view', <UsersPage />) },
      { path: 'admin/parametres', element: guarded('settings.manage', <SettingsPage />) },
      { path: 'admin/audit', element: guarded('audit.view', <AuditPage />) },
      { path: 'admin/etat', element: guarded('settings.manage', <StatusPage />) },
      { path: 'admin/postes', element: guarded('workstations.manage', <WorkstationsPage />) },
      { path: 'admin/hors-ligne', element: guarded('offline.manage', <OfflineAdminPage />) },
      { path: 'sans-acces', element: <NoAccessPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
