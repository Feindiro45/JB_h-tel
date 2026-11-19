/** Jeu d'icônes du prototype (trait de 1,65 px), décoratives : toujours accompagnées d'un libellé. */
const PATHS = {
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  phone: '<path d="m5 3 4 4-2 3a14 14 0 0 0 7 7l3-2 4 4-2 3C10 22 2 14 2 5z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  hash: '<path d="m9 3-3 18M18 3l-3 18M3 9h18M2 15h18"/>',
  percent: '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="m4 20 16-16"/>',
  edit: '<path d="m15 4 5 5M4 20l4-1 12-12a3 3 0 0 0-4-4L4 15z"/>',
  tool: '<path d="M14 6a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-4 3-3-3z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:
    '<path d="m3 3 18 18M10 5a11 11 0 0 1 2 0c6 0 10 7 10 7a20 20 0 0 1-4 4M6 6a20 20 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/>',
  undo: '<path d="M4 4v6h6M4 10a8 8 0 1 1 1 9"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  refresh: '<path d="M20 4v6h-6M4 20v-6h6M20 10a8 8 0 0 0-14-5M4 14a8 8 0 0 0 14 5"/>',
  loader: '<path d="M20 12a8 8 0 1 1-8-8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  print: '<path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7zM17 11h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  layers: '<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  wallet:
    '<path d="M20 8V5H5a2 2 0 0 1 0-4h12v4M3 3v16a2 2 0 0 0 2 2h15V8H6a3 3 0 0 1-3-3M16 12h5v5h-5z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>',
  rooms: '<path d="M3 18V7m18 11v-6H3m2 0V8h6v4m0 0V8h6a4 4 0 0 1 4 4M3 16h18"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m1-15a3 3 0 0 1 0 6m2 3a4 4 0 0 1 3 4v2"/>',
  cash: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h1m10 0h1"/>',
  document: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  chart: '<path d="M3 3v18h18M8 16v-4m5 4V8m5 8V5"/>',
  settings:
    '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 7.2-7.2m-3 3 2 2m-4 0 2 2"/>',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 19,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  )
}
