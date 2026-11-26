import type { CSSProperties } from 'react'

export type PadlockPhase = 'closing' | 'idle' | 'checking' | 'error' | 'opening'

/** Éclats du cadenas qui s'ouvre : direction, distance et couleur de chaque particule. */
const PARTICLES = Array.from({ length: 14 }, (_, index) => ({
  angle: index * (360 / 14) + (index % 2 ? 9 : -6),
  distance: 86 + (index % 3) * 26,
  color: ['#fcd34d', '#34d399', '#f8fafc', '#fbbf24'][index % 4],
  size: 6 + (index % 3) * 3,
}))

/**
 * Cadenas animé de la page de veille (D-074) : il se referme à la mise en veille (l'anse descend et
 * claque), flotte doucement en attendant, tremble sur un mauvais mot de passe et éclate quand le
 * logiciel se déverrouille. Purement décoratif : l'état est annoncé par le texte de la page.
 */
export function Padlock({ phase }: { phase: PadlockPhase }) {
  return (
    <div className="padlock" data-phase={phase} aria-hidden="true">
      <span className="padlock__halo" />
      <span className="padlock__flash" />
      {PARTICLES.map((particle) => (
        <span
          key={particle.angle}
          className="padlock__particle"
          style={
            {
              '--angle': `${particle.angle}deg`,
              '--distance': `${particle.distance}px`,
              '--color': particle.color,
              '--size': `${particle.size}px`,
            } as CSSProperties
          }
        />
      ))}
      <svg className="padlock__art" viewBox="0 0 120 140" width="132" height="154">
        <defs>
          <linearGradient id="padlock-shackle" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f8fafc" />
            <stop offset="0.55" stopColor="#cbd5e1" />
            <stop offset="1" stopColor="#64748b" />
          </linearGradient>
          <linearGradient id="padlock-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="0.45" stopColor="#f5b301" />
            <stop offset="1" stopColor="#b45309" />
          </linearGradient>
          <radialGradient id="padlock-shine" cx="0.3" cy="0.2" r="0.7">
            <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path
          className="padlock__shackle"
          d="M35 64 V44 a25 25 0 0 1 50 0 V64"
          fill="none"
          stroke="url(#padlock-shackle)"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <g className="padlock__body">
          <rect x="16" y="58" width="88" height="72" rx="18" fill="url(#padlock-body)" />
          <rect x="16" y="58" width="88" height="72" rx="18" fill="url(#padlock-shine)" />
          <rect
            x="16.5"
            y="58.5"
            width="87"
            height="71"
            rx="17.5"
            fill="none"
            stroke="#fff7d6"
            strokeOpacity="0.55"
          />
          <circle cx="60" cy="88" r="9" fill="#3f2a05" />
          <rect x="56" y="91" width="8" height="20" rx="3.5" fill="#3f2a05" />
        </g>
        <circle
          className="padlock__ring"
          cx="60"
          cy="94"
          r="54"
          fill="none"
          stroke="#a7f3d0"
          strokeWidth="3"
        />
      </svg>
    </div>
  )
}
