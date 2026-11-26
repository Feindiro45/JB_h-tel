import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const { password } = JSON.parse(
  readFileSync(
    new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url),
    'utf8',
  ),
) as { password: string }

// Serveur PHP à un seul processus, lent au premier passage.
const expect = baseExpect.configure({ timeout: 25_000 })

/** Date lointaine propre à ce scénario (aucune autre recette ne réserve à cette date). */
function farDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

async function login(page: Page): Promise<void> {
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill('admin@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()
}

/** Réservation pour un nouveau client à la date donnée ; rend le numéro de la chambre choisie. */
async function book(page: Page, name: string, phone: string, date: string, room?: string) {
  await page.goto('/reservations')
  await page.getByRole('button', { name: '+ Nouvelle réservation' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Nouveau client', exact: true }).check()
  await dialog.getByLabel('Nom', { exact: true }).fill(name)
  await dialog.getByLabel('Téléphone', { exact: true }).fill(phone)
  await dialog.getByLabel('Titulaire du séjour').fill(name)
  await dialog.getByRole('button', { name: 'Suivant' }).click()
  await dialog.getByLabel('Date d’arrivée').fill(date)
  await dialog.getByLabel('Date de départ').fill(date)
  const select = dialog.getByLabel('Chambre', { exact: true })
  await expect(select.locator('option')).not.toHaveCount(1)
  if (room) {
    const label = await select
      .locator('option', { hasText: new RegExp(`^${room} ·`) })
      .first()
      .textContent()
    await select.selectOption({ label: label!.trim() })
  } else {
    await select.selectOption({ index: 1 })
  }
  const chosen = (await select.locator('option:checked').textContent())!.split(' · ')[0]!.trim()
  await expect(dialog.getByText('Total net')).toBeVisible()
  // Assistant D-071 : récapitulatif confirmé par le client, puis règlement choisi.
  await dialog.getByRole('button', { name: 'Suivant' }).click()
  await dialog.getByLabel('Le client a vérifié ces informations et les confirme').check()
  await dialog.getByRole('button', { name: 'Suivant' }).click()
  await dialog.getByRole('radio', { name: 'Paiement différé', exact: true }).check()
  await dialog.getByRole('button', { name: 'Créer la réservation' }).click()
  return chosen
}

async function newStation(browser: Browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  return { context, page }
}

test('conflit de chambre : réservation hors ligne refusée par le serveur, cause gardée, refus examiné', async ({
  browser,
}) => {
  // Base de recette conservée d’une exécution à l’autre : nom et date propres à chaque passage.
  const date = farDate(60 + Math.floor(Math.random() * 300))
  const run = Array.from({ length: 5 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join('')
  const nameA = `Conflit ${run}`
  // Poste A : préparé en ligne, puis coupé du réseau.
  const a = await newStation(browser)
  await a.page.goto('/synchronisation')
  await a.page.getByRole('button', { name: 'Tout télécharger' }).click()
  await expect(a.page.getByRole('button', { name: 'Tout télécharger' })).toBeEnabled({
    timeout: 120_000,
  })
  await a.context.setOffline(true)

  // Hors ligne, A réserve une chambre : libre d’après ses données.
  const room = await book(a.page, nameA, '+23672008881', date)
  await expect(a.page).toHaveURL(/\/reservations\/local-[0-9a-f-]{36}$/)

  // Pendant la coupure, le poste B (en ligne) réserve la même chambre à la même date.
  const b = await newStation(browser)
  await book(b.page, `Concurrent ${run}`, '+23672008882', date, room)
  await expect(b.page).toHaveURL(/\/reservations\/[0-9a-f-]{36}$/)
  await b.context.close()

  // Retour du réseau sur A : le serveur revérifie et refuse ; rien n’est écrasé en silence.
  await a.context.setOffline(false)
  await a.page.goto('/synchronisation')
  await expect(a.page.locator('.connectivity-chip')).toHaveText('En ligne', { timeout: 40_000 })
  const outbox = a.page.getByRole('region', { name: 'Mettre à jour en ligne' })
  const refused = outbox.getByRole('row', {
    name: new RegExp(`Réservation — chambre ${room} · ${nameA}`),
  })
  await expect(refused).toContainText('Refusée', { timeout: 60_000 })
  await expect(refused).toContainText('Chambre indisponible')
  await expect(refused).toContainText(`La chambre ${room} n'est pas disponible`)
  // Le client, lui, a bien été créé (opération indépendante).
  await expect(
    outbox.getByRole('row', { name: new RegExp(`Nouveau client — ${nameA}`) }),
  ).toContainText('Envoyée')

  // L’administrateur voit le refus « À examiner » et le clôt avec un motif (journal d’audit).
  await a.page.goto('/admin/hors-ligne')
  const center = a.page.getByRole('region', { name: 'Centre de synchronisation' })
  await center.getByLabel('Recherche').fill(nameA)
  const row = center.getByRole('row', { name: /Réservation — chambre/ })
  await expect(row).toContainText('Refusée')
  await expect(row).toContainText(`La chambre ${room} n'est pas disponible`)
  await row.getByRole('button', { name: /Examiner/ }).click()
  const dialog = a.page.getByRole('dialog', { name: 'Examiner l’opération refusée' })
  await dialog.getByRole('radio', { name: 'Rejet confirmé' }).check()
  await dialog.getByLabel('Motif').fill('Client relogé en ligne dans une autre chambre')
  await dialog.getByRole('button', { name: 'Enregistrer l’examen' }).click()
  await expect(dialog).toBeHidden()
  // Le refus examiné sort de la liste « À examiner » et garde la décision, l’auteur et le motif.
  await center.getByLabel('Examen').selectOption('')
  await expect(row).toContainText('Rejet confirmé')
  await expect(row).toContainText('Client relogé en ligne dans une autre chambre')
  await a.context.close()
})
