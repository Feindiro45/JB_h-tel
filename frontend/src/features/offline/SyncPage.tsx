import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { lastBackupQuery } from '../../shared/offline/backup'
import { coverageRows, readServerTotals } from '../../shared/offline/coverage'
import { useConnectivity } from '../../shared/offline/connectivity'
import { promptInstall, useInstallState } from '../../shared/offline/install'
import {
  describeLocalCopy,
  updateLocalCopy,
  type DownloadProgress,
} from '../../shared/offline/localSync'
import { outboxQuery, type OperationStatus } from '../../shared/offline/outbox'
import { clearQueryCache } from '../../shared/offline/persistence'
import {
  requestPersistentStorage,
  storageProtection,
  storageSizes,
} from '../../shared/offline/storage'
import type { AutoSave, SyncRun } from '../../shared/offline/syncLog'
import { SYNC_LOG_KEY, syncLogQuery } from '../../shared/offline/syncQueries'
import { Badge } from '../../shared/ui/Badge'
import { DonutChart, type DonutSegment } from '../../shared/ui/DonutChart'
import { Icon, type IconName } from '../../shared/ui/Icon'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { LocalTable } from '../../shared/ui/LocalTable'
import { Modal } from '../../shared/ui/Modal'
import { PageOverview } from '../../shared/ui/PageOverview'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime, formatNumber, formatTime } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { BackupPanel } from './BackupPanel'
import { OutboxPanel } from './OutboxPanel'
import { useBackupReminder } from './useBackupReminder'
import './offline.css'

const STORAGE_KEY = ['offline', 'storage'] as const

/** Couleurs d'état vérifiées (daltonisme) ; toujours accompagnées d'une icône et d'un libellé. */
const TONE = { good: '#047857', warning: '#e3a32e', critical: '#c93644', neutral: '#94a39b' }
/** Répartition du stockage : palette catégorielle dans l'ordre fixe, vérifiée. */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} Ko`
  const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
  if (bytes < 1024 ** 3) return `${decimal.format(bytes / 1048576)} Mo`
  return `${decimal.format(bytes / 1024 ** 3)} Go`
}

function formatDuration(run: SyncRun): string {
  const seconds = (run.finishedAt - run.startedAt) / 1000
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(seconds)} s`
}

const STATUS = {
  success: { tone: 'green', label: 'Réussie' },
  partial: { tone: 'amber', label: 'Partielle' },
  failure: { tone: 'red', label: 'Échec' },
} as const

const TRIGGER = {
  manual: 'Manuelle',
  reconnect: 'Retour du réseau',
  auto: 'Automatique',
  full: 'Téléchargement complet',
} as const

const DIRECTION = { local: 'Vers ce poste', online: 'Vers le serveur' } as const

/** Recalcule l'affichage quand le cache des données change (lectures, mises à jour). */
function useCacheVersion(): number {
  const client = useQueryClient()
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = client.getQueryCache().subscribe(() => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        setVersion((v) => v + 1)
      }, 400)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [client])
  return version
}

/** Base du poste : protection, espace, et taille de chaque famille de données. */
const storageQuery = {
  queryKey: STORAGE_KEY,
  queryFn: async () => {
    const [protection, sizes] = await Promise.all([storageProtection(), storageSizes()])
    const of = (...keys: string[]) => keys.reduce((sum, key) => sum + (sizes[key] ?? 0), 0)
    const copy = of('query-cache')
    const operations = of('outbox', 'provisional-sequence', 'last-backup')
    const history = of('sync-runs', 'sync-auto-save')
    const stored = Object.values(sizes).reduce((sum, size) => sum + size, 0)
    // Le reste : fichiers de l'application (service worker), session, réglages.
    const application = Math.max(protection.usage ?? 0, stored) - copy - operations - history
    return { protection, copy, operations, history, application }
  },
  networkMode: 'always' as const,
  staleTime: 0,
}

/**
 * Menu « Synchronisation et sauvegardes » (demande de l'utilisateur, 21-22/11/2026) : l'état du
 * poste se lit d'un coup d'œil (icônes, camemberts), puis les actions : mise à jour en local et
 * en ligne, protection du stockage, installation, sauvegarde chiffrée, historique détaillé.
 */
