import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'
import { ApiError, NETWORK_ERROR_MESSAGE } from './errors'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

describe('api client', () => {
  it('appelle l’API avec les cookies de session et renvoie le JSON', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { status: 'ok' }))

    await expect(
      api.get('/api/v1/health', { query: { from: '2026-11-19', vide: '' } }),
    ).resolves.toEqual({
      status: 'ok',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('http://localhost:8000/api/v1/health?from=2026-11-19')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.Accept).toBe('application/json')
  })

  it('envoie le jeton CSRF sur les requêtes qui modifient des données', async () => {
    document.cookie = 'XSRF-TOKEN=abc%3D123; path=/'
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))

    await api.post('/api/v1/reservations', { room_id: 1 })

    const init = fetchMock.mock.calls[0][1]
    const headers = init?.headers as Record<string, string>
    expect(headers['X-XSRF-TOKEN']).toBe('abc=123')
    expect(headers['Content-Type']).toBe('application/json')
    expect(init?.body).toBe('{"room_id":1}')
  })

  it('lève une ApiError française pour une réponse en échec', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, {
        title: 'Chambre indisponible',
        message: 'La chambre 101 est déjà réservée.',
      }),
    )

    const error = await api.post('/api/v1/reservations', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).title).toBe('Chambre indisponible')
  })

  it('transforme une panne réseau en message « Connexion impossible »', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    const error = await api.get('/api/v1/health').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).isNetworkError).toBe(true)
    expect((error as ApiError).message).toBe(NETWORK_ERROR_MESSAGE)
  })

  it('laisse passer l’annulation volontaire d’une requête', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'))

    await expect(api.get('/api/v1/health')).rejects.toMatchObject({ name: 'AbortError' })
  })
})
