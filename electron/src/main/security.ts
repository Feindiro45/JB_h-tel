import { app, shell, type Session, type WebContents } from 'electron'
import { API_PREFIX, isAppLocation } from './proxy.ts'

/**
 * Durcissement Electron (D-069, docs/OFFLINE_SECURITY.md) : navigation limitée à l'application,
 * nouvelles fenêtres seulement pour les documents de l'API (rapport PDF), liens web ouverts dans
 * le navigateur du système, aucune permission matérielle, aucun `<webview>`.
 */
export function isAppUrl(url: string): boolean {
  try {
    return isAppLocation(new URL(url))
  } catch {
    return false
  }
}

export function isTrustedSender(frameUrl: string | undefined): boolean {
  return typeof frameUrl === 'string' && isAppUrl(frameUrl)
}

function isApiDocument(url: string): boolean {
  try {
    const parsed = new URL(url)
    return isAppLocation(parsed) && parsed.pathname.startsWith(`${API_PREFIX}/`)
  } catch {
    return false
  }
}

function openExternally(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') void shell.openExternal(url)
  } catch {
    // Adresse invalide : ignorée.
  }
}

export function hardenSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write'),
  )
  session.setPermissionCheckHandler((_contents, permission) => permission === 'clipboard-sanitized-write')
}

export function hardenContents(): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) {
        event.preventDefault()
        openExternally(url)
      }
    })
    contents.on('will-redirect', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(({ url }) => {
      if (isApiDocument(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
          },
        }
      }
      openExternally(url)
      return { action: 'deny' }
    })
  })
}
