import type { WebContents } from 'electron'
import type { PrinterSettings } from './config.ts'

/**
 * Impression des tickets 80 mm (et 58 mm) depuis le poste Windows, sans Internet (D-069).
 * La page du ticket est celle de l'application (même contenu que la PWA) ; le format du papier
 * est donné en microns à Chromium. Imprimante absente ou en erreur : message français, et la
 * tentative est notée dans `print_jobs` (réimpressions comprises).
 */
export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

export interface TicketPrint {
  /** Document imprimé (ex. « REC-000123 », « FAC-LOC-POSTE-000004 »). */
  document: string
  widthMm: 58 | 80
  /** Longueur mesurée de la bande (mm) ; `null` : format laissé à la page. */
  heightMm: number | null
}

export type PrintOutcome =
  | { ok: true; printer: string | null }
  | { ok: false; reason: 'cancelled' | 'missing' | 'failed'; message: string }

export async function listPrinters(contents: WebContents): Promise<PrinterInfo[]> {
  const printers = await contents.getPrintersAsync()
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: Boolean((printer as { isDefault?: boolean }).isDefault),
  }))
}

export function validTicket(value: unknown): value is TicketPrint {
  const t = value as Partial<TicketPrint> | null
  return (
    !!t &&
    typeof t.document === 'string' &&
    t.document.length > 0 &&
    t.document.length <= 120 &&
    (t.widthMm === 58 || t.widthMm === 80) &&
    (t.heightMm === null ||
      (typeof t.heightMm === 'number' && t.heightMm >= 20 && t.heightMm <= 5000))
  )
}

export async function printTicket(
  contents: WebContents,
  ticket: TicketPrint,
  settings: PrinterSettings,
): Promise<PrintOutcome> {
  const printers = await listPrinters(contents)
  if (printers.length === 0) {
    return {
      ok: false,
      reason: 'missing',
      message:
        'Aucune imprimante n’est installée sur ce poste. Installez le pilote de l’imprimante de tickets, puis réessayez.',
    }
  }
  if (settings.name && !printers.some((printer) => printer.name === settings.name)) {
    return {
      ok: false,
      reason: 'missing',
      message: `L’imprimante « ${settings.name} » est introuvable. Vérifiez qu’elle est branchée et allumée, ou choisissez-en une autre dans Synchronisation → Poste Windows.`,
    }
  }
  return new Promise((resolve) => {
    contents.print(
      {
        silent: settings.silent,
        deviceName: settings.name ?? undefined,
        printBackground: true,
        margins: { marginType: 'none' },
        ...(ticket.heightMm
          ? { pageSize: { width: ticket.widthMm * 1000, height: Math.ceil(ticket.heightMm) * 1000 } }
          : {}),
      },
      (success, failureReason) => {
        if (success) return resolve({ ok: true, printer: settings.name })
        if (failureReason === 'cancelled' || failureReason === 'Print job canceled') {
          return resolve({ ok: false, reason: 'cancelled', message: 'Impression annulée.' })
        }
        resolve({
          ok: false,
          reason: 'failed',
          message:
            'L’impression a échoué. Vérifiez le papier, le câble et l’état de l’imprimante, puis réessayez.',
        })
      },
    )
  })
}
