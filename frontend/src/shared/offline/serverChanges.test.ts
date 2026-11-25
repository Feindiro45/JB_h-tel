import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { pullServerChanges, screensFor } from './serverChanges'
import { storageGet } from './storage'

const USER = { id: 'u-1' }

type Reply = { status?: number; body: unknown }

/** Serveur simulé : rend les réponses dans l'ordre et note les adresses demandées. */
function server(replies: Reply[]) {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input))
      const reply = replies.shift() ?? { status: 500, body: {} }
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return urls
}

const status = (cursor: string): Reply => ({
  body: {
    data: { protocol: 1, server_time: '2026-12-01T10:00:00+01:00', cursor, poll_seconds: 30 },
  },
})
const page = (cursor: string, rows: { entity: string }[], hasMore = false): Reply => ({
  body: {
    data: rows.map((row) => ({ ...row, id: null, action: 'updated', occurred_at: '' })),
    meta: { cursor, has_more: hasMore, protocol: 1 },
  },
})

describe('Changements faits ailleurs (D-069)', () => {
  it('premier passage : le suivi commence au curseur du serveur, sans rien recharger', async () => {
    const urls = server([status('v1.42')])
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    expect(await pullServerChanges(client, USER)).toBe(0)
    expect(urls[0]).toContain('/api/v1/sync/status')
    expect(invalidate).not.toHaveBeenCalled()
    expect(await storageGet('server-changes')).toEqual({ userId: 'u-1', cursor: 'v1.42' })
  })

  it('n’actualise que les écrans touchés, lit toutes les pages et garde le nouveau curseur', async () => {
    const urls = server([
      status('v1.1'),
      page('v1.3', [{ entity: 'payment' }], true),
      page('v1.4', [{ entity: 'customer' }]),
    ])
    const client = new QueryClient()
    await pullServerChanges(client, USER)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    expect(await pullServerChanges(client, USER)).toBe(2)
    expect(urls[1]).toContain('cursor=v1.1')
    expect(urls[2]).toContain('cursor=v1.3')
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey))
    expect(keys).toContain('["cash-journal"]')
    expect(keys).toContain('["customers"]')
    expect(keys).not.toContain('["catalog"]')
    expect(await storageGet('server-changes')).toEqual({ userId: 'u-1', cursor: 'v1.4' })
  })

  it('curseur trop ancien : tous les écrans sont rechargés et le suivi repart', async () => {
    server([
      status('v1.1'),
      {
        status: 410,
        body: { title: 'Rechargement nécessaire', message: '…', code: 'sync_cursor_expired' },
      },
      status('v1.90'),
    ])
    const client = new QueryClient()
    await pullServerChanges(client, USER)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    expect(await pullServerChanges(client, USER)).toBe(0)
    expect(invalidate).toHaveBeenCalledWith()
    expect(await storageGet('server-changes')).toEqual({ userId: 'u-1', cursor: 'v1.90' })
  })

  it('serveur d’une version antérieure (404) : ignoré sans erreur, plus interrogé', async () => {
    const urls = server([{ status: 404, body: { title: 'Introuvable', message: '…' } }])
    const client = new QueryClient()
    expect(await pullServerChanges(client, USER)).toBeNull()
    expect(await pullServerChanges(client, USER)).toBeNull()
    expect(urls).toHaveLength(1)
  })

  it('changement d’utilisateur : le curseur d’un autre compte n’est pas repris', async () => {
    const urls = server([status('v1.5'), status('v1.7')])
    const client = new QueryClient()
    await pullServerChanges(client, USER)
    await pullServerChanges(client, { id: 'u-2' })
    expect(urls[1]).toContain('/api/v1/sync/status')
  })

  it('type de donnée inconnu : tout est actualisé', () => {
    expect(screensFor(['nouveau_type'])).toBe('all')
    expect(screensFor(['refund'])).toContainEqual(['payments'])
  })
})
