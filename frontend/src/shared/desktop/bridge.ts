/**
 * Pont vers le logiciel Windows (D-069, `electron/src/preload/preload.ts`). Dans la PWA, il est
 * absent : toutes les fonctions de ce dossier rendent alors le comportement web habituel. Le
 * contrat ci-dessous doit rester identique au preload.
 */
export interface StoreRead {
  values: Record<string, unknown>
  versions: Record<string, number>
}

export interface StoreCommit {
  expect?: Record<string, number>
  put?: Record<string, unknown>
  remove?: string[]
}

export type CommitResult = { ok: true } | { ok: false; conflict: string[] }

export interface DesktopBackup {
  name: string
  reason: 'auto' | 'manual' | 'migration' | 'restore' | 'update' | 'recovery'
  createdAt: string
  bytes: number
}

export interface PrinterSettings {
  name: string | null
  silent: boolean
  widthMm: 58 | 80
}

export interface DesktopPrinter {
  name: string
  displayName: string
  isDefault: boolean
}

export type DesktopUpdate =
  | { status: 'disabled' }
  | { status: 'idle'; checkedAt: string | null }
  | { status: 'downloading'; version: string }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export interface DesktopInfo {
  version: string
  electron: string
  dataDir: string
  databaseBytes: number | null
  freeBytes: number | null
  sealing: 'dpapi' | 'plain' | 'memory'
  schemaVersion: number
  serverUrl: string
  store: {
    operations: { pending: number; accepted: number; rejected: number; abandoned: number }
    cachedQueries: number
    keys: number
    sealed: boolean
  }
  backups: { count: number; latest: DesktopBackup | null }
  recovery: { restored: boolean; corruptFile: string } | null
  update: DesktopUpdate
  printer: PrinterSettings
}

export interface TicketPrint {
  document: string
  widthMm: 58 | 80
  heightMm: number | null
}

export type PrintOutcome = (
  | { ok: true; printer: string | null }
  | { ok: false; reason: 'cancelled' | 'missing' | 'failed'; message: string }
) & { reprint: boolean }

export interface PrintRecord {
  at: string
  document: string
  printer: string | null
  widthMm: number
  reprint: boolean
  status: 'printed' | 'failed' | 'cancelled'
  error: string | null
}

export interface DesktopBridge {
  kind: 'windows'
  apiBase: string
  storage: {
    read(keys: string[]): Promise<StoreRead>
    commit(change: StoreCommit): Promise<CommitResult>
    clear(): Promise<void>
    sizes(): Promise<Record<string, number>>
  }
  system: {
    info(): Promise<DesktopInfo>
    onResume(callback: () => void): () => void
    onUpdate(callback: (state: DesktopUpdate) => void): () => void
    checkUpdate(): Promise<void>
    installUpdate(): Promise<void>
  }
  backups: {
    list(): Promise<DesktopBackup[]>
    create(): Promise<DesktopBackup>
    exportCopy(): Promise<{ saved: boolean; name?: string }>
    restore(): Promise<{ restored: boolean; kept?: number }>
    openFolder(): Promise<void>
  }
  printing: {
    printers(): Promise<DesktopPrinter[]>
    settings(value?: PrinterSettings): Promise<PrinterSettings>
    printTicket(ticket: TicketPrint): Promise<PrintOutcome>
    history(): Promise<PrintRecord[]>
  }
}

declare global {
  interface Window {
    jbDesktop?: DesktopBridge
  }
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  const bridge = window.jbDesktop
  return bridge && bridge.kind === 'windows' ? bridge : null
}

export function isDesktop(): boolean {
  return desktopBridge() !== null
}
