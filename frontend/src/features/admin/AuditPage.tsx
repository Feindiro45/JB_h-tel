import { PageOverview } from '../../shared/ui/PageOverview'
import { useAutoFilters } from '../../shared/ui/useAutoFilters'
import { AutoFilterStatus } from '../../shared/ui/AutoFilterStatus'
import { Icon } from '../../shared/ui/Icon'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { SelectField, TextField } from '../../shared/ui/fields'
import { EmptyState, LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { Pagination } from '../../shared/ui/Pagination'
import { formatDateTime } from '../../shared/utils/format'
import { adminQuery, type AuditEntry, type AuditList } from './api'

export function AuditPage() {
  const {
    filters,
    draft,
    change: changeFilters,
    pending,
    valid,
  } = useAutoFilters({
    domain: '',
    from: '',
    to: '',
    actor_id: '',
    page: 1,
    per_page: 25,
  })
  const list = useQuery(adminQuery<AuditList>('audit-logs', filters))
  const [detail, setDetail] = useState<AuditEntry | null>(null)
  const agents = useQuery(adminQuery<{ data: { id: string; name: string }[] }>('audit-actors'))
  const change = (key: 'domain' | 'from' | 'to' | 'actor_id', value: string) =>
    changeFilters({ [key]: value })
  return (
    <>
      <PageHeading
        icon="document"
        eyebrow="Administration"
        title="Journal d’audit"
        description="Historique en lecture seule des opérations et de leurs auteurs."
      />
      <PageOverview
        items={[
          {
            label: 'Opérations',
            value: list.data?.meta.total,
            hint: 'Ensemble des résultats filtrés',
            icon: 'document',
          },
          {
            label: 'Sur cette page',
            value: list.data?.data.length,
            hint: 'Opérations actuellement affichées',
            icon: 'layers',
          },
          {
            label: 'Auteurs',
            value: list.data
              ? new Set(list.data.data.map((r) => r.actor?.id).filter(Boolean)).size
              : undefined,
            hint: 'Auteurs distincts sur cette page',
            icon: 'people',
          },
          {
            label: 'Domaines',
            value: list.data?.domains.length,
            hint: 'Domaines disponibles dans le filtre',
            icon: 'filter',
          },
        ]}
      />
      <Panel title="Opérations">
        <div className="filterbar">
          <SelectField
            label="Domaine"
            value={draft.domain}
            onChange={(e) => change('domain', e.target.value)}
          >
            <option value="">Tous</option>
            {list.data?.domains.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Auteur"
            value={draft.actor_id}
            onChange={(e) => change('actor_id', e.target.value)}
          >
            <option value="">Tous</option>
            {agents.data?.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Du"
            type="date"
            value={draft.from}
            onChange={(e) => change('from', e.target.value)}
          />
          <TextField
            label="Au"
            type="date"
            value={draft.to}
            onChange={(e) => change('to', e.target.value)}
          />
          <AutoFilterStatus pending={pending} valid={valid} />
        </div>
        {list.isPending ? (
          <LoadingBlock />
        ) : !list.data?.data.length ? (
          <EmptyState />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opération</th>
                  <th>Auteur</th>
                  <th>Élément</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((r) => {
                  const target = (
                    {
                      reservation: '/reservations/',
                      customer: '/clients/',
                      payment: '/documents/recus/',
                    } as Record<string, string>
                  )[r.entity.type]
                  return (
                    <tr key={r.id}>
                      <td>{formatDateTime(r.occurred_at)}</td>
                      <td>{r.label}</td>
                      <td>{r.actor?.name ?? 'Système'}</td>
                      <td>
                        {target && r.entity.id ? (
                          <Link to={`${target}${r.entity.id}`}>{r.entity.type_label}</Link>
                        ) : (
                          r.entity.type_label
                        )}
                      </td>
                      <td>
                        <button className="text-button" onClick={() => setDetail(r)}>
                          <Icon name="eye" size={17} />
                          Détail
                        </button>
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
          onPage={(page) => changeFilters({ page })}
          perPage={filters.per_page}
          onPerPage={(per_page) => changeFilters({ per_page })}
        />
      </Panel>
      {detail && (
        <Modal
          title={detail.label}
          subtitle={`${detail.actor?.name ?? 'Système'} · ${formatDateTime(detail.occurred_at)}`}
          onClose={() => setDetail(null)}
        >
          <div className="fields">
            <div>
              <h3>Avant</h3>
              <pre className="audit-state">{JSON.stringify(detail.before, null, 2) ?? '—'}</pre>
            </div>
            <div>
              <h3>Après</h3>
              <pre className="audit-state">{JSON.stringify(detail.after, null, 2) ?? '—'}</pre>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
