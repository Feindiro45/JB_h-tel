type Value = string | number | boolean | null | undefined

/** Filtres d'un écran envoyés à son export : sans la pagination (le classeur prend tout). */
export function exportQuery(filters: object): Record<string, Value> {
  const query: Record<string, Value> = {}
  for (const [key, value] of Object.entries(filters as Record<string, Value>)) {
    if (key !== 'page' && key !== 'per_page') query[key] = value
  }
  return query
}
