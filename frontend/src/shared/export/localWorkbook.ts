/**
 * Classeur Excel construit sur le poste, sans réseau (demande de l'utilisateur du 22/11/2026 :
 * « les deux »). Même présentation que les exports du serveur (`App\Shared\Export\Workbook`) :
 * bandeau vert et or, indicateurs en tuiles, tableaux de synthèse avec barres de données,
 * feuilles de données (formats FCFA et dates, filtres, en-tête figé, totaux). Il est
 * **simplifié** : construit à partir des données gardées sur ce poste, sans graphiques, et le dit
 * sur chaque feuille. ExcelJS n'est chargé qu'au premier export (fichier séparé).
 */
import type { Workbook as ExcelWorkbook, Worksheet } from 'exceljs'
import { registerOfflinePreparation } from '../offline/essentials'

export type ColumnType = 'text' | 'int' | 'fcfa' | 'date' | 'datetime' | 'percent'

export interface LocalColumn {
  label: string
  type?: ColumnType
  width?: number
  /** Ligne de total (montants et nombres) ; `false` pour un prix unitaire, un numéro… */
  total?: boolean
}

export interface LocalSheet {
  name: string
  description?: string
  columns: LocalColumn[]
  rows: unknown[][]
}

export interface LocalKpi {
  label: string
  value: number | string | null
  format?: 'fcfa' | 'int' | 'percent'
  hint?: string
}

export interface LocalSummary {
  heading: string
  valueLabel: string
  rows: [string, number][]
  format?: 'fcfa' | 'int'
}

export interface LocalWorkbookSpec {
  /** « Réservations », « Caisse »… */
  title: string
  /** Nom de fichier : jb-hotel-<module>-<date>.xlsx */
  module: string
  /** Filtres appliqués (« Statut : Confirmée »). */
  context: string[]
  kpis: LocalKpi[]
  summaries: LocalSummary[]
  sheets: LocalSheet[]
  note?: string
}

const PRIMARY = 'FF047857'
const DARK = 'FF12352D'
const GOLD = 'FFE8C48B'
const MINT = 'FFE8F4EE'
const ZEBRA = 'FFF5F8F6'
const LINE = 'FFDCE7E1'
const MUTED = 'FF4F635C'
const WHITE = 'FFFFFFFF'

const FORMATS: Record<ColumnType, string | undefined> = {
  text: undefined,
  int: '#,##0',
  fcfa: '#,##0" FCFA"',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
  percent: '0.0%',
}

const WIDTHS: Record<ColumnType, number> = {
  text: 22,
  int: 11,
  fcfa: 19,
  date: 12,
  datetime: 18,
  percent: 11,
}

export const OFFLINE_MARK =
  'Données gardées sur ce poste (hors ligne) — classeur simplifié, sans graphiques'

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

export function localFilename(module: string, now = new Date()): string {
  return `jb-hotel-${module}-${stamp(now)}.xlsx`
}

/** Date ISO → date Excel ; les dates seules restent au jour dit (pas de décalage horaire). */
function cellValue(value: unknown, type: ColumnType): unknown {
  if (value === null || value === undefined || value === '') return null
  if (type === 'date' || type === 'datetime') {
    const text = String(value)
    const day = /^\d{4}-\d{2}-\d{2}$/.test(text)
    const date = day ? new Date(`${text}T00:00:00Z`) : new Date(text)
    if (Number.isNaN(date.getTime())) return text
    if (day || type === 'date') {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    }
    // Heure locale du poste écrite telle quelle (Excel n'a pas de fuseau).
    return new Date(
      Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
      ),
    )
  }
  if (type === 'text') return String(value)
  return typeof value === 'number' ? value : Number(value)
}

function band(sheet: Worksheet, columns: number, title: string, subtitle: string) {
  sheet.mergeCells(1, 1, 1, columns)
  sheet.mergeCells(2, 1, 2, columns)
  const top = sheet.getCell(1, 1)
  top.value = title
  top.font = { bold: true, size: 18, color: { argb: WHITE } }
  top.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
  top.alignment = { vertical: 'middle', indent: 1 }
  const sub = sheet.getCell(2, 1)
  sub.value = subtitle
  sub.font = { size: 10, color: { argb: DARK } }
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } }
  sub.alignment = { vertical: 'middle', indent: 1, wrapText: true }
  let width = 0
  for (let c = 1; c <= columns; c++) width += Math.max(8, sheet.getColumn(c).width ?? 10)
  sheet.getRow(1).height = 34
  sheet.getRow(2).height = Math.max(22, 14 * Math.ceil((subtitle.length * 1.05) / width) + 8)
}

