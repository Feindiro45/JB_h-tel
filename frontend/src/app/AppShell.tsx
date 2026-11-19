import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { logout, ME_KEY, useCurrentUser } from '../features/auth'
import { config } from '../shared/config'
import { Icon } from '../shared/ui/Icon'
import { formatDate, initials, todayIso } from '../shared/utils/format'
import { NAVIGATION } from './navigation'

/** Structure du prototype : barre latérale par groupes (filtrée par permissions), barre du haut. */
export function AppShell() {
  const { user, can } = useCurrentUser()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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
    <div className="layout">
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
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            JB
          </span>
          <span>
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
                  <NavLink key={item.path} to={item.path} onClick={() => setMenuOpen(false)}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
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
            <span>
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
              className="icon-button mobile-menu"
              aria-label="Afficher la navigation"
              aria-controls="navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="hide-mobile">Réception</span>
            <strong>{formatDate(todayIso())}</strong>
          </div>
          <div>
            <span className="role-chip">{user.role_label ?? 'Sans rôle'}</span>
          </div>
        </header>
        <main id="contenu" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
