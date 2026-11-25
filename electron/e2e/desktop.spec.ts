import { _electron as electron, expect as baseExpect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { API, ORIGIN } from '../playwright.config.ts'

/**
 * Recette du logiciel Windows (D-069, docs/TEST_REPORT.md) : connexion en ligne à travers le
 * relais, copie des données dans SQLite, redémarrages sans serveur, encaissement hors ligne gardé
 * dans la base locale, puis envoi automatique et idempotent au retour du serveur.
 */
const electronDir = fileURLToPath(new URL('..', import.meta.url))
const { password } = JSON.parse(
  readFileSync(new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url), 'utf8'),
) as { password: string }
const UNREACHABLE = 'http://127.0.0.1:9'
const expect = baseExpect.configure({ timeout: 30_000 })

const dataDir = mkdtempSync(join(tmpdir(), 'jbhotel-desktop-e2e-'))
const database = join(dataDir, 'jbhotel.sqlite')

async function launch(server: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  // JBH_E2E_EXECUTABLE : recette de la version empaquetée (release/win-unpacked/JBHotel.exe).
  const executable = process.env.JBH_E2E_EXECUTABLE
  const app = await electron.launch({
    cwd: electronDir,
    ...(executable ? { executablePath: executable } : {}),
    args: [...(executable ? [] : ['.']), `--data-dir=${dataDir}`, `--server=${server}`, `--origin=${ORIGIN}`],
    env,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

/** Lecture directe de la base locale (colonnes techniques en clair, valeurs chiffrées). */
function sql<T>(query: string): T[] {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    return db.prepare(query).all() as T[]
  } finally {
    db.close()
  }
}

function cachedKeys(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const read = await window.jbDesktop!.storage.read(['query-cache'])
    const cache = read.values['query-cache'] as { state?: { queries?: { queryKey: unknown }[] } } | undefined
    return JSON.stringify(cache?.state?.queries?.map((q) => q.queryKey) ?? [])
  })
}

declare global {
  interface Window {
    jbDesktop?: {
      storage: { read(keys: string[]): Promise<{ values: Record<string, unknown> }> }
      system: { info(): Promise<{ sealing: string; schemaVersion: number }> }
      printing: { printers(): Promise<unknown[]> }
    }
  }
}

