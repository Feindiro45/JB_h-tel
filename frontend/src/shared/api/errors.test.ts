import { describe, expect, it } from 'vitest'
import {
  ApiError,
  NETWORK_ERROR_MESSAGE,
  errorFromResponse,
  networkError,
  toUserError,
} from './errors'

describe('errorFromResponse', () => {
  it('reprend le titre, le message et les erreurs de champ envoyés par le backend', () => {
    const error = errorFromResponse(422, {
      title: 'Données invalides',
      message: 'Corrigez les champs signalés.',
      errors: { email: ['Le champ adresse e-mail est obligatoire.'] },
    })

    expect(error.status).toBe(422)
    expect(error.title).toBe('Données invalides')
    expect(error.message).toBe('Corrigez les champs signalés.')
    expect(error.fieldMessages).toEqual(['Le champ adresse e-mail est obligatoire.'])
  })

  it.each([
    [401, 'Session expirée'],
    [403, 'Accès refusé'],
    [404, 'Élément introuvable'],
    [409, 'Opération impossible'],
    [422, 'Données invalides'],
    [429, 'Trop de demandes'],
    [500, 'Incident technique'],
    [503, 'Service indisponible'],
  ])('fournit un message français par défaut pour le statut %i', (status, title) => {
    const error = errorFromResponse(status, undefined)
    expect(error.title).toBe(title)
    expect(error.message.length).toBeGreaterThan(10)
  })

  it("n'affiche jamais le détail renvoyé par une erreur serveur", () => {
    const error = errorFromResponse(500, {
      title: 'SQLSTATE[42S02]',
      message: 'Table jb_interne introuvable',
      errors: { trace: ['#0 vendor/...'] },
    })

    expect(error.title).toBe('Incident technique')
    expect(error.message).not.toContain('jb_interne')
    expect(error.fieldErrors).toEqual({})
  })

  it('ignore les erreurs de champ mal formées', () => {
    const error = errorFromResponse(422, { errors: { email: [42, ''], nom: 'Requis.' } })
    expect(error.fieldErrors).toEqual({ nom: ['Requis.'] })
  })
})

describe('networkError', () => {
  it('utilise le message réseau imposé par le cahier des charges', () => {
    const error = networkError()
    expect(error.isNetworkError).toBe(true)
    expect(error.message).toBe('Connexion impossible. Vérifiez votre connexion et réessayez.')
    expect(NETWORK_ERROR_MESSAGE).toBe(error.message)
  })
})

describe('toUserError', () => {
  it('conserve une ApiError telle quelle', () => {
    const original = new ApiError(409, 'Chambre indisponible', 'La chambre 101 est occupée.')
    expect(toUserError(original)).toBe(original)
  })

  it('masque une erreur JavaScript inattendue derrière un message générique', () => {
    const error = toUserError(new TypeError("Cannot read properties of undefined (reading 'x')"))
    expect(error.title).toBe('Erreur inattendue')
    expect(error.message).not.toContain('undefined')
  })
})
