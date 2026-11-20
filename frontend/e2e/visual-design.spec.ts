import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const { password } = JSON.parse(
  readFileSync(
    new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url),
    'utf8',
  ),
) as { password: string }

test('charte du contenu sur toutes les pages, aside conservé et adaptation mobile', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1752, height: 1000 })
  await page.goto('/connexion')
  await page.screenshot({ path: 'test-results/design-connexion.png', fullPage: true })
  await page.getByLabel('Adresse e-mail').fill('admin@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const screens = [
    ['/tableau-de-bord', 'tableau-de-bord'],
    ['/reservations', 'reservations'],
    ['/alertes', 'alertes'],
    ['/disponibilites', 'disponibilites'],
    ['/clients', 'clients'],
    ['/caisse', 'caisse'],
    ['/documents', 'documents'],
    ['/documents?onglet=recus', 'recus'],
    ['/rapports', 'rapports'],
    ['/admin/chambres', 'chambres'],
    ['/admin/tarifs', 'tarifs'],
    ['/admin/utilisateurs', 'utilisateurs'],
    ['/admin/parametres', 'parametres'],
    ['/admin/audit', 'audit'],
    ['/admin/etat', 'etat'],
  ]
  const payments = await page.request.get('http://localhost:8011/api/v1/payments', {
    headers: { Origin: 'http://localhost:5174', Referer: 'http://localhost:5174/' },
  })
  expect(payments.ok()).toBe(true)
  const payment = (await payments.json()).data[0] as
    { id: string; reservation: { id: string }; customer: { id: string } } | undefined
  if (payment) {
    screens.push(
      [`/reservations/${payment.reservation.id}`, 'fiche-reservation'],
      [`/clients/${payment.customer.id}`, 'fiche-client'],
      [`/documents/recus/${payment.id}`, 'fiche-recu'],
    )
  }
  for (const [path, name] of screens) {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.locator('.page-heading__icon')).toBeVisible()
    expect(
      await page.locator('main .metric').count(),
      `Vue d’ensemble : ${name}`,
    ).toBeGreaterThanOrEqual(3)
    const fieldIssues = await page
      .locator('main .field-control, .modal .field-control')
      .evaluateAll((fields) =>
        fields.flatMap((field) => {
          const input = field.querySelector('input, select, textarea')
          if (!input || !input.getClientRects().length) return []
          const icon = field.querySelector(':scope > svg')
          if (!icon) return ['Icône de champ absente']
          const textStart =
            input.getBoundingClientRect().left + parseFloat(getComputedStyle(input).paddingLeft)
          return icon.getBoundingClientRect().right + 6 > textStart
            ? ['Icône trop proche du texte']
            : []
        }),
      )
    expect(fieldIssues, `Champs : ${name}`).toEqual([])
    const tableIssues = await page.locator('main table').evaluateAll((tables) =>
      tables.flatMap((table) => {
        if (table.closest('.print-only')) return []
        const container = table.closest('.table-section') ?? table.closest('.panel')
        if (!container) return ['Tableau sans section']
        const filters =
          container.querySelector('.filterbar input, .filterbar select') ||
          (container.previousElementSibling?.matches('.filterbar') &&
            container.previousElementSibling.querySelector('input, select'))
        const pagination = container.querySelector('.pagination')
        return filters && pagination
          ? []
          : [table.querySelector('th')?.textContent ?? 'Tableau sans filtre ou pagination']
      }),
    )
    expect(tableIssues, `Filtres et pagination : ${name}`).toEqual([])
    const repeatedColors = await page
      .locator('main :is(.heading-actions, .toolbar, .segmented, .compact-actions, td:last-child)')
      .evaluateAll((groups) =>
        groups.flatMap((group) => {
          const actions = Array.from(group.children).filter(
            (el) => el.matches('button, a') && el.getClientRects().length,
          )
          return actions.flatMap((el, i) =>
            i > 0 &&
            getComputedStyle(el).backgroundColor ===
              getComputedStyle(actions[i - 1]).backgroundColor
              ? [el.textContent?.trim()]
              : [],
          )
        }),
      )
    expect(repeatedColors, `Couleurs des boutons voisins : ${name}`).toEqual([])
    const buttonsWithoutIcons = await page
      .locator('main button')
      .evaluateAll((buttons) =>
        buttons
          .filter(
            (button) =>
              button.getClientRects().length > 0 &&
              !button.closest('.pagination') &&
              !button.querySelector('svg'),
          )
          .map((button) => button.textContent?.trim()),
      )
    expect(buttonsWithoutIcons, `Icônes des boutons : ${name}`).toEqual([])
    const aside = await page.locator('aside').evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      background: getComputedStyle(el).backgroundColor,
      padding: getComputedStyle(el).padding,
    }))
    expect(aside).toEqual({ width: 248, background: 'rgb(16, 43, 37)', padding: '24px 16px 16px' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1752,
    )
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(audit.violations, name).toEqual([])
    await page.screenshot({ path: `test-results/design-${name}.png`, fullPage: true })
  }
  await page.goto('/admin/chambres')
  await page.getByRole('button', { name: '+ Chambre', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(await dialog.locator('.field-control--icon > svg').count()).toBeGreaterThan(0)
  const secondaryColor = await dialog
    .locator('.dialog-foot .secondary')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  const primaryColor = await dialog
    .locator('.dialog-foot .primary')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(secondaryColor).not.toBe(primaryColor)
  expect(secondaryColor).toBe('rgb(32, 90, 179)')
  const fieldGap = await dialog
    .locator('.fields')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).columnGap))
  expect(fieldGap).toBeGreaterThanOrEqual(18)
  const misalignedFields = await dialog.locator('.field-control').evaluateAll((fields) =>
    fields.flatMap((field) => {
      const input = field.querySelector('input,select')
      const icon = field.querySelector(':scope > svg')
      if (!input || !icon) return []
      const control = input.getBoundingClientRect(),
        mark = icon.getBoundingClientRect()
      return Math.abs(control.top + control.height / 2 - mark.top - mark.height / 2) > 2
        ? ['Icône décentrée']
        : []
    }),
  )
  expect(misalignedFields).toEqual([])
  expect(
    await dialog
      .locator('button')
      .evaluateAll((buttons) => buttons.filter((button) => !button.querySelector('svg')).length),
  ).toBe(0)
  await dialog.screenshot({ path: 'test-results/design-formulaire-chambre.png' })
  const dialogAudit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(dialogAudit.violations).toEqual([])
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(dialog).toBeHidden()
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const path of ['/documents', '/tableau-de-bord', '/reservations', '/admin/chambres']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('alertdialog')).toHaveCount(0)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `test-results/design-${path.split('/').at(-1)}-${width}.png`,
        fullPage: true,
      })
    }
  }
  expect(errors).toEqual([])
})
