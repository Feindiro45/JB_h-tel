import { contextBridge, ipcRenderer } from 'electron'

/**
 * Pont limité entre l'interface React et le processus principal (D-069). Il est exposé en
 * lecture seule sous `window.jbDesktop` ; son contrat est décrit côté interface dans
 * `frontend/src/shared/desktop/bridge.ts`. Aucun module Node, aucun chemin de fichier, aucune
 * requête SQL : uniquement des opérations nommées, revalidées par le processus principal.
 */
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

function listen(channel: string, callback: (payload: unknown) => void): () => void {
  const handler = (_event: unknown, payload: unknown) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const bridge = {
  kind: 'windows',
  apiBase: 'app://jbhotel/server',
  storage: {
    read: (keys: string[]) => invoke('storage:read', keys),
    commit: (change: unknown) => invoke('storage:commit', change),
    clear: () => invoke('storage:clear'),
    sizes: () => invoke('storage:sizes'),
  },
  system: {
    info: () => invoke('desktop:info'),
    onResume: (callback: () => void) => listen('desktop:resume', () => callback()),
    onUpdate: (callback: (state: unknown) => void) => listen('desktop:update', callback),
    checkUpdate: () => invoke('update:check'),
    installUpdate: () => invoke('update:install'),
  },
  backups: {
    list: () => invoke('backup:list'),
    create: () => invoke('backup:create'),
    exportCopy: () => invoke('backup:export'),
    restore: () => invoke('backup:restore'),
    openFolder: () => invoke('backup:open-folder'),
  },
  printing: {
    printers: () => invoke('print:printers'),
    settings: (value?: unknown) => invoke('print:settings', value),
    printTicket: (ticket: unknown) => invoke('print:ticket', ticket),
    history: () => invoke('print:history'),
  },
}

contextBridge.exposeInMainWorld('jbDesktop', Object.freeze(bridge))
