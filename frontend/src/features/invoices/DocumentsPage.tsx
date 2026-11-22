import { invoicesOfflineWorkbook } from './exportOffline'
import { exportQuery } from '../../shared/export/exportQuery'
import { ExportButton } from '../../shared/ui/ExportButton'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { AutoFilterStatus } from '../../shared/ui/AutoFilterStatus'
import { useQuery } from '@tanstack/react-query'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { InvoiceRow } from '../../shared/api/types'
import { Badge } from '../../shared/ui/Badge'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, Metric, PageHeading, Panel } from '../../shared/ui/layout'
import { Icon } from '../../shared/ui/Icon'
import { Pagination } from '../../shared/ui/Pagination'
import { formatDay, formatFcfa, formatSignedFcfa, formatTime } from '../../shared/utils/format'
import { useCurrentUser } from '../auth'
import { ReceiptsPanel } from '../cashier'
import { invoicesListQuery, type InvoiceFilters } from './api'
import { CreditNoteDialog } from './CreditNoteDialog'

type Tab = 'factures' | 'recus'

/** Factures, avoirs et reçus : consultation, ticket 80 mm avec QR de vérification (D-065) et avoir motivé. */
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

  const focusTab = useRef(false)
  const select = (key: Tab) => {
    focusTab.current = true
    setParams(key === 'factures' ? {} : { onglet: key }, { replace: true })
  }
  useLayoutEffect(() => {
    if (focusTab.current) {
      document.getElementById(`${id}-${tab}`)?.focus()
      focusTab.current = false
    }
  }, [id, tab])
  // Flèches gauche/droite entre onglets (motif ARIA « tabs »).
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const index = visible.findIndex((t) => t.key === tab)
    const next =
      visible[(index + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length]
    select(next.key)
  }

  const tabNavigation = (
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
          <Icon name={t.key === 'factures' ? 'document' : 'cash'} size={20} />
          {t.label}
        </button>
      ))}
    </div>
  )
  return (
    <>
      <PageHeading
        icon="document"
        eyebrow="Finances"
        title="Factures et reçus"
        description="Consultez, filtrez, imprimez ou téléchargez vos factures, avoirs et reçus de paiement."
        actions={
          can('invoices.issue') && (
            <Link className="primary" to="/reservations">
              <Icon name="plus" />
              Facturer un séjour
            </Link>
          )
        }
      />
      {tab === 'factures' ? (
        <InvoicesPanel
          tabs={tabNavigation}
          panelId={`${id}-${tab}-panel`}
          labelledBy={`${id}-${tab}`}
        />
      ) : (
        <>
          {tabNavigation}
          <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}`}>
            <ReceiptsPanel />
          </div>
        </>
      )}
    </>
  )
}

function InvoicesPanel({
  tabs,
  panelId,
  labelledBy,
}: {
  tabs: ReactNode
  panelId: string
  labelledBy: string
}) {
  const { can } = useCurrentUser()
  const { filters, draft, change, pending, valid } = useAutoFilters<InvoiceFilters>({
    page: 1,
    per_page: 25,
  })
  const [crediting, setCrediting] = useState<InvoiceRow | null>(null)
  const list = useQuery(invoicesListQuery(filters))
  const rows = list.data?.data ?? []
  const totals = list.data?.totals

  return (
    <>
      {totals && (
        <div className="metrics" aria-label="Totaux des documents filtrés">
          <Metric
            tone="green"
            icon="document"
            label="Factures"
            value={formatFcfa(totals.invoices_fcfa)}
            hint="Montant des factures émises"
          />
          <Metric
            tone="blue"
            icon="document"
            label="Avoirs"
            value={formatSignedFcfa(-totals.credit_notes_fcfa)}
            hint="Documents rectificatifs"
          />
          <Metric
            tone="mint"
            icon="layers"
            label="Net facturé"
            value={formatSignedFcfa(totals.net_invoiced_fcfa)}
            hint="Factures moins avoirs"
          />
          <Metric
            tone="amber"
            icon="wallet"
            label="Documents"
            value={String(totals.count)}
            hint="Sur l’ensemble des résultats filtrés"
          />
        </div>
      )}
      {tabs}
      <div role="tabpanel" id={panelId} aria-labelledby={labelledBy}>
        <form
          className="filterbar"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Filtrer les factures"
        >
          <TextField
            label="Recherche"
            type="search"
            placeholder="Numéro de document ou client…"
            value={draft.search ?? ''}
            onChange={(e) => change({ search: e.target.value || undefined }, true)}
          />
          <SelectField
            label="Type"
            value={draft.type ?? ''}
            onChange={(e) => change({ type: e.target.value || undefined })}
          >
            <option value="">Tous</option>
            <option value="INVOICE">Factures</option>
            <option value="CREDIT_NOTE">Avoirs</option>
          </SelectField>
          <SelectField
            label="Statut"
            value={draft.status ?? ''}
            onChange={(e) => change({ status: e.target.value || undefined })}
          >
            <option value="">Tous</option>
            <option value="ISSUED">Émise</option>
            <option value="CREDITED">Annulée par avoir</option>
          </SelectField>
          <TextField
            label="Du"
            type="date"
            value={draft.from ?? ''}
            onChange={(e) => change({ from: e.target.value || undefined })}
          />
          <TextField
            label="Au"
            type="date"
            value={draft.to ?? ''}
            onChange={(e) => change({ to: e.target.value || undefined })}
          />
          <AutoFilterStatus pending={pending} valid={valid} />
        </form>

        <Panel
          title={`Liste des factures et avoirs${list.data?.meta ? ` (${list.data.meta.total})` : ''}`}
          action={
            <ExportButton
              path="/api/v1/invoices/export"
              module="factures"
              query={exportQuery(filters)}
              offline={(client) => invoicesOfflineWorkbook(client, filters)}
            />
          }
        >
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
                    <th scope="col">Type</th>
                    <th scope="col">Émis le</th>
                    <th scope="col">Client et chambre</th>
                    <th scope="col">Statut</th>
                    <th scope="col" className="num">
                      Montant net
                    </th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((invoice) => {
                    const isCredit = invoice.type === 'CREDIT_NOTE'
                    return (
                      <tr key={invoice.id}>
                        <td>
                          <div className="cell-with-icon">
                            <Icon name="document" size={21} />
                            <div>
                              <strong>
                                {invoice.type_label} {invoice.number}
                              </strong>
                              {invoice.credited_invoice && (
                                <small style={{ display: 'block' }}>
                                  annule la facture {invoice.credited_invoice.number}
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`document-type${isCredit ? ' document-type--credit' : ''}`}
                          >
                            {invoice.type_label}
                          </span>
                        </td>
                        <td>
                          <div className="cell-with-icon cell-date">
                            <Icon name="calendar" size={17} />
                            <time dateTime={invoice.issued_at}>
                              {formatDay(invoice.issued_at)} · {formatTime(invoice.issued_at)}
                            </time>
                          </div>
                        </td>
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
                            <small style={{ display: 'block' }}>
                              Chambre {invoice.room.number}
                            </small>
                          )}
                        </td>
                        <td>
                          <Badge
                            tone={
                              isCredit ? 'amber' : invoice.status === 'CREDITED' ? 'red' : 'green'
                            }
                            label={isCredit ? 'Avoir' : invoice.status_label}
                          />
                        </td>
                        <td className={`num${isCredit ? ' amount-out' : ''}`}>
                          {formatSignedFcfa(isCredit ? -invoice.net_fcfa : invoice.net_fcfa)}
                        </td>
                        <td className="num compact-actions">
                          <Link
                            className="text-button"
                            to={`/documents/factures/${invoice.id}/ticket`}
                            aria-label={`Ticket 80 mm de ${invoice.type_label.toLowerCase()} ${invoice.number}`}
                          >
                            <Icon name="print" size={15} />
                            Ticket
                          </Link>
                          <a
                            className="text-button"
                            href={invoice.verification_url}
                            target="_blank"
                            rel="noopener"
                            aria-label={`Vérification publique de ${invoice.number} (nouvel onglet)`}
                          >
                            <Icon name="shield" size={17} />
                            Vérification ↗
                          </a>
                          {!isCredit && invoice.status === 'ISSUED' && can('invoices.credit') && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => setCrediting(invoice)}
                              aria-label={`Émettre un avoir pour ${invoice.number}`}
                            >
                              <Icon name="undo" size={17} />
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
          <Pagination
            meta={list.data?.meta}
            onPage={(page) => change({ page })}
            perPage={filters.per_page}
            onPerPage={(per_page) => change({ per_page })}
          />
        </Panel>
      </div>
      {crediting && <CreditNoteDialog invoice={crediting} onClose={() => setCrediting(null)} />}
    </>
  )
}