function header(cell: ReturnType<Worksheet['getCell']>, value: string) {
  cell.value = value
  cell.font = { bold: true, color: { argb: WHITE } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } }
  cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 }
}

function dashboard(book: ExcelWorkbook, spec: LocalWorkbookSpec, subtitle: string) {
  const sheet = book.addWorksheet('Tableau de bord', {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })
  sheet.getColumn(1).width = 3
  for (let c = 2; c <= 14; c++) sheet.getColumn(c).width = 15
  band(sheet, 14, `JB Hôtel — ${spec.title}`, `Tableau de bord · ${subtitle}`)

  let row = 5
  for (let start = 0; start < spec.kpis.length; start += 4) {
    spec.kpis.slice(start, start + 4).forEach((kpi, index) => {
      const first = 2 + index * 3
      for (let offset = 0; offset < 3; offset++) {
        sheet.mergeCells(row + offset, first, row + offset, first + 2)
        const cell = sheet.getCell(row + offset, first)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MINT } }
        cell.alignment = { vertical: 'middle', indent: 1 }
        cell.border = { left: { style: 'thick', color: { argb: PRIMARY } } }
      }
      const label = sheet.getCell(row, first)
      label.value = kpi.label.toUpperCase()
      label.font = { size: 9, bold: true, color: { argb: MUTED } }
      const value = sheet.getCell(row + 1, first)
      value.value = kpi.value ?? '—'
      value.font = { size: 18, bold: true, color: { argb: DARK } }
      if (kpi.format && typeof kpi.value === 'number') value.numFmt = FORMATS[kpi.format] ?? ''
      const hint = sheet.getCell(row + 2, first)
      hint.value = kpi.hint ?? ''
      hint.font = { size: 9, italic: true, color: { argb: MUTED } }
    })
    sheet.getRow(row).height = 18
    sheet.getRow(row + 1).height = 30
    sheet.getRow(row + 2).height = 18
    row += 4
  }

  for (const summary of spec.summaries) {
    sheet.mergeCells(row, 2, row, 5)
    const heading = sheet.getCell(row, 2)
    heading.value = summary.heading
    heading.font = { bold: true, size: 12, color: { argb: DARK } }
    const head = row + 1
    sheet.mergeCells(head, 2, head, 3)
    sheet.mergeCells(head, 4, head, 5)
    header(sheet.getCell(head, 2), 'Libellé')
    header(sheet.getCell(head, 4), summary.valueLabel)
    let line = head
    summary.rows.forEach(([label, value], index) => {
      line = head + 1 + index
      sheet.mergeCells(line, 2, line, 3)
      sheet.mergeCells(line, 4, line, 5)
      sheet.getCell(line, 2).value = label
      const amount = sheet.getCell(line, 4)
      amount.value = value
      amount.numFmt = FORMATS[summary.format ?? 'int'] ?? ''
      if (index % 2 === 1) {
        for (const c of [2, 4]) {
          sheet.getCell(line, c).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: ZEBRA },
          }
        }
      }
    })
    if (summary.rows.length === 0) {
      line = head + 1
      sheet.mergeCells(line, 2, line, 5)
      const empty = sheet.getCell(line, 2)
      empty.value = 'Aucune donnée gardée sur ce poste.'
      empty.font = { italic: true, color: { argb: MUTED } }
    } else {
      // Barres de données à la place du graphique (le classeur du serveur a de vrais graphiques).
      sheet.addConditionalFormatting({
        ref: `D${head + 1}:D${line}`,
        rules: [
          {
            type: 'dataBar',
            priority: 1,
            minLength: 0,
            maxLength: 100,
            gradient: false,
            border: false,
            negativeBarColorSameAsPositive: true,
            axisPosition: 'auto',
            direction: 'leftToRight',
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: { argb: 'FF2A78D6' },
          } as never,
        ],
      })
    }
    row = line + 2
  }

  const notes = [spec.note, OFFLINE_MARK].filter(Boolean) as string[]
  for (const text of notes) {
    sheet.mergeCells(row, 2, row, 13)
    const cell = sheet.getCell(row, 2)
    cell.value = text
    cell.font = { italic: true, size: 9, color: { argb: MUTED } }
    cell.alignment = { wrapText: true }
    sheet.getRow(row).height = 30
    row++
  }
}

