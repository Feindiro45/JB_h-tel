import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('connexion simple sans image, centrée et accessible sur PC et mobile', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 401,
      json: { title: 'Session expirée', message: 'Veuillez vous reconnecter.' },
    }),
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/connexion')
  await expect(
    page.getByRole('heading', { name: 'Connexion de l’équipe', exact: true }),
  ).toBeVisible()
  await expect(page.locator('main img, .auth-visual')).toHaveCount(0)
  const card = page.locator('.auth-panel > div')
  const box = (await card.boundingBox())!
  expect(box.x + box.width / 2).toBeCloseTo(720, 0)
  expect(box.y + box.height / 2).toBeCloseTo(450, 0)
  expect(await page.locator('main').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe(
    'none',
  )
  await page.screenshot({ path: 'test-results/connexion-simple-pc.png', fullPage: true })
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByText('Saisissez votre adresse e-mail.')).toBeVisible()
  await expect(page.getByText('Saisissez votre mot de passe.')).toBeVisible()
  const password = page.getByLabel('Mot de passe', { exact: true })
  await password.fill('Exemple2026')
  await page.getByRole('button', { name: 'Afficher le mot de passe' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Masquer le mot de passe' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(audit.violations).toEqual([])
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 740 })
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const bounds = (await card.boundingBox())!
    expect(bounds.width).toBeLessThanOrEqual(width - 32)
    await page.screenshot({ path: `test-results/connexion-simple-${width}.png`, fullPage: true })
  }
})
