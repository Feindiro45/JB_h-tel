import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  isAppLocation,
  normalizeOrigin,
  normalizeServerUrl,
  requestHeaders,
  responseHeaders,
  targetUrl,
} from './proxy.ts'

const server = 'https://banguiweb-tech.com/backend'
const target = { serverUrl: server, origin: 'https://banguiweb-tech.com' }

describe('relais de l’API', () => {
  test('transmet les appels de l’interface au dossier de l’API', () => {
    assert.equal(
      targetUrl('app://jbhotel/server/api/v1/reservations?page=2', server),
      'https://banguiweb-tech.com/backend/api/v1/reservations?page=2',
    )
    assert.equal(
      targetUrl('app://jbhotel/server/sanctum/csrf-cookie', server),
      'https://banguiweb-tech.com/backend/sanctum/csrf-cookie',
    )
  })

  test('refuse ce qui n’est pas pour l’API ou sort de son dossier', () => {
    assert.equal(targetUrl('app://jbhotel/assets/index.js', server), null)
    assert.equal(targetUrl('app://autre/server/api/v1/health', server), null)
    assert.equal(targetUrl('app://jbhotel/serveur/api', server), null)
    assert.equal(targetUrl('app://jbhotel/server/../../etc/passwd', server), null)
    assert.equal(targetUrl('app://x:y@jbhotel/server/api/v1/health', server), null)
  })

  test('reconnaît l’adresse de l’application malgré l’origine « null » de Node', () => {
    assert.equal(isAppLocation(new URL('app://jbhotel/reservations')), true)
    assert.equal(isAppLocation(new URL('app://autre/')), false)
    assert.equal(isAppLocation(new URL('https://jbhotel/')), false)
  })

  test('en-têtes : Origin de l’application web, jeton CSRF, rien d’autre de l’interface', () => {
    const incoming = new Headers({
      accept: 'application/json',
      'idempotency-key': 'k-1',
      cookie: 'volé=1',
      origin: 'app://jbhotel',
      'x-workstation-token': 'w',
    })
    const post = requestHeaders(incoming, target, 'POST', 'jeton')
    assert.equal(post.get('origin'), 'https://banguiweb-tech.com')
    assert.equal(post.get('referer'), 'https://banguiweb-tech.com/')
    assert.equal(post.get('x-xsrf-token'), 'jeton')
    assert.equal(post.get('idempotency-key'), 'k-1')
    assert.equal(post.get('x-workstation-token'), 'w')
    assert.equal(post.get('cookie'), null)
    assert.equal(requestHeaders(incoming, target, 'GET', 'jeton').get('x-xsrf-token'), null)
  })

  test('la réponse ne rend jamais les cookies à l’interface', () => {
    const headers = responseHeaders(
      new Headers({ 'content-type': 'application/json', 'set-cookie': 'laravel_session=x' }),
    )
    assert.equal(headers.get('set-cookie'), null)
    assert.equal(headers.get('content-type'), 'application/json')
  })

  test('adresses du serveur contrôlées', () => {
    assert.equal(normalizeServerUrl('https://banguiweb-tech.com/backend/'), server)
    assert.throws(() => normalizeServerUrl('file:///C:/x'))
    assert.throws(() => normalizeServerUrl('https://a:b@banguiweb-tech.com'))
    assert.equal(normalizeOrigin('https://banguiweb-tech.com/x'), 'https://banguiweb-tech.com')
  })
})
