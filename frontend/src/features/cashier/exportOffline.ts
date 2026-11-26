import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../shared/api/errors'
import type { CashJournal } from '../../shared/api/types'
import type { LocalWorkbookSpec } from '../../shared/export/localWorkbook'
import { formatDate } from '../../shared/utils/format'
import { cashJournalQuery } from './api'

/**
 * Classeur simplifié de la caisse sans réseau : le journal de la période affichée, tel que gardé
 * sur le poste (même calcul que le serveur, D-041). Une période jamais ouverte en ligne n'est pas
 * recalculée : le classeur serait incomplet, il est refusé avec une explication.
 */
export function cashOfflineWorkbook(
  client: QueryClient,
  period: { from: string; to: string; agentId: string; agentName?: string },
): LocalWorkbookSpec {
  const journal = client.getQueryData<CashJournal>(
    cashJournalQuery(period.from, period.to, period.agentId).queryKey,
  )
  if (!journal) {
    throw new ApiError(
      409,
      'Journal absent de ce poste',
      'Le journal de cette période n’est pas gardé sur ce poste : ouvrez-le une fois en ligne, ou faites « Tout télécharger pour le hors ligne » au retour du réseau.',
      {},
      'offline_data_missing',
    )
  }
  const { totals, movements } = journal
  const net = (row: { collected_fcfa: number; refunded_fcfa: number }) =>
    row.collected_fcfa - row.refunded_fcfa
  const days = new Map<
    string,
    { count: number; collected: number; refunded: number; net: number }
  >()
  for (const m of movements) {
    if (!m.counted) continue
    const day = m.at.slice(0, 10)
    const entry = days.get(day) ?? { count: 0, collected: 0, refunded: 0, net: 0 }
    if (m.type === 'PAYMENT') {
      entry.count++
      entry.collected += m.amount_fcfa
    } else entry.refunded += m.amount_fcfa
    entry.net += m.signed_amount_fcfa
    days.set(day, entry)
  }
  const daily = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const single = period.from === period.to

  return {
    title: 'Caisse',
    module: 'caisse',
    context: [
      single
        ? `Période : le ${formatDate(period.from)}`
        : `Période : du ${formatDate(period.from)} au ${formatDate(period.to)}`,
      period.agentName && `Agent : ${period.agentName}`,
    ].filter(Boolean) as string[],
    kpis: [
      {
        label: 'Encaissé',
        value: totals.collected_fcfa,
        format: 'fcfa',
        hint: `${totals.payments_count} versement(s) valide(s)`,
      },
      {
        label: 'Remboursé',
        value: totals.refunded_fcfa,
        format: 'fcfa',
        hint: `${totals.refunds_count} remboursement(s)`,
      },
      {
        label: 'Net de caisse',
        value: totals.net_fcfa,
        format: 'fcfa',
        hint: 'Encaissé − remboursé',
      },
      {
        label: 'Versements annulés',
        value: totals.cancelled_fcfa,
        format: 'fcfa',
        hint: 'Listés, jamais comptés',
      },
    ],
    summaries: [
      {
        heading: 'Net par moyen de paiement',
        valueLabel: 'Net',
        format: 'fcfa',
        rows: journal.by_method.map((row) => [row.label, net(row)]),
      },
      {
        heading: 'Net par agent',
        valueLabel: 'Net',
        format: 'fcfa',
        rows: journal.by_agent.map((row) => [row.label, net(row)]),
      },
      {
        heading: 'Net par jour',
        valueLabel: 'Net',
        format: 'fcfa',
        rows: daily.map(([day, entry]) => [`${day.slice(8, 10)}/${day.slice(5, 7)}`, entry.net]),
      },
    ],
    note: 'Encaissé : versements valides, par date de réception. Remboursé : remboursements, par date de traitement. Un versement annulé reste listé mais n’entre dans aucun total.',
    sheets: [
      {
        name: 'Mouvements',
        description: 'Encaissements et remboursements, dans l’ordre chronologique',
        columns: [
          { label: 'Date', type: 'datetime' },
          { label: 'Mouvement', width: 16 },
          { label: 'Reçu', width: 18 },
          { label: 'Client', width: 26 },
          { label: 'Chambre', width: 10 },
          { label: 'Moyen', width: 16 },
          { label: 'Agent', width: 20 },
          { label: 'Statut', width: 12 },
          { label: 'Montant', type: 'fcfa', total: false },
          { label: 'Compté en caisse', type: 'fcfa' },
          { label: 'Motif', width: 28 },
        ],
        rows: movements.map((m) => [
          m.at,
          m.type_label,
          m.receipt_number,
          m.customer?.full_name ?? '—',
          m.room?.number,
          m.method_label,
          m.agent.name,
          m.status_label,
          m.amount_fcfa,
          m.signed_amount_fcfa,
          m.reason,
        ]),
      },
      {
        name: 'Par jour',
        description: 'Récapitulatif quotidien de la caisse',
        columns: [
          { label: 'Jour', type: 'date' },
          { label: 'Versements', type: 'int' },
          { label: 'Encaissé', type: 'fcfa' },
          { label: 'Remboursé', type: 'fcfa' },
          { label: 'Net', type: 'fcfa' },
        ],
        rows: daily.map(([day, e]) => [day, e.count, e.collected, e.refunded, e.net]),
      },
    ],
  }
}
