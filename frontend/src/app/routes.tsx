import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoginPage, RequireAuth, RequirePermission } from '../features/auth'
import { CustomerDetailPage, CustomersPage } from '../features/customers'
import { DashboardPage } from '../features/dashboard'
import { PlanningPage, ReservationDetailPage, ReservationsPage } from '../features/reservations'
import { StatusPage } from '../features/system'
import { AppShell } from './AppShell'
import { NotFoundPage } from './pages/NotFoundPage'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { GuestOnly, Landing } from './routeGuards'
import { NoAccessPage, UpcomingPage } from './pages/UpcomingPage'

const guarded = (permission: string, element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
)

const upcoming = (eyebrow: string, title: string, description: string) => (
  <UpcomingPage eyebrow={eyebrow} title={title} description={description} />
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
      {
        path: 'reservations/:id',
        element: guarded('reservations.view', <ReservationDetailPage />),
      },
      { path: 'disponibilites', element: guarded('reservations.view', <PlanningPage />) },
      { path: 'clients', element: guarded('customers.view', <CustomersPage />) },
      { path: 'clients/:id', element: guarded('customers.view', <CustomerDetailPage />) },
      {
        path: 'caisse',
        element: guarded(
          'payments.view',
          upcoming('Finances', 'Caisse', 'Mouvements de caisse, soldes et remboursements.'),
        ),
      },
      {
        path: 'documents',
        element: guarded(
          'invoices.view',
          upcoming('Finances', 'Factures et reçus', 'Factures, avoirs et reçus émis.'),
        ),
      },
      {
        path: 'rapports',
        element: guarded(
          'reports.view',
          upcoming('Finances', 'Rapports', 'Facturé, chiffre d’affaires et encaissé, par période.'),
        ),
      },
      {
        path: 'admin/chambres',
        element: guarded(
          'rooms.manage',
          upcoming(
            'Administration',
            'Chambres et catégories',
            'Chambres, capacités et maintenance.',
          ),
        ),
      },
      {
        path: 'admin/tarifs',
        element: guarded(
          'rates.manage',
          upcoming('Administration', 'Tarifs', 'Grille tarifaire versionnée et historique.'),
        ),
      },
      {
        path: 'admin/utilisateurs',
        element: guarded(
          'users.view',
          upcoming('Administration', 'Utilisateurs et accès', 'Comptes, rôles et permissions.'),
        ),
      },
      { path: 'admin/etat', element: guarded('settings.manage', <StatusPage />) },
      { path: 'sans-acces', element: <NoAccessPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
