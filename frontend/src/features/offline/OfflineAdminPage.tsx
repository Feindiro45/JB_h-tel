import { exportQuery } from '../../shared/export/exportQuery'
import { ExportButton } from '../../shared/ui/ExportButton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { OPERATION_LABELS } from '../../shared/offline/rules'
import type { OperationKind } from '../../shared/offline/outbox'
import { Badge } from '../../shared/ui/Badge'
import { SelectField, TextAreaField, TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { EmptyState, LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { LocalTable } from '../../shared/ui/LocalTable'
import { Modal } from '../../shared/ui/Modal'
import { PageOverview } from '../../shared/ui/PageOverview'
import { Pagination } from '../../shared/ui/Pagination'
import { useToast } from '../../shared/ui/toastContext'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { formatDateTime, formatNumber } from '../../shared/utils/format'
import {
  OFFLINE_ADMIN_KEY,
  offlineOperationsQuery,
  offlineOverviewQuery,
  reviewOperation,
  type OfflineOperationRow,
  type Outcome,
  type Review,
  type StationState,
} from './adminApi'
import { OfflineGuide } from './OfflineGuide'
import './offline.css'

const OUTCOME_TONE: Record<Outcome, 'green' | 'blue' | 'red'> = {
  ACCEPTED: 'green',
  DUPLICATE: 'blue',
  REJECTED: 'red',
}
const REVIEW_TONE: Record<Review, 'amber' | 'green' | 'neutral'> = {
  TO_REVIEW: 'amber',
  REENTERED: 'green',
  REJECTED: 'neutral',
}
const SYNC_LABEL = { success: 'Réussie', partial: 'Partielle', failure: 'Échec' } as const

const when = (value: string | null | undefined) => (value ? formatDateTime(value) : '—')

/** État d'un poste lisible d'un coup d'œil : en ligne, ou silencieux depuis… */
function StationStatus({ station }: { station: StationState }) {
  return station.silent ? (
    <Badge tone="amber" label={`Silencieux depuis ${when(station.last_seen_at)}`} />
  ) : (
    <Badge tone="green" label="En ligne" />
  )
}

/**
 * Administration → Mode hors ligne (lot 4A, D-064) : l'administrateur suit le poste principal et
 * les autres postes depuis n'importe quel appareil, examine les opérations refusées et retrouve
 * les règles, les sauvegardes et le guide « Comment gérer ».
 */
export function OfflineAdminPage() {
  const overview = useQuery(offlineOverviewQuery)
  const data = overview.data
  const main = data?.main ?? null

  return (
    <>
      <PageHeading
        icon="cloudOff"
        eyebrow="Administration"
        title="Mode hors ligne"
        description="Poste principal, opérations faites sans Internet et refus à examiner."
        actions={
          <Link className="secondary" to="/admin/postes">
            <Icon name="cash" size={17} />
            Postes de caisse
          </Link>
        }
      />
      <PageOverview
        items={[
          {
            label: 'Poste principal',
            value: main ? (main.silent ? 'Silencieux' : 'En ligne') : 'Aucun',
            hint: main
              ? `${main.name} · signal ${when(main.last_seen_at)}`
              : 'À désigner dans Postes de caisse',
            icon: main && !main.silent ? 'cloud' : 'cloudOff',
            tone: main ? (main.silent ? 'amber' : 'green') : 'red',
          },
          {
            label: 'En attente sur le poste',
            value: main ? main.report.pending_operations : undefined,
            hint: main?.report.oldest_pending_at
              ? `La plus ancienne : ${when(main.report.oldest_pending_at)}`
              : 'Opérations pas encore envoyées',
            icon: 'upload',
            tone: main?.report.pending_operations ? 'amber' : 'blue',
          },
          {
            label: 'À examiner',
            value: data?.to_review,
            hint: 'Opérations refusées par le serveur',
            icon: 'shield',
            tone: data?.to_review ? 'red' : 'mint',
          },
          {
            label: 'Reçues aujourd’hui',
            value: data ? data.today.accepted + data.today.duplicates : undefined,
            hint: data
              ? `${data.today.duplicates} doublon(s) évité(s) · ${data.today.rejected} refus`
              : 'Opérations faites hors ligne',
            icon: 'check',
            tone: 'green',
          },
        ]}
      />

      {overview.isPending ? (
        <LoadingBlock lines={4} label="Chargement de l’état des postes…" />
      ) : data ? (
        <>
          <div className="sync-cards">
            <MainStationPanel station={main} silentAfter={data.silent_after_minutes} />
            <RulesPanel rules={data.rules} />
          </div>
          <StationsPanel stations={data.workstations} />
        </>
      ) : null}

      <SyncCenterPanel />
      <OfflineGuide />
    </>
  )
}

function MainStationPanel({
  station,
  silentAfter,
}: {
  station: StationState | null
  silentAfter: number
}) {
  const r = station?.report
  return (
    <Panel
      title="Poste principal"
      action={station ? <StationStatus station={station} /> : undefined}
    >
      {!station || !r ? (
        <EmptyState title="Aucun poste principal">
          Désignez-le dans <Link to="/admin/postes">Postes de caisse</Link> : il est le seul à
          enregistrer réservations et encaissements quand la règle est active.
        </EmptyState>
      ) : (
        <div className="panel-body">
          {station.silent && (
            <p className="notice" role="alert">
              Aucun signal depuis plus de {silentAfter} min : coupure d’Internet, poste éteint ou en
              panne. Ses opérations partiront au retour du réseau ; en cas de panne ou de vol, voir
              le guide ci-dessous.
            </p>
          )}
          <div className="pairs grid-pairs">
            <Pair label="Poste">{station.name}</Pair>
            <Pair label="Dernier signal">
              {when(station.last_seen_at)}
              {station.last_seen_by ? ` · ${station.last_seen_by}` : ''}
            </Pair>
            <Pair label="En attente d’envoi">{formatNumber(r.pending_operations)}</Pair>
            <Pair label="Refusées sur le poste">{formatNumber(r.rejected_operations)}</Pair>
            <Pair label="Dernière synchronisation">
              {r.last_sync_at ? (
                <>
                  {when(r.last_sync_at)}{' '}
                  {r.last_sync_status && (
                    <Badge
                      tone={
                        r.last_sync_status === 'success'
                          ? 'green'
                          : r.last_sync_status === 'partial'
                            ? 'amber'
                            : 'red'
                      }
                      label={SYNC_LABEL[r.last_sync_status]}
                    />
                  )}
                </>
              ) : (
                'Aucune'
              )}
            </Pair>
            <Pair label="Dernière sauvegarde exportée">
              {r.last_backup_at ? when(r.last_backup_at) : 'Aucune'}
            </Pair>
            <Pair label="Stockage du poste">
              {r.storage_persisted === null
                ? 'Inconnu'
                : r.storage_persisted
                  ? 'Protégé'
                  : 'Non protégé'}
            </Pair>
            <Pair label="État reçu le">{when(r.reported_at)}</Pair>
          </div>
          {r.pending_operations > 0 && !r.last_backup_at && (
            <p className="notice" style={{ marginTop: 12 }}>
              Des opérations attendent sur ce poste sans sauvegarde exportée : demandez à la
              caissière « Exporter une sauvegarde » dans Synchronisation.
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

function RulesPanel({ rules }: { rules: import('../../shared/offline/rules').OfflineRules }) {
  const allowed = rules.allowed_operations
  return (
    <Panel
      title="Règles hors ligne"
      action={
        <Link className="text-button" to="/admin/parametres">
          <Icon name="settings" size={17} />
          Modifier
        </Link>
      }
    >
      <div className="panel-body pairs grid-pairs">
        <Pair label="Opérations permises sans Internet">
          {allowed === null || allowed.length === Object.keys(OPERATION_LABELS).length
            ? 'Toutes'
            : allowed.length === 0
              ? 'Aucune'
              : allowed.map((kind) => OPERATION_LABELS[kind as OperationKind] ?? kind).join(', ')}
        </Pair>
        <Pair label="Durée hors ligne">Sans limite (décision du 22/11/2026)</Pair>
        <Pair label="Verrouillage après">{rules.lock_after_minutes} min d’inactivité</Pair>
        <Pair label="Rappel de sauvegarde après">{rules.backup_reminder_minutes} min</Pair>
        <Pair label="Numéros provisoires">
          {rules.provisional_prefix}-POSTE-000001 · FAC-{rules.provisional_prefix}-…
        </Pair>
      </div>
    </Panel>
  )
}

function StationsPanel({ stations }: { stations: StationState[] }) {
  return (
    <Panel title="Tous les postes">
      {stations.length === 0 ? (
        <EmptyState title="Aucun poste">Les postes s’enregistrent à leur connexion.</EmptyState>
      ) : (
        <LocalTable label="postes" rows={stations} searchText={(s) => s.name}>
          {(rows) => (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Poste</th>
                    <th scope="col">État</th>
                    <th scope="col" className="num">
                      En attente
                    </th>
                    <th scope="col" className="num">
                      Refusées
                    </th>
                    <th scope="col">Dernière synchronisation</th>
                    <th scope="col">Sauvegarde</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.is_main && <small>Poste principal</small>}
                      </td>
                      <td>
                        <StationStatus station={s} />
                      </td>
                      <td className="num">{formatNumber(s.report.pending_operations)}</td>
                      <td className="num">{formatNumber(s.report.rejected_operations)}</td>
                      <td>{when(s.report.last_sync_at)}</td>
                      <td>{when(s.report.last_backup_at)}</td>
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

/** Centre de synchronisation (4A.4) : tout ce qui a été reçu des postes, refus à examiner d'abord. */
function SyncCenterPanel() {
  const { draft, filters, change } = useAutoFilters({
    outcome: '' as Outcome | '',
    review: 'TO_REVIEW' as Review | '',
    search: '',
    page: 1,
    per_page: 25,
  })
  const operations = useQuery(offlineOperationsQuery(filters))
  const [reviewing, setReviewing] = useState<OfflineOperationRow | null>(null)
  const rows = operations.data?.data ?? []

  return (
    <Panel
      title="Centre de synchronisation"
      subtitle="Opérations faites hors ligne et reçues par le serveur, avec la cause de chaque refus."
      action={
        <ExportButton
          path="/api/v1/offline/operations/export"
          module="hors-ligne"
          query={exportQuery(filters)}
        />
      }
    >
      <div className="filterbar">
        <TextField
          label="Recherche"
          value={draft.search}
          onChange={(e) => change({ search: e.target.value }, true)}
        />
        <SelectField
          label="Résultat"
          value={draft.outcome}
          onChange={(e) => change({ outcome: e.target.value as Outcome | '' })}
        >
          <option value="">Tous</option>
          <option value="ACCEPTED">Acceptées</option>
          <option value="DUPLICATE">Doublons évités</option>
          <option value="REJECTED">Refusées</option>
        </SelectField>
        <SelectField
          label="Examen"
          value={draft.review}
          onChange={(e) => change({ review: e.target.value as Review | '' })}
        >
          <option value="">Tous</option>
          <option value="TO_REVIEW">À examiner</option>
          <option value="REENTERED">Ressaisies</option>
          <option value="REJECTED">Rejet confirmé</option>
        </SelectField>
      </div>
      {operations.isPending ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title={filters.review === 'TO_REVIEW' ? 'Rien à examiner' : 'Aucune opération'}>
          {filters.review === 'TO_REVIEW'
            ? 'Aucun refus en attente : toutes les opérations reçues ont été acceptées ou traitées.'
            : 'Les opérations faites hors ligne apparaissent ici dès leur réception.'}
        </EmptyState>
      ) : (
        <div className="table-wrap outbox-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Opération</th>
                <th scope="col">Reçue le</th>
                <th scope="col">Résultat</th>
                <th scope="col">Cause</th>
                <th scope="col">Examen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.label}</strong>
                    <small>
                      {o.kind_label} · {o.user ?? '—'}
                      {o.workstation ? ` · ${o.workstation}` : ''}
                    </small>
                    {o.created_offline_at && (
                      <small>Faite hors ligne le {formatDateTime(o.created_offline_at)}</small>
                    )}
                  </td>
                  <td>
                    {formatDateTime(o.received_at)}
                    {o.attempts > 1 && <small>{o.attempts} envois</small>}
                  </td>
                  <td>
                    <Badge tone={OUTCOME_TONE[o.outcome]} label={o.outcome_label} />
                  </td>
                  <td>
                    {o.reason ? (
                      <>
                        {o.reason_title && <strong>{o.reason_title}</strong>}
                        <small>{o.reason}</small>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {o.review_status === 'TO_REVIEW' ? (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setReviewing(o)}
                        aria-label={`Examiner : ${o.label}`}
                      >
                        <Icon name="shield" size={17} />
                        Examiner
                      </button>
                    ) : o.review_status ? (
                      <>
                        <Badge tone={REVIEW_TONE[o.review_status]} label={o.review_label ?? ''} />
                        <small>
                          {o.reviewed_by} · {when(o.reviewed_at)}
                        </small>
                        {o.review_reason && <small>Motif : {o.review_reason}</small>}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        meta={operations.data?.meta}
        onPage={(page) => change({ page })}
        perPage={draft.per_page}
        onPerPage={(per_page) => change({ per_page })}
      />
      {reviewing && <ReviewDialog operation={reviewing} onClose={() => setReviewing(null)} />}
    </Panel>
  )
}

function ReviewDialog({
  operation,
  onClose,
}: {
  operation: OfflineOperationRow
  onClose: () => void
}) {
  const client = useQueryClient()
  const { notify } = useToast()
  const [resolution, setResolution] = useState<'REENTERED' | 'REJECTED'>('REENTERED')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const save = useMutation({
    mutationFn: () => reviewOperation(operation.id, { resolution, reason: reason.trim() }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: OFFLINE_ADMIN_KEY })
      notify(resolution === 'REENTERED' ? 'Opération notée comme ressaisie' : 'Rejet confirmé')
      onClose()
    },
  })
  return (
    <Modal
      title="Examiner l’opération refusée"
      subtitle={operation.label}
      onClose={onClose}
      onSubmit={() =>
        reason.trim().length < 3
          ? setError('Indiquez le motif (3 caractères au moins).')
          : save.mutate()
      }
      submitLabel="Enregistrer l’examen"
      submitting={save.isPending}
    >
      <p className="notice">
        <strong>{operation.reason_title ?? 'Refus du serveur'} :</strong> {operation.reason}
      </p>
      <div
        className="segmented"
        role="radiogroup"
        aria-label="Décision"
        style={{ margin: '12px 0' }}
      >
        <label>
          <input
            type="radio"
            name="resolution"
            checked={resolution === 'REENTERED'}
            onChange={() => setResolution('REENTERED')}
          />{' '}
          Ressaisie en ligne
        </label>
        <label>
          <input
            type="radio"
            name="resolution"
            checked={resolution === 'REJECTED'}
            onChange={() => setResolution('REJECTED')}
          />{' '}
          Rejet confirmé
        </label>
      </div>
      <div className="fields">
        <TextAreaField
          className="full"
          label="Motif"
          value={reason}
          maxLength={255}
          required
          error={error}
          hint="Inscrit au journal d’audit : par exemple « Ressaisi le 23/11 pour 20 000 FCFA »."
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  )
}
