import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { restoreQueryCache, saveQueryCache, snapshot } from './persistence'

const USER = { id: 'u-1', name: 'Grâce' }

describe('Copie locale après une relecture échouée (D-069)', () => {
  it('garde la session et les écrans quand le serveur ne répond plus (réseau local actif)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['auth', 'me'], USER)
    client.setQueryData(['reservations', 'r1'], { data: { id: 'r1' } })
    // Le serveur est injoignable : la relecture échoue, les données déjà reçues restent.
    await client
      .fetchQuery({
        queryKey: ['auth', 'me'],
        queryFn: () => Promise.reject(new TypeError('Failed to fetch')),
        staleTime: 0,
      })
      .catch(() => undefined)
    expect(client.getQueryState(['auth', 'me'])?.status).toBe('error')

    const saved = snapshot(client)
    const me = saved.state.queries.find((q) => q.queryKey[0] === 'auth')
    expect(me?.state.status).toBe('success')
    expect(me?.state.data).toEqual(USER)
    expect(saved.userId).toBe('u-1')

    await saveQueryCache(client)
    const restarted = new QueryClient()
    expect(await restoreQueryCache(restarted)).not.toBeNull()
    expect(restarted.getQueryData(['auth', 'me'])).toEqual(USER)
    expect(restarted.getQueryData(['reservations', 'r1'])).toEqual({ data: { id: 'r1' } })
  })

  it('une lecture en échec sans aucune donnée n’est pas gardée', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['auth', 'me'], USER)
    await client
      .fetchQuery({ queryKey: ['customers'], queryFn: () => Promise.reject(new Error('x')) })
      .catch(() => undefined)
    expect(snapshot(client).state.queries.map((q) => q.queryKey[0])).toEqual(['auth'])
  })
})
