import { useQuery } from '@tanstack/react-query'
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { InvoiceRow } from '../../shared/api/types'
import { Badge } from '../../shared/ui/Badge'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Pair, Panel } from '../../shared/ui/layout'
import { Pagination } from '../../shared/ui/Pagination'
import { formatDateTime, formatFcfa, formatSignedFcfa } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { ReceiptsPanel } from '../cashier'
import { invoicePdfUrl, invoicesListQuery, type InvoiceFilters } from './api'
import { CreditNoteDialog } from './CreditNoteDialog'

type Tab = 'factures' | 'recus'

/** Factures, avoirs et reçus : consultation, PDF A4, vérification et avoir motivé. */
export function DocumentsPage() {
  const { can } = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const id = useId()
  const tabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: 'factures', label: 'Factures et avoirs', visible: can('invoices.view') },
    { key: 'recus', label: 'Reçus de paiement', visible: can('payments.view') },
  ]
  const visible = tabs.filter((tab) => tab.visible)
  const requested = params.get('onglet') === 'recus' ? 'recus' : 'factures'
  const tab: Tab = visible.some((t) => t.key === requested)
    ? requested
    : (visible[0]?.key ?? 'factures')

  const select = (key: Tab) =>
    setParams(key === 'factures' ? {} : { onglet: key }, { replace: true })
  // Flèches gauche/droite entre onglets (motif ARIA « tabs »).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const index = visible.findIndex((t) => t.key === tab)
    const next =
      visible[(index + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length]
    select(next.key)
    document.getElementById(`${id}-${next.key}`)?.focus()
  }

  return (
    <>
      <PageHeading
        eyebrow="Finances"
        title="Factures et reçus"
        description="Consultez les pièces, imprimez-les en A4 ou enregistrez-les en PDF."
      />
      <div className="tabs" role="tablist" aria-label="Type de document" onKeyDown={onKeyDown}>
        {visible.map((t) => (
          <button
            key={t.key}
            id={`${id}-${t.key}`}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`${id}-${t.key}-panel`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => select(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}`}>
        {tab === 'factures' ? (
          <Panel title="Factures et avoirs">
            <InvoicesPanel />
          </Panel>
        ) : (
          <Panel title="Reçus de paiement" subtitle="Un reçu numéroté par versement">
            <ReceiptsPanel />
          </Panel>
        )}
      </div>
    </>
  )
}

function InvoicesPanel() {
  const { can } = useCurrentUser()
  const [filters, setFilters] = useState<InvoiceFilters>({ page: 1 })
  const [draft, setDraft] = useState<InvoiceFilters>({})
  const [crediting, setCrediting] = useState<InvoiceRow | null>(null)
  const list = useQuery(invoicesListQuery(filters))
  const rows = list.data?.data ?? []
  const totals = list.data?.totals

  function apply(event: FormEvent) {
    event.preventDefault()
    setFilters({ ...draft, page: 1 })
  }

  return (
    <>
      <form className="filterbar" onSubmit={apply} aria-label="Filtrer les factures">
        <TextField
          label="Numéro"
          type="search"
          placeholder="FAC-2026-…"
          value={draft.search ?? ''}
          onChange={(e) => setDraft({ ...draft, search: e.target.value || undefined })}
        />
        <SelectField
          label="Type"
          value={draft.type ?? ''}
          onChange={(e) => setDraft({ ...draft, type: e.target.value || undefined })}
        >
          <option value="">Tous</option>
          <option value="INVOICE">Factures</option>
          <option value="CREDIT_NOTE">Avoirs</option>
        </SelectField>
        <SelectField
          label="Statut"
          value={draft.status ?? ''}
          onChange={(e) => setDraft({ ...draft, status: e.target.value || undefined })}
        >
          <option value="">Tous</option>
          <option value="ISSUED">Émise</option>
          <option value="CREDITED">Annulée par avoir</option>
        </SelectField>
        <TextField
          label="Du"
          type="date"
          value={draft.from ?? ''}
          onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })}
        />
        <TextField
          label="Au"
          type="date"
          value={draft.to ?? ''}
          onChange={(e) => setDraft({ ...draft, to: e.target.value || undefined })}
        />
        <button type="submit" className="secondary">
          Filtrer
        </button>
      </form>

      {totals && (
        <div className="summary-strip" aria-label="Totaux des documents filtrés">
          <Pair label="Factures">{formatFcfa(totals.invoices_fcfa)}</Pair>
          <Pair label="Avoirs">{formatSignedFcfa(-totals.credit_notes_fcfa)}</Pair>
          <Pair label="Net facturé">{formatSignedFcfa(totals.net_invoiced_fcfa)}</Pair>
          <Pair label="Documents">{String(totals.count)}</Pair>
        </div>
      )}

      {list.isPending ? (
        <LoadingBlock />
      ) : rows.length === 0 ? (
        <EmptyState title="Aucun document">
          Aucune facture ni aucun avoir ne correspond à ces critères.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Émis le</th>
                <th scope="col">Client et chambre</th>
                <th scope="col">Statut</th>
                <th scope="col" className="num">
                  Montant net
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => {
                const isCredit = invoice.type === 'CREDIT_NOTE'
                return (
                  <tr key={invoice.id}>
                    <td>
                      <strong>
                        {invoice.type_label} {invoice.number}
                      </strong>
                      {invoice.credited_invoice && (
                        <small style={{ display: 'block' }}>
                          annule la facture {invoice.credited_invoice.number}
                        </small>
                      )}
                    </td>
                    <td>{formatDateTime(invoice.issued_at)}</td>
                    <td>
                      {invoice.reservation ? (
                        <Link
                          className="text-button"
                          to={`/reservations/${invoice.reservation.id}`}
                        >
                          {invoice.customer?.full_name ?? 'Séjour'}
                        </Link>
                      ) : (
                        (invoice.customer?.full_name ?? '—')
                      )}
                      {invoice.room && (
                        <small style={{ display: 'block' }}>Chambre {invoice.room.number}</small>
                      )}
                    </td>
                    <td>
                      <Badge
                        tone={isCredit ? 'amber' : invoice.status === 'CREDITED' ? 'red' : 'green'}
                        label={isCredit ? 'Avoir' : invoice.status_label}
                      />
                    </td>
                    <td className={`num${isCredit ? ' amount-out' : ''}`}>
                      {formatSignedFcfa(isCredit ? -invoice.net_fcfa : invoice.net_fcfa)}
                    </td>
                    <td className="num compact-actions">
                      <a
                        className="text-button"
                        href={invoicePdfUrl(invoice.id)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`PDF de ${invoice.type_label.toLowerCase()} ${invoice.number} (nouvel onglet)`}
                      >
                        PDF ↗
                      </a>
                      <a
                        className="text-button"
                        href={invoice.verification_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Vérification publique de ${invoice.number} (nouvel onglet)`}
                      >
                        Vérification ↗
                      </a>
                      {!isCredit && invoice.status === 'ISSUED' && can('invoices.credit') && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setCrediting(invoice)}
                          aria-label={`Émettre un avoir pour ${invoice.number}`}
                        >
                          Avoir
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={list.data?.meta} onPage={(page) => setFilters({ ...filters, page })} />
      {crediting && <CreditNoteDialog invoice={crediting} onClose={() => setCrediting(null)} />}
    </>
  )
}
