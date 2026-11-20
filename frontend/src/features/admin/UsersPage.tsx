import { PageOverview } from '../../shared/ui/PageOverview'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../shared/api/client'
import type { CurrentUser, Envelope } from '../../shared/api/types'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { Pagination } from '../../shared/ui/Pagination'
import { useToast } from '../../shared/ui/toastContext'
import { useCurrentUser } from '../auth'
import { adminQuery, type Role, type Users } from './api'
import { EditDialog, type EditField } from './EditDialog'

export function UsersPage() {
  const { can } = useCurrentUser()
  const { draft, filters, change } = useAutoFilters({
    search: '',
    role: '',
    active: '',
    page: 1,
    per_page: 25,
  })
  const users = useQuery(adminQuery<Users>('users', filters))
  const roles = useQuery({ ...adminQuery<Envelope<Role[]>>('roles'), enabled: can('roles.manage') })
  const [editing, setEditing] = useState<CurrentUser | 'new' | null>(null)
  const [permissions, setPermissions] = useState<string[] | null>(null)
  const cashier = roles.data?.data.find((r) => r.name === 'caissiere')
  const { notify } = useToast()
  // Nouveau lien pour choisir son mot de passe (6M) : invitation expirée ou mot de passe oublié.
  const invite = useMutation({
    mutationFn: (user: CurrentUser) =>
      api.post<{ message: string }>(`/api/v1/users/${user.id}/invitation`),
    onSuccess: (response) => notify(response.message),
  })
  const fields: EditField[] = [
    { name: 'name', label: 'Nom', required: true, maxLength: 160 },
    { name: 'email', label: 'Adresse e-mail', type: 'email', required: true },
    {
      name: 'role',
      label: 'Rôle',
      required: true,
      options: [
        { value: 'admin', label: 'Administrateur' },
        { value: 'caissiere', label: 'Caissière' },
      ],
    },
    {
      name: 'active',
      label: 'Compte',
      required: true,
      options: [
        { value: 'true', label: 'Actif' },
        { value: 'false', label: 'Désactivé' },
      ],
    },
    {
      name: 'password',
      label: editing === 'new' ? 'Mot de passe (facultatif)' : 'Mot de passe',
      type: 'password',
      hint:
        editing === 'new'
          ? 'Laissez vide pour envoyer automatiquement un lien permettant à l’utilisateur de choisir son mot de passe.'
          : 'Au moins 10 caractères, avec lettres et chiffres. Laisser vide pour conserver le mot de passe actuel.',
    },
    {
      name: 'password_confirmation',
      label: 'Confirmer le mot de passe',
      type: 'password',
      hint:
        editing === 'new' ? 'À remplir uniquement si vous saisissez un mot de passe.' : undefined,
    },
  ]
  return (
    <>
      <PageHeading
        icon="people"
        eyebrow="Administration"
        title="Utilisateurs et accès"
        actions={
          can('users.manage') && (
            <button className="primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={17} />
              <span className="sr-only">+</span> Utilisateur
            </button>
          )
        }
      />
      <PageOverview
        items={[
          {
            label: 'Comptes',
            value: users.data?.meta.total,
            hint: 'Ensemble des résultats filtrés',
            icon: 'people',
          },
          {
            label: 'Actifs',
            value: users.data ? users.data.data.filter((u) => u.active).length : undefined,
            hint: 'Sur la page affichée',
            icon: 'check',
          },
          {
            label: 'Administrateurs',
            value: users.data
              ? users.data.data.filter((u) => u.role === 'admin').length
              : undefined,
            hint: 'Sur la page affichée',
            icon: 'shield',
          },
          {
            label: 'Caissières',
            value: users.data
              ? users.data.data.filter((u) => u.role === 'caissiere').length
              : undefined,
            hint: 'Sur la page affichée',
            icon: 'wallet',
          },
        ]}
      />
      <Panel title="Comptes">
        <div className="filterbar">
          <TextField
            label="Recherche"
            value={draft.search}
            onChange={(e) => change({ search: e.target.value }, true)}
          />
          <SelectField
            label="Rôle"
            value={draft.role}
            onChange={(e) => change({ role: e.target.value })}
          >
            <option value="">Tous</option>
            <option value="admin">Administrateur</option>
            <option value="caissiere">Caissière</option>
          </SelectField>
          <SelectField
            label="Compte"
            value={draft.active}
            onChange={(e) => change({ active: e.target.value })}
          >
            <option value="">Tous</option>
            <option value="1">Actif</option>
            <option value="0">Désactivé</option>
          </SelectField>
        </div>
        {users.isPending ? (
          <LoadingBlock />
        ) : !users.data?.data.length ? (
          <EmptyState />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>E-mail</th>
                  <th>Rôle</th>
                  <th>Compte</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.data.data.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role_label}</td>
                    <td>{u.active ? 'Actif' : 'Désactivé'}</td>
                    <td>
                      {can('users.manage') && (
                        <span className="compact-actions">
                          <button
                            className="text-button"
                            onClick={() => setEditing(u)}
                            aria-label={`Modifier ${u.name}`}
                          >
                            <Icon name="edit" size={17} />
                            Modifier
                          </button>
                          <button
                            className="text-button"
                            onClick={() => invite.mutate(u)}
                            disabled={invite.isPending}
                            aria-label={`Envoyer à ${u.name} un lien pour choisir son mot de passe`}
                          >
                            <Icon name="mail" size={17} />
                            Inviter
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          meta={users.data?.meta}
          onPage={(page) => change({ page })}
          perPage={draft.per_page}
          onPerPage={(per_page) => change({ per_page })}
        />
      </Panel>
      {can('roles.manage') && cashier && (
        <Panel
          title="Droits de la caissière"
          subtitle="Les permissions sont appliquées par le serveur dès la prochaine requête."
          action={
            <button className="secondary" onClick={() => setPermissions([...cashier.permissions])}>
              <Icon name="shield" size={17} />
              Modifier les droits
            </button>
          }
        >
          <p className="caption">
            {cashier.permissions.length} permissions accordées. Les droits de l’administrateur
            restent protégés.
          </p>
        </Panel>
      )}
      {editing && (
        <EditDialog
          title={editing === 'new' ? 'Nouvel utilisateur' : 'Modifier l’utilisateur'}
          path={editing === 'new' ? 'users' : `users/${editing.id}`}
          method={editing === 'new' ? 'post' : 'patch'}
          fields={fields}
          initial={
            editing === 'new'
              ? { role: 'caissiere', active: 'true' }
              : {
                  name: editing.name,
                  email: editing.email,
                  role: editing.role ?? 'caissiere',
                  active: String(editing.active),
                }
          }
          successMessage={(v) =>
            editing !== 'new'
              ? 'Modification enregistrée'
              : v.password
                ? `Compte créé · e-mail de bienvenue envoyé à ${v.email}`
                : `Compte créé · invitation envoyée à ${v.email} pour choisir son mot de passe`
          }
          transform={(v) => {
            const result: Record<string, unknown> = { ...v, active: v.active === 'true' }
            if (!v.password) {
              delete result.password
              delete result.password_confirmation
            }
            return result
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {permissions && (
        <PermissionsDialog initial={permissions} onClose={() => setPermissions(null)} />
      )}
    </>
  )
}

function PermissionsDialog({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const [selected, setSelected] = useState(initial)
  const list = useQuery(adminQuery<Envelope<{ name: string; label: string }[]>>('permissions'))
  const cache = useQueryClient()
  const { notify } = useToast()
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/roles/caissiere/permissions', { permissions: selected }),
    onSuccess: () => {
      void cache.invalidateQueries()
      notify('Droits mis à jour')
      onClose()
    },
  })
  return (
    <Modal
      title="Droits de la caissière"
      onClose={onClose}
      onSubmit={() => save.mutate()}
      submitting={save.isPending}
      submitDisabled={!list.data}
    >
      <div className="fields">
        {list.data?.data.map((p) => (
          <label className="check" key={p.name}>
            <input
              type="checkbox"
              checked={selected.includes(p.name)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, p.name] : selected.filter((s) => s !== p.name),
                )
              }
            />
            {p.label}
          </label>
        ))}
      </div>
    </Modal>
  )
}
