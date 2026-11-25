import { expect as baseExpect, test, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const { password } = JSON.parse(
  readFileSync(
    new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url),
    'utf8',
  ),
) as { password: string }

// Chaque étape attend le serveur PHP E2E, à un seul processus et lent au premier passage.
const expect = baseExpect.configure({ timeout: 20_000 })

/** Largeur d'une page PDF en millimètres, lue dans le /MediaBox (points PDF : 72 par pouce). */
function pdfPages(pdf: Buffer): { widthMm: number; heightMm: number }[] {
  const boxes = [
    ...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g),
  ]
  return boxes.map(([, width, height]) => ({
    widthMm: (Number(width) * 25.4) / 72,
    heightMm: (Number(height) * 25.4) / 72,
  }))
}

/** Aucun montant ni libellé ne dépasse du ticket ; aucun montant n'est coupé sur deux lignes. */
async function expectNothingOverflows(page: Page) {
  const report = await page.locator('.thermal-ticket').evaluate((ticket) => {
    const box = ticket.getBoundingClientRect()
    const outside = [...ticket.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.left < box.left - 0.5 || r.right > box.right + 0.5)
      })
      .map((el) => el.textContent)
    const wrapped = [...ticket.querySelectorAll('.ticket-amount')]
      .filter((el) => el.getClientRects().length > 1)
      .map((el) => el.textContent)
    // Un libellé d'un seul mot (« Client ») doit tenir sur une ligne : jamais « Clie / nt ».
    const brokenLabels = [...ticket.querySelectorAll('.ticket-pair > :first-child')]
      .filter((el) => !el.textContent?.trim().includes(' ') && el.getClientRects().length > 1)
      .map((el) => el.textContent)
    return { width: box.width, outside, wrapped, brokenLabels }
  })
  expect(report.outside).toEqual([])
  expect(report.wrapped).toEqual([])
  expect(report.brokenLabels).toEqual([])
  return report.width
}

/** Impression émulée : seul le ticket est visible, sur une seule page à la largeur du rouleau. */
async function expectSingleStripPdf(page: Page, widthMm: number, file: string) {
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.sidebar')).toBeHidden()
  await expect(page.locator('.page-heading')).toBeHidden()
  await expect(page.getByLabel('Largeur du papier')).toBeHidden()
  await expect(page.locator('.thermal-ticket')).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  if (process.env.E2E_TICKET_OUTPUT) writeFileSync(`${process.env.E2E_TICKET_OUTPUT}/${file}`, pdf)
  const pages = pdfPages(pdf)
  expect(pages).toHaveLength(1)
  expect(pages[0]!.widthMm).toBeCloseTo(widthMm, 0)
  expect(pages[0]!.heightMm).toBeGreaterThan(60)
  await page.emulateMedia({ media: 'screen' })
}

test('tickets 80 mm et 58 mm d’un reçu et d’une facture, imprimés sur une seule bande', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill('admin@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()

  // Chambre dédiée : aucun conflit avec les autres scénarios.
  await page.goto('/admin/chambres')
  await page.getByRole('button', { name: '+ Chambre', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Numéro').fill('E2E-902')
  await dialog.getByLabel('Catégorie').selectOption({ label: 'VIP' })
  await dialog.getByLabel('Capacité').fill('2')
  await dialog.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/reservations')
  await page.getByRole('button', { name: '+ Nouvelle réservation' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Nouveau client', exact: true }).check()
  await dialog.getByLabel('Nom', { exact: true }).fill('Ticket Thermique Avec Un Nom Assez Long')
  await dialog.getByLabel('Téléphone', { exact: true }).fill('+23672008888')
  await dialog.getByLabel('Titulaire du séjour').fill('Ticket Thermique')
  const room = dialog.getByLabel('Chambre', { exact: true })
  await expect(room.locator('option').filter({ hasText: 'E2E-902' })).toHaveCount(1)
  await room.selectOption(
    (await room.locator('option').filter({ hasText: 'E2E-902' }).getAttribute('value'))!,
  )
  await dialog.getByRole('radio', { name: 'Avance', exact: true }).check()
  await dialog.getByLabel('Montant de l’avance (FCFA)').fill('20000')
  await dialog.getByRole('button', { name: 'Créer la réservation' }).click()
  await expect(page).toHaveURL(/\/reservations\/[a-f0-9-]{36}$/)
  const reservationUrl = page.url()
  await expect(page.getByRole('link', { name: 'Ouvrir le ticket de facture' })).toBeVisible()

  // Ticket du reçu, depuis la ligne de paiement de la réservation.
  await page.getByRole('link', { name: /^Ticket 80 mm du reçu REC-/ }).click()
  await expect(page).toHaveURL(/\/documents\/recus\/[a-f0-9-]{36}\/ticket$/)
  const receipt = page.getByRole('article', { name: /^Ticket du reçu REC-/ })
  await expect(receipt).toContainText('Reçu de paiement')
  await expect(receipt).toContainText(/Versement20[\s  ]000 FCFA/)
  await expect(receipt).toContainText('E2E-902')
  await expect(receipt).not.toContainText(/\bPayé\b/)
  expect(await expectNothingOverflows(page)).toBeCloseTo((80 * 96) / 25.4, 0)
  await expectSingleStripPdf(page, 80, 'recu-80mm.pdf')

  await page.getByLabel('Largeur du papier').selectOption('58')
  await expect(receipt).toHaveClass(/thermal-ticket--58/)
  expect(await expectNothingOverflows(page)).toBeCloseTo((58 * 96) / 25.4, 0)
  await expectSingleStripPdf(page, 58, 'recu-58mm.pdf')
  await page.getByLabel('Largeur du papier').selectOption('80')

  // Ticket de la facture (QR code de vérification, D-065), depuis la fiche réservation ; les
  // autres pages retrouvent leur format ensuite.
  await page.goto(reservationUrl)
  await page.getByRole('link', { name: /^Ticket 80 mm de facture FAC-/ }).click()
  await expect(page).toHaveURL(/\/documents\/factures\/[a-f0-9-]{36}\/ticket$/)
  const invoice = page.getByRole('article', { name: /^Ticket facture FAC-/ })
  await expect(invoice).toContainText('Hébergement')
  await expect(invoice).toContainText(/Solde à l’émission\d/)
  await expect(
    invoice.getByRole('img', { name: 'QR code de vérification de la facture' }),
  ).toBeVisible()
  await expect(invoice).toContainText('/verification/factures/')
  expect(await expectNothingOverflows(page)).toBeCloseTo((80 * 96) / 25.4, 0)
  await expectSingleStripPdf(page, 80, 'facture-80mm.pdf')

  await page.goto(reservationUrl)
  await expect(page.locator('#thermal-ticket-page')).toHaveCount(0)
  expect(errors).toEqual([])
})
