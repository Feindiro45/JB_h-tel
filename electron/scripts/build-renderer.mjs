// Construit l'interface React existante (frontend/) pour le poste Windows, dans renderer/.
// Même code que la PWA : l'adresse de l'API est remplacée à l'exécution par le relais
// app://jbhotel/server du processus principal (voir frontend/src/shared/config.ts).
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url))
const out = fileURLToPath(new URL('../renderer/', import.meta.url))
const env = { ...process.env, VITE_API_URL: 'app://jbhotel/server' }
delete env.ELECTRON_RUN_AS_NODE

// Chemin relatif : le dossier du projet contient une espace (« JB Hôtel »).
const result = spawnSync('npx', ['vite', 'build', '--outDir', '../electron/renderer', '--emptyOutDir'], {
  cwd: frontend,
  env,
  stdio: 'inherit',
  shell: true,
})
if (result.status !== 0) process.exit(result.status ?? 1)
// Le service worker de la PWA est inutile dans le logiciel : l'interface est déjà installée.
if (existsSync(`${out}sw.js`)) rmSync(`${out}sw.js`)
console.log('Interface construite pour le poste Windows dans electron/renderer/')
