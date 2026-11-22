import type { QueryClient } from '@tanstack/react-query'
import type { InvoiceRow } from '../../shared/api/types'
import { groupRows, monthlyRows, type LocalWorkbookSpec } from '../../shared/export/localWorkbook'
import { formatDate } from '../../shared/utils/format'
import type { InvoiceFilters } from './api'

/** Factures et avoirs gardés sur le poste (lignes des listes), sans doublon. */
function keptInvoices(client: QueryClient): InvoiceRow[] {
  const byId = new Map<string, InvoiceRow>()
  for (const query of client.getQueryCache().findAll({ queryKey: ['invoices', 'list'] })) {
    const data = query.state.data as { data?: InvoiceRow[] } | undefined
    for (const row of data?.data ?? []) if (!byId.has(row.id)) byId.set(row.id, row)
  }
  return [...byId.values()]
}

/** Classeur simplifié des factures et avoirs gardés sur le poste (export sans réseau). */
export function invoicesOfflineWorkbook(
  client: QueryClient,
  filters: InvoiceFilters,
): LocalWorkbookSpec {
  const search = filters.search?.trim().toLowerCase()
  const documents = keptInvoices(client)
    .filter((i) => !filters.type || i.type === filters.type)
    .filter((i) => !filters.status || i.status === filters.status)
    .filter((i) => !filters.from || i.issued_at.slice(0, 10) >= filters.from)
    .filter((i) => !filters.to || i.issued_at.slice(0, 10) <= filters.to)
    .filter(
      (i) => !search || `${i.number} ${i.customer?.full_name ?? ''}`.toLowerCase().includes(search),
    )
    .sort((a, b) => b.issued_at.localeCompare(a.issued_at))
  const isCredit = (i: InvoiceRow) => i.type === 'CREDIT_NOTE'
  const signed = (i: InvoiceRow) => (isCredit(i) ? -i.net_fcfa : i.net_fcfa)
  const invoices = documents.filter((i) => !isCredit(i))
  const credits = documents.filter(isCredit)
  const sum = (list: InvoiceRow[]) => list.reduce((total, i) => total + i.net_fcfa, 0)

  return {
    title: 'Factures et avoirs',
    module: 'factures',
    context: [
      filters.type && `Type : ${filters.type === 'CREDIT_NOTE' ? 'Avoir' : 'Facture'}`,
      filters.from && `Du : ${formatDate(filters.from)}`,
      filters.to && `Au : ${formatDate(filters.to)}`,
      filters.search && `Recherche : ${filters.search}`,
    ].filter(Boolean) as string[],
    kpis: [
      {
        label: 'Factures',
        value: sum(invoices),
        format: 'fcfa',
        hint: `${invoices.length} facture(s)`,
      },
      { label: 'Avoirs', value: sum(credits), format: 'fcfa', hint: `${credits.length} avoir(s)` },
      {
        label: 'Net facturé',
        value: sum(invoices) - sum(credits),
        format: 'fcfa',
        hint: 'Factures − avoirs',
      },
      {
        label: 'Remises facturées',
        value: invoices.reduce((total, i) => total + i.discount_fcfa, 0),
        format: 'fcfa',
        hint: 'Sur les factures',
      },
    ],
    summaries: [
      {
        heading: 'Documents par statut',
        valueLabel: 'Documents',
        rows: groupRows(documents, (i) => (isCredit(i) ? 'Avoir' : i.status_label)),
      },
      {
        heading: 'Net facturé par mois',
        valueLabel: 'Net facturé',
        format: 'fcfa',
        rows: monthlyRows(documents, (i) => i.issued_at, signed),
      },
    ],
    note: 'Facturé = factures émises − avoirs émis, à leur date d’émission (D-040). Une facture provisoire (FAC-LOC-…) reçoit son numéro définitif au retour du réseau.',
    sheets: [
      {
        name: 'Documents',
        description: 'Un document par ligne ; « Net signé » compte les avoirs en négatif',
        columns: [
          { label: 'Numéro', width: 18 },
          { label: 'Type', width: 10 },
          { label: 'Émis le', type: 'datetime' },
          { label: 'Statut', width: 18 },
          { label: 'Client', width: 26 },
          { label: 'Chambre', width: 10 },
          { label: 'Brut', type: 'fcfa' },
          { label: 'Remise', type: 'fcfa' },
          { label: 'Net', type: 'fcfa' },
          { label: 'Net signé', type: 'fcfa' },
          { label: 'Facture annulée', width: 18 },
        ],
        rows: documents.map((i) => [
          i.number,
          i.type_label,
          i.issued_at,
          isCredit(i) ? 'Avoir' : i.status_label,
          i.customer?.full_name,
          i.room?.number,
          i.gross_fcfa,
          i.discount_fcfa,
          i.net_fcfa,
          signed(i),
          i.credited_invoice?.number,
        ]),
      },
    ],
  }
}
