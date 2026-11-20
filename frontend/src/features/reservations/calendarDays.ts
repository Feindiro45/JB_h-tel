/** Écart de dates civiles, sans dépendre du fuseau du navigateur ou des changements d’heure. */
export function calendarDaysBetween(from: string, to: string): number | null {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const time = Date.parse(`${value}T00:00:00Z`)
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
      ? time
      : null
  }
  const start = parse(from),
    end = parse(to)
  return start === null || end === null || end < start ? null : (end - start) / 86400000
}
