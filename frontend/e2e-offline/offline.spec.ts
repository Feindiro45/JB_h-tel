import { expect as baseExpect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const { password } = JSON.parse(
  readFileSync(
    new URL('../../backend/storage/framework/testing/e2e.local.json', import.meta.url),
    'utf8',
  ),
) as { password: string }

// Serveur PHP à un seul processus, lent au premier passage.
const expect = baseExpect.configure({ timeout: 25_000 })

/** Clés des données gardées dans la copie IndexedDB du poste (JSON). */
function copiedKeys(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open('jb-hotel-offline', 1)
        open.onsuccess = () => {
          const get = open.result.transaction('kv').objectStore('kv').get('query-cache')
          get.onsuccess = () =>
            resolve(
              JSON.stringify(
                get.result?.state?.queries?.map((q: { queryKey: unknown }) => q.queryKey) ?? [],
              ),
            )
        }
        open.onerror = () => resolve('')
      }),
  )
}

test('poste coupé du réseau : ouverture, consultation, historique, verrou et retour du réseau', async ({
  page,
  context,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  // 1. En ligne : connexion, service worker installé, écrans consultés gardés sur le poste.
  await page.goto('/connexion')
  await page.getByLabel('Adresse e-mail').fill('admin@jbhotel.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble', exact: true })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.goto('/disponibilites')
  await expect(page.getByRole('heading', { name: 'Disponibilités', level: 1 })).toBeVisible()
  await expect(page.locator('main')).toContainText('101')
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  // Une réservation créée en ligne (paiement différé) : sa fiche est gardée sur le poste.
  await page.goto('/reservations')
  await page.getByRole('button', { name: '+ Nouvelle réservation' }).click()
  const booking = page.getByRole('dialog')
  await booking.getByRole('radio', { name: 'Nouveau client', exact: true }).check()
  await booking.getByLabel('Nom', { exact: true }).fill('Hors Ligne')
  await booking.getByLabel('Téléphone', { exact: true }).fill('+23672006666')
  await booking.getByLabel('Titulaire du séjour').fill('Hors Ligne')
  await booking.getByRole('button', { name: 'Suivant' }).click()
  const room = booking.getByLabel('Chambre', { exact: true })
  await expect(room.locator('option')).not.toHaveCount(1)
  await room.selectOption({ index: 1 })
  await expect(booking.getByText('Total net')).toBeVisible()
  await booking.getByRole('button', { name: 'Suivant' }).click()
  await booking.getByLabel('Le client a vérifié ces informations et les confirme').check()
  await booking.getByRole('button', { name: 'Suivant' }).click()
  await booking.getByRole('radio', { name: 'Paiement différé', exact: true }).check()
  await booking.getByRole('button', { name: 'Créer la réservation' }).click()
  await expect(page).toHaveURL(/\/reservations\/[a-f0-9-]{36}$/)
  // D-071 : l'arrivée du jour est proposée d'elle-même ; ce scénario ne l'enregistre pas.
  await page
    .getByRole('dialog', { name: 'Enregistrer l’arrivée' })
    .getByRole('button', { name: 'Annuler' })
    .click()
  const reservationUrl = page.url()
  await expect(page.getByRole('button', { name: 'Encaisser' })).toBeVisible()
  // La fiche et ses encaissements sont gardés sur le poste avant de quitter la page.
  const reservationId = reservationUrl.split('/').at(-1)!
  await expect.poll(() => copiedKeys(page)).toContain(`["payments","${reservationId}"]`)

  await page.goto('/synchronisation')
  await page.getByRole('button', { name: 'Mettre à jour en local' }).click()
  const history = page.getByRole('region', { name: 'Historique des synchronisations' })
  await expect(history.getByRole('row').nth(1)).toContainText('Réussie')
  await expect(history.getByRole('row').nth(1)).toContainText('Manuelle')
  // La copie du poste contient bien le planning (écran essentiel) avant la coupure.
  await expect.poll(() => copiedKeys(page)).toContain('"planning"')
  await expect.poll(() => copiedKeys(page)).toContain(`["reservations","${reservationId}"]`)

  // Application installable (PWA) : contrôle officiel du navigateur, sans erreur.
  const cdp = await context.newCDPSession(page)
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[]
  }
  // Seule réserve admise : le contexte de test est une navigation privée, où rien ne s’installe.
  expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([])
  await expect(page.getByRole('region', { name: 'Installation sur ce poste' })).toBeVisible()

  // 2. Coupure : l'application s'ouvre quand même et montre les données gardées.
  await context.setOffline(true)
  await page.goto('/disponibilites')
  await expect(page.getByRole('heading', { name: 'Disponibilités', level: 1 })).toBeVisible()
  await expect(page.locator('main')).toContainText('101')
  await expect(page.locator('.connectivity-chip')).toHaveText('Hors ligne')
  await expect(page.getByText(/sont celles gardées sur ce poste/)).toBeVisible()

  // Listes principales téléchargées par « Mettre à jour en local », même jamais ouvertes en ligne.
  await page.goto('/reservations')
  await expect(page.getByRole('heading', { name: 'Réservations', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Séjours enregistrés' })).toBeVisible()
  await expect(page.getByText('Pas encore disponible hors ligne.')).toHaveCount(0)
  await page.goto('/clients')
  await expect(page.getByRole('heading', { name: 'Clients', level: 1 })).toBeVisible()
  await expect(page.getByText('Pas encore disponible hors ligne.')).toHaveCount(0)

  // Encaissement hors ligne (lot 4) : reçu provisoire, opération gardée sur le poste.
  await page.goto(reservationUrl)
  await page.getByRole('button', { name: 'Encaisser' }).click()
  const payment = page.getByRole('dialog', { name: 'Encaisser' })
  await payment.getByLabel('Montant (FCFA)').fill('5000')
  await payment.getByRole('button', { name: 'Enregistrer l’encaissement' }).click()
  await expect(
    page.getByText(/Encaissement gardé sur ce poste — reçu provisoire LOC-/),
  ).toBeVisible()
  await expect(page.getByText(/^LOC-.*-000001$/).first()).toBeVisible()
  await expect(page.getByText('En attente d’envoi').first()).toBeVisible()

  // Réservation hors ligne (4.5) : nouveau client, chambre libre et prix calculés sur le poste,
  // paiement intégral sur la réservation encore locale ; tout part en chaîne au retour du réseau.
  await page.goto('/reservations')
  await page.getByRole('button', { name: '+ Nouvelle réservation' }).click()
  const offlineBooking = page.getByRole('dialog')
  await expect(
    offlineBooking.getByText(/chambres libres et prix calculés sur ce poste/),
  ).toBeVisible()
  await offlineBooking.getByRole('radio', { name: 'Nouveau client', exact: true }).check()
  await offlineBooking.getByLabel('Nom', { exact: true }).fill('Sans Reseau')
  await offlineBooking.getByLabel('Téléphone', { exact: true }).fill('+23672007777')
  await offlineBooking.getByLabel('Titulaire du séjour').fill('Sans Reseau')
  await offlineBooking.getByRole('button', { name: 'Suivant' }).click()
  const offlineRoom = offlineBooking.getByLabel('Chambre', { exact: true })
  await expect(offlineRoom.locator('option')).not.toHaveCount(1)
  await offlineRoom.selectOption({ index: 1 })
  await expect(offlineBooking.getByText('Total net')).toBeVisible()
  await offlineBooking.getByRole('button', { name: 'Suivant' }).click()
  await offlineBooking.getByLabel('Le client a vérifié ces informations et les confirme').check()
  await offlineBooking.getByRole('button', { name: 'Suivant' }).click()
  await offlineBooking.getByRole('radio', { name: 'Paiement intégral', exact: true }).check()
  await offlineBooking.getByRole('button', { name: 'Créer la réservation' }).click()
  await expect(page).toHaveURL(/\/reservations\/local-[0-9a-f-]{36}$/)
  // Hors ligne aussi, l'arrivée du jour est proposée d'elle-même (D-071).
  await page
    .getByRole('dialog', { name: 'Enregistrer l’arrivée' })
    .getByRole('button', { name: 'Annuler' })
    .click()
  await expect(
    page.getByText('Gardée sur ce poste, pas encore reçue par le serveur.'),
  ).toBeVisible()
  await expect(page.getByText(/^LOC-.*-000003$/).first()).toBeVisible()
  const localBookingUrl = page.url()

  // Recette 1 : fermer puis rouvrir l’application sans réseau ; la réservation et le reçu
  // provisoires sont toujours là, et le ticket 80 mm s’imprime.
  const reopened = await context.newPage()
  await reopened.goto(localBookingUrl)
  await expect(reopened.getByRole('heading', { name: /Sans Reseau/i, level: 1 })).toBeVisible()
  await expect(reopened.locator('.connectivity-chip')).toHaveText('Hors ligne')
  const ticketLink = reopened.getByRole('link', { name: /Ticket 80 mm du reçu LOC-.*-000003/ })
  await ticketLink.click()
  await expect(reopened.getByRole('article', { name: /Ticket du reçu/ })).toContainText(
    'Provisoire',
  )
  await expect(reopened.getByRole('button', { name: 'Imprimer le ticket' })).toBeEnabled()
  await reopened.close()

  // Facture hors ligne (4.13) : provisoire FAC-LOC-…, numéro définitif au retour du réseau.
  await page.goto(localBookingUrl)
  await expect(page.getByRole('button', { name: 'Émettre une facture' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Ouvrir le ticket de facture' }).click()
  await expect(
    page.getByRole('article', { name: /Ticket facture provisoire FAC-LOC-/ }),
  ).toContainText('Provisoire')
  await expect(page.getByText(/^FAC-LOC-.*-000002$/).first()).toBeVisible()

  // Écran d’administration jamais gardé : message clair, jamais un chargement sans fin.
  await page.goto('/admin/audit')
  await expect(page.getByText('Pas encore disponible hors ligne.').first()).toBeVisible()

  // 3. Mise à jour impossible hors ligne : échec journalisé avec sa cause.
  await page.goto('/synchronisation')
  await page.getByRole('button', { name: 'Mettre à jour en local' }).click()
  await expect(history.getByRole('row').nth(1)).toContainText('Échec')
  await expect(history.getByRole('row').nth(1)).toContainText('Connexion impossible')

  // 4. Inactivité de plus de 15 min hors ligne : verrou, puis déverrouillage par mot de passe.
  await page.evaluate(() =>
    localStorage.setItem('jb-hotel.last-activity', String(Date.now() - 20 * 60_000)),
  )
  await page.reload()
  const lock = page.getByRole('dialog', { name: 'Session verrouillée' })
  await expect(lock).toBeVisible()
  await lock.getByLabel('Mot de passe').fill('pas-le-bon')
  await lock.getByRole('button', { name: 'Déverrouiller' }).click()
  await expect(lock).toContainText('Mot de passe incorrect.')
  await lock.getByLabel('Mot de passe').fill(password)
  await lock.getByRole('button', { name: 'Déverrouiller' }).click()
  await expect(lock).toBeHidden()

  // 5. Retour du réseau : état « En ligne » et mise à jour automatique journalisée.
  await context.setOffline(false)
  await expect(page.locator('.connectivity-chip')).toHaveText('En ligne', { timeout: 40_000 })
  await expect(history.getByRole('row').nth(1)).toContainText('Retour du réseau', {
    timeout: 40_000,
  })

  // Tout ce qui a été fait hors ligne est parti tout seul et a été accepté par le serveur :
  // encaissement, puis client → réservation → encaissement, chacun avec l’identifiant du serveur.
  const outbox = page.getByRole('region', { name: 'Mettre à jour en ligne' })
  await expect(outbox.getByText('Envoyée', { exact: true })).toHaveCount(4, { timeout: 60_000 })
  await expect(outbox.getByText('Refusée', { exact: true })).toHaveCount(0)
  await expect(outbox).toContainText(/LOC-.*-000001 → REC-\d{4}-\d+/)
  await expect(outbox).toContainText(/LOC-.*-000003 → REC-\d{4}-\d+/)
  await expect(outbox).toContainText(/Facture FAC-LOC-.*-000002 → FAC-\d{4}-\d+/)
  await expect(history).toContainText('Vers le serveur')

  // La fiche provisoire s’ouvre sur la réservation créée par le serveur, payée.
  await page.goto(localBookingUrl)
  await expect(page).toHaveURL(/\/reservations\/[0-9a-f-]{36}$/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: /Sans Reseau/i, level: 1 })).toBeVisible()
  await expect(page.getByText('Gardée sur ce poste, pas encore reçue par le serveur.')).toHaveCount(
    0,
  )
  await expect(page.getByText(/^REC-\d{4}-\d+$/).first()).toBeVisible()
  await page.goto(reservationUrl)
  await expect(page.getByText(/^REC-\d{4}-\d+$/).first()).toBeVisible()
  await expect(page.getByText('En attente d’envoi')).toHaveCount(0)

  // Le serveur a noté chaque opération reçue (lot 4A) : Administration → Mode hors ligne.
  await page.goto('/admin/hors-ligne')
  await expect(page.getByRole('heading', { name: 'Mode hors ligne', level: 1 })).toBeVisible()
  const center = page.getByRole('region', { name: 'Centre de synchronisation' })
  await center.getByLabel('Examen').selectOption('')
  // Recherche sur les noms de ce scénario : le journal est partagé avec les autres recettes.
  await center.getByLabel('Recherche').fill('Sans Reseau')
  await expect(center.getByText('Acceptée', { exact: true })).toHaveCount(3)
  await center.getByLabel('Recherche').fill('Hors Ligne')
  await expect(center.getByText('Acceptée', { exact: true })).toHaveCount(1)
  await expect(center.getByText('Refusée', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
