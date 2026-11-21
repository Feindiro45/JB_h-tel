import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toUserError } from '../../shared/api/errors'
import { Badge } from '../../shared/ui/Badge'
import { TextAreaField, TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { LocalTable } from '../../shared/ui/LocalTable'
import { Modal } from '../../shared/ui/Modal'
import { PageOverview } from '../../shared/ui/PageOverview'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime } from '../../shared/utils/format'
import {
  designateWorkstation,
  reactivateWorkstation,
  renameWorkstation,
  revokeWorkstation,
  setMainPostEnforcement,
  WORKSTATION_SELF_KEY,
  WORKSTATIONS_KEY,
  workstationsQuery,
  type WorkstationRow,
  type WorkstationsOverview,
} from './api'
import './workstations.css'

type Dialog =
  | { kind: 'rename' | 'designate' | 'revoke'; workstation: WorkstationRow }
  | { kind: 'enforce'; enable: boolean }

function useRefresh() {
  const cache = useQueryClient()
  return () => {
    void cache.invalidateQueries({ queryKey: WORKSTATIONS_KEY })
    void cache.invalidateQueries({ queryKey: WORKSTATION_SELF_KEY })
    void cache.invalidateQueries({ queryKey: ['settings'] })
  }
}

/** « Edge · Windows » plutôt que la chaîne brute du navigateur (gardée en info-bulle). */
function describeBrowser(userAgent: string): string {
  const browser = [
    [/Edg\//, 'Edge'],
    [/OPR\//, 'Opera'],
    [/Firefox\//, 'Firefox'],
    [/Chrome\//, 'Chrome'],
    [/Safari\//, 'Safari'],
  ] as const
  const system = [
    [/Android/, 'Android'],
    [/iPhone|iPad/, 'iOS'],
    [/Windows/, 'Windows'],
    [/Mac OS X/, 'macOS'],
    [/Linux/, 'Linux'],
  ] as const
  const name = browser.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Navigateur'
  const os = system.find(([pattern]) => pattern.test(userAgent))?.[1]
  return os ? `${name} · ${os}` : name
}

function lastSeen(row: { last_seen_at: string | null }) {
  return row.last_seen_at ? formatDateTime(row.last_seen_at) : 'Jamais'
}

/**
 * Postes de caisse (D-062) : chaque navigateur connecté s'enregistre ; l'administrateur désigne
 * un seul poste principal, seul autorisé à enregistrer réservations et encaissements quand la
 * règle est activée. Chaque désignation est numérotée et journalisée.
 */
export function WorkstationsPage() {
  const overview = useQuery(workstationsQuery())
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const refresh = useRefresh()
  const { notify } = useToast()
  const reactivate = useMutation({
    mutationFn: (row: WorkstationRow) => reactivateWorkstation(row.id),
    onSuccess: (_data, row) => {
      refresh()
      notify(`Poste « ${row.name} » réactivé`)
    },
  })

  const data = overview.data
  const active = data?.workstations.filter((w) => !w.revoked_at) ?? []

  return (
    <>
      <PageHeading
        icon="cash"
        eyebrow="Administration"
        title="Postes de caisse"
        description="Un seul poste principal enregistre les réservations et les encaissements (D-062)."
      />
      <PageOverview
        items={[
          {
            label: 'Poste principal',
            value: data ? (data.main?.name ?? 'Aucun') : undefined,
            hint: data?.main
              ? `Désignation n° ${data.main.assignment_number}`
              : 'À désigner ci-dessous',
            icon: 'cash',
          },
          {
            label: 'État du poste principal',
            value: data
              ? data.main
                ? data.main.silent
                  ? 'Silencieux'
                  : 'En ligne'
                : '—'
              : undefined,
            hint: data?.main ? `Dernier signal : ${lastSeen(data.main)}` : 'Aucun poste principal',
            icon: 'clock',
            tone: data?.main?.silent ? 'amber' : undefined,
          },
          {
            label: 'Écritures réservées',
            value: data ? (data.settings.enforce_main_post ? 'Oui' : 'Non') : undefined,
            hint: 'Réservations et encaissements',
            icon: 'shield',
          },
          {
            label: 'Postes actifs',
            value: data ? active.length : undefined,
            hint: `${(data?.workstations.length ?? 0) - active.length} révoqué(s)`,
            icon: 'layers',
          },
        ]}
      />

      {overview.isPending ? (
        <LoadingBlock lines={6} label="Chargement des postes…" />
      ) : !data ? (
        <EmptyState title="Postes indisponibles">Rechargez la page pour réessayer.</EmptyState>
      ) : (
        <>
          <EnforcementPanel
            data={data}
            onToggle={(enable) => setDialog({ kind: 'enforce', enable })}
          />
          <WorkstationsPanel
            data={data}
            onAction={(kind, workstation) => setDialog({ kind, workstation })}
            onReactivate={(row) => reactivate.mutate(row)}
          />
          <AssignmentsPanel data={data} />
          <GuidePanel silentAfter={data.settings.silent_after_minutes} />
        </>
      )}

      {dialog?.kind === 'rename' && (
        <RenameDialog workstation={dialog.workstation} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'designate' && data && (
        <DesignateDialog
          workstation={dialog.workstation}
          data={data}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeDialog workstation={dialog.workstation} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'enforce' && (
        <EnforcementDialog enable={dialog.enable} data={data} onClose={() => setDialog(null)} />
      )}
    </>
  )
}

function EnforcementPanel({
  data,
  onToggle,
}: {
  data: WorkstationsOverview
  onToggle: (enable: boolean) => void
}) {
  const enabled = data.settings.enforce_main_post
  return (
    <Panel
      title="Règle du poste principal"
      subtitle="Provisoire (D-062) : à activer une fois le poste principal désigné et vérifié."
      action={
        <button
          type="button"
          className={enabled ? 'secondary' : 'primary'}
          disabled={!enabled && !data.main}
          onClick={() => onToggle(!enabled)}
        >
          <Icon name="shield" size={17} />
          {enabled ? 'Désactiver la règle' : 'Activer la règle'}
        </button>
      }
    >
      <div className="panel-body">
        <p>
          <Badge tone={enabled ? 'green' : 'neutral'} label={enabled ? 'Active' : 'Inactive'} />{' '}
          {enabled
            ? `Seul « ${data.main?.name ?? '—'} » enregistre les réservations et les encaissements. Les autres postes consultent, établissent des devis et gèrent les réglages.`
            : 'Tous les postes peuvent enregistrer réservations et encaissements, comme avant.'}
        </p>
        {!data.main && (
          <p className="notice" role="note">
            Désignez d’abord un poste principal : la règle ne peut pas être activée sans lui.
          </p>
        )}
      </div>
    </Panel>
  )
}

/** « Consultation » seulement quand la règle D-062 est active ; sinon tout poste peut écrire. */
function roleBadge(row: WorkstationRow, enforced: boolean) {
  if (row.revoked_at) return <Badge tone="red" label="Révoqué" />
  if (row.is_main)
    return <Badge tone="green" label={row.silent ? 'Principal · silencieux' : 'Principal'} />
  return <Badge tone="neutral" label={enforced ? 'Consultation' : 'Actif'} />
}

function WorkstationsPanel({
  data,
  onAction,
  onReactivate,
}: {
  data: WorkstationsOverview
  onAction: (kind: 'rename' | 'designate' | 'revoke', row: WorkstationRow) => void
  onReactivate: (row: WorkstationRow) => void
}) {
  return (
    <Panel
      title="Postes enregistrés"
      subtitle="Chaque navigateur connecté s’enregistre automatiquement. Renommez les postes de l’hôtel pour les reconnaître."
    >
      <LocalTable
        label="postes enregistrés"
        rows={data.workstations}
        searchText={(w) =>
          `${w.name} ${w.user_agent ?? ''} ${w.last_seen_by ?? ''} ${w.registered_by ?? ''}`
        }
      >
        {(rows) => (
          <div className="table-wrap workstations-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Poste</th>
                  <th scope="col">Rôle</th>
                  <th scope="col">Dernier signal</th>
                  <th scope="col">Enregistré</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.name}</strong>
                      {w.is_current && (
                        <>
                          {' '}
                          <Badge tone="blue" label="Ce poste" />
                        </>
                      )}
                      {w.user_agent && (
                        <small title={w.user_agent}>{describeBrowser(w.user_agent)}</small>
                      )}
                      {w.revocation_reason && <small>Motif : {w.revocation_reason}</small>}
                    </td>
                    <td>{roleBadge(w, data.settings.enforce_main_post)}</td>
                    <td>
                      {lastSeen(w)}
                      {w.last_seen_by && <small>par {w.last_seen_by}</small>}
                    </td>
                    <td>
                      {formatDateTime(w.registered_at)}
                      {w.registered_by && <small>par {w.registered_by}</small>}
                    </td>
                    <td className="compact-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onAction('rename', w)}
                        aria-label={`Renommer ${w.name}`}
                      >
                        <Icon name="edit" size={17} />
                        Renommer
                      </button>
                      {!w.is_main && !w.revoked_at && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onAction('designate', w)}
                          aria-label={`Désigner ${w.name} comme poste principal`}
                        >
                          <Icon name="check" size={17} />
                          Poste principal
                        </button>
                      )}
                      {!w.is_main && !w.revoked_at && (
                        <button
                          type="button"
                          className="text-button text-button--danger"
                          onClick={() => onAction('revoke', w)}
                          aria-label={`Révoquer ${w.name}`}
                        >
                          <Icon name="close" size={17} />
                          Révoquer
                        </button>
                      )}
                      {w.revoked_at && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onReactivate(w)}
                          aria-label={`Réactiver ${w.name}`}
                        >
                          <Icon name="undo" size={17} />
                          Réactiver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LocalTable>
    </Panel>
  )
}

function AssignmentsPanel({ data }: { data: WorkstationsOverview }) {
  return (
    <Panel
      title="Historique des désignations"
      subtitle="Chaque désignation porte un numéro : un ancien poste ne pourra plus envoyer d’opérations."
    >
      {data.assignments.length === 0 ? (
        <EmptyState title="Aucune désignation">
          Aucun poste principal n’a encore été désigné.
        </EmptyState>
      ) : (
        <LocalTable
          label="désignations"
          rows={data.assignments}
          searchText={(a) =>
            `${a.number} ${a.workstation ?? ''} ${a.previous_workstation ?? ''} ${a.mode_label} ${a.reason ?? ''} ${a.assigned_by ?? ''}`
          }
        >
          {(rows) => (
            <div className="table-wrap workstations-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col" className="num">
                      N°
                    </th>
                    <th scope="col">Poste principal</th>
                    <th scope="col">Ancien poste</th>
                    <th scope="col">Type</th>
                    <th scope="col">Motif</th>
                    <th scope="col">Par</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="num">{a.number}</td>
                      <td>
                        <strong>{a.workstation ?? '—'}</strong>
                        <small>{formatDateTime(a.assigned_at)}</small>
                      </td>
                      <td>
                        {a.previous_workstation ?? '—'}
                        {a.previous_last_seen_at && (
                          <small>Dernier signal : {formatDateTime(a.previous_last_seen_at)}</small>
                        )}
                      </td>
                      <td>
                        <Badge
                          tone={
                            a.mode === 'FORCED' ? 'amber' : a.mode === 'PLANNED' ? 'green' : 'blue'
                          }
                          label={a.mode_label}
                        />
                      </td>
                      <td>{a.reason ?? '—'}</td>
                      <td>{a.assigned_by ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LocalTable>
      )}
    </Panel>
  )
}

function GuidePanel({ silentAfter }: { silentAfter: number }) {
  return (
    <Panel
      title="Comment changer de poste principal"
      subtitle="Procédure à suivre par l’administrateur."
    >
      <div className="panel-body workstation-guide">
        <div className="workstation-guide__grid">
          <section>
            <h3>Changement planifié (nouveau PC)</h3>
            <ol>
              <li>Connectez-vous une fois sur le nouveau PC : il apparaît dans la liste.</li>
              <li>Renommez-le (par exemple « CAISSE-02 »).</li>
              <li>Cliquez sur « Poste principal » sur sa ligne.</li>
              <li>L’ancien poste passe aussitôt en consultation.</li>
            </ol>
          </section>
          <section>
            <h3>Changement forcé (panne, vol)</h3>
            <ol>
              <li>Le poste principal est « silencieux » après {silentAfter} min sans signal.</li>
              <li>
                Désignez le poste de secours ; confirmez le transfert forcé et donnez le motif.
              </li>
              <li>
                Si l’ancien poste revient, ses envois seront refusés et mis de côté pour examen
                (mode hors ligne, à venir).
              </li>
              <li>Révoquez l’ancien poste s’il ne doit plus servir.</li>
            </ol>
          </section>
        </div>
      </div>
    </Panel>
  )
}

function RenameDialog({
  workstation,
  onClose,
}: {
  workstation: WorkstationRow
  onClose: () => void
}) {
  const [name, setName] = useState(workstation.name)
  const [error, setError] = useState<string>()
  const refresh = useRefresh()
  const { notify } = useToast()
  const save = useMutation({
    mutationFn: () => renameWorkstation(workstation.id, name.trim()),
    onSuccess: () => {
      refresh()
      notify('Poste renommé')
      onClose()
    },
    onError: (e) => setError(toUserError(e).fieldErrors.name?.[0]),
  })
  return (
    <Modal
      title="Renommer le poste"
      subtitle={workstation.name}
      size="small"
      onClose={onClose}
      onSubmit={() => {
        if (name.trim().length < 2) return setError('Le nom doit compter au moins 2 caractères.')
        save.mutate()
      }}
      submitting={save.isPending}
    >
      <div className="fields">
        <TextField
          className="full"
          label="Nom du poste"
          icon="edit"
          value={name}
          maxLength={40}
          required
          error={error}
          hint="Par exemple « CAISSE-01 » ou « Bureau direction »."
          onChange={(e) => setName(e.target.value)}
        />
      </div>
    </Modal>
  )
}

function DesignateDialog({
  workstation,
  data,
  onClose,
}: {
  workstation: WorkstationRow
  data: WorkstationsOverview
  onClose: () => void
}) {
  const forced = data.main?.silent === true
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string>()
  const refresh = useRefresh()
  const { notify } = useToast()
  const save = useMutation({
    mutationFn: () =>
      designateWorkstation(workstation.id, {
        reason: reason.trim() || undefined,
        force: forced ? confirmed : undefined,
      }),
    onSuccess: () => {
      refresh()
      notify(`« ${workstation.name} » est le poste principal`)
      onClose()
    },
    onError: (e) => {
      setError(toUserError(e).fieldErrors.reason?.[0])
      refresh()
    },
  })

  return (
    <Modal
      title="Désigner le poste principal"
      subtitle={workstation.name}
      onClose={onClose}
      onSubmit={() => {
        if (forced && reason.trim().length < 5)
          return setError('Motif obligatoire pour un transfert forcé (5 caractères au moins).')
        save.mutate()
      }}
      submitLabel={forced ? 'Confirmer le transfert forcé' : 'Désigner'}
      submitting={save.isPending}
      submitDisabled={forced && !confirmed}
      danger={forced}
    >
      {!data.main ? (
        <p>
          Premier poste principal : « {workstation.name} » pourra enregistrer réservations et
          encaissements quand la règle sera activée.
        </p>
      ) : forced ? (
        <p className="notice" role="note">
          Le poste principal actuel « {data.main.name} » ne donne plus signe de vie (dernier signal
          : {lastSeen(data.main)}). Ses éventuelles opérations non synchronisées seront mises de
          côté pour examen, jamais appliquées en silence.
        </p>
      ) : (
        <p>
          Transfert planifié : « {data.main.name} » est joignable (dernier signal :{' '}
          {lastSeen(data.main)}). Il passera en consultation dès la désignation.
        </p>
      )}
      <div className="fields">
        <TextAreaField
          className="full"
          label={forced ? 'Motif du transfert forcé' : 'Motif (facultatif)'}
          value={reason}
          maxLength={255}
          required={forced}
          error={error}
          onChange={(e) => setReason(e.target.value)}
        />
        {forced && (
          <label className="check full">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Je confirme le transfert forcé : l’ancien poste ne pourra plus rien enregistrer.
          </label>
        )}
      </div>
    </Modal>
  )
}

function RevokeDialog({
  workstation,
  onClose,
}: {
  workstation: WorkstationRow
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const refresh = useRefresh()
  const { notify } = useToast()
  const save = useMutation({
    mutationFn: () => revokeWorkstation(workstation.id, reason.trim()),
    onSuccess: () => {
      refresh()
      notify(`Poste « ${workstation.name} » révoqué`)
      onClose()
    },
    onError: (e) => setError(toUserError(e).fieldErrors.reason?.[0]),
  })
  return (
    <Modal
      title="Révoquer le poste"
      subtitle={workstation.name}
      onClose={onClose}
      onSubmit={() => {
        if (reason.trim().length < 3) return setError('Indiquez le motif (3 caractères au moins).')
        save.mutate()
      }}
      submitLabel="Révoquer"
      submitting={save.isPending}
      danger
    >
      <p>
        Un poste révoqué ne peut plus devenir poste principal. Il reste dans la liste et peut être
        réactivé.
      </p>
      <div className="fields">
        <TextAreaField
          className="full"
          label="Motif de la révocation"
          value={reason}
          maxLength={255}
          required
          error={error}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  )
}

function EnforcementDialog({
  enable,
  data,
  onClose,
}: {
  enable: boolean
  data: WorkstationsOverview | undefined
  onClose: () => void
}) {
  const refresh = useRefresh()
  const { notify } = useToast()
  const save = useMutation({
    mutationFn: () => setMainPostEnforcement(enable),
    onSuccess: () => {
      refresh()
      notify(enable ? 'Règle du poste principal activée' : 'Règle du poste principal désactivée')
      onClose()
    },
  })
  return (
    <Modal
      title={enable ? 'Activer la règle du poste principal' : 'Désactiver la règle'}
      size="small"
      onClose={onClose}
      onSubmit={() => save.mutate()}
      submitLabel={enable ? 'Activer' : 'Désactiver'}
      submitting={save.isPending}
    >
      <p>
        {enable
          ? `Seul « ${data?.main?.name ?? '—'} » pourra enregistrer réservations et encaissements. Les autres postes passeront en consultation.`
          : 'Tous les postes pourront de nouveau enregistrer réservations et encaissements.'}
      </p>
    </Modal>
  )
}
