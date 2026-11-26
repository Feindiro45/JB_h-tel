import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon, type IconName } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { api } from '../../shared/api/client'
import type { Envelope } from '../../shared/api/types'
import { Badge } from '../../shared/ui/Badge'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { adminQuery, type Setting } from './api'
import { useCurrentUser } from '../auth'
import { EditDialog } from './EditDialog'
import './settings.css'

/** Domaines des paramètres (D-060), d'après le préfixe de leur clé ; une couleur par domaine. */
const GROUPS: {
  prefix: string
  title: string
  description: string
  icon: IconName
  tone: string
}[] = [
  {
    prefix: 'hotel',
    title: 'Établissement',
    description:
      'Nom, ville, adresse, téléphone, e-mail et mentions imprimés en tête des factures et reçus (D-073). Une facture déjà émise garde les informations du jour de son émission.',
    icon: 'rooms',
    tone: 'blue',
  },
  {
    prefix: 'security',
    title: 'Veille et sécurité',
    description:
      'Délai sans action avant la mise en veille du logiciel, en ligne comme hors ligne : le mot de passe est alors demandé pour reprendre (D-074).',
    icon: 'lock',
    tone: 'violet',
  },
  {
    prefix: 'discounts',
    title: 'Remises',
    description: 'Plafonds et arrondis appliqués aux réductions.',
    icon: 'percent',
    tone: 'green',
  },
  {
    prefix: 'payments',
    title: 'Encaissements',
    description: 'Moyens de paiement proposés à la caisse.',
    icon: 'wallet',
    tone: 'blue',
  },
  {
    prefix: 'reservations',
    title: 'Réservations',
    description: 'Blocage des chambres quand l’heure n’est pas saisie.',
    icon: 'calendar',
    tone: 'violet',
  },
  {
    prefix: 'billing',
    title: 'Facturation et caisse',
    description: 'Forfaits, numérotation des pièces et trop-perçu.',
    icon: 'document',
    tone: 'gold',
  },
  {
    prefix: 'offline',
    title: 'Hors ligne',
    description: 'Opérations permises sans Internet, sauvegardes et numéros provisoires (D-064).',
    icon: 'cloudOff',
    tone: 'slate',
  },
  {
    prefix: 'workstations',
    title: 'Postes de caisse',
    description: 'Poste principal unique (D-062) et délai avant de le considérer hors ligne.',
    icon: 'monitor',
    tone: 'teal',
  },
]

type Show = '' | 'PROVISIONAL' | 'VALIDATED' | 'EDITABLE'

interface SettingGroup {
  key: string
  title: string
  description: string
  icon: IconName
  tone: string
  items: Setting[]
}

