import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

// D-060 : pages d'erreur de l'application et du serveur (liens publics).
const { password } = JSON.parse(
  readFileSync(
    new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url),
    'utf8',
  ),
) as { password: string }

async function expectAccessible(page: import('@playwright/test').Page, name: string) {
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(audit.violations, name).toEqual([])
}

test('pages d’erreur en français, accessibles et adaptées au mobile', async ({ page }) => {
  // Serveur : lien public inconnu (QR code abîmé, lien d'e-mail erroné), sans connexion.
  const response = await page.goto('http://localhost:8011/page-inexistante')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible()
  await expect(page.getByText('Erreur 404')).toBeVisible()
  await expect(page.getByRole('link', { name: /connexion/i })).toHaveCount(0)
  await expectAccessible(page, 'serveur-404')

  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill('admin@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/adresse-inconnue')
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Retour à l’accueil' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
    await expectAccessible(page, `application-404-${width}`)
  }
  await page.getByRole('link', { name: 'Retour à l’accueil' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()
})
