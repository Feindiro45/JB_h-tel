import { useEffect, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Comportement commun des modales (règles validées) : le reste de l'application devient inerte,
 * le focus va au premier élément voulu, reste piégé dans la modale (Tab, Maj+Tab) et revient à
 * l'élément d'origine à la fermeture.
 */
export function useFocusTrap(
  container: RefObject<HTMLElement | null>,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const appRoot = document.getElementById('root')
    appRoot?.setAttribute('inert', '')
    const first = initialFocus?.current ?? container.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => {
      appRoot?.removeAttribute('inert')
      previouslyFocused?.focus()
    }
    // Exécuté une seule fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return function handleTabKey(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab' || !container.current) return
    const focusable = Array.from(container.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}
