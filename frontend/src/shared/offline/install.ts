import { useSyncExternalStore } from 'react'

/**
 * Installation de l'application (PWA, lot 2) : Edge et Chrome proposent l'installation par
 * l'événement `beforeinstallprompt`, gardé ici dès le démarrage pour le bouton « Installer
 * l'application ». Les autres navigateurs passent par leur propre menu.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  /** Application déjà ouverte comme application installée. */
  installed: boolean
  /** Le navigateur accepte d'afficher sa fenêtre d'installation. */
  canPrompt: boolean
}

let deferred: BeforeInstallPromptEvent | null = null
let state: InstallState = { installed: runsInstalled(), canPrompt: false }
const listeners = new Set<() => void>()

function runsInstalled(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function emit(next: InstallState) {
  state = next
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    emit({ ...state, canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit({ installed: true, canPrompt: false })
  })
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

/** Ouvre la fenêtre d'installation du navigateur ; rend le choix de l'utilisateur. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  const event = deferred
  deferred = null
  emit({ ...state, canPrompt: false })
  await event.prompt()
  return (await event.userChoice).outcome
}