test('poste Windows : en ligne, redémarrages sans serveur, encaissement local, envoi au retour', async () => {
  // 1. Premier démarrage, serveur joignable : connexion à travers le relais (cookies Sanctum,
  //    CSRF et origine gérés par le processus principal).
  let { app, page } = await launch(API)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  expect(page.url()).toMatch(/^app:\/\/jbhotel\//)
  await page.getByLabel('Adresse e-mail').fill('admin@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()

  // Sécurité : aucun accès à Node depuis l'interface, navigation externe bloquée.
  expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
  expect(await page.evaluate(() => typeof (window as unknown as { process?: unknown }).process)).toBe('undefined')
  const info = await page.evaluate(() => window.jbDesktop!.system.info())
  expect(info.sealing).toBe('dpapi')
  expect(info.schemaVersion).toBe(1)

  // D-070 : sans aucun clic, le poste télécharge tout seul sa copie complète après la connexion.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const read = await window.jbDesktop!.storage.read(['sync-runs'])
          const runs = (read.values['sync-runs'] ?? []) as { trigger: string; status: string }[]
          return runs.map((run) => `${run.trigger}:${run.status}`)
        }),
      { timeout: 120_000 },
    )
    .toContain('auto-full:success')

  // Réservation créée en ligne (paiement différé), gardée sur le poste.
  await page.goto('app://jbhotel/reservations')
  await page.getByRole('button', { name: '+ Nouvelle réservation' }).click()
  const booking = page.getByRole('dialog')
  await booking.getByRole('radio', { name: 'Nouveau client', exact: true }).check()
  await booking.getByLabel('Nom', { exact: true }).fill('Poste Windows')
  await booking.getByLabel('Téléphone', { exact: true }).fill('+23672008888')
  await booking.getByLabel('Titulaire du séjour').fill('Poste Windows')
  const room = booking.getByLabel('Chambre', { exact: true })
  await expect(room.locator('option')).not.toHaveCount(1)
  await room.selectOption({ index: 1 })
  await booking.getByRole('radio', { name: 'Paiement différé', exact: true }).check()
  await booking.getByRole('button', { name: 'Créer la réservation' }).click()
  await expect(page).toHaveURL(/\/reservations\/[a-f0-9-]{36}$/)
  const reservationUrl = page.url()
  const reservationId = reservationUrl.split('/').at(-1)!
  await expect(page.getByRole('button', { name: 'Encaisser' })).toBeVisible()
  await expect.poll(() => cachedKeys(page)).toContain(`["payments","${reservationId}"]`)

  await page.goto('app://jbhotel/synchronisation')
  await page.getByRole('button', { name: 'Mettre à jour en local' }).click()
  const history = page.getByRole('region', { name: 'Historique des synchronisations' })
  await expect(history.getByRole('row').nth(1)).toContainText('Réussie', { timeout: 120_000 })
  const desktop = page.getByRole('region', { name: 'Poste Windows' })
  await expect(desktop).toContainText('Chiffrées (compte Windows)')
  await expect(page.getByRole('region', { name: 'Imprimante des tickets' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Installation sur ce poste' })).toHaveCount(0)
  await expect.poll(() => cachedKeys(page)).toContain(`["reservations","${reservationId}"]`)
  await app.close()

  // La copie est dans la base SQLite du dossier de données, par écran.
  expect(existsSync(database)).toBe(true)
  const roots = sql<{ root: string }>('SELECT DISTINCT root FROM local_queries').map((r) => r.root)
  expect(roots).toEqual(expect.arrayContaining(['reservations', 'payments', 'planning']))

  // 2. Redémarrage sans serveur : l'application s'ouvre depuis les fichiers installés.
  ;({ app, page } = await launch(UNREACHABLE))
  await page.goto(reservationUrl.replace(/^app:\/\/jbhotel/, 'app://jbhotel'))
  await expect(page.locator('.connectivity-chip')).toHaveText('Hors ligne')
  await expect(page.getByRole('button', { name: 'Encaisser' })).toBeVisible()
  await page.getByRole('button', { name: 'Encaisser' }).click()
  const payment = page.getByRole('dialog', { name: 'Encaisser' })
  await payment.getByLabel('Montant (FCFA)').fill('5000')
  await payment.getByRole('button', { name: 'Enregistrer l’encaissement' }).click()
  await expect(page.getByText(/Encaissement gardé sur ce poste — reçu provisoire LOC-/)).toBeVisible()
  const provisional = (await page.getByText(/^LOC-.*-000001$/).first().textContent())!.trim()

  // L'opération est dans la file SQLite, en attente.
  expect(sql<{ kind: string; status: string }>('SELECT kind, status FROM sync_outbox')).toEqual([
    { kind: 'payment.record', status: 'pending' },
  ])
  expect(await page.evaluate(() => window.jbDesktop!.printing.printers().then((p) => Array.isArray(p)))).toBe(true)
  await app.close()

  // 3. Deuxième redémarrage sans serveur : rien n'est perdu.
  ;({ app, page } = await launch(UNREACHABLE))
  await page.goto(reservationUrl)
  await expect(page.getByText(provisional).first()).toBeVisible()
  await expect(page.getByText('En attente d’envoi').first()).toBeVisible()
  await app.close()

  // 4. Retour du serveur : envoi automatique au démarrage, une seule fois, avec reçu définitif.
  ;({ app, page } = await launch(API))
  await page.goto(reservationUrl)
  await expect(page.locator('.connectivity-chip')).toHaveText('En ligne')
  await expect
    .poll(() => sql<{ status: string }>('SELECT status FROM sync_outbox').map((r) => r.status), { timeout: 90_000 })
    .toEqual(['accepted'])
  const payments = await page.evaluate(async (id) => {
    const response = await fetch(`app://jbhotel/server/api/v1/reservations/${id}/payments`, {
      headers: { Accept: 'application/json' },
    })
    return (await response.json()) as { data: { amount_fcfa: number; receipt_number: string; status: string }[] }
  }, reservationId)
  const valid = payments.data.filter((p) => p.status === 'VALID')
  expect(valid).toHaveLength(1)
  expect(valid[0]!.amount_fcfa).toBe(5000)
  expect(valid[0]!.receipt_number).toMatch(/^REC-/)

  // Journal des changements du serveur : le poste suit le curseur.
  await expect
    .poll(async () => page.evaluate(async () => (await window.jbDesktop!.storage.read(['server-changes'])).values['server-changes']), { timeout: 60_000 })
    .toMatchObject({ cursor: expect.stringMatching(/^v1\.\d+$/) })
  const feed = await page.evaluate(async () => {
    const response = await fetch('app://jbhotel/server/api/v1/sync/changes?cursor=v1.0&limit=500', {
      headers: { Accept: 'application/json' },
    })
    return (await response.json()) as { data: { entity: string }[] }
  })
  expect(feed.data.map((row) => row.entity)).toContain('payment')
  await app.close()

  // Journal local : file tracée (mise en file puis acceptation).
  expect(
    sql<{ event: string; new_status: string | null }>(
      'SELECT event, new_status FROM sync_outbox_journal ORDER BY seq',
    ).map((row) => `${row.event}:${row.new_status}`),
  ).toEqual(['queued:pending', 'status:accepted'])
  expect(errors).toEqual([])
})
