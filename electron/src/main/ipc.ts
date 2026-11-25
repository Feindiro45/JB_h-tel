import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { statfs, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { savePrinter, withPrinter, type DesktopConfig } from './config.ts'
import { listPrinters, printTicket, validTicket } from './printing.ts'
import { isTrustedSender } from './security.ts'
import type { BackupInfo } from './storage/backups.ts'
import type { LocalDatabase } from './storage/localDatabase.ts'
import { schemaVersion } from './storage/migrations.ts'
import type { Sealer } from './storage/sealer.ts'
import { StoreError, type StoreCommit } from './storage/store.ts'
import type { UpdateState, Updater } from './updater.ts'

/**
 * Canaux IPC exposés à l'interface par le preload (D-069). Chaque appel vérifie que l'émetteur
 * est la page de l'application et que les données reçues ont la forme attendue. Aucune requête
 * SQL, aucun chemin de fichier et aucun module Node ne sont accessibles depuis React.
 */
export interface DesktopContext {
  local: LocalDatabase
  sealer: Sealer
  dataDir: string
  configFile: string
  config: () => DesktopConfig
  setConfig: (config: DesktopConfig) => void
  updater: Updater
  version: string
  log: (message: string) => void
}

class InvalidRequest extends Error {}

function guard(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event.senderFrame?.url)) throw new InvalidRequest('Appel refusé.')
}

function keysOf(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50 || !value.every((k) => typeof k === 'string')) {
    throw new InvalidRequest('Clés de stockage invalides.')
  }
  return value as string[]
}

function commitOf(value: unknown): StoreCommit {
  const change = value as StoreCommit | null
  if (!change || typeof change !== 'object') throw new InvalidRequest('Écriture invalide.')
  const expect = change.expect ?? {}
  if (typeof expect !== 'object' || !Object.values(expect).every((v) => Number.isSafeInteger(v))) {
    throw new InvalidRequest('Écriture invalide.')
  }
  if (change.put !== undefined && (typeof change.put !== 'object' || change.put === null)) {
    throw new InvalidRequest('Écriture invalide.')
  }
  if (change.remove !== undefined) keysOf(change.remove)
  return { expect, put: change.put ?? {}, remove: change.remove ?? [] }
}

function publicBackup(item: BackupInfo) {
  return { name: item.name, reason: item.reason, createdAt: item.createdAt, bytes: item.bytes }
}

function handle(channel: string, work: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) {
  ipcMain.handle(channel, async (event, ...args) => {
    guard(event)
    try {
      return await work(event, ...args)
    } catch (error) {
      // Message français sans détail technique (chemins, SQL) pour l'interface.
      if (error instanceof InvalidRequest || error instanceof StoreError) throw new Error(error.message)
      throw error
    }
  })
}

