import { app } from 'electron'
import electronUpdater from 'electron-updater'

/**
 * Mises à jour du logiciel (D-069), distinctes de la synchronisation des données : le nouvel
 * installateur est téléchargé depuis le canal HTTPS configuré (`updateUrl`, dossier contenant
 * `latest.yml`), puis installé à la fermeture ou sur demande. La base locale vit dans le dossier
 * de données de l'utilisateur et n'est jamais touchée ; une sauvegarde est faite avant le
 * redémarrage. Sans canal configuré, ou hors de la version installée, rien n'est vérifié.
 */
export type UpdateState =
  | { status: 'disabled' }
  | { status: 'idle'; checkedAt: string | null }
  | { status: 'downloading'; version: string }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

const CHECK_EVERY_MS = 6 * 3600_000

export interface Updater {
  state(): UpdateState
  check(): Promise<void>
  install(): Promise<void>
}

export function createUpdater(options: {
  url: string | null
  beforeInstall: () => Promise<void>
  onChange: (state: UpdateState) => void
  log: (message: string) => void
}): Updater {
  let current: UpdateState = { status: 'disabled' }
  const set = (next: UpdateState) => {
    current = next
    options.onChange(next)
  }
  if (!options.url || !app.isPackaged) {
    return { state: () => current, check: async () => undefined, install: async () => undefined }
  }
  const { autoUpdater } = electronUpdater
  autoUpdater.setFeedURL({ provider: 'generic', url: options.url })
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  set({ status: 'idle', checkedAt: null })
  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version }))
  autoUpdater.on('update-not-available', () =>
    set({ status: 'idle', checkedAt: new Date().toISOString() }),
  )
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (error) => {
    // Hors ligne, la vérification échoue simplement : elle sera refaite plus tard.
    options.log(`Mise à jour : ${String(error?.message ?? error)}`)
    set({ status: 'idle', checkedAt: null })
  })
  const check = async () => {
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      options.log(`Vérification des mises à jour impossible : ${String(error)}`)
    }
  }
  setTimeout(() => void check(), 30_000)
  setInterval(() => void check(), CHECK_EVERY_MS)
  return {
    state: () => current,
    check,
    async install() {
      if (current.status !== 'ready') return
      await options.beforeInstall()
      autoUpdater.quitAndInstall(false, true)
    },
  }
}
