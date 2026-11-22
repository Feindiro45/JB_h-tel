import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { api } from '../../shared/api/client'
import type { Envelope } from '../../shared/api/types'
import { Badge } from '../../shared/ui/Badge'
import { TextField } from '../../shared/ui/fields'
import { LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { adminQuery, type Setting } from './api'
import { useCurrentUser } from '../auth'
import { EditDialog } from './EditDialog'
import './settings.css'

/** Domaines des paramètres (D-060), d'après le préfixe de leur clé. */
const GROUPS: { prefix: string; title: string; description: string }[] = [
  {
    prefix: 'discounts',
    title: 'Remises',
    description: 'Plafonds et arrondis appliqués aux réductions.',
  },
  {
    prefix: 'payments',
    title: 'Encaissements',
    description: 'Moyens de paiement proposés à la caisse.',
  },
  {
    prefix: 'reservations',
    title: 'Réservations',
    description: 'Blocage des chambres quand l’heure n’est pas saisie.',
  },
  {
    prefix: 'billing',
    title: 'Facturation et caisse',
    description: 'Forfaits, numérotation des pièces et trop-perçu.',
  },
  {
    prefix: 'offline',
    title: 'Hors ligne',
    description:
      'Opérations permises sans Internet, verrouillage, sauvegardes et numéros provisoires (D-064).',
  },
  {
    prefix: 'workstations',
    title: 'Postes de caisse',
    description: 'Poste principal unique (D-062) et délai avant de le considérer hors ligne.',
  },
]

function settingGroups(settings: Setting[]) {
  const known = GROUPS.map((group) => ({
    key: group.prefix,
    title: group.title,
    description: group.description,
    items: settings.filter((s) => s.key.startsWith(`${group.prefix}.`)),
  }))
  const others = settings.filter((s) => !GROUPS.some((g) => s.key.startsWith(`${g.prefix}.`)))
  return [
    ...known,
    { key: 'others', title: 'Autres règles', description: 'Règles générales.', items: others },
  ].filter((group) => group.items.length > 0)
}

function displayValue(s: Setting): ReactNode {
  if (Array.isArray(s.value))
    return (
      <span className="setting-chips">
        {s.value.map((v) => (
          <span key={v} className="setting-chip">
            {s.options?.[v] ?? v}
          </span>
        ))}
      </span>
    )
  if (typeof s.value === 'boolean') return s.value ? 'Oui' : 'Non'
  if (s.value === null || s.value === undefined) return 'Non défini'
  const text = s.options?.[String(s.value)] ?? String(s.value)
  return s.unit ? `${text} ${s.unit}` : text
}

/** « 2026-11-20 09:15:00 » (heure de l'hôtel, renvoyée par le serveur) → « 20/11/2026 à 09:15 ». */
function displayUpdatedAt(value: string): string {
  const [date = '', time = ''] = value.split(' ')
  const [y, m, d] = date.split('-')
  return d && m && y ? `${d}/${m}/${y} à ${time.slice(0, 5)}` : value
}

function SettingRow({ setting: s, onEdit }: { setting: Setting; onEdit: () => void }) {
  const titleId = useId()
  return (
    <article className="setting" aria-labelledby={titleId}>
      <div className="setting__main">
        <h3 id={titleId}>{s.label}</h3>
        <p>{s.help}</p>
        <p className="setting__meta">
          <span className="setting__ref">Réf. {s.reference}</span>
          {s.updated_at && (
            <span>
              Modifié le {displayUpdatedAt(s.updated_at)}
              {s.updated_by ? ` par ${s.updated_by}` : ''}
            </span>
          )}
        </p>
      </div>
      <div className="setting__side">
        <Badge
          tone={s.status === 'VALIDATED' ? 'green' : 'amber'}
          label={s.status === 'VALIDATED' ? 'Validé' : 'Provisoire'}
        />
        <strong className={`setting__value${s.type === 'text' ? ' setting__value--code' : ''}`}>
          {displayValue(s)}
        </strong>
        {s.editable ? (
          <button type="button" className="secondary" onClick={onEdit} aria-describedby={titleId}>
            <Icon name="edit" size={17} />
            Modifier
          </button>
        ) : (
          <span className="setting__locked">
            <Icon name="key" size={14} />
            Fixé par décision
          </span>
        )}
      </div>
    </article>
  )
}

export function SettingsPage() {
  const settings = useQuery(adminQuery<Envelope<Setting[]>>('settings'))
  const [editing, setEditing] = useState<Setting | null>(null)
  return (
    <>
      <PageHeading
        icon="settings"
        eyebrow="Administration"
        title="Paramètres"
        description="Règles de fonctionnement de l’hôtel, regroupées par domaine. Les règles provisoires attendent la validation de l’hôtel."
      />
      <PageOverview
        items={[
          {
            label: 'Paramètres',
            value: settings.data?.data.length,
            hint: 'Règles de configuration',
            icon: 'settings',
          },
          {
            label: 'Validés',
            value: settings.data
              ? settings.data.data.filter((s) => s.status === 'VALIDATED').length
              : undefined,
            hint: 'Règles déjà confirmées',
            icon: 'check',
          },
          {
            label: 'Provisoires',
            value: settings.data
              ? settings.data.data.filter((s) => s.status !== 'VALIDATED').length
              : undefined,
            hint: 'À faire valider par l’hôtel',
            icon: 'clock',
          },
          {
            label: 'Modifiables',
            value: settings.data ? settings.data.data.filter((s) => s.editable).length : undefined,
            hint: 'Réglages autorisés dans l’interface',
            icon: 'edit',
          },
        ]}
      />
      <div className="settings-legend" role="note">
        <span>
          <Badge tone="green" label="Validé" /> règle confirmée par l’hôtel
        </span>
        <span>
          <Badge tone="amber" label="Provisoire" /> valeur par défaut, en attente de validation
        </span>
        <span>
          <Icon name="key" size={15} /> fixée par une décision : modifiable seulement après accord
        </span>
      </div>
      {settings.isPending ? (
        <LoadingBlock />
      ) : (
        settingGroups(settings.data?.data ?? []).map((group) => (
          <Panel key={group.key} title={group.title} subtitle={group.description}>
            <div className="settings-list">
              {group.items.map((s) => (
                <SettingRow key={s.key} setting={s} onEdit={() => setEditing(s)} />
              ))}
            </div>
          </Panel>
        ))
      )}
      <MailPanel />
      {editing &&
        (editing.type === 'methods' || editing.type === 'choices' ? (
          <MethodsDialog setting={editing} onClose={() => setEditing(null)} />
        ) : (
          <EditDialog
            title={editing.label}
            path={`settings/${editing.key}`}
            method="put"
            fields={[
              editing.type === 'boolean'
                ? {
                    name: 'value',
                    label: editing.label,
                    required: true,
                    hint: editing.help,
                    options: [
                      { value: 'true', label: 'Oui' },
                      { value: 'false', label: 'Non' },
                    ],
                  }
                : editing.type === 'text'
                  ? { name: 'value', label: editing.label, required: true, hint: editing.help }
                  : {
                      name: 'value',
                      label: editing.label,
                      type: 'number',
                      required: true,
                      min: editing.min ?? 0,
                      max: editing.max ?? 100,
                    },
            ]}
            initial={{ value: String(editing.value) }}
            transform={(v) =>
              editing.type === 'boolean'
                ? { value: v.value === 'true' }
                : editing.type === 'text'
                  ? { value: v.value.trim() }
                  : { value: Number(v.value) }
            }
            onClose={() => setEditing(null)}
          />
        ))}
    </>
  )
}
function MethodsDialog({ setting, onClose }: { setting: Setting; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(setting.value) ? setting.value : [],
  )
  const cache = useQueryClient()
  const { notify } = useToast()
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/settings/${setting.key}`, { value: selected }),
    onSuccess: () => {
      void cache.invalidateQueries()
      notify(`${setting.label} : mis à jour`)
      onClose()
    },
  })
  return (
    <Modal
      title={setting.label}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      submitting={save.isPending}
      // Les moyens de paiement en exigent au moins un ; les opérations hors ligne peuvent être toutes décochées.
      submitDisabled={setting.type === 'methods' && selected.length === 0}
    >
      <div className="fields">
        {Object.entries(setting.options ?? {}).map(([value, label]) => (
          <label className="check" key={value}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, value] : selected.filter((v) => v !== value),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
    </Modal>
  )
}

export interface MailStatus {
  mailer: string
  transport: string
  delivers: boolean
  host: string | null
  port: number | null
  scheme: string | null
  authenticated: boolean
  from_address: string
  from_name: string
  queue: {
    connection: string
    needs_worker: boolean
    pending: number | null
    failed: number | null
  }
}

/**
 * Envoi des e-mails (6M) : état de la configuration (sans aucun secret) et e-mail de test envoyé
 * immédiatement. Les identifiants SMTP se règlent dans backend/.env, jamais dans l'interface.
 */
function MailPanel() {
  const { user } = useCurrentUser()
  const status = useQuery(adminQuery<Envelope<MailStatus>>('settings/mail'))
  const cache = useQueryClient()
  const { notify } = useToast()
  const [to, setTo] = useState(user?.email ?? '')
  const test = useMutation({
    mutationFn: () =>
      api.post<{ message: string }>('/api/v1/settings/mail/test', { to: to.trim() || null }),
    onSuccess: (response) => {
      notify(response.message)
      void cache.invalidateQueries({ queryKey: ['admin', 'settings/mail'] })
    },
  })
  // Après correction du serveur SMTP : remet en file les envois classés en échec (D-054).
  const retry = useMutation({
    mutationFn: () => api.post<{ message: string }>('/api/v1/settings/mail/retry'),
    onSuccess: (response) => {
      notify(response.message)
      void cache.invalidateQueries({ queryKey: ['admin', 'settings/mail'] })
    },
  })
  const mail = status.data?.data
  return (
    <Panel
      title="Envoi des e-mails"
      subtitle="Confirmations de séjour, reçus, factures, alertes de connexion et invitations du personnel. Les identifiants SMTP se règlent dans backend/.env."
      action={
        mail && (
          <Badge
            tone={mail.delivers ? 'green' : 'amber'}
            label={mail.delivers ? 'Envoi réel' : 'Aucun envoi réel'}
          />
        )
      }
    >
      {!mail ? (
        <LoadingBlock lines={2} />
      ) : (
        <>
          <div className="panel-body pairs grid-pairs">
            <Pair label="Mode">
              {mail.delivers
                ? `${mail.transport.toUpperCase()} — les e-mails partent réellement`
                : `${mail.transport} — les e-mails sont seulement écrits dans le journal`}
            </Pair>
            <Pair label="Serveur">
              {mail.host
                ? `${mail.host}:${mail.port}${mail.scheme ? ` · ${mail.scheme}` : ''}${mail.authenticated ? ' · authentifié' : ''}`
                : '—'}
            </Pair>
            <Pair label="Expéditeur">{`${mail.from_name} <${mail.from_address}>`}</Pair>
            <Pair label="File d’attente">
              {mail.queue.needs_worker
                ? `${mail.queue.pending ?? '?'} en attente · ${mail.queue.failed ?? 0} en échec`
                : `Envoi immédiat · ${mail.queue.failed ?? 0} en échec`}
            </Pair>
          </div>
          {mail.queue.needs_worker && (mail.queue.pending ?? 0) > 0 && (
            <p className="notice" role="status">
              Des e-mails attendent leur envoi : le service d’envoi en arrière-plan doit tourner sur
              le serveur (commande « php artisan queue:work »).
            </p>
          )}
          {(mail.queue.failed ?? 0) > 0 && (
            <div className="notice" role="status">
              <p>
                {mail.queue.failed} envoi(s) n’ont pas pu partir après 24 h d’essais. Une fois le
                serveur d’envoi corrigé (e-mail de test réussi), relancez-les.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => retry.mutate()}
                disabled={retry.isPending}
              >
                <Icon name={retry.isPending ? 'loader' : 'refresh'} size={17} />
                Relancer les envois en échec
              </button>
            </div>
          )}
          <form
            className="filterbar"
            aria-label="E-mail de test"
            onSubmit={(event) => {
              event.preventDefault()
              test.mutate()
            }}
          >
            <TextField
              label="Adresse de test"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              hint="Laisser vide pour l’envoyer à votre propre adresse."
            />
            <button type="submit" className="primary" disabled={test.isPending}>
              <Icon name={test.isPending ? 'loader' : 'mail'} size={17} />
              {test.isPending ? 'Envoi…' : 'Envoyer un e-mail de test'}
            </button>
          </form>
        </>
      )}
    </Panel>
  )
}
