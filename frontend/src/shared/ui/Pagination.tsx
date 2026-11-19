const number = new Intl.NumberFormat('fr-FR')

/** Garde les extrémités et les pages voisines sans allonger les grandes listes. */
function pageNumbers(current: number, last: number): (number | string)[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const start = Math.max(2, Math.min(current - 1, last - 3))
  const end = Math.min(last - 1, Math.max(current + 1, 4))
  const pages: (number | string)[] = [1]
  if (start > 2) pages.push('before')
  for (let page = start; page <= end; page++) pages.push(page)
  if (end < last - 1) pages.push('after')
  pages.push(last)
  return pages
}

function Chevron({ next = false }: { next?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={next ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Pied de liste commun : plage affichée, navigation numérotée et taille de page. */
export function Pagination({
  meta,
  onPage,
  perPage,
  onPerPage,
  label = 'Pagination',
}: {
  meta: { current_page: number; last_page: number; total?: number; per_page?: number } | undefined
  onPage: (page: number) => void
  perPage?: number
  onPerPage?: (size: number) => void
  label?: string
}) {
  if (!meta) return null
  const last = Math.max(1, meta.last_page)
  const current = Math.min(Math.max(1, meta.current_page), last)
  const size = meta.per_page ?? perPage ?? 25
  const total = meta.total
  const firstRow = (current - 1) * size + 1
  const lastRow = total === undefined ? 0 : Math.min(current * size, total)
  return (
    <nav className="pagination" aria-label={label}>
      <p className="pagination__summary" aria-live="polite" aria-atomic="true">
        {total === undefined ? (
          <>
            Page <strong>{number.format(current)}</strong> sur {number.format(last)}
          </>
        ) : total === 0 ? (
          'Aucun résultat'
        ) : (
          <>
            <strong>
              {number.format(firstRow)}–{number.format(lastRow)}
            </strong>
            <span>
              {' '}
              sur {number.format(total)} résultat{total > 1 ? 's' : ''}
            </span>
          </>
        )}
        {total !== undefined && (
          <span className="sr-only">
            . Page {current} sur {last}.
          </span>
        )}
      </p>
      <div className="pagination__controls">
        <button
          type="button"
          className="pagination__arrow"
          aria-label="Page précédente"
          disabled={current <= 1}
          onClick={() => onPage(current - 1)}
        >
          <Chevron />
          <span>Précédent</span>
        </button>
        <ol className="pagination__pages" aria-label="Pages">
          {pageNumbers(current, last).map((page) =>
            typeof page === 'string' ? (
              <li key={page} className="pagination__ellipsis" aria-hidden="true">
                …
              </li>
            ) : (
              <li
                key={page}
                className={
                  Math.abs(page - current) > 1 &&
                  !(current <= 2 && page <= 3) &&
                  !(current >= last - 1 && page >= last - 2)
                    ? 'pagination__distant'
                    : undefined
                }
              >
                <button
                  type="button"
                  className="pagination__page"
                  aria-label={`Page ${page}`}
                  aria-current={page === current ? 'page' : undefined}
                  onClick={() => {
                    if (page !== current) onPage(page)
                  }}
                >
                  {number.format(page)}
                </button>
              </li>
            ),
          )}
        </ol>
        <button
          type="button"
          className="pagination__arrow"
          aria-label="Page suivante"
          disabled={current >= last}
          onClick={() => onPage(current + 1)}
        >
          <span>Suivant</span>
          <Chevron next />
        </button>
      </div>
      {onPerPage && (
        <label className="pagination__size">
          <span className="pagination__size-label" aria-hidden="true">
            Afficher
          </span>
          <span className="sr-only">Lignes par page</span>
          <select value={perPage ?? size} onChange={(e) => onPerPage(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span aria-hidden="true">par page</span>
        </label>
      )}
    </nav>
  )
}
