import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { logout, ME_KEY, useCurrentUser } from '../features/auth'
import { AlertLink } from '../features/reservations'
import { config } from '../shared/config'
import { Icon } from '../shared/ui/Icon'
import { formatDate, initials, todayIso } from '../shared/utils/format'
import { NAVIGATION } from './navigation'
import './sidebar.css'

const SIDEBAR_PREFERENCE = 'jb-hotel.sidebar-collapsed'

function savedSidebarPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_PREFERENCE) === 'true'
  } catch {
    return false
  }
}

/** Structure du prototype : barre latérale par groupes (filtrée par permissions), barre du haut. */
export function AppShell() {
  const { user, can } = useCurrentUser()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(savedSidebarPreference)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const sidebarToggleLabel = sidebarCollapsed
    ? 'Déployer le menu latéral'
    : 'Réduire le menu latéral'

  function toggleSidebar() {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    try {
      localStorage.setItem(SIDEBAR_PREFERENCE, String(next))
    } catch {
      // Le réglage reste utilisable si le navigateur interdit le stockage local.
    }
  }
  const currentPage = NAVIGATION.flatMap(({ group, items }) =>
    items.map((item) => ({ ...item, group })),
  )
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]

  const signOut = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, null)
      navigate('/connexion', { replace: true })
    },
  })

  if (!user) return null

  return (
    <div className={`layout${sidebarCollapsed ? ' layout--sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <aside id="navigation" className={`sidebar${menuOpen ? ' open' : ''}`}>
        <button
          type="button"
          className="icon-button drawer-close"
          aria-label="Fermer la navigation"
          onClick={() => setMenuOpen(false)}
        >
          ×
        </button>
        <NavLink to="/" className="brand" title={config.appName}>
          <span className="brand-mark" aria-hidden="true">
            JB
          </span>
          <span className="brand-name">
            <b>{config.appName}</b>
            <small>BANGUI · HÔTELLERIE</small>
          </span>
        </NavLink>
        <nav aria-label="Navigation principale">
          {NAVIGATION.map(({ group, items }) => {
            const allowed = items.filter((item) => can(item.permission))
            if (allowed.length === 0) return null
            return (
              <div className="nav-group" key={group}>
                <p>{group.toUpperCase()}</p>
                {allowed.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={item.label}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name={item.icon} />
                    <span className="nav-label">{item.label}</span>
                    {item.upcoming && <span className="sr-only"> (bientôt disponible)</span>}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="profile-details">
              <strong>{user.name}</strong>
              <small>{user.role_label ?? 'Sans rôle'}</small>
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Se déconnecter"
              title="Se déconnecter"
              onClick={() => signOut.mutate()}
              disabled={signOut.isPending}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <button
              type="button"
              className="icon-button sidebar-toggle"
              aria-label={sidebarToggleLabel}
              title={sidebarToggleLabel}
              aria-controls="navigation"
              aria-expanded={!sidebarCollapsed}
              onClick={toggleSidebar}
            >
              <Icon name={sidebarCollapsed ? 'panelOpen' : 'panelClose'} size={21} />
            </button>
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label="Afficher la navigation"
              aria-controls="navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <nav className="breadcrumb" aria-label="Fil d’Ariane">
              <ol>
                <li>{currentPage?.group ?? 'JB Hôtel'}</li>
                <li>
                  <Icon name="chevron" size={15} />
                  <span aria-current="page">{currentPage?.label ?? 'Application'}</span>
                </li>
              </ol>
            </nav>
          </div>
          <div>
            <span className="topbar-date">
              <Icon name="calendar" size={17} />
              <time dateTime={todayIso()}>{formatDate(todayIso())}</time>
            </span>
            <span className="role-chip">{user.role_label ?? 'Sans rôle'}</span>
            <AlertLink />
          </div>
        </header>
        <main id="contenu" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