function settingGroups(settings: Setting[]): SettingGroup[] {
  const known = GROUPS.map((group) => ({
    key: group.prefix,
    title: group.title,
    description: group.description,
    icon: group.icon,
    tone: group.tone,
    items: settings.filter((s) => s.key.startsWith(`${group.prefix}.`)),
  }))
  const others = settings.filter((s) => !GROUPS.some((g) => s.key.startsWith(`${g.prefix}.`)))
  return [
    ...known,
    {
      key: 'others',
      title: 'Autres règles',
      description: 'Règles générales.',
      icon: 'settings' as IconName,
      tone: 'green',
      items: others,
    },
  ].filter((group) => group.items.length > 0)
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Recherche (libellé, explication, référence) et filtre « Afficher ». */
function matches(s: Setting, search: string, show: Show): boolean {
  if (show === 'PROVISIONAL' && s.status === 'VALIDATED') return false
  if (show === 'VALIDATED' && s.status !== 'VALIDATED') return false
  if (show === 'EDITABLE' && !s.editable) return false
  const needle = normalize(search.trim())
  return !needle || normalize(`${s.label} ${s.help} ${s.reference} ${s.key}`).includes(needle)
}

function displayValue(s: Setting): ReactNode {
  if (Array.isArray(s.value))
    return s.value.length === 0 ? (
      'Aucune'
    ) : (
      <span className="setting-chips">
        {s.value.map((v) => (
          <span key={v} className="setting-chip">
            <Icon name="check" size={13} />
            {s.options?.[v] ?? v}
          </span>
        ))}
      </span>
    )
  if (typeof s.value === 'boolean') return s.value ? 'Oui' : 'Non'
  if (s.value === null || s.value === undefined || s.value === '')
    return s.key.startsWith('hotel.') ? 'Non imprimé' : 'Non défini'
  const text = s.options?.[String(s.value)] ?? String(s.value)
  return s.unit ? `${text} ${s.unit}` : text
}

/** Taille de la valeur : grande pour un nombre court, normale pour une phrase ou une liste. */
function valueKind(s: Setting): string {
  if (Array.isArray(s.value)) return 'list'
  if (s.type === 'text' && !s.options && !s.key.startsWith('hotel.')) return 'code'
  if (typeof s.value === 'boolean') return s.value ? 'yes' : 'no'
  const text = String(displayValue(s))
  return text.length > 16 ? 'long' : 'short'
}

/** « 2026-11-20 09:15:00 » (heure de l'hôtel, renvoyée par le serveur) → « 20/11/2026 à 09:15 ». */
/** Informations de l'établissement qui peuvent rester vides (D-073) : rien n'est alors imprimé. */
const OPTIONAL_TEXT = new Set([
  'hotel.address',
  'hotel.phone',
  'hotel.email',
  'hotel.tax_id',
  'hotel.trade_register',
])
const TEXT_INPUT_TYPES: Record<string, string> = { 'hotel.email': 'email', 'hotel.phone': 'tel' }

function displayUpdatedAt(value: string): string {
  const [date = '', time = ''] = value.split(' ')
  const [y, m, d] = date.split('-')
  return d && m && y ? `${d}/${m}/${y} à ${time.slice(0, 5)}` : value
}

function SettingCard({ setting: s, onEdit }: { setting: Setting; onEdit: () => void }) {
  const titleId = useId()
  const validated = s.status === 'VALIDATED'
  const kind = valueKind(s)
  return (
    <article
      className={`setting-card${validated ? ' setting-card--validated' : ''}`}
      aria-labelledby={titleId}
    >
      <header className="setting-card__head">
        <h3 id={titleId}>{s.label}</h3>
        <Badge tone={validated ? 'green' : 'amber'} label={validated ? 'Validé' : 'Provisoire'} />
      </header>
      <div className={`setting-card__value setting-card__value--${kind}`}>
        {kind === 'yes' || kind === 'no' ? (
          <span className="setting-card__bool">
            <Icon name={kind === 'yes' ? 'check' : 'close'} size={16} />
            {displayValue(s)}
          </span>
        ) : (
          displayValue(s)
        )}
      </div>
      <p className="setting-card__help">{s.help}</p>
      <footer className="setting-card__foot">
        <div className="setting-card__meta">
          <span className="setting-card__ref">Réf. {s.reference}</span>
          {s.updated_at && (
            <span>
              Modifié le {displayUpdatedAt(s.updated_at)}
              {s.updated_by ? ` par ${s.updated_by}` : ''}
            </span>
          )}
        </div>
        {s.editable ? (
          <button type="button" className="secondary" onClick={onEdit} aria-describedby={titleId}>
            <Icon name="edit" size={16} />
            Modifier
          </button>
        ) : (
          <span className="setting-card__locked">
            <Icon name="key" size={14} />
            Fixé par décision
          </span>
        )}
      </footer>
    </article>
  )
}

function SettingSection({
  group,
  onEdit,
}: {
  group: SettingGroup
  onEdit: (setting: Setting) => void
}) {
  const titleId = useId()
  const provisional = group.items.filter((s) => s.status !== 'VALIDATED').length
  return (
    <section
      className={`settings-section settings-tone--${group.tone}`}
      id={`parametres-${group.key}`}
      aria-labelledby={titleId}
    >
      <header className="settings-section__head">
        <span className="settings-section__icon" aria-hidden="true">
          <Icon name={group.icon} size={22} />
        </span>
        <div>
          <h2 id={titleId}>{group.title}</h2>
          <p>{group.description}</p>
        </div>
        <span className="settings-section__count">
          {group.items.length} règle{group.items.length > 1 ? 's' : ''}
          {provisional > 0 && <> · {provisional} à valider</>}
        </span>
      </header>
      <div className="settings-grid">
        {group.items.map((s) => (
          <SettingCard key={s.key} setting={s} onEdit={() => onEdit(s)} />
        ))}
      </div>
    </section>
  )
}

export function SettingsPage() {
  const settings = useQuery(adminQuery<Envelope<Setting[]>>('settings'))
  const [editing, setEditing] = useState<Setting | null>(null)
  const [search, setSearch] = useState('')
  const [show, setShow] = useState<Show>('')
  const all = useMemo(() => settings.data?.data ?? [], [settings.data])
  const groups = useMemo(
    () => settingGroups(all.filter((s) => matches(s, search, show))),
    [all, search, show],
  )
  const count = (test: (s: Setting) => boolean) =>
    settings.data ? all.filter(test).length : undefined

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
            value: count(() => true),
            hint: 'Règles de configuration',
            icon: 'settings',
          },
          {
            label: 'Validés',
            value: count((s) => s.status === 'VALIDATED'),
            hint: 'Règles déjà confirmées',
            icon: 'check',
          },
          {
            label: 'Provisoires',
            value: count((s) => s.status !== 'VALIDATED'),
            hint: 'À faire valider par l’hôtel',
            icon: 'clock',
          },
          {
            label: 'Modifiables',
            value: count((s) => s.editable),
            hint: 'Réglages autorisés dans l’interface',
            icon: 'edit',
          },
        ]}
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Domaines des paramètres">
          <p className="settings-nav__title">Domaines</p>
          <ul>
            {groups.map((group) => {
              const provisional = group.items.filter((s) => s.status !== 'VALIDATED').length
              return (
                <li key={group.key}>
                  <a
                    href={`#parametres-${group.key}`}
                    className={`settings-tone--${group.tone}`}
                    aria-label={`${group.title} : ${group.items.length} règle${group.items.length > 1 ? 's' : ''}${provisional > 0 ? `, dont ${provisional} à valider` : ''}`}
                    onClick={(event) => {
                      event.preventDefault()
                      document
                        .getElementById(`parametres-${group.key}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  >
                    <span className="settings-nav__icon" aria-hidden="true">
                      <Icon name={group.icon} size={17} />
                    </span>
                    <span className="settings-nav__label">{group.title}</span>
                    <span className="settings-nav__count">{group.items.length}</span>
                    {provisional > 0 && (
                      <span className="settings-nav__pending" aria-hidden="true" />
                    )}
                  </a>
                </li>
              )
            })}
            <li>
              <a
                href="#parametres-e-mails"
                className="settings-tone--blue"
                onClick={(event) => {
                  event.preventDefault()
                  document
                    .getElementById('parametres-e-mails')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                <span className="settings-nav__icon" aria-hidden="true">
                  <Icon name="mail" size={17} />
                </span>
                <span className="settings-nav__label">Envoi des e-mails</span>
              </a>
            </li>
          </ul>
          <div className="settings-legend" role="note">
            <span>
              <Badge tone="green" label="Validé" /> confirmé par l’hôtel
            </span>
            <span>
              <Badge tone="amber" label="Provisoire" /> en attente de validation
            </span>
            <span>
              <Icon name="key" size={15} /> fixé par une décision
            </span>
          </div>
        </nav>
        <div className="settings-content">
          <form
            className="filterbar settings-filters"
            aria-label="Filtrer les paramètres"
            onSubmit={(event) => event.preventDefault()}
          >
            <TextField
              label="Rechercher une règle"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Remise, préfixe, D-016…"
            />
            <SelectField
              label="Afficher"
              icon="filter"
              value={show}
              onChange={(event) => setShow(event.target.value as Show)}
            >
              <option value="">Toutes les règles</option>
              <option value="PROVISIONAL">À valider (provisoires)</option>
              <option value="VALIDATED">Validées</option>
              <option value="EDITABLE">Modifiables ici</option>
            </SelectField>
          </form>
          {settings.isPending ? (
            <LoadingBlock />
          ) : groups.length === 0 ? (
            <EmptyState title="Aucune règle ne correspond">
              Modifiez la recherche ou choisissez « Toutes les règles ».
            </EmptyState>
          ) : (
            groups.map((group) => (
              <SettingSection key={group.key} group={group} onEdit={setEditing} />
            ))
          )}
          <div id="parametres-e-mails" className="settings-mail">
            <MailPanel />
          </div>
        </div>
      </div>
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
                  ? {
                      name: 'value',
                      label: editing.label,
                      required: !OPTIONAL_TEXT.has(editing.key),
                      type: TEXT_INPUT_TYPES[editing.key],
                      maxLength: 200,
                      hint: editing.help,
                    }
                  : {
                      name: 'value',
                      label: editing.label,
                      type: 'number',
                      required: true,
                      min: editing.min ?? 0,
                      max: editing.max ?? 100,
                    },
            ]}
            initial={{ value: editing.value === null ? '' : String(editing.value) }}
            transform={(v) =>
              editing.type === 'boolean'
                ? { value: v.value === 'true' }
                : editing.type === 'text'
                  ? // Une information facultative laissée vide n'est plus imprimée (D-073).
                    {
                      value:
                        v.value.trim() === '' && OPTIONAL_TEXT.has(editing.key)
                          ? null
                          : v.value.trim(),
                    }
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