export function registerIpc(context: DesktopContext): void {
  const { local } = context

  handle('storage:read', (_event, keys) => local.store.read(keysOf(keys)))
  handle('storage:commit', (_event, change) => local.store.commit(commitOf(change)))
  handle('storage:clear', () => local.store.clear())
  handle('storage:sizes', () => local.store.sizes())

  handle('desktop:info', async () => {
    // Taille réelle : fichier principal + journal WAL (pas encore recopié dans la base).
    const [db, wal, disk] = await Promise.all([
      stat(local.file).catch(() => null),
      stat(`${local.file}-wal`).catch(() => null),
      statfs(context.dataDir).catch(() => null),
    ])
    const latest = local.backups.latest()
    const config = context.config()
    return {
      version: context.version,
      electron: process.versions.electron,
      dataDir: context.dataDir,
      databaseBytes: db ? db.size + (wal?.size ?? 0) : null,
      freeBytes: disk ? disk.bavail * disk.bsize : null,
      sealing: context.sealer.mode,
      schemaVersion: schemaVersion(local.db),
      serverUrl: config.serverUrl,
      store: local.store.info(),
      backups: {
        count: local.backups.list().length,
        latest: latest ? publicBackup(latest) : null,
      },
      recovery: local.recovery
        ? { restored: local.recovery.restoredFrom !== null, corruptFile: basename(local.recovery.corruptFile) }
        : null,
      update: context.updater.state(),
      printer: config.printer,
    }
  })

  handle('backup:list', () => local.backups.list().map(publicBackup))
  handle('backup:create', async () => {
    const item = await local.backup('manual')
    local.store.audit('sauvegarde.creee', { name: item.name })
    return publicBackup(item)
  })
  handle('backup:open-folder', async () => {
    await shell.openPath(local.backups.directory)
  })
  handle('backup:export', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const item = await local.backup('manual')
    const options = {
      title: 'Exporter une sauvegarde de JB Hôtel',
      defaultPath: item.name,
      filters: [{ name: 'Sauvegarde JB Hôtel', extensions: ['sqlite'] }],
    }
    const choice = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (choice.canceled || !choice.filePath) return { saved: false }
    local.backups.exportTo(item, choice.filePath)
    local.store.audit('sauvegarde.exportee', { name: item.name })
    return { saved: true, name: basename(choice.filePath) }
  })
  handle('backup:restore', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Restaurer une sauvegarde de JB Hôtel',
      defaultPath: local.backups.directory,
      properties: ['openFile'] as Array<'openFile'>,
      filters: [{ name: 'Sauvegarde JB Hôtel', extensions: ['sqlite'] }],
    }
    const choice = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const file = choice.filePaths[0]
    if (choice.canceled || !file) return { restored: false }
    const confirm = {
      type: 'warning' as const,
      buttons: ['Restaurer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      title: 'Restaurer une sauvegarde',
      message: `Restaurer « ${basename(file)} » ?`,
      detail:
        'Les données du poste sont remplacées par celles de la sauvegarde. Une sauvegarde de l’état actuel est faite avant, et les opérations en attente plus récentes sont conservées. L’application redémarre ensuite.',
    }
    const answer = window ? await dialog.showMessageBox(window, confirm) : await dialog.showMessageBox(confirm)
    if (answer.response !== 0) return { restored: false }
    const { kept } = await local.restore(file)
    setTimeout(() => window?.webContents.reload(), 200)
    return { restored: true, kept }
  })

  handle('print:printers', (event) => listPrinters(event.sender))
  handle('print:settings', (_event, value) => {
    if (value !== undefined) {
      const next = withPrinter(context.config(), value)
      savePrinter(context.configFile, next.printer)
      context.setConfig(next)
      local.store.audit('imprimante.reglee', next.printer)
    }
    return context.config().printer
  })
  handle('print:ticket', async (event, value) => {
    if (!validTicket(value)) throw new InvalidRequest('Impression invalide.')
    const settings = context.config().printer
    const reprint =
      (
        local.db
          .prepare("SELECT COUNT(*) AS n FROM print_jobs WHERE document = ? AND status = 'printed'")
          .get(value.document) as { n: number }
      ).n > 0
    const outcome = await printTicket(event.sender, value, settings)
    local.db
      .prepare(
        'INSERT INTO print_jobs (document, printer, width_mm, reprint, status, error) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        value.document,
        settings.name,
        value.widthMm,
        reprint ? 1 : 0,
        outcome.ok ? 'printed' : outcome.reason === 'cancelled' ? 'cancelled' : 'failed',
        outcome.ok ? null : outcome.message,
      )
    return { ...outcome, reprint }
  })
  handle('print:history', () =>
    local.db
      .prepare('SELECT at, document, printer, width_mm AS widthMm, reprint, status, error FROM print_jobs ORDER BY id DESC LIMIT 50')
      .all()
      .map((row) => ({ ...row, reprint: row.reprint === 1 })),
  )

  handle('update:check', () => context.updater.check())
  handle('update:install', () => context.updater.install())
}

export function broadcast(channel: 'desktop:resume' | 'desktop:update', payload?: UpdateState): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

export function logFile(dataDir: string): string {
  return join(dataDir, 'journal', 'main.log')
}
