import { expect as baseExpect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const { password } = JSON.parse(
  readFileSync(
    new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url),
    'utf8',
  ),
) as { password: string }

// Serveur PHP à un seul processus, lent au premier passage.
const expect = baseExpect.configure({ timeout: 25_000 })

test('poste coupé du réseau : ouverture, consultation, historique, verrou et retour du réseau', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  // 1. En ligne : connexion, service worker installé, écrans consultés gardés sur le poste.
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill('admin@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.goto('/disponibilites')
  await expect(page.getByRole('heading', { name: 'Disponibilités', level: 1 })).toBeVisible()
  await expect(page.locator('main')).toContainText('101')
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await page.goto('/synchronisation')
  await page.getByRole('button', { name: 'Mettre à jour en local' }).click()
  const history = page.getByRole('region', { name: 'Historique des synchronisations' })
  await expect(history.getByRole('row').nth(1)).toContainText('Réussie')
  await expect(history.getByRole('row').nth(1)).toContainText('Manuelle')
  // La copie du poste contient bien le planning (écran essentiel) avant la coupure.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const open = indexedDB.open('jb-hotel-offline', 1)
            open.onsuccess = () => {
              const get = open.result.transaction('kv').objectStore('kv').get('query-cache')
              get.onsuccess = () =>
                resolve(
                  JSON.stringify(
                    get.result?.state?.queries?.map((q: { queryKey: unknown }) => q.queryKey) ?? [],
                  ),
                )
            }
            open.onerror = () => resolve('')
          }),
      ),
    )
    .toContain('"planning"')

  // Application installable (PWA) : contrôle officiel du navigateur, sans erreur.
  const cdp = await context.newCDPSession(page)
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[]
  }
  // Seule réserve admise : le contexte de test est une navigation privée, où rien ne s’installe.
  expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([])
  await expect(page.getByRole('region', { name: 'Installation sur ce poste' })).toBeVisible()

  // 2. Coupure : l'application s'ouvre quand même et montre les données gardées.
  await context.setOffline(true)
  await page.goto('/disponibilites')
  await expect(page.getByRole('heading', { name: 'Disponibilités', level: 1 })).toBeVisible()
  await expect(page.locator('main')).toContainText('101')
  await expect(page.locator('.connectivity-chip')).toHaveText('Hors ligne')
  await expect(page.getByText(/Vous consultez les données gardées sur ce poste/)).toBeVisible()

  // Listes principales téléchargées par « Mettre à jour en local », même jamais ouvertes en ligne.
  await page.goto('/reservations')
  await expect(page.getByRole('heading', { name: 'Réservations', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Séjours enregistrés' })).toBeVisible()
  await expect(page.getByText('Pas encore disponible hors ligne.')).toHaveCount(0)
  await page.goto('/clients')
  await expect(page.getByRole('heading', { name: 'Clients', level: 1 })).toBeVisible()
  await expect(page.getByText('Pas encore disponible hors ligne.')).toHaveCount(0)

  // Écran d’administration jamais gardé : message clair, jamais un chargement sans fin.
  await page.goto('/admin/audit')
  await expect(page.getByText('Pas encore disponible hors ligne.').first()).toBeVisible()

  // 3. Mise à jour impossible hors ligne : échec journalisé avec sa cause.
  await page.goto('/synchronisation')
  await page.getByRole('button', { name: 'Mettre à jour en local' }).click()
  await expect(history.getByRole('row').nth(1)).toContainText('Échec')
  await expect(history.getByRole('row').nth(1)).toContainText('Connexion impossible')

  // 4. Inactivité de plus de 15 min hors ligne : verrou, puis déverrouillage par mot de passe.
  await page.evaluate(() =>
    localStorage.setItem('jb-hotel.last-activity', String(Date.now() - 20 * 60_000)),
  )
  await page.reload()
  const lock = page.getByRole('dialog', { name: 'Session verrouillée' })
  await expect(lock).toBeVisible()
  await lock.getByLabel('Mot de passe').fill('pas-le-bon')
  await lock.getByRole('button', { name: 'Déverrouiller' }).click()
  await expect(lock).toContainText('Mot de passe incorrect.')
  await lock.getByLabel('Mot de passe').fill(password)
  await lock.getByRole('button', { name: 'Déverrouiller' }).click()
  await expect(lock).toBeHidden()

  // 5. Retour du réseau : état « En ligne » et mise à jour automatique journalisée.
  await context.setOffline(false)
  await expect(page.locator('.connectivity-chip')).toHaveText('En ligne', { timeout: 40_000 })
  await expect(history.getByRole('row').nth(1)).toContainText('Retour du réseau', {
    timeout: 40_000,
  })
  expect(errors).toEqual([])
})
