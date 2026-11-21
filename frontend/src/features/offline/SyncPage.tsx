import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useConnectivity } from '../../shared/offline/connectivity'
import { promptInstall, useInstallState } from '../../shared/offline/install'
import { describeLocalCopy, sizeOf, updateLocalCopy } from '../../shared/offline/localSync'
import { clearQueryCache, readStoredCache } from '../../shared/offline/persistence'
import type { SyncRun } from '../../shared/offline/syncLog'
import { SYNC_LOG_KEY, syncLogQuery } from '../../shared/offline/syncQueries'
import { Badge } from '../../shared/ui/Badge'
import { Icon } from '../../shared/ui/Icon'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { LocalTable } from '../../shared/ui/LocalTable'
import { Modal } from '../../shared/ui/Modal'
import { PageOverview } from '../../shared/ui/PageOverview'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime, formatNumber, formatTime } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import './offline.css'

const STORED_KEY = ['offline', 'stored-copy'] as const

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} Ko`
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / 1048576)} Mo`
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

/**
 * Menu « Synchronisation et sauvegardes » (demande de l'utilisateur, 21/11/2026) : état de la
 * copie gardée sur ce poste pour travailler sans réseau, mise à jour en local, historique de
 * chaque synchronisation avec ses chiffres et la cause de chaque échec. L'envoi des opérations
 * faites hors ligne (« mise à jour en ligne ») et l'export chiffré arrivent avec le lot 4.
 */
