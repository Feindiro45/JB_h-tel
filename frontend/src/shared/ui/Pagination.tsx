/** Pagination des listes de l'API (`meta.current_page`, `meta.last_page`). */
export function Pagination({
  meta,
  onPage,
}: {
  meta: { current_page: number; last_page: number } | undefined
  onPage: (page: number) => void
}) {
  if (!meta || meta.last_page <= 1) return null
  return (
    <nav className="toolbar" style={{ padding: '12px 18px' }} aria-label="Pagination">
      <button
        type="button"
        className="secondary"
        disabled={meta.current_page <= 1}
        onClick={() => onPage(meta.current_page - 1)}
      >
        ← Précédent
      </button>
      <span className="caption" aria-current="page">
        Page {meta.current_page} sur {meta.last_page}
      </span>
      <button
        type="button"
        className="secondary"
        disabled={meta.current_page >= meta.last_page}
        onClick={() => onPage(meta.current_page + 1)}
      >
        Suivant →
      </button>
    </nav>
  )
}
