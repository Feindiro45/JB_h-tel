import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

// Contrôle en lecture seule du serveur déjà lancé, sans préparer ni réinitialiser de base.
const baseURL = process.env.DEV_CHECK_URL || 'http://localhost:5173'
const browser = await chromium.launch({
  channel: process.env.E2E_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
})

try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', (response) => {
    const { pathname } = new URL(response.url())
    if (response.status() >= 400 && /^\/(src|node_modules)\//.test(pathname))
      errors.push(`Module indisponible : ${response.status()} ${pathname}`)
  })

  for (const path of ['/', '/reservations', '/documents', '/connexion']) {
    await page.goto(new URL(path, baseURL).href)
    // Contexte anonyme : chaque route doit afficher la connexion, sans page blanche.
    await page.getByRole('heading', { name: 'Connexion de l’équipe', exact: true }).waitFor()
    assert.ok((await page.locator('#root').innerText()).trim(), `Affichage vide sur ${path}`)
    assert.deepEqual(errors, [], `Erreur de chargement sur ${path}`)
    console.log(`Affichage vérifié : ${path}`)
  }
  await page.reload()
  await page.getByRole('heading', { name: 'Connexion de l’équipe', exact: true }).waitFor()
  assert.deepEqual(errors, [], 'Erreur après rechargement')
  console.log('Serveur actif vérifié : démarrage, routes et rechargement sans erreur JavaScript.')
} finally {
  await browser.close()
}
