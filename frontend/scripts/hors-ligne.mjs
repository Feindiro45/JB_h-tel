// Version de production sur ce poste, pour essayer le mode hors ligne (service worker actif).
// `npm run hors-ligne` → http://localhost:4173, branchée sur l'API locale (http://localhost:8000).
// L'API visée est forcée ici : sans cela, Vite prendrait `.env.production` (serveur hébergé).
// Pour couper le réseau : outils du navigateur (F12) → Réseau → « Hors connexion », ou arrêter
// `php artisan serve`. Le backend local doit autoriser http://localhost:4173 (FRONTEND_URL et
// SANCTUM_STATEFUL_DOMAINS dans backend/.env).
import { spawnSync } from 'node:child_process'

const env = { ...process.env, VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:8000' }
const out = 'node_modules/.hors-ligne-dist'
const run = (args) => {
  const result = spawnSync('npx', args, { stdio: 'inherit', env, shell: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log(`Version de production branchée sur ${env.VITE_API_URL}`)
run(['vite', 'build', '--outDir', out, '--emptyOutDir'])
run(['vite', 'preview', '--outDir', out, '--port', '4173', '--strictPort'])
