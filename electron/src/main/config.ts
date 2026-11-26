import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { normalizeOrigin, normalizeServerUrl } from './proxy.ts'

/**
 * Réglages du poste Windows, dans `config.json` du dossier de données (jamais dans le dossier
 * d'installation, remplacé à chaque mise à jour). Aucun secret : adresse du serveur, origine
 * de l'application web, canal de mise à jour, imprimante des tickets.
 */
export interface PrinterSettings {
  /** Nom Windows de l'imprimante ; `null` : imprimante par défaut. */
  name: string | null
  /** `true` : impression directe sans fenêtre de choix. */
  silent: boolean
  widthMm: 58 | 80
}

export interface DesktopConfig {
  serverUrl: string
  origin: string
  /** Canal des mises à jour (dossier HTTPS contenant latest.yml) ; `null` : désactivées. */
  updateUrl: string | null
  printer: PrinterSettings
}

declare const __JBH_SERVER_URL__: string | undefined
declare const __JBH_ORIGIN__: string | undefined
declare const __JBH_UPDATE_URL__: string | undefined

/**
 * Production (25/11/2026) : API Laravel à la racine de api.jb-hotel.com, application web sur
 * app.jb-hotel.com (origine que Sanctum reconnaît), canal des mises à jour dans son dossier
 * /desktop. Une valeur choisie à la construction (scripts/build-main.mjs) remplace chacune.
 */
export const PRODUCTION = {
  serverUrl: 'https://api.jb-hotel.com',
  origin: 'https://app.jb-hotel.com',
  updateUrl: 'https://app.jb-hotel.com/desktop',
} as const

export function builtDefaults(): { serverUrl: string; origin: string | null; updateUrl: string | null } {
  return {
    serverUrl:
      (typeof __JBH_SERVER_URL__ === 'string' && __JBH_SERVER_URL__) || PRODUCTION.serverUrl,
    origin: (typeof __JBH_ORIGIN__ === 'string' && __JBH_ORIGIN__) || PRODUCTION.origin,
    updateUrl: (typeof __JBH_UPDATE_URL__ === 'string' && __JBH_UPDATE_URL__) || PRODUCTION.updateUrl,
  }
}

function argument(args: readonly string[], name: string): string | null {
  const prefix = `--${name}=`
  const found = args.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function printerFrom(value: unknown): PrinterSettings {
  const p = (value ?? {}) as Partial<PrinterSettings>
  return {
    name: typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 200 ? p.name : null,
    silent: p.silent === true,
    widthMm: p.widthMm === 58 ? 58 : 80,
  }
}

export function loadConfig(
  file: string,
  args: readonly string[] = [],
  defaults = builtDefaults(),
): DesktopConfig {
  let stored: Partial<DesktopConfig> = {}
  if (existsSync(file)) {
    try {
      stored = JSON.parse(readFileSync(file, 'utf8')) as Partial<DesktopConfig>
    } catch {
      stored = {}
    }
  }
  const serverUrl = normalizeServerUrl(
    argument(args, 'server') ?? stored.serverUrl ?? defaults.serverUrl,
  )
  const origin = normalizeOrigin(
    argument(args, 'origin') ?? stored.origin ?? defaults.origin ?? serverUrl,
  )
  const update = argument(args, 'update-url') ?? stored.updateUrl ?? defaults.updateUrl
  return {
    serverUrl,
    origin,
    updateUrl: update ? normalizeServerUrl(update) : null,
    printer: printerFrom(stored.printer),
  }
}

/** Écriture atomique : fichier temporaire puis renommage. */
export function saveConfig(file: string, config: DesktopConfig): void {
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

export function withPrinter(config: DesktopConfig, value: unknown): DesktopConfig {
  return { ...config, printer: printerFrom(value) }
}

/**
 * Enregistre seulement l'imprimante : les autres valeurs du fichier sont gardées telles quelles
 * (une adresse de serveur passée en ligne de commande n'est jamais rendue permanente).
 */
export function savePrinter(file: string, printer: PrinterSettings): void {
  let stored: Record<string, unknown> = {}
  if (existsSync(file)) {
    try {
      stored = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    } catch {
      stored = {}
    }
  }
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ ...stored, printer }, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}
