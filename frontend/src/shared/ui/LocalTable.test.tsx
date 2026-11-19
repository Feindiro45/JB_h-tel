import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { LocalTable } from './LocalTable'

const rows = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  name: i === 44 ? 'Émilie' : `Client ${i + 1}`,
}))

function example() {
  return render(
    <LocalTable label="clients" rows={rows} searchText={(r) => r.name}>
      {(visible) => (
        <table>
          <thead>
            <tr>
              <th>Client</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </LocalTable>,
  )
}

it('pagine le tableau puis filtre immédiatement en revenant à la première page', async () => {
  example()
  const user = userEvent.setup()
  const nav = screen.getByRole('navigation', { name: 'Pagination : clients' })
  await user.click(within(nav).getByRole('button', { name: /^Page 3$/ }))
  expect(nav).toHaveTextContent('51–60')
  await user.type(screen.getByRole('searchbox', { name: 'Rechercher dans clients' }), 'emilie')
  expect(screen.getByRole('table')).toHaveTextContent('Émilie')
  expect(nav).toHaveTextContent('1–1')
  expect(nav).toHaveTextContent('sur 1 résultat')
})

it('affiche un état vide et permet d’effacer une recherche sans validation', async () => {
  example()
  const user = userEvent.setup()
  const search = screen.getByRole('searchbox')
  await user.type(search, 'inexistant')
  expect(screen.getByRole('navigation')).toHaveTextContent('Aucun résultat')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  await user.clear(search)
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(25)
})

it('imprime toutes les lignes puis rétablit le filtre et la pagination à l’écran', async () => {
  example()
  const user = userEvent.setup()
  await user.type(screen.getByRole('searchbox'), 'emilie')
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(1)
  act(() => window.dispatchEvent(new Event('beforeprint')))
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(60)
  act(() => window.dispatchEvent(new Event('afterprint')))
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(1)
  expect(screen.getByRole('searchbox')).toHaveValue('emilie')
})
