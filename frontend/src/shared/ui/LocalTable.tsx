import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { AutoFilterStatus } from './AutoFilterStatus'
import { TextField } from './fields'
import { EmptyState } from './layout'
import { Pagination } from './Pagination'
import { useTable } from './useTable'

/** Tableaux secondaires dont toutes les lignes sont déjà fournies par l’API. */
export function LocalTable<T>({
  label,
  rows,
  searchText,
  children,
}: {
  label: string
  rows: T[]
  searchText: (row: T) => string
  children: (rows: T[]) => ReactNode
}) {
  const [search, setSearch] = useState('')
  const [printing, setPrinting] = useState(false)
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  const filtered = rows.filter((row) =>
    normalize(searchText(row)).includes(normalize(search.trim())),
  )
  const table = useTable(filtered)

  useEffect(() => {
    // Le navigateur doit disposer des lignes complètes avant de prendre son instantané papier.
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  return (
    <section className="table-section" aria-label={`Tableau : ${label}`}>
      <div className="filterbar no-print" role="search" aria-label={`Filtres : ${label}`}>
        <TextField
          label={`Rechercher dans ${label}`}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            table.onPage(1)
          }}
        />
        <AutoFilterStatus pending={false} valid />
      </div>
      {printing ? (
        children(rows)
      ) : filtered.length ? (
        children(table.rows)
      ) : (
        <EmptyState title="Aucun résultat" />
      )}
      <Pagination {...table} label={`Pagination : ${label}`} />
    </section>
  )
}
