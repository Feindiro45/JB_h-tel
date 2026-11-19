import { useEffect, useRef, useState } from 'react'

interface Options {
  requiredPeriod?: boolean
  maxDays?: number
}

/** Ne publie pas une période incomplète ou inversée pendant sa saisie. */
function validPeriod(value: object, options: Options): boolean {
  const { from, to } = value as { from?: string; to?: string }
  if (options.requiredPeriod && (!from || !to)) return false
  const date = /^\d{4}-\d{2}-\d{2}$/
  if ((from && !date.test(from)) || (to && !date.test(to))) return false
  if (from && to && from > to) return false
  if (
    from &&
    to &&
    options.maxDays &&
    (Date.parse(to) - Date.parse(from)) / 86400000 + 1 > options.maxDays
  )
    return false
  return true
}

/** Filtres instantanés ; recherche différée de 300 ms, annulation et retour en page 1. */
export function useAutoFilters<T extends object>(initial: T, options: Options = {}) {
  const initialRef = useRef(initial)
  const draftRef = useRef(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [draft, setDraft] = useState(initial)
  const [filters, setFilters] = useState(initial)
  const [pending, setPending] = useState(false)
  useEffect(() => () => clearTimeout(timer.current), [])

  function publish(next: T, debounce: boolean) {
    clearTimeout(timer.current)
    draftRef.current = next
    setDraft(next)
    if (!validPeriod(next, options)) {
      setPending(false)
      return
    }
    setPending(debounce)
    if (debounce)
      timer.current = setTimeout(() => {
        setFilters(next)
        setPending(false)
      }, 300)
    else setFilters(next)
  }
  function change(patch: Partial<T>, debounce = false) {
    const next = { ...draftRef.current, ...patch }
    if ('page' in next && !('page' in patch)) next.page = 1
    publish(next, debounce)
  }
  function reset() {
    const next = { ...initialRef.current }
    if ('per_page' in next && 'per_page' in draftRef.current)
      next.per_page = draftRef.current.per_page
    publish(next, false)
  }
  return { draft, filters, change, reset, pending, valid: validPeriod(draft, options) }
}
