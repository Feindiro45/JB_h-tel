import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useConnectivity } from '../../shared/offline/connectivity'
import {
  notifyOutboxChanged,
  outboxQuery,
  updateOperation,
  type OperationStatus,
  type QueuedOperation,
} from '../../shared/offline/outbox'
import { sendPendingOperations } from '../../shared/offline/outboxSync'
import { SYNC_LOG_KEY } from '../../shared/offline/syncQueries'
import { Badge } from '../../shared/ui/Badge'
import { TextAreaField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { EmptyState, Panel } from '../../shared/ui/layout'
import { LocalTable } from '../../shared/ui/LocalTable'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'

const STATUS: Record<
  OperationStatus,
  { tone: 'amber' | 'green' | 'red' | 'neutral'; label: string }
> = {
  pending: { tone: 'amber', label: 'En attente' },
  accepted: { tone: 'green', label: 'Envoyée' },
  rejected: { tone: 'red', label: 'Refusée' },
  abandoned: { tone: 'neutral', label: 'Abandonnée' },
}

/**
 * Sens « poste → serveur » du menu Synchronisation (lot 4, D-064) : opérations faites hors ligne,
 * envoyées au serveur qui les revalide. Une opération refusée reste visible avec sa cause : on
 * peut la réessayer après correction, ou l'abandonner avec un motif, jamais l'effacer.
 */
export function OutboxPanel() {
  const client = useQueryClient()
  const { user } = useCurrentUser()
  const { online } = useConnectivity()
  const { notify } = useToast()
  const outbox = useQuery(outboxQuery)
  const [abandoning, setAbandoning] = useState<QueuedOperation | null>(null)

  const operations = [...(outbox.data ?? [])].sort((a, b) => b.createdAt - a.createdAt)
  const count = (status: OperationStatus) => operations.filter((o) => o.status === status).length
  const mine = operations.filter((o) => o.status === 'pending' && o.userId === user?.id)
  const others = count('pending') - mine.length

  const send = useMutation({
    mutationFn: () => sendPendingOperations(client, 'manual', user),
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: (run) => {
      void client.invalidateQueries({ queryKey: SYNC_LOG_KEY })
      if (!run) return notify('Aucune opération à envoyer')
      notify(
        run.status === 'success'
          ? `${run.records} opération(s) envoyée(s) et enregistrée(s) par le serveur`
          : `Envoi ${run.status === 'partial' ? 'partiel' : 'impossible'} : voir la cause dans la liste`,
      )
    },
  })

  const retry = useMutation({
    mutationFn: (operation: QueuedOperation) =>
      updateOperation(operation.id, { status: 'pending', error: null }),
    networkMode: 'always',
    onSuccess: () => {
      notifyOutboxChanged(client)
      notify('Opération remise en attente d’envoi')
    },
  })

  return (
    <Panel
      title="Mettre à jour en ligne"
      subtitle="Sens poste → serveur : opérations faites hors ligne, revalidées par le serveur à l’envoi (D-064)."
      action={
        <button
          type="button"
          className="primary"
          disabled={!online || mine.length === 0 || send.isPending}
          onClick={() => send.mutate()}
        >
          <Icon name="refresh" size={17} />
          {send.isPending ? 'Envoi…' : 'Mettre à jour en ligne'}
        </button>
      }
    >
      <div className="panel-body outbox-summary">
        <Badge tone="amber" label={`${count('pending')} en attente`} />
        <Badge tone="green" label={`${count('accepted')} envoyée(s)`} />
        <Badge tone="red" label={`${count('rejected')} refusée(s)`} />
        {!online && mine.length > 0 && (
          <span>L’envoi partira automatiquement au retour du réseau.</span>
        )}
        {others > 0 && (
          <span>
            {others} opération(s) d’un autre utilisateur : elle(s) partiront à sa prochaine
            connexion sur ce poste.
          </span>
        )}
      </div>
      {operations.length === 0 ? (
        <EmptyState title="Aucune opération faite hors ligne">
          Hors ligne, réservations, clients, encaissements, arrivées, départs, prolongations et
          annulations sont gardés ici puis envoyés au serveur.
        </EmptyState>
      ) : (
        <LocalTable
          label="opérations hors ligne"
          rows={operations}
          searchText={(o) =>
            `${o.label} ${o.userName} ${STATUS[o.status].label} ${o.provisionalNumber ?? ''} ${o.definitiveNumber ?? ''} ${o.error?.message ?? ''}`
          }
        >
          {(rows) => (
            <div className="table-wrap outbox-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Opération</th>
                    <th scope="col">État</th>
                    <th scope="col">Détail</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.label}</strong>
                        <small>
                          {formatDateTime(new Date(o.createdAt))} · {o.userName}
                        </small>
                        {o.provisionalNumber && (
                          <small>
                            {o.kind === 'invoice.issue' ? 'Facture' : 'Reçu'} {o.provisionalNumber}
                            {o.definitiveNumber ? ` → ${o.definitiveNumber}` : ' (provisoire)'}
                          </small>
                        )}
                      </td>
                      <td>
                        <Badge tone={STATUS[o.status].tone} label={STATUS[o.status].label} />
                      </td>
                      <td>
                        {o.error ? (
                          <>
                            <strong>{o.error.title}</strong>
                            <small>{o.error.message}</small>
                          </>
                        ) : o.abandonReason ? (
                          <small>Motif : {o.abandonReason}</small>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="compact-actions">
                        {o.status === 'rejected' && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => retry.mutate(o)}
                            aria-label={`Réessayer : ${o.label}`}
                          >
                            <Icon name="refresh" size={17} />
                            Réessayer
                          </button>
                        )}
                        {(o.status === 'rejected' || o.status === 'pending') && (
                          <button
                            type="button"
                            className="text-button text-button--danger"
                            onClick={() => setAbandoning(o)}
                            aria-label={`Abandonner : ${o.label}`}
                          >
                            <Icon name="close" size={17} />
                            Abandonner
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
      )}
      {abandoning && <AbandonDialog operation={abandoning} onClose={() => setAbandoning(null)} />}
    </Panel>
  )
}

function AbandonDialog({
  operation,
  onClose,
}: {
  operation: QueuedOperation
  onClose: () => void
}) {
  const client = useQueryClient()
  const { notify } = useToast()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const save = useMutation({
    mutationFn: () =>
      updateOperation(operation.id, { status: 'abandoned', abandonReason: reason.trim() }),
    networkMode: 'always',
    onSuccess: () => {
      notifyOutboxChanged(client)
      notify('Opération abandonnée : elle ne sera pas envoyée')
      onClose()
    },
  })
  return (
    <Modal
      title="Abandonner l’opération"
      subtitle={operation.label}
      danger
      onClose={onClose}
      onSubmit={() => {
        if (reason.trim().length < 3) return setError('Indiquez le motif (3 caractères au moins).')
        save.mutate()
      }}
      submitLabel="Abandonner"
      submitting={save.isPending}
    >
      <p>
        L’opération ne sera jamais envoyée au serveur. Elle reste dans la liste avec votre motif. Si
        de l’argent a été encaissé, régularisez-le par une nouvelle saisie en ligne.
      </p>
      <div className="fields">
        <TextAreaField
          className="full"
          label="Motif de l’abandon"
          value={reason}
          maxLength={255}
          required
          error={error}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Modal>
  )
}
