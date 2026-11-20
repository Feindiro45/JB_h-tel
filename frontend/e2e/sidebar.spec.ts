import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('menu PC réductible : contenu adapté, préférence conservée et menu mobile complet', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: '0190a000-0000-7000-8000-000000000001',
          name: 'Paterne Feindiro',
          active: true,
          role: 'admin',
          role_label: 'Administrateur',
          permissions: [
            'reservations.view',
            'reservations.create',
            'customers.view',
            'payments.view',
            'invoices.view',
            'reports.view',
            'rooms.manage',
            'rates.manage',
            'users.view',
            'settings.manage',
            'audit.view',
          ],
        },
      },
    }),
  )
  await page.route('**/api/v1/alerts**', (route) =>
    route.fulfill({
      json: route.request().url().includes('/summary')
        ? { data: { at: '2026-12-01T10:00:00+01:00', total: 0, rooms: 0, day: 0, half_day: 0 } }
        : {
            at: '2026-12-01T10:00:00+01:00',
            data: [],
            meta: { total: 0, current_page: 1, last_page: 1 },
          },
    }),
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/alertes')
  await expect(page.getByRole('heading', { name: 'Alertes', exact: true })).toBeVisible()
  const sidebar = page.locator('#navigation')
  const main = page.locator('main')
  const expandedSidebar = (await sidebar.boundingBox())!
  const expandedMain = (await main.boundingBox())!
  expect(expandedSidebar.width).toBe(248)
  const toggle = page.getByRole('button', { name: 'Réduire le menu latéral' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Déployer le menu latéral' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  expect((await sidebar.boundingBox())!.width).toBe(80)
  expect((await main.boundingBox())!.width).toBeGreaterThan(expandedMain.width)
  expect((await main.boundingBox())!.x).toBe(80)
  await expect(page.getByRole('link', { name: 'Réservations', exact: true })).toHaveAttribute(
    'title',
    'Réservations',
  )
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  await page.screenshot({ path: 'test-results/menu-compact-pc.png', fullPage: true })
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(audit.violations).toEqual([])
  await page.reload()
  await expect(page.getByRole('button', { name: 'Déployer le menu latéral' })).toBeVisible()
  expect((await sidebar.boundingBox())!.width).toBe(80)
  // Le choix PC n'applique pas le rail d'icônes au tiroir mobile.
  await page.setViewportSize({ width: 1920, height: 1080 })
  expect((await main.boundingBox())!.width).toBe(1840)
  await page.setViewportSize({ width: 1024, height: 900 })
  expect((await sidebar.boundingBox())!.width).toBe(80)
  expect((await main.boundingBox())!.width).toBe(944)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Déployer le menu latéral' })).toBeHidden()
  await page.getByRole('button', { name: 'Afficher la navigation' }).click()
  await expect(sidebar).toBeVisible()
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(250, 1)
  expect(
    await page
      .getByRole('link', { name: 'Réservations', exact: true })
      .locator('.nav-label')
      .evaluate((el) => getComputedStyle(el).clipPath),
  ).toBe('none')
  await page.getByRole('link', { name: 'Alertes', exact: true }).click()
  await expect(sidebar).toBeHidden()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Déployer le menu latéral' }).click()
  expect((await sidebar.boundingBox())!.width).toBe(248)
  expect((await main.boundingBox())!.width).toBe(expandedMain.width)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'test-results/menu-deploye-pc.png', fullPage: true })
})
