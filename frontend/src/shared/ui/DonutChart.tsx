import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import './donutChart.css'

export interface DonutSegment {
  key: string
  label: string
  value: number
  /** Valeur affichée (« 2,4 Mo », « 12 ») ; par défaut le nombre brut. */
  display?: string
  color: string
  icon?: IconName
}

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** Trait de surface entre deux parts (≈ 2 px à la taille par défaut). */
const GAP = 1.6

/** Icône lisible sur la couleur de la part : sombre sur les teintes claires (jaune, ambre). */
function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.3 ? '#0b0b0b' : '#ffffff'
}

/**
 * Camembert en anneau : chaque part garde son icône, son libellé et sa valeur dans la légende
 * (jamais la couleur seule). Survol ou focus d'une part ou d'une ligne de légende : la part
 * ressort et son chiffre prend la place du total au centre.
 */
export function DonutChart({
  label,
  segments,
  center,
}: {
  /** Nom accessible du graphique. */
  label: string
  segments: DonutSegment[]
  center: { value: string; caption: string }
}) {
  const [active, setActive] = useState<string | null>(null)
  const visible = segments.filter((s) => s.value > 0)
  const total = visible.reduce((sum, s) => sum + s.value, 0)
  const focused = visible.find((s) => s.key === active) ?? null
  const share = (value: number) => (total ? Math.round((value * 100) / total) : 0)

  // Parts cumulées, calculées sans mutation pendant le rendu.
  const arcs = visible.reduce<{ items: (DonutSegment & { start: number; length: number })[] }>(
    (acc, segment) => {
      const previous = acc.items.at(-1)
      const start = previous ? previous.start + previous.length : 0
      return {
        items: [
          ...acc.items,
          { ...segment, start, length: (segment.value / total) * CIRCUMFERENCE },
        ],
      }
    },
    { items: [] },
  ).items

  return (
    <figure className="donut-chart" aria-label={label}>
      <div className="donut-chart__ring">
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="donut-chart__track" cx="50" cy="50" r={RADIUS} />
          {arcs.map((arc) => {
            const gap = arcs.length > 1 ? Math.min(GAP, arc.length / 2) : 0
            return (
              <circle
                key={arc.key}
                className={`donut-chart__arc${active === arc.key ? ' is-active' : ''}${active && active !== arc.key ? ' is-dimmed' : ''}`}
                cx="50"
                cy="50"
                r={RADIUS}
                stroke={arc.color}
                strokeDasharray={`${Math.max(arc.length - gap, 0.01)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-arc.start}
                onPointerEnter={() => setActive(arc.key)}
                onPointerLeave={() => setActive(null)}
              />
            )
          })}
        </svg>
        <div className="donut-chart__center" aria-live="polite">
          <strong>{focused ? (focused.display ?? String(focused.value)) : center.value}</strong>
          <small>{focused ? `${focused.label} · ${share(focused.value)} %` : center.caption}</small>
        </div>
      </div>
      <ul className="donut-chart__legend">
        {segments.map((segment) => (
          <li
            key={segment.key}
            tabIndex={segment.value > 0 ? 0 : undefined}
            className={active === segment.key ? 'is-active' : undefined}
            onPointerEnter={() => segment.value > 0 && setActive(segment.key)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => segment.value > 0 && setActive(segment.key)}
            onBlur={() => setActive(null)}
          >
            <span
              className="donut-chart__key"
              style={{ background: segment.color, color: inkOn(segment.color) }}
            >
              {segment.icon && <Icon name={segment.icon} size={13} />}
            </span>
            <span className="donut-chart__label">{segment.label}</span>
            <strong>{segment.display ?? segment.value}</strong>
          </li>
        ))}
      </ul>
    </figure>
  )
}
