import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'
import { newIdempotencyKey } from './idempotency'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.restoreAllMocks())

describe('Clés d’idempotence (lot 3)', () => {
  it('produit des UUID v4 distincts', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(50)
    for (const key of keys) expect(key).toMatch(UUID_V4)
  })

  it('reste utilisable sans HTTPS (crypto.randomUUID absent)', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      expect(newIdempotencyKey()).toMatch(UUID_V4)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
    expect(typeof crypto.randomUUID).toBe('function')
  })

  it('envoie l’en-tête Idempotency-Key seulement quand une clé est donnée', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{}', { status: 201 }))

    await api.post('/api/v1/customers', { last_name: 'A' }, { idempotencyKey: 'cle-de-test' })
    await api.post('/api/v1/customers', { last_name: 'A' })

    const headers = fetchMock.mock.calls.map(([, init]) => init?.headers as Record<string, string>)
    expect(headers[0]!['Idempotency-Key']).toBe('cle-de-test')
    expect(headers[1]!['Idempotency-Key']).toBeUndefined()
  })
})
