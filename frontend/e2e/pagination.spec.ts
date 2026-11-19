import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('pagination : accès direct, limites, taille de page et petits écrans', async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: '0190a000-0000-7000-8000-000000000001',
          name: 'Administrateur',
          email: 'admin@example.test',
          active: true,
          role: 'admin',
          role_label: 'Administrateur',
          permissions: ['customers.view'],
          last_login_at: null,
        },
      },
    }),
  )
  await page.route('**/api/v1/customers**', (route) => {
    const params = new URL(route.request().url()).searchParams
    const current = Number(params.get('page') || 1)
    const size = Number(params.get('per_page') || 25)
    const total = params.get('search') === 'introuvable' ? 0 : 217
    const start = (current - 1) * size
    return route.fulfill({
      json: {
        data: Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) => ({
          id: `0190a000-0000-7000-8000-${String(start + i + 1).padStart(12, '0')}`,
          name: `Client ${start + i + 1}`,
          full_name: `Client ${start + i + 1}`,
          phone: '+236 72 00 00 00',
          email: null,
          email_notifications: false,
          origin_city: 'Bangui',
          origin_country: 'RCA',
          created_at: '2026-11-19',
        })),
        meta: {
          total,
          current_page: current,
          last_page: Math.max(1, Math.ceil(total / size)),
          per_page: size,
        },
      },
    })
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/clients')
  const nav = page.getByRole('navigation', { name: 'Pagination', exact: true })
  await expect(nav).toContainText('1–25 sur 217 résultats')
  await expect(nav.getByRole('button', { name: 'Page précédente' })).toBeDisabled()
  await nav.getByRole('button', { name: 'Page 9', exact: true }).click()
  await expect(nav).toContainText('201–217 sur 217 résultats')
  await expect(nav.getByRole('button', { name: 'Page suivante' })).toBeDisabled()
  await nav.getByRole('combobox', { name: 'Lignes par page' }).selectOption('10')
  await expect(nav).toContainText('1–10 sur 217 résultats')
  await nav.getByRole('button', { name: 'Page 4', exact: true }).click()
  await expect(nav).toContainText('31–40 sur 217 résultats')
  await expect(nav.getByRole('button', { name: 'Page 4', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await nav.scrollIntoViewIfNeeded()
    expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width)
    const audit = await new AxeBuilder({ page })
      .include('.pagination')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(audit.violations).toEqual([])
    await nav.screenshot({ path: `test-results/pagination-${width}.png` })
  }
  await nav.getByRole('button', { name: 'Page suivante' }).click()
  await expect(nav).toContainText('41–50 sur 217 résultats')
  await page.getByRole('searchbox', { name: 'Recherche', exact: true }).fill('introuvable')
  await expect(nav).toContainText('Aucun résultat')
  await expect(nav.getByRole('button', { name: 'Page suivante' })).toBeDisabled()
  await expect(nav.getByRole('button', { name: 'Page précédente' })).toBeDisabled()
  await expect(page.getByRole('button', { name: /^(Filtrer|Rechercher)$/ })).toHaveCount(0)
  const emailApplied = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return (
      url.pathname === '/api/v1/customers' &&
      url.searchParams.get('email') === 'client@example.test' &&
      url.searchParams.get('page') === '1'
    )
  })
  await page.getByRole('searchbox', { name: 'E-mail', exact: true }).fill('client@example.test')
  await emailApplied
  await page.getByRole('button', { name: 'Effacer', exact: true }).click()
  // Le répertoire initial peut être encore frais dans le cache de requêtes.
  await expect(page.getByRole('searchbox', { name: 'E-mail', exact: true })).toHaveValue('')
  await expect(nav).toContainText('1–10 sur 217 résultats')
})
