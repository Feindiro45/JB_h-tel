import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'

const { password } = JSON.parse(
  readFileSync(
    new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url),
    'utf8',
  ),
) as { password: string }

test('connexion réelle, administration, réservation avec avance, facture, rapports et accès', async ({
  page,
}) => {
  // Parcours complet : réservation, facture, cinq audits Axe, deux exports et trois largeurs d'écran.
  test.setTimeout(120_000)
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill('admin@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/admin/chambres')
  await expect(
    page.getByRole('heading', { name: 'Chambres et catégories', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '+ Chambre', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Numéro').fill('E2E-901')
  await dialog.getByLabel('Catégorie').selectOption({ label: 'VIP' })
  await dialog.getByLabel('Capacité').fill('2')
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('cell', { name: 'E2E-901', exact: true })).toBeVisible()
  await page.goto('/reservations')
  await page.getByRole('button', { name: '+ Nouvelle réservation' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Nouveau client', exact: true }).check()
  await dialog.getByLabel('Nom', { exact: true }).fill('Recette E2E')
  await dialog.getByLabel('Téléphone', { exact: true }).fill('+23672009999')
  await dialog.getByLabel('Titulaire du séjour').fill('Recette E2E')
  await expect(
    dialog.getByLabel('Chambre', { exact: true }).locator('option').filter({ hasText: 'E2E-901' }),
  ).toHaveCount(1)
  const option = await dialog
    .getByLabel('Chambre', { exact: true })
    .locator('option')
    .filter({ hasText: 'E2E-901' })
    .getAttribute('value')
  await dialog.getByLabel('Chambre', { exact: true }).selectOption(option!)
  await dialog.getByRole('radio', { name: 'Avance', exact: true }).check()
  await dialog.getByLabel('Montant de l’avance (FCFA)').fill('20000')
  await expect(dialog.getByRole('button', { name: 'Créer la réservation' })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Créer la réservation' }).click()
  await expect(page).toHaveURL(/\/reservations\/[a-f0-9-]{36}$/)
  await expect(page.getByText(/20[\s\u202f\u00a0]?000 FCFA/).first()).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Réservation enregistrée : les prochaines étapes' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Émettre une facture' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ouvrir le ticket de facture' })).toBeVisible({
    timeout: 15_000,
  })
  await page.screenshot({ path: 'test-results/reservation-guide-desktop.png', fullPage: true })
  for (const [path, title] of [
    ['/admin/tarifs', 'Tarifs'],
    ['/admin/utilisateurs', 'Utilisateurs et accès'],
    ['/admin/parametres', 'Paramètres'],
    ['/admin/audit', 'Journal d’audit'],
    ['/rapports', 'Rapports'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(accessibility.violations).toEqual([])
  }
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Exporter CSV' }).click()
  expect((await download).suggestedFilename()).toMatch(/rapport-.*\.csv/)
  const pdfDownload = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Exporter PDF' }).click()
  const pdf = await pdfDownload
  expect(pdf.suggestedFilename()).toMatch(/rapport-.*\.pdf/)
  await pdf.saveAs('test-results/rapport.pdf')
  // Classeur Excel du vrai serveur : session, CORS et nom de fichier lu dans Content-Disposition.
  const xlsxDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter (Excel)' }).click()
  const xlsx = await xlsxDownload
  expect(xlsx.suggestedFilename()).toMatch(/^jb-hotel-rapport-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/)
  await xlsx.saveAs('test-results/rapport.xlsx')
  await expect(page.getByText('Classeur Excel téléchargé.')).toBeVisible()
  await page.goto('/reservations')
  const stays = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exporter (Excel)' }).click()
  expect((await stays).suggestedFilename()).toMatch(/^jb-hotel-reservations-.*\.xlsx$/)
  await page.goto('/rapports')
  await page.screenshot({ path: 'test-results/rapports-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/admin/chambres')
  await expect(
    page.getByRole('heading', { name: 'Chambres et catégories', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('cell', { name: 'E2E-901', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'test-results/chambres-tablette.png', fullPage: true })
  const tablet = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(tablet.violations).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('cell', { name: 'E2E-901', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'test-results/chambres-mobile.png', fullPage: true })
  expect(errors).toEqual([])
})

test('la caissière utilise une session CSRF et ne peut accéder aux écrans administrateur', async ({
  page,
}) => {
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill('caissiere@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()
  await page.goto('/admin/tarifs')
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible()
  const response = await page.request.post('http://localhost:8011/api/v1/room-rates', {
    headers: { Origin: 'http://localhost:5174', Referer: 'http://localhost:5174/' },
    data: {},
  })
  expect(response.status()).toBe(419)
})
