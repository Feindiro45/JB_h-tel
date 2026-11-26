import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { builtDefaults, loadConfig, saveConfig, savePrinter, withPrinter } from './config.ts'

const defaults = { serverUrl: 'https://banguiweb-tech.com/backend', origin: null, updateUrl: null }

test('sans valeur de construction : API api.jb-hotel.com, origine app.jb-hotel.com, canal /desktop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jbh-config-'))
  const config = loadConfig(join(dir, 'config.json'), [], builtDefaults())
  assert.equal(config.serverUrl, 'https://api.jb-hotel.com')
  assert.equal(config.origin, 'https://app.jb-hotel.com')
  assert.equal(config.updateUrl, 'https://app.jb-hotel.com/desktop')
})

test('réglages par défaut : serveur de production, origine déduite, imprimante 80 mm', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jbh-config-'))
  const config = loadConfig(join(dir, 'config.json'), [], defaults)
  assert.deepEqual(config, {
    serverUrl: 'https://banguiweb-tech.com/backend',
    origin: 'https://banguiweb-tech.com',
    updateUrl: null,
    printer: { name: null, silent: false, widthMm: 80 },
  })
})

test('le fichier puis la ligne de commande remplacent les valeurs par défaut', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jbh-config-'))
  const file = join(dir, 'config.json')
  writeFileSync(file, JSON.stringify({ serverUrl: 'https://autre.example/api', printer: { name: 'XP-80', silent: true, widthMm: 58 } }))
  const fromFile = loadConfig(file, [], defaults)
  assert.equal(fromFile.serverUrl, 'https://autre.example/api')
  assert.deepEqual(fromFile.printer, { name: 'XP-80', silent: true, widthMm: 58 })
  const fromArgs = loadConfig(file, ['--server=http://localhost:8000', '--origin=http://localhost:5173'], defaults)
  assert.equal(fromArgs.serverUrl, 'http://localhost:8000')
  assert.equal(fromArgs.origin, 'http://localhost:5173')
})

test('régler l’imprimante ne rend pas permanente l’adresse passée en ligne de commande', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jbh-config-'))
  const file = join(dir, 'config.json')
  writeFileSync(file, JSON.stringify({ updateUrl: 'https://banguiweb-tech.com/desktop' }))
  const running = loadConfig(file, ['--server=http://localhost:8000'], defaults)
  savePrinter(file, withPrinter(running, { name: 'XP-80', silent: true, widthMm: 80 }).printer)
  const stored = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(stored.serverUrl, undefined)
  assert.equal(stored.updateUrl, 'https://banguiweb-tech.com/desktop')
  assert.equal(stored.printer.name, 'XP-80')
})

test('fichier illisible : valeurs par défaut ; enregistrement atomique', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jbh-config-'))
  const file = join(dir, 'config.json')
  writeFileSync(file, '{pas du json')
  const config = withPrinter(loadConfig(file, [], defaults), { name: 'EPSON TM-T20', silent: true, widthMm: 80 })
  saveConfig(file, config)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).printer.name, 'EPSON TM-T20')
})
