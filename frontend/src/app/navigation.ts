import type { IconName } from '../shared/ui/Icon'

export interface NavItem {
  path: string
  label: string
  icon: IconName
  /** Permission serveur requise (catalogue PermissionName du backend). */
  permission: string
  /** Écran prévu dans une étape ultérieure de la phase 6. */
  upcoming?: boolean
}

/** Navigation du prototype, filtrée selon les permissions renvoyées par `/auth/me`. */
export const NAVIGATION: { group: string; items: NavItem[] }[] = [
  {
    group: 'Exploitation',
    items: [
      {
        path: '/tableau-de-bord',
        label: 'Vue d’ensemble',
        icon: 'dashboard',
        permission: 'reports.view',
      },
      {
        path: '/reservations',
        label: 'Réservations',
        icon: 'calendar',
        permission: 'reservations.view',
      },
      {
        path: '/disponibilites',
        label: 'Disponibilités',
        icon: 'rooms',
        permission: 'reservations.view',
      },
      { path: '/clients', label: 'Clients', icon: 'people', permission: 'customers.view' },
    ],
  },
  {
    group: 'Finances',
    items: [
      {
        path: '/caisse',
        label: 'Caisse',
        icon: 'cash',
        permission: 'payments.view',
        upcoming: true,
      },
      {
        path: '/documents',
        label: 'Factures et reçus',
        icon: 'document',
        permission: 'invoices.view',
        upcoming: true,
      },
      {
        path: '/rapports',
        label: 'Rapports',
        icon: 'chart',
        permission: 'reports.view',
        upcoming: true,
      },
    ],
  },
  {
    group: 'Administration',
    items: [
      {
        path: '/admin/chambres',
        label: 'Chambres et catégories',
        icon: 'rooms',
        permission: 'rooms.manage',
        upcoming: true,
      },
      {
        path: '/admin/tarifs',
        label: 'Tarifs',
        icon: 'cash',
        permission: 'rates.manage',
        upcoming: true,
      },
      {
        path: '/admin/utilisateurs',
        label: 'Utilisateurs et accès',
        icon: 'people',
        permission: 'users.view',
        upcoming: true,
      },
      {
        path: '/admin/etat',
        label: 'État du système',
        icon: 'settings',
        permission: 'settings.manage',
      },
    ],
  },
]

/** Première page autorisée pour l'utilisateur (page d'accueil après connexion). */
export function landingPath(can: (permission: string) => boolean): string {
  for (const { items } of NAVIGATION) {
    const first = items.find((item) => !item.upcoming && can(item.permission))
    if (first) return first.path
  }
  return '/sans-acces'
}
