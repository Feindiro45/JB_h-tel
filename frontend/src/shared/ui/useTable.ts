import { useState } from 'react'

/** Pagination des petits catalogues déjà chargés intégralement par l'API. */
export function useTable<T>(rows: T[]) {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const lastPage = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(page, lastPage)
  return {
    rows: rows.slice((current - 1) * perPage, current * perPage),
    meta: { total: rows.length, current_page: current, last_page: lastPage },
    onPage: setPage,
    perPage,
    onPerPage: (value: number) => {
      setPerPage(value)
      setPage(1)
    },
  }
}
