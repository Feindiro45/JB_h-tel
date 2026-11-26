import AxeBuilder from '@axe-core/playwright'
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const { password } = JSON.parse(
  readFileSync(
    new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url),
    'utf8',
  ),
) as { password: string }

// Chaque étape attend le serveur PHP E2E, à un seul processus et lent au premier passage.
const expect = baseExpect.configure({ timeout: 20_000 })

/** Un contexte de navigateur distinct = un autre appareil, donc un autre poste de caisse. */
async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()
  return page
}

test('poste principal : désignation, règle active et poste de consultation bloqué (D-062)', async ({
  browser,
}) => {
  test.setTimeout(150_000)
  const admin = await signIn(browser, 'admin@jbhotel.local')
  const errors: string[] = []
  admin.on('pageerror', (error) => errors.push(error.message))

  // Le navigateur s'enregistre de lui-même à la connexion.
  await expect(admin.locator('.workstation-chip')).toContainText(/Poste \d+/)
  await admin.goto('/admin/postes')
  await expect(admin.getByRole('heading', { name: 'Postes de caisse', level: 1 })).toBeVisible()
  const list = admin.getByRole('region', { name: 'Postes enregistrés' })
  const mine = list.getByRole('row').filter({ hasText: 'Ce poste' })
  await expect(admin.getByRole('button', { name: 'Activer la règle' })).toBeDisabled()

  await mine.getByRole('button', { name: /^Renommer/ }).click()
  let dialog = admin.getByRole('dialog')
  await dialog.getByLabel('Nom du poste').fill('CAISSE-E2E')
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(dialog).toBeHidden()

  await mine.getByRole('button', { name: 'Désigner CAISSE-E2E comme poste principal' }).click()
  dialog = admin.getByRole('dialog')
  await expect(dialog).toContainText('Premier poste principal')
  await dialog.getByRole('button', { name: 'Désigner' }).click()
  await expect(dialog).toBeHidden()
  await expect(mine).toContainText('Principal')
  await expect(admin.getByRole('region', { name: 'Historique des désignations' })).toContainText(
    'Première désignation',
  )

  await admin.getByRole('button', { name: 'Activer la règle' }).click()
  await admin.getByRole('dialog').getByRole('button', { name: 'Activer' }).click()
  await expect(admin.getByRole('button', { name: 'Désactiver la règle' })).toBeVisible()
  await expect(admin.locator('.workstation-chip')).toContainText('CAISSE-E2E · principal')
  const accessibility = await new AxeBuilder({ page: admin })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(accessibility.violations).toEqual([])

  // Une caissière sur un autre appareil : consultation seulement, écriture refusée en français.
  const cashier = await signIn(browser, 'caissiere@jbhotel.local')
  await expect(cashier.locator('.workstation-chip')).toContainText('· consultation')
  await cashier.goto('/reservations')
  await cashier.getByRole('button', { name: '+ Nouvelle réservation' }).click()
  dialog = cashier.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Nouveau client', exact: true }).check()
  await dialog.getByLabel('Nom', { exact: true }).fill('Poste Bloqué')
  await dialog.getByLabel('Téléphone', { exact: true }).fill('+23672007777')
  await dialog.getByLabel('Titulaire du séjour').fill('Poste Bloqué')
  await dialog.getByRole('button', { name: 'Suivant' }).click()
  const room = dialog.getByLabel('Chambre', { exact: true })
  await expect(room.locator('option')).not.toHaveCount(1)
  await room.selectOption({ index: 1 })
  await expect(dialog.getByText('Total net')).toBeVisible()
  await dialog.getByRole('button', { name: 'Suivant' }).click()
  await dialog.getByLabel('Le client a vérifié ces informations et les confirme').check()
  await dialog.getByRole('button', { name: 'Suivant' }).click()
  await dialog.getByRole('radio', { name: 'Paiement différé', exact: true }).check()
  await dialog.getByRole('button', { name: 'Créer la réservation' }).click()
  const refusal = cashier.getByRole('alertdialog')
  await expect(refusal).toContainText('Poste non autorisé')
  await expect(refusal).toContainText('« CAISSE-E2E »')
  await refusal.getByRole('button', { name: 'Fermer' }).first().click()
  // La saisie est conservée après l'erreur ; la fiche client, hors D-062, a été créée.
  await dialog.getByRole('button', { name: 'Retour' }).click()
  await expect(dialog).toContainText('POSTE BLOQUÉ')
  await dialog.getByRole('button', { name: 'Retour' }).click()
  await dialog.getByRole('button', { name: 'Retour' }).click()
  await expect(dialog.getByLabel('Titulaire du séjour')).toHaveValue('Poste Bloqué')

  // Nettoyage : règle désactivée pour les autres scénarios.
  await admin.getByRole('button', { name: 'Désactiver la règle' }).click()
  await admin.getByRole('dialog').getByRole('button', { name: 'Désactiver' }).click()
  await expect(admin.getByRole('button', { name: 'Activer la règle' })).toBeVisible()
  expect(errors).toEqual([])
})
