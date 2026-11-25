// Construit le processus principal et le preload (CommonJS, un fichier chacun) dans build/.
// Valeurs par défaut du poste fixées à la construction (aucun secret). Sans variable, ce sont
// celles de la production (PRODUCTION dans src/main/config.ts) :
//   JBH_SERVER_URL  racine de Laravel (défaut : https://api.jb-hotel.com)
//   JBH_ORIGIN      origine de l'application web autorisée par Sanctum (défaut : https://app.jb-hotel.com)
//   JBH_UPDATE_URL  canal HTTPS des mises à jour, dossier contenant latest.yml
//                   (défaut : https://app.jb-hotel.com/desktop)
import { build } from 'esbuild'

const define = Object.fromEntries(
  ['JBH_SERVER_URL', 'JBH_ORIGIN', 'JBH_UPDATE_URL'].map((name) => [
    `__${name}__`,
    JSON.stringify(process.env[name] ?? ''),
  ]),
)

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: 'linked',
  external: ['electron', 'electron-updater'],
  logLevel: 'info',
}

await build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'build/main.cjs', define })
await build({ ...common, entryPoints: ['src/preload/preload.ts'], outfile: 'build/preload.cjs' })