function dataSheet(book: ExcelWorkbook, spec: LocalSheet, subtitle: string) {
  const sheet = book.addWorksheet(spec.name.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })
  const columns = spec.columns
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width ?? WIDTHS[column.type ?? 'text']
  })
  band(sheet, columns.length, spec.name, `${spec.description ?? ''} · ${subtitle}`)
  sheet.getRow(3).height = 6
  columns.forEach((column, index) => header(sheet.getCell(4, index + 1), column.label))
  sheet.getRow(4).height = 30

  spec.rows.forEach((values, rowIndex) => {
    const line = 5 + rowIndex
    columns.forEach((column, index) => {
      const type = column.type ?? 'text'
      const cell = sheet.getCell(line, index + 1)
      cell.value = cellValue(values[index], type) as never
      const format = FORMATS[type]
      if (format) {
        cell.numFmt = format
        cell.alignment = { horizontal: 'right' }
      }
      if (rowIndex % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }
      }
      cell.border = { bottom: { style: 'hair', color: { argb: LINE } } }
    })
  })

  const last = 4 + spec.rows.length
  if (spec.rows.length === 0) {
    sheet.mergeCells(5, 1, 5, columns.length)
    const empty = sheet.getCell(5, 1)
    empty.value = 'Aucune donnée gardée sur ce poste pour ces filtres.'
    empty.font = { italic: true, color: { argb: MUTED } }
    return
  }
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: columns.length } }
  const summed = columns
    .map((column, index) => ({ column, index }))
    .filter(
      ({ column }) => (column.type === 'fcfa' || column.type === 'int') && column.total !== false,
    )
  if (summed.length === 0) return
  const totals = last + 1
  sheet.getCell(totals, 1).value = 'Total'
  for (const { column, index } of summed) {
    const letter = sheet.getColumn(index + 1).letter
    const result = spec.rows.reduce((sum, row) => sum + (Number(row[index]) || 0), 0)
    const cell = sheet.getCell(totals, index + 1)
    cell.value = { formula: `SUBTOTAL(109,${letter}5:${letter}${last})`, result }
    cell.numFmt = FORMATS[column.type ?? 'int'] ?? ''
  }
  for (let c = 1; c <= columns.length; c++) {
    const cell = sheet.getCell(totals, c)
    cell.font = { bold: true, color: { argb: DARK } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MINT } }
    cell.border = { top: { style: 'medium', color: { argb: PRIMARY } } }
  }
}

/** Construit le classeur (ExcelJS chargé à la demande). */
export async function buildLocalWorkbook(spec: LocalWorkbookSpec, now = new Date()): Promise<Blob> {
  const { Workbook } = await import('exceljs')
  const book = new Workbook()
  book.creator = 'JB Hôtel'
  book.title = `JB Hôtel — ${spec.title}`
  const pad = (n: number) => String(n).padStart(2, '0')
  const exported = `Exporté le ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} à ${pad(now.getHours())}:${pad(now.getMinutes())} sur ce poste`
  const subtitle = [
    ...(spec.context.length ? spec.context : ['Sans filtre']),
    exported,
    OFFLINE_MARK,
  ].join(' · ')
  dashboard(book, spec, subtitle)
  for (const sheet of spec.sheets) dataSheet(book, sheet, subtitle)
  const buffer = await book.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** Charge ExcelJS à l'avance (« Tout télécharger pour le hors ligne ») pour l'avoir sans réseau. */
export async function preloadLocalWorkbook(): Promise<void> {
  await import('exceljs')
}

// « Tout télécharger pour le hors ligne » charge aussi l'outil des classeurs : le service worker
// le garde, et l'export sans réseau fonctionne même si aucun export n'a été fait en ligne.
registerOfflinePreparation({
  order: 99,
  label: 'Exports Excel sans réseau',
  permission: 'reservations.view',
  run: () => preloadLocalWorkbook(),
})

/** Regroupement libellé → somme (ou nombre), du plus grand au plus petit. */
export function groupRows<T>(
  items: readonly T[],
  key: (item: T) => string,
  value: (item: T) => number = () => 1,
): [string, number][] {
  const groups = new Map<string, number>()
  for (const item of items) groups.set(key(item), (groups.get(key(item)) ?? 0) + value(item))
  return [...groups.entries()].sort((a, b) => b[1] - a[1])
}

const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

/** Regroupement par mois, dans l'ordre du calendrier : « déc. 2026 » → somme (ou nombre). */
export function monthlyRows<T>(
  items: readonly T[],
  date: (item: T) => string | null | undefined,
  value: (item: T) => number = () => 1,
): [string, number][] {
  const groups = new Map<string, number>()
  for (const item of items) {
    const iso = date(item)
    if (!iso) continue
    const month = iso.slice(0, 7)
    groups.set(month, (groups.get(month) ?? 0) + value(item))
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, total]) => [
      `${MONTHS[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`,
      total,
    ])
}
