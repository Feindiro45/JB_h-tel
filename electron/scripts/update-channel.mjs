// Prépare le dossier du canal des mises à jour (D-069) à partir de la dernière construction
// (`npm run dist`) : à téléverser tel quel dans /desktop à la racine de https://app.jb-hotel.com.
//
//   npm run update-channel                      → ../deploiement/desktop
//   npm run update-channel -- --out=D:\canal    → autre dossier
//
// Le script refuse de produire un canal incohérent : latest.yml absent ou d'une autre version,
// empreinte ou taille de l'installateur différente de celle annoncée, installateur construit sans
// app-update.yml (il ne pourrait jamais télécharger de mise à jour). Les .blockmap des versions
// précédentes sont gardés : ils permettent aux postes de ne télécharger que les blocs changés.
import { createHash } from 'node:crypto'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const release = join(root, 'release')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const channelUrl = pkg.build.publish?.[0]?.url
const outArg = process.argv.find((arg) => arg.startsWith('--out='))
const out = resolve(outArg ? outArg.slice('--out='.length) : join(root, '..', 'deploiement', 'desktop'))

function fail(message) {
  console.error(`Canal non préparé : ${message}`)
  process.exit(1)
}

function digest(file, algorithm, encoding) {
  return new Promise((done, reject) => {
    const hash = createHash(algorithm)
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => done(hash.digest(encoding)))
  })
}

/** Valeur d'une clé de premier niveau de latest.yml (format fixe écrit par electron-builder). */
function field(yaml, key) {
  const match = yaml.match(new RegExp(`^${key}: '?([^'\\r\\n]+)'?\\s*$`, 'm'))
  return match ? match[1] : null
}

if (!channelUrl) fail('« build.publish » absent de package.json.')
const latestFile = join(release, 'latest.yml')
if (!existsSync(latestFile)) fail('release/latest.yml absent ; lancer « npm run dist ».')
const latest = readFileSync(latestFile, 'utf8')
const version = field(latest, 'version')
const installer = field(latest, 'path')
const sha512 = field(latest, 'sha512')
const size = Number(latest.match(/^\s+size: (\d+)\s*$/m)?.[1])
if (version !== pkg.version) fail(`latest.yml annonce ${version}, package.json ${pkg.version}.`)
if (installer !== `JB-Hotel-Setup-${version}.exe`) fail(`installateur inattendu dans latest.yml : ${installer}.`)

const installerFile = join(release, installer)
const blockmapFile = `${installerFile}.blockmap`
for (const file of [installerFile, blockmapFile]) if (!existsSync(file)) fail(`${file} absent.`)
if (statSync(installerFile).size !== size) fail(`taille de ${installer} différente de latest.yml.`)
if ((await digest(installerFile, 'sha512', 'base64')) !== sha512) {
  fail(`empreinte de ${installer} différente de latest.yml (fichier reconstruit après coup ?).`)
}

const appUpdate = join(release, 'win-unpacked', 'resources', 'app-update.yml')
if (!existsSync(appUpdate)) fail('app-update.yml absent de l’application : les postes ne pourraient rien télécharger.')
if (!readFileSync(appUpdate, 'utf8').includes(`url: ${channelUrl}`)) {
  fail(`app-update.yml ne vise pas ${channelUrl}.`)
}

mkdirSync(out, { recursive: true })
// Un seul installateur dans le canal : celui annoncé par latest.yml.
for (const name of readdirSync(out)) {
  if (/^JB-Hotel-Setup-.+\.exe$/.test(name) && name !== installer) rmSync(join(out, name))
}
copyFileSync(installerFile, join(out, installer))
for (const name of readdirSync(release)) {
  if (/^JB-Hotel-Setup-.+\.exe\.blockmap$/.test(name)) copyFileSync(join(release, name), join(out, name))
}
writeFileSync(
  join(out, '.htaccess'),
  `# JB Hôtel — canal des mises à jour du logiciel Windows : ${channelUrl}
# Généré par electron/scripts/update-channel.mjs. Téléverser ce fichier avec les autres
# (les clients FTP masquent souvent les fichiers commençant par un point).

Options -Indexes

# Pas de renvoi vers l'application React du dossier parent : un fichier absent répond 404,
# ce qui permet au logiciel de passer proprement au téléchargement complet.
<IfModule mod_rewrite.c>
    RewriteEngine On
</IfModule>

<IfModule mod_mime.c>
    AddType text/yaml .yml
    AddType application/octet-stream .exe .blockmap
</IfModule>

# latest.yml annonce la version à installer : toujours revalidé, jamais gardé en cache.
<IfModule mod_headers.c>
    <FilesMatch "\\.(?:yml|exe|blockmap)$">
        Header set Cache-Control "no-cache, must-revalidate"
    </FilesMatch>
</IfModule>
`,
  'utf8',
)
// latest.yml en dernier : il n'annonce la version qu'une fois l'installateur en place.
copyFileSync(latestFile, join(out, 'latest.yml.tmp'))
renameSync(join(out, 'latest.yml.tmp'), join(out, 'latest.yml'))

const files = readdirSync(out).filter((name) => name !== 'SHA256SUMS.txt').sort()
const sums = []
for (const name of files) sums.push(`${await digest(join(out, name), 'sha256', 'hex')}  ${name}`)
writeFileSync(join(out, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8')

console.log(`Canal ${channelUrl} préparé dans ${out} : version ${version}`)
for (const line of sums) console.log(`  ${line}`)
