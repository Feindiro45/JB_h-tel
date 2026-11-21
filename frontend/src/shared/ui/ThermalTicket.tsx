import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router'
import { formatFcfa } from '../utils/format'
import { SelectField } from './fields'
import { Icon } from './Icon'
import { PageHeading } from './layout'
import './thermalTicket.css'

/** Largeur du rouleau en millimètres : 80 mm par défaut, 58 mm si l'imprimante l'exige (N-07). */
export type TicketWidth = 80 | 58

const WIDTH_PREFERENCE = 'jb-hotel.ticket-width'
const PAGE_STYLE_ID = 'thermal-ticket-page'
/** Marge de coupe ajoutée sous le ticket (mm). */
const TEAR_MARGIN_MM = 6
const MM_PER_CSS_PX = 25.4 / 96

function readWidth(): TicketWidth {
  try {
    return localStorage.getItem(WIDTH_PREFERENCE) === '58' ? 58 : 80
  } catch {
    return 80
  }
}

function saveWidth(width: TicketWidth) {
  try {
    localStorage.setItem(WIDTH_PREFERENCE, String(width))
  } catch {
    // La largeur reste réglable pour la page en cours si le stockage local est interdit.
  }
}

/** En-tête de l'hôtel (configuration serveur `jbhotel.hotel`, mentions légales provisoires Q-09). */
export function ThermalTicket({
  label,
  hotel,
  title,
  stamp,
  width,
  children,
  footer,
}: {
  label: string
  hotel: Record<string, string | null>
  title: string
  /** Mention encadrée sous le titre (« Annulé », « Annulée par avoir »…). */
  stamp?: string | null
  width: TicketWidth
  children: ReactNode
  footer: ReactNode
}) {
  const legal = [
    hotel.tax_id && `NIF ${hotel.tax_id}`,
    hotel.trade_register && `RCCM ${hotel.trade_register}`,
  ].filter(Boolean)

  return (
    <article className={`thermal-ticket thermal-ticket--${width}`} aria-label={label}>
      <header className="ticket-center">
        <p className="ticket-brand">{hotel.name ?? 'JB Hôtel'}</p>
        {[hotel.address, hotel.city].filter(Boolean).map((line) => (
          <p key={line}>{line}</p>
        ))}
        {hotel.phone && <p>Tél. : {hotel.phone}</p>}
        {legal.length > 0 && <p>{legal.join(' · ')}</p>}
        <p className="ticket-title">{title}</p>
        {stamp && <p className="ticket-stamp">{stamp}</p>}
      </header>
      <TicketRule />
      {children}
      <TicketRule />
      <footer className="ticket-center">{footer}</footer>
    </article>
  )
}

export function TicketRule() {
  return <hr className="ticket-rule" />
}

/** Libellé à gauche, valeur à droite ; `amount` empêche la coupure d'un montant. */
export function TicketPair({
  label,
  children,
  strong = false,
  amount = false,
}: {
  label: ReactNode
  children: ReactNode
  strong?: boolean
  amount?: boolean
}) {
  return (
    <div className={strong ? 'ticket-pair ticket-pair--strong' : 'ticket-pair'}>
      <span>{label}</span>
      <span className={amount ? 'ticket-amount' : undefined}>{children}</span>
    </div>
  )
}

export interface TicketLine {
  key: string
  label: string
  quantity: number
  unitPriceFcfa: number
  amountFcfa: number
}

/** Prestations : libellé sur toute la largeur, puis « quantité × prix unitaire » et montant. */
export function TicketLines({ lines }: { lines: TicketLine[] }) {
  return (
    <>
      <div className="ticket-lines-head" aria-hidden="true">
        <span>Désignation</span>
        <span>Montant</span>
      </div>
      <ul className="ticket-lines" aria-label="Prestations">
        {lines.map((line) => (
          <li key={line.key}>
            <p>{line.label}</p>
            <TicketPair label={`${line.quantity} × ${formatFcfa(line.unitPriceFcfa)}`} amount>
              {formatFcfa(line.amountFcfa)}
            </TicketPair>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Format de page pendant l'affichage du ticket : largeur du rouleau × hauteur réelle du ticket,
 * pour imprimer une seule bande continue. `@page :first` l'emporte sur la règle A4 générale ;
 * la règle est retirée en quittant la page, les autres impressions restent en A4.
 */
function usePageSize(stage: RefObject<HTMLDivElement | null>, width: TicketWidth) {
  const update = useCallback(() => {
    const style = document.getElementById(PAGE_STYLE_ID)
    if (!style) return
    const height = stage.current?.querySelector('.thermal-ticket')?.getBoundingClientRect().height
    const heightMm = height ? Math.ceil(height * MM_PER_CSS_PX) + TEAR_MARGIN_MM : 297
    const page = `size: ${width}mm ${heightMm}mm; margin: 0;`
    style.textContent = `@media print { @page { ${page} } @page :first { ${page} } }`
  }, [stage, width])

  useEffect(() => {
    const style = document.createElement('style')
    style.id = PAGE_STYLE_ID
    document.head.appendChild(style)
    document.documentElement.classList.add('ticket-printing')
    return () => {
      style.remove()
      document.documentElement.classList.remove('ticket-printing')
    }
  }, [])

  useEffect(() => {
    update()
    window.addEventListener('beforeprint', update)
    return () => window.removeEventListener('beforeprint', update)
  }, [update])

  return update
}

/**
 * Page d'un ticket 80 mm : aperçu, choix de la largeur du rouleau et impression par le
 * navigateur. Réimprimer ne crée aucune opération (spécification 80 mm, § 5.10).
 */
export function TicketPrintLayout({
  eyebrow,
  title,
  description,
  links,
  children,
}: {
  eyebrow: string
  title: string
  description: ReactNode
  /** Liens de retour (document A4, réservation…). */
  links: { to: string; label: string; icon: 'back' | 'eye' | 'document' }[]
  children: (width: TicketWidth) => ReactNode
}) {
  const [width, setWidth] = useState<TicketWidth>(readWidth)
  const stage = useRef<HTMLDivElement>(null)
  const updatePageSize = usePageSize(stage, width)

  const print = () => {
    updatePageSize()
    window.print()
  }

  return (
    <div className="ticket-page">
      <PageHeading
        icon="print"
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <button type="button" className="primary" onClick={print}>
            <Icon name="print" size={17} />
            Imprimer le ticket
          </button>
        }
      />
      <div className="toolbar">
        {links.map((link) => (
          <Link key={link.to} className="secondary" to={link.to}>
            <Icon name={link.icon} size={17} />
            {link.label}
          </Link>
        ))}
      </div>
      <div className="fields no-print">
        <SelectField
          label="Largeur du papier"
          icon="print"
          value={String(width)}
          hint="Choisissez la largeur du rouleau chargé dans l’imprimante thermique."
          onChange={(event) => {
            const next: TicketWidth = event.target.value === '58' ? 58 : 80
            setWidth(next)
            saveWidth(next)
          }}
        >
          <option value="80">80 mm (standard)</option>
          <option value="58">58 mm</option>
        </SelectField>
      </div>
      <div className="ticket-stage" ref={stage}>
        {children(width)}
      </div>
      <p className="notice ticket-help no-print" role="note">
        Dans la fenêtre d’impression, choisissez l’imprimante thermique, le papier {width} mm,
        aucune marge et l’échelle 100 %. Réimprimer ce ticket ne crée ni encaissement ni facture.
      </p>
    </div>
  )
}