export function SyncPage() {
  const client = useQueryClient()
  const { user } = useCurrentUser()
  const { notify } = useToast()
  const log = useQuery(syncLogQuery)
  useCacheVersion()
  const datasets = describeLocalCopy(client)
  const [confirmClear, setConfirmClear] = useState(false)

  const refresh = () => {
    void client.invalidateQueries({ queryKey: SYNC_LOG_KEY })
    void client.invalidateQueries({ queryKey: STORAGE_KEY })
  }

  const update = useMutation({
    mutationFn: () => updateLocalCopy(client, 'manual', user?.name ?? null),
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: (run) => {
      refresh()
      notify(
        run.status === 'success'
          ? `Copie locale à jour : ${formatNumber(run.records)} élément(s), ${run.datasets} jeu(x) de données`
          : run.status === 'partial'
            ? `Mise à jour partielle : ${run.failures.length} échec(s), voir l’historique`
            : 'Mise à jour impossible : voir la cause dans l’historique',
      )
    },
  })

  const runs = log.data?.runs ?? []

  return (
    <>
      <PageHeading
        icon="refresh"
        eyebrow="Exploitation"
        title="Synchronisation et sauvegardes"
        description="L’état de ce poste d’un coup d’œil, et ses échanges avec le serveur."
        actions={
          <>
            <button
              type="button"
              className="primary"
              disabled={update.isPending}
              onClick={() => update.mutate()}
            >
              <Icon name="refresh" size={17} />
              {update.isPending ? 'Mise à jour…' : 'Mettre à jour en local'}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" size={17} />
              Effacer la copie locale
            </button>
          </>
        }
      />

      <StatusTiles records={datasets.reduce((sum, d) => sum + d.records, 0)} />

      <FullDownloadCard lastFull={runs.find((run) => run.trigger === 'full') ?? null} />

      <div className="sync-charts">
        <CoverageChart />
        <StorageChart autoSave={log.data?.autoSave ?? null} />
        <OperationsChart />
        <RunsChart runs={runs} />
      </div>

      <div className="sync-cards">
        <InstallPanel />
        <BackupPanel />
      </div>

      <OutboxPanel />

      <div className="sync-history">
        <Panel title="Historique des synchronisations">
          {log.isPending ? (
            <LoadingBlock />
          ) : runs.length === 0 ? (
            <EmptyState title="Aucune synchronisation">
              Lancez « Mettre à jour en local » : chaque mise à jour apparaîtra ici.
            </EmptyState>
          ) : (
            <LocalTable
              label="synchronisations"
              rows={runs}
              searchText={(r) =>
                `${STATUS[r.status].label} ${TRIGGER[r.trigger]} ${DIRECTION[r.direction]} ${r.user ?? ''} ${r.failures.map((f) => `${f.dataset} ${f.cause}`).join(' ')}`
              }
            >
              {(rows) => (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Sens</th>
                        <th scope="col">Résultat</th>
                        <th scope="col" className="num">
                          Éléments
                        </th>
                        <th scope="col">Échecs et causes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((run) => (
                        <tr key={run.id}>
                          <td>
                            {formatDateTime(new Date(run.startedAt))}
                            <small>
                              {TRIGGER[run.trigger]} · {formatDuration(run)}
                              {run.user ? ` · ${run.user}` : ''}
                            </small>
                          </td>
                          <td>
                            <span className="sync-direction">
                              <Icon
                                name={run.direction === 'online' ? 'upload' : 'download'}
                                size={16}
                              />
                              {DIRECTION[run.direction]}
                            </span>
                          </td>
                          <td>
                            <Badge
                              tone={STATUS[run.status].tone}
                              label={STATUS[run.status].label}
                            />
                          </td>
                          <td className="num">
                            {formatNumber(run.records)}
                            <small>
                              {run.datasets} jeu(x) · {formatBytes(run.bytes)}
                              {run.skipped ? ` · ${run.skipped} non rechargé(s)` : ''}
                            </small>
                          </td>
                          <td>
                            {run.failures.length === 0 ? (
                              '—'
                            ) : (
                              <ul className="sync-failures">
                                {run.failures.map((failure) => (
                                  <li key={`${failure.dataset}-${failure.cause}`}>
                                    <strong>{failure.dataset} :</strong> {failure.cause}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </LocalTable>
          )}
        </Panel>
      </div>

      <Panel title="Contenu de la copie locale">
        {datasets.length === 0 ? (
          <EmptyState title="Copie vide">
            Aucun écran consulté pour l’instant sur ce poste.
          </EmptyState>
        ) : (
          <DatasetBars datasets={datasets} />
        )}
      </Panel>

      {confirmClear && (
        <Modal
          title="Effacer la copie locale"
          size="small"
          danger
          onClose={() => setConfirmClear(false)}
          onSubmit={() => {
            void clearQueryCache().then(() => {
              refresh()
              notify('Copie locale effacée de ce poste')
              setConfirmClear(false)
            })
          }}
          submitLabel="Effacer"
        >
          <p>
            Les données gardées sur ce poste pour le mode hors ligne seront effacées. Elles seront
            de nouveau gardées en consultant les écrans en ligne. L’historique des synchronisations
            et les opérations en attente sont conservés.
          </p>
        </Modal>
      )}
    </>
  )
}

/**
 * Quatre repères, en vue d’ensemble comme sur chaque page métier : serveur, disque du poste,
 * opérations à envoyer, dernière sauvegarde.
 */
function StatusTiles({ records }: { records: number }) {
  const { online, since } = useConnectivity()
  const storage = useQuery(storageQuery)
  const outbox = useQuery(outboxQuery)
  const last = useQuery(lastBackupQuery)
  const reminder = useBackupReminder()
  const pending = (outbox.data ?? []).filter((o) => o.status === 'pending').length
  const protection = storage.data?.protection
  const used = protection?.usage ?? null
  const quota = protection?.quota ?? null
  const share =
    used && quota
      ? ` · ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format((used * 100) / quota)} % du disque permis`
      : ''

  return (
    <PageOverview
      items={[
        {
          label: 'Connexion au serveur',
          value: online ? 'En ligne' : 'Hors ligne',
          hint: online ? 'Données en direct' : `Depuis ${formatTime(new Date(since))}`,
          icon: online ? 'cloud' : 'cloudOff',
          tone: online ? 'green' : 'amber',
        },
        {
          label: 'Disque du poste',
          value: formatBytes(used),
          hint: `${
            protection?.persisted
              ? 'Protégé'
              : protection?.durable === false
                ? 'Base indisponible'
                : 'Non protégé'
          } · ${formatNumber(records)} élément(s)${share}`,
          icon: 'disk',
          tone: protection?.persisted ? 'green' : protection?.durable === false ? 'red' : 'blue',
        },
        {
          label: 'Opérations à envoyer',
          value: pending,
          hint: pending ? 'En attente du serveur' : 'Tout est envoyé',
          icon: 'upload',
          tone: pending ? 'amber' : 'green',
        },
        {
          label: 'Dernière sauvegarde',
          value: last.data ? formatDateTime(new Date(last.data.at)) : 'Aucune',
          hint: reminder
            ? 'Sauvegarde conseillée'
            : last.data
              ? `${last.data.count} opération(s)`
              : 'Export chiffré manuel',
          icon: 'archive',
          tone: reminder ? 'red' : last.data ? 'green' : 'mint',
        },
      ]}
    />
  )
}

function StorageChart({ autoSave }: { autoSave: AutoSave | null }) {
  const client = useQueryClient()
  const { notify } = useToast()
  const storage = useQuery(storageQuery)
  const protect = useMutation({
    mutationFn: requestPersistentStorage,
    networkMode: 'always',
    onSuccess: (granted) => {
      void client.invalidateQueries({ queryKey: STORAGE_KEY })
      notify(
        granted
          ? 'Données de ce poste protégées : le navigateur ne les effacera plus de lui-même'
          : 'Protection refusée par le navigateur : installez l’application puis réessayez',
      )
    },
  })
  const data = storage.data
  const segments: DonutSegment[] = data
    ? [
        { key: 'copy', label: 'Copie des écrans', value: data.copy, icon: 'layers' },
        { key: 'operations', label: 'Opérations', value: data.operations, icon: 'upload' },
        { key: 'history', label: 'Historique', value: data.history, icon: 'clock' },
        { key: 'application', label: 'Application', value: data.application, icon: 'monitor' },
      ].map((segment, index) => ({
        ...segment,
        icon: segment.icon as IconName,
        color: SERIES[index]!,
        display: segment.value ? formatBytes(segment.value) : '0 Ko',
      }))
    : []
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <Panel
      title="Stockage de ce poste"
      action={
        data?.protection.durable && data.protection.persisted === false ? (
          <button
            type="button"
            className="secondary"
            disabled={protect.isPending}
            onClick={() => protect.mutate()}
          >
            <Icon name="shield" size={17} />
            Protéger
          </button>
        ) : data?.protection.persisted ? (
          <Badge tone="green" label="Protégé" />
        ) : undefined
      }
    >
      <div className="panel-body">
        {!data ? (
          <LoadingBlock lines={3} />
        ) : !data.protection.durable ? (
          <p className="notice" role="alert">
            <strong>Base indisponible :</strong> navigation privée ? Les données ne durent que le
            temps de la page.
          </p>
        ) : (
          <>
            <DonutChart
              label="Répartition du stockage du poste"
              segments={segments}
              center={{ value: formatBytes(total), caption: 'utilisés' }}
            />
            <p className="sync-chart__note" role="status">
              <Icon name={autoSave?.status === 'failure' ? 'close' : 'check'} size={15} />
              {autoSave ? (
                <span>
                  Copie automatique{' '}
                  <Badge
                    tone={autoSave.status === 'success' ? 'green' : 'red'}
                    label={autoSave.status === 'success' ? 'Réussie' : 'Échec'}
                  />{' '}
                  {formatDateTime(new Date(autoSave.at))} · {formatNumber(autoSave.records)}{' '}
                  élément(s)
                  {autoSave.cause && <> · {autoSave.cause}</>}
                </span>
              ) : (
                <span>Copie automatique : consultez les écrans en ligne pour les garder ici.</span>
              )}
            </p>
            {data.protection.persisted === false && (
              <p className="sync-chart__note">
                <Icon name="idea" size={15} />
                <span>Installez l’application pour que le navigateur protège ces données.</span>
              </p>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}

const OPERATION_SEGMENTS: {
  status: OperationStatus
  label: string
  color: string
  icon: IconName
}[] = [
  // Ordre de l'anneau : le rouge et le vert ne se touchent jamais.
  { status: 'pending', label: 'En attente', color: TONE.warning, icon: 'clock' },
  { status: 'accepted', label: 'Envoyées', color: TONE.good, icon: 'check' },
  { status: 'abandoned', label: 'Abandonnées', color: TONE.neutral, icon: 'trash' },
  { status: 'rejected', label: 'Refusées', color: TONE.critical, icon: 'close' },
]

function OperationsChart() {
  const outbox = useQuery(outboxQuery)
  const operations = outbox.data ?? []
  return (
    <Panel title="Opérations hors ligne">
      <div className="panel-body">
        <DonutChart
          label="Opérations faites hors ligne par état"
          segments={OPERATION_SEGMENTS.map(({ status, ...segment }) => ({
            ...segment,
            key: status,
            value: operations.filter((o) => o.status === status).length,
          }))}
          center={{ value: formatNumber(operations.length), caption: 'opération(s)' }}
        />
      </div>
    </Panel>
  )
}

function RunsChart({ runs }: { runs: SyncRun[] }) {
  const count = (status: SyncRun['status']) => runs.filter((r) => r.status === status).length
  const success = count('success')
  return (
    <Panel title="Synchronisations">
      <div className="panel-body">
        <DonutChart
          label="Résultat des dernières synchronisations"
          segments={[
            {
              key: 'success',
              label: 'Réussies',
              value: success,
              color: TONE.good,
              icon: 'check',
            },
            {
              key: 'partial',
              label: 'Partielles',
              value: count('partial'),
              color: TONE.warning,
              icon: 'help',
            },
            {
              key: 'failure',
              label: 'Échecs',
              value: count('failure'),
              color: TONE.critical,
              icon: 'close',
            },
          ]}
          center={{
            value: runs.length ? `${Math.round((success * 100) / runs.length)} %` : '—',
            caption: runs.length ? `réussies sur ${runs.length}` : 'aucune encore',
          }}
        />
      </div>
    </Panel>
  )
}

const BARS_SHOWN = 8

/** Contenu de la copie : barres classées, la plus grande d'abord (une seule teinte). */
function DatasetBars({ datasets }: { datasets: ReturnType<typeof describeLocalCopy> }) {
  const sorted = [...datasets].sort((a, b) => b.records - a.records)
  const shown = sorted.slice(0, BARS_SHOWN)
  const rest = sorted.slice(BARS_SHOWN)
  const rows = rest.length
    ? [
        ...shown,
        {
          label: `Autres (${rest.length})`,
          records: rest.reduce((sum, d) => sum + d.records, 0),
          updatedAt: Math.max(...rest.map((d) => d.updatedAt)),
        },
      ]
    : shown
  const max = Math.max(1, ...rows.map((d) => d.records))
  return (
    <ul className="dataset-bars" aria-label="Données gardées sur ce poste">
      {rows.map((d) => (
        <li key={d.label}>
          <span className="dataset-bars__label">
            {d.label}
            <small>{formatDateTime(new Date(d.updatedAt))}</small>
          </span>
          <span className="dataset-bars__track" aria-hidden="true">
            <span style={{ width: `${Math.max((d.records / max) * 100, d.records ? 1.5 : 0)}%` }} />
          </span>
          <strong>{formatNumber(d.records)}</strong>
        </li>
      ))}
    </ul>
  )
}

/** Application installée sur le poste (PWA) : icône sur le bureau, ouverture sans réseau. */
function InstallPanel() {
  const { installed, canPrompt } = useInstallState()
  const { notify } = useToast()
  return (
    <Panel
      title="Installation sur ce poste"
      action={
        installed ? (
          <Badge tone="green" label="Installée" />
        ) : canPrompt ? (
          <Badge tone="blue" label="Installable" />
        ) : (
          <Badge tone="neutral" label="Non installée" />
        )
      }
    >
      <div className="panel-body action-card">
        <span className="action-card__icon" aria-hidden="true">
          <Icon name="monitor" size={30} />
        </span>
        <div>
          {installed ? (
            <p>JB Hôtel s’ouvre depuis le bureau, même sans réseau.</p>
          ) : canPrompt ? (
            <>
              <p>Une icône sur le bureau, une fenêtre à part, ouverture sans réseau.</p>
              <button
                type="button"
                className="primary"
                onClick={() =>
                  void promptInstall().then((outcome) => {
                    if (outcome === 'accepted') notify('Application installée sur ce poste')
                  })
                }
              >
                <Icon name="download" size={17} />
                Installer l’application
              </button>
            </>
          ) : (
            <p>
              Edge ou Chrome : menu du navigateur → « Applications » → « Installer JB Hôtel »
              (adresse HTTPS, première ouverture en ligne).
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}

/**
 * « Tout télécharger pour le hors ligne » (demande de l'utilisateur, 22/11/2026) : en un clic,
 * toutes les pages et leurs fiches (réservations, encaissements, reçus, factures, clients) sont
 * gardées sur le poste, sans les parcourir une par une. Le rythme respecte la limite du serveur.
 */
function FullDownloadCard({ lastFull }: { lastFull: SyncRun | null }) {
  const client = useQueryClient()
  const { user } = useCurrentUser()
  const { online } = useConnectivity()
  const { notify } = useToast()
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const download = useMutation({
    mutationFn: () =>
      updateLocalCopy(client, 'full', user?.name ?? null, { full: true, onProgress: setProgress }),
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: (run) => {
      void client.invalidateQueries({ queryKey: SYNC_LOG_KEY })
      void client.invalidateQueries({ queryKey: STORAGE_KEY })
      notify(
        run.status === 'success'
          ? `Poste prêt pour le hors ligne : ${formatNumber(run.records)} élément(s) gardé(s)`
          : `Téléchargement ${run.status === 'partial' ? 'partiel' : 'impossible'} : voir la cause dans l’historique`,
      )
    },
    onSettled: () => setProgress(null),
  })
  const running = download.isPending
  const percent =
    progress && progress.planned
      ? Math.round(((progress.done + progress.failed) * 100) / progress.planned)
      : 0

  return (
    <section className="full-download" aria-label="Tout télécharger pour le hors ligne">
      <span className={`full-download__icon${running ? ' is-running' : ''}`} aria-hidden="true">
        <Icon name="download" size={30} />
      </span>
      <div className="full-download__body">
        <h2>Tout télécharger pour le hors ligne</h2>
        {running && progress ? (
          <>
            <span
              className="full-download__bar"
              role="progressbar"
              aria-label="Téléchargement en cours"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span style={{ width: `${percent}%` }} />
            </span>
            <p className="full-download__step" aria-live="polite">
              <strong>{percent} %</strong> · {progress.step} · {formatNumber(progress.done)} /{' '}
              {formatNumber(progress.planned)}
              {progress.failed ? ` · ${progress.failed} échec(s)` : ''}
            </p>
          </>
        ) : (
          <p>
            {lastFull ? (
              <>
                <Badge tone={STATUS[lastFull.status].tone} label={STATUS[lastFull.status].label} />{' '}
                {formatDateTime(new Date(lastFull.startedAt))} · {formatNumber(lastFull.records)}{' '}
                élément(s)
              </>
            ) : (
              'Toutes les pages et leurs fiches gardées sur ce poste, en un clic.'
            )}
          </p>
        )}
      </div>
      <button
        type="button"
        className="primary"
        disabled={running || !online}
        onClick={() => download.mutate()}
      >
        <Icon name={running ? 'loader' : 'download'} size={17} />
        {running ? 'Téléchargement…' : 'Tout télécharger'}
      </button>
    </section>
  )
}

/** Couleurs de la couverture : même teinte, foncée pour le poste, claire pour le reste. */
const COVERAGE = { local: '#047857', online: '#9fd3b9' }

/**
 * Données sur ce poste comparées au serveur (demande de l'utilisateur, 22/11/2026) : la part
 * disponible hors ligne, puis une jauge par famille (réservations, clients, encaissements,
 * factures). Hors ligne, le dernier relevé du serveur reste affiché avec sa date.
 */
function CoverageChart() {
  const client = useQueryClient()
  const { user } = useCurrentUser()
  const { online } = useConnectivity()
  const permissions = user?.permissions ?? []
  const server = useQuery({
    queryKey: ['offline', 'coverage-server', online, permissions.join(',')],
    queryFn: () => readServerTotals(permissions),
    networkMode: 'always',
    staleTime: 60_000,
    meta: { silentError: true },
  })
  const rows = coverageRows(client, permissions, server.data ?? null)
  const measured = rows.filter((row) => row.server !== null)
  const local = measured.reduce((sum, row) => sum + row.local, 0)
  const total = measured.reduce((sum, row) => sum + (row.server ?? 0), 0)
  const percent = total ? Math.round((local * 100) / total) : null

  return (
    <Panel title="Sur ce poste et en ligne">
      <div className="panel-body">
        {server.isPending ? (
          <LoadingBlock lines={3} />
        ) : (
          <>
            <DonutChart
              label="Données disponibles sur ce poste comparées au serveur"
              segments={[
                {
                  key: 'local',
                  label: 'Sur ce poste',
                  value: local,
                  display: formatNumber(local),
                  color: COVERAGE.local,
                  icon: 'disk',
                },
                {
                  key: 'online',
                  label: 'Seulement en ligne',
                  value: Math.max(total - local, 0),
                  display: formatNumber(Math.max(total - local, 0)),
                  color: COVERAGE.online,
                  icon: 'cloud',
                },
              ]}
              center={{
                value: percent === null ? '—' : `${percent} %`,
                caption: 'disponible hors ligne',
              }}
            />
            <ul className="coverage-meters" aria-label="Éléments par famille, poste et serveur">
              {rows.map((row) => {
                const ratio = row.server ? Math.min(1, row.local / row.server) : 0
                return (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <span
                      className="coverage-meters__track"
                      role="meter"
                      aria-label={`${row.label} : ${row.local} sur ${row.server ?? 'inconnu'}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(ratio * 100)}
                    >
                      <span style={{ width: `${ratio * 100}%` }} />
                    </span>
                    <strong>
                      {formatNumber(row.local)} /{' '}
                      {row.server === null ? '—' : formatNumber(row.server)}
                    </strong>
                  </li>
                )
              })}
            </ul>
            <p className="sync-chart__note">
              <Icon name={server.data?.live ? 'cloud' : 'cloudOff'} size={15} />
              {server.data
                ? `${server.data.live ? 'Serveur relevé' : 'Dernier relevé du serveur'} : ${formatDateTime(new Date(server.data.at))}`
                : 'Serveur jamais relevé depuis ce poste.'}
            </p>
          </>
        )}
      </div>
    </Panel>
  )
}
