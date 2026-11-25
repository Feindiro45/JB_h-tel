import { app, BrowserWindow, dialog, Menu, powerMonitor, safeStorage, session } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, type DesktopConfig } from './config.ts'
import { broadcast, logFile, registerIpc } from './ipc.ts'
import { handleProtocol, registerScheme } from './protocol.ts'
import { APP_ORIGIN } from './proxy.ts'
import { hardenContents, hardenSession } from './security.ts'
import { LocalDatabase } from './storage/localDatabase.ts'
import { DowngradeError } from './storage/migrations.ts'
import { keySealer, newKey, plainSealer, type Sealer } from './storage/sealer.ts'
import { createUpdater } from './updater.ts'

/**
 * JB Hôtel pour Windows (D-069) : la même application React que la PWA, servie depuis les
 * fichiers installés, avec une base SQLite locale à la place d'IndexedDB et le serveur Laravel
 * existant comme référence partagée. Démarre sans Internet ; synchronise dès que le serveur
 * répond (voir docs/ELECTRON_ARCHITECTURE.md).
 */
const args = process.argv.slice(1)

function argument(name: string): string | null {
  const prefix = `--${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

// Dossier de données fixe et sans accent (`%APPDATA%\JBHotel`), indépendant du dossier
// d'installation : une mise à jour ou une réinstallation ne touche jamais à la base.
const dataDir = argument('data-dir') ?? join(app.getPath('appData'), 'JBHotel')
mkdirSync(dataDir, { recursive: true })
app.setPath('userData', dataDir)
app.setPath('sessionData', join(dataDir, 'session'))

const logPath = logFile(dataDir)
function log(message: string): void {
  try {
    mkdirSync(join(dataDir, 'journal'), { recursive: true })
    if (existsSync(logPath) && statSync(logPath).size > 1_000_000) {
      renameSync(logPath, `${logPath}.1`)
    }
    appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch {
    // Journal indisponible : l'application continue.
  }
}

registerScheme()
hardenContents()

if (!app.requestSingleInstanceLock()) {
  // Une seule fenêtre de caisse par poste : la base locale n'a qu'un seul écrivain.
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let local: LocalDatabase | null = null
let config: DesktopConfig

/** Clé de chiffrement locale, protégée par Windows (DPAPI) pour ce compte utilisateur. */
function loadSealer(): Sealer {
  const file = join(dataDir, 'cle-locale.bin')
  if (!safeStorage.isEncryptionAvailable()) {
    log('Chiffrement du système indisponible : données locales non chiffrées.')
    return plainSealer
  }
  if (existsSync(file)) {
    const key = Buffer.from(safeStorage.decryptString(readFileSync(file)), 'base64')
    return keySealer(key, 'dpapi')
  }
  const key = newKey()
  writeFileSync(file, safeStorage.encryptString(Buffer.from(key).toString('base64')))
  return keySealer(key, 'dpapi')
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'JB Hôtel',
    backgroundColor: '#F8FAFC',
    autoHideMenuBar: true,
    icon: join(app.getAppPath(), 'renderer', 'icons', 'icon-512.png'),
    webPreferences: {
      preload: join(app.getAppPath(), 'build', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged || args.includes('--devtools'),
    },
  })
  window.once('ready-to-show', () => {
    window.maximize()
    window.show()
    if (args.includes('--devtools')) window.webContents.openDevTools({ mode: 'detach' })
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })
  void window.loadURL(`${APP_ORIGIN}/`)
  return window
}

async function scheduleBackups(database: LocalDatabase): Promise<void> {
  const run = async () => {
    try {
      if (database.backups.isDue()) {
        const item = await database.backup('auto')
        log(`Sauvegarde automatique ${item.name}`)
      }
    } catch (error) {
      log(`Sauvegarde automatique impossible : ${String(error)}`)
    }
  }
  await run()
  setInterval(() => void run(), 3600_000)
}

async function start(): Promise<void> {
  config = loadConfig(join(dataDir, 'config.json'), args)
  const sealer = loadSealer()
  local = await LocalDatabase.open({
    file: join(dataDir, 'jbhotel.sqlite'),
    backupsDir: join(dataDir, 'sauvegardes'),
    sealer,
  })
  log(`Démarrage ${app.getVersion()} — serveur ${config.serverUrl}`)

  const ses = session.defaultSession
  hardenSession(ses)
  handleProtocol(ses, join(app.getAppPath(), 'renderer'), () => ({
    serverUrl: config.serverUrl,
    origin: config.origin,
  }))
  const database = local
  const updater = createUpdater({
    url: config.updateUrl,
    beforeInstall: async () => {
      await database.backup('update')
    },
    onChange: (state) => broadcast('desktop:update', state),
    log,
  })
  registerIpc({
    local: database,
    sealer,
    dataDir,
    configFile: join(dataDir, 'config.json'),
    config: () => config,
    setConfig: (next) => {
      config = next
    },
    updater,
    version: app.getVersion(),
    log,
  })

  Menu.setApplicationMenu(null)
  mainWindow = createWindow()

  if (database.recovery) {
    const { restoredFrom } = database.recovery
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Base locale réparée',
      message: 'La base locale de ce poste était endommagée.',
      detail: restoredFrom
        ? 'Elle a été mise de côté et la dernière sauvegarde valide a été restaurée. Les opérations faites après cette sauvegarde peuvent manquer : vérifiez l’écran Synchronisation et prévenez l’administrateur.'
        : 'Elle a été mise de côté et aucune sauvegarde valide n’a été trouvée : le poste repart d’une base vide. Connectez-vous en ligne pour recharger les données et prévenez l’administrateur.',
    })
  }

  // Réveil de Windows ou session déverrouillée : l'interface vérifie le serveur et synchronise.
  powerMonitor.on('resume', () => broadcast('desktop:resume'))
  powerMonitor.on('unlock-screen', () => broadcast('desktop:resume'))

  void scheduleBackups(database)
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => app.quit())

app.on('will-quit', () => {
  local?.close()
  local = null
})

app.whenReady().then(start).catch((error: unknown) => {
  log(`Démarrage impossible : ${String((error as Error)?.stack ?? error)}`)
  const message =
    error instanceof DowngradeError
      ? error.message
      : 'La base locale du poste ne peut pas être ouverte. Fermez les autres fenêtres de JB Hôtel, puis relancez le logiciel. Si le problème continue, prévenez l’administrateur (journal : dossier JBHotel\\journal).'
  dialog.showErrorBox('JB Hôtel ne peut pas démarrer', message)
  app.quit()
})
