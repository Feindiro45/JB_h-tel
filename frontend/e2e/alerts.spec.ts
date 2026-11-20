import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('alertes : compteur, filtres, résolution et affichage mobile accessibles', async ({
  page,
}) => {
  let resolved = false
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: '0190a000-0000-7000-8000-000000000001',
          name: 'Réception',
          active: true,
          role: 'caissiere',
          role_label: 'Caissière',
          permissions: ['reservations.view'],
        },
      },
    }),
  )
  await page.route('**/api/v1/alerts**', (route) => {
    const url = new URL(route.request().url())
    const at = '2026-12-01T13:30:00+01:00'
    if (url.pathname.endsWith('/summary'))
      return route.fulfill({
        json: {
          data: {
            at,
            total: resolved ? 0 : 1,
            rooms: resolved ? 0 : 1,
            day: 0,
            half_day: resolved ? 0 : 1,
          },
        },
      })
    const visible = !resolved && url.searchParams.get('search') !== 'introuvable'
    return route.fulfill({
      json: {
        at,
        data: visible
          ? [
              {
                id: '0190a000-0000-7000-8000-0000000000ab',
                customer: { full_name: 'DOKO Émile', phone: '+236 75 00 12 34' },
                room: { number: '101', room_type: { label: 'VIP' } },
                price: { billing_unit_label: 'Demi-journée' },
                period: { blocked_until: '2026-12-01T12:00:00+01:00', is_estimated: false },
                overdue_minutes: 90,
              },
            ]
          : [],
        meta: { total: visible ? 1 : 0, current_page: 1, last_page: 1 },
      },
    })
  })
  await page.goto('/alertes')
  await expect(page.getByRole('heading', { name: 'Alertes', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Alertes : 1 départ dépassé' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1 h 30 min' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Traiter le séjour' })).toHaveAttribute(
    'href',
    /\/reservations\/[0-9a-f-]{36}$/,
  )
  await page.screenshot({ path: 'test-results/alertes-bureau.png', fullPage: true })
  await page.getByLabel('Client ou chambre').fill('introuvable')
  await expect(page.getByText('Aucun départ à traiter')).toBeVisible()
  await page.getByLabel('Client ou chambre').clear()
  await expect(page.getByText('DOKO Émile')).toBeVisible()
  await page.getByLabel('Forfait').selectOption('HALF_DAY')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('link', { name: 'Alertes : 1 départ dépassé' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(audit.violations).toEqual([])
  await page.screenshot({ path: 'test-results/alertes-mobile.png', fullPage: true })
  resolved = true
  await page.getByRole('button', { name: 'Actualiser' }).click()
  await expect(page.getByText('Aucun départ à traiter')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Alertes : 0 départ dépassé' })).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})
