import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
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

export function SettingsPage() {
  const settings = useQuery(adminQuery<Envelope<Setting[]>>('settings'))
  const [editing, setEditing] = useState<Setting | null>(null)
  return (
    <>
      <PageHeading
        icon="settings"
        eyebrow="Administration"
        title="Paramètres"
        description="Les règles provisoires restent soumises à la validation de l’hôtel."
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
      <MailPanel />
      {settings.isPending ? (
        <LoadingBlock />
      ) : (
        settings.data?.data.map((s) => (
          <Panel
            key={s.key}
            title={s.label}
            subtitle={s.help}
            action={
              <Badge
                tone={s.status === 'VALIDATED' ? 'green' : 'amber'}
                label={s.status === 'VALIDATED' ? 'Validé' : 'Provisoire'}
              />
            }
          >
            <div className="filterbar">
              <strong>
                {Array.isArray(s.value)
                  ? s.value.map((v) => s.options?.[v] ?? v).join(', ')
                  : typeof s.value === 'boolean'
                    ? s.value
                      ? 'Oui'
                      : 'Non'
                    : (s.options?.[String(s.value)] ?? String(s.value ?? 'Non défini'))}
              </strong>
              <span className="caption">{s.reference}</span>
              {s.editable && (
                <button className="secondary" onClick={() => setEditing(s)}>
                  <Icon name="edit" size={17} />
                  Modifier
                </button>
              )}
            </div>
          </Panel>
        ))
      )}
      {editing &&
        (editing.type === 'methods' ? (
          <MethodsDialog setting={editing} onClose={() => setEditing(null)} />
        ) : (
          <EditDialog
            title={editing.label}
            path={`settings/${editing.key}`}
            method="put"
            fields={[
              {
                name: 'value',
                label: editing.label,
                type: 'number',
                required: true,
                min: editing.min ?? 0,
                max: editing.max ?? 100,
              },
            ]}
            initial={{ value: String(editing.value) }}
            transform={(v) => ({ value: Number(v.value) })}
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
      notify('Moyens de paiement mis à jour')
      onClose()
    },
  })
  return (
    <Modal
      title={setting.label}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      submitting={save.isPending}
      submitDisabled={selected.length === 0}
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