export function SyncPage() {
  const client = useQueryClient()
  const { user } = useCurrentUser()
  const { online, since } = useConnectivity()
  const { notify } = useToast()
  const log = useQuery(syncLogQuery)
  const stored = useQuery({
    queryKey: STORED_KEY,
    queryFn: async () => {
      const cache = await readStoredCache()
      return cache ? { savedAt: cache.savedAt, bytes: sizeOf(cache) } : null
    },
    networkMode: 'always',
    staleTime: 0,
  })
  useCacheVersion()
  const datasets = describeLocalCopy(client)
  const records = datasets.reduce((sum, d) => sum + d.records, 0)
  const [confirmClear, setConfirmClear] = useState(false)

  const refresh = () => {
    void client.invalidateQueries({ queryKey: SYNC_LOG_KEY })
    void client.invalidateQueries({ queryKey: STORED_KEY })
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
  const lastRun = runs[0]
  const autoSave = log.data?.autoSave ?? null

  return (
    <>
      <PageHeading
        icon="refresh"
        eyebrow="Exploitation"
        title="Synchronisation et sauvegardes"
        description="Données gardées sur ce poste pour travailler sans réseau, et historique des mises à jour."
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
      <PageOverview
        items={[
          {
            label: 'Connexion au serveur',
            value: online ? 'En ligne' : 'Hors ligne',
            hint: online
              ? 'Données mises à jour en direct'
              : `Depuis ${formatTime(new Date(since))}`,
            icon: 'globe',
            tone: online ? 'green' : 'amber',
          },
          {
            label: 'Dernière mise à jour en local',
            value: lastRun ? STATUS[lastRun.status].label : 'Aucune',
            hint: lastRun ? formatDateTime(new Date(lastRun.startedAt)) : 'Lancez une mise à jour',
            icon: 'clock',
            tone: lastRun ? (STATUS[lastRun.status].tone === 'red' ? 'red' : undefined) : undefined,
          },
          {
            label: 'Informations sur ce poste',
            value: formatNumber(records),
            hint: `${datasets.length} jeu(x) de données · ${formatBytes(stored.data?.bytes)}`,
            icon: 'layers',
          },
          {
            label: 'Opérations à envoyer',
            value: 0,
            hint: 'Enregistrement hors ligne : lot 4',
            icon: 'wallet',
          },
        ]}
      />

      <InstallPanel />

      <Panel
        title="Sauvegarde automatique sur ce poste"
        subtitle="Chaque écran consulté en ligne est gardé ici 12 h au plus (D-064), pour la consultation et la réimpression sans réseau."
      >
        <div className="panel-body">
          {autoSave ? (
            <p>
              <Badge
                tone={autoSave.status === 'success' ? 'green' : 'red'}
                label={autoSave.status === 'success' ? 'Réussie' : 'Échec'}
              />{' '}
              Dernière copie le {formatDateTime(new Date(autoSave.at))} :{' '}
              {formatNumber(autoSave.records)} élément(s), {autoSave.datasets} jeu(x) de données,{' '}
              {formatBytes(autoSave.bytes)}.{autoSave.cause && <> Cause : {autoSave.cause}</>}
            </p>
          ) : (
            <p>Aucune copie encore : consultez les écrans en ligne pour les garder sur ce poste.</p>
          )}
          {stored.data && (
            <p className="hint">
              Copie enregistrée le {formatDateTime(new Date(stored.data.savedAt))}, valable jusqu’à
              12 h sans connexion.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        title="Historique des synchronisations"
        subtitle={`Les ${runs.length ? Math.min(runs.length, 50) : 50} dernières mises à jour de ce poste, avec leurs résultats et la cause de chaque échec.`}
      >
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
                        <td>{DIRECTION[run.direction]}</td>
                        <td>
                          <Badge tone={STATUS[run.status].tone} label={STATUS[run.status].label} />
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

      <Panel
        title="Contenu de la copie locale"
        subtitle="Jeux de données gardés sur ce poste, avec leur nombre d’éléments et leur date."
      >
        {datasets.length === 0 ? (
          <EmptyState title="Copie vide">
            Aucun écran consulté pour l’instant sur ce poste.
          </EmptyState>
        ) : (
          <LocalTable label="données gardées" rows={datasets} searchText={(d) => d.label}>
            {(rows) => (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Jeu de données</th>
                      <th scope="col" className="num">
                        Éléments
                      </th>
                      <th scope="col">Mis à jour le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.label}>
                        <td>{d.label}</td>
                        <td className="num">{formatNumber(d.records)}</td>
                        <td>{formatDateTime(new Date(d.updatedAt))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </LocalTable>
        )}
      </Panel>

      <Panel
        title="Mettre à jour en ligne et exporter"
        subtitle="Sens poste → serveur : envoi des opérations faites hors ligne (lot 4, D-064)."
      >
        <div className="panel-body">
          <p>
            <Badge tone="neutral" label="0 opération en attente" /> L’enregistrement hors ligne
            n’est pas encore livré : hors ligne, les écritures sont refusées avec un message. Au lot
            4, les opérations faites sans réseau apparaîtront ici, avec leur envoi au serveur, les
            refus éventuels et leur cause, l’export chiffré de sauvegarde et un rappel après une
            heure d’attente.
          </p>
        </div>
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
            est conservé.
          </p>
        </Modal>
      )}
    </>
  )
}

/** Application installée sur le poste (PWA) : icône sur le bureau, fenêtre à part, ouverture sans réseau. */
function InstallPanel() {
  const { installed, canPrompt } = useInstallState()
  const { notify } = useToast()
  return (
    <Panel
      title="Installation sur ce poste"
      subtitle="Installée, l’application s’ouvre depuis le bureau dans sa propre fenêtre, même sans réseau."
      action={
        canPrompt ? (
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
        ) : undefined
      }
    >
      <div className="panel-body">
        {installed ? (
          <p>
            <Badge tone="green" label="Installée" /> JB Hôtel est ouverte comme une application sur
            ce poste.
          </p>
        ) : canPrompt ? (
          <p>
            <Badge tone="blue" label="Installable" /> Cliquez sur « Installer l’application » : une
            icône JB Hôtel sera ajoutée au bureau et au menu Démarrer.
          </p>
        ) : (
          <p>
            <Badge tone="neutral" label="Non installée" /> Dans Edge ou Chrome, ouvrez le menu du
            navigateur puis « Applications » → « Installer JB Hôtel ». L’installation demande une
            adresse sécurisée (HTTPS) et une première ouverture en ligne.
          </p>
        )}
      </div>
    </Panel>
  )
}
