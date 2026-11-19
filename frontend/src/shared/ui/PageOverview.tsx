import { Metric } from './layout'
import type { IconName } from './Icon'

export interface OverviewItem {
  label: string
  value: string | number | undefined
  hint: string
  icon: IconName
  tone?: 'green' | 'amber' | 'blue' | 'mint' | 'red'
}

/** Les pages précisent le périmètre de chaque indicateur, notamment après pagination. */
export function PageOverview({ items }: { items: OverviewItem[] }) {
  return (
    <section className="metrics page-overview" aria-label="Vue d’ensemble">
      {items.map((item, index) => (
        <Metric
          key={item.label}
          {...item}
          value={item.value === undefined ? '—' : String(item.value)}
          tone={item.tone ?? (['green', 'blue', 'mint', 'amber'] as const)[index % 4]}
        />
      ))}
    </section>
  )
}
