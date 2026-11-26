// Recette du logiciel Windows : base E2E isolée préparée, puis Playwright (Electron).
// L'application doit être construite avant (npm run build).
import { spawnSync } from 'node:child_process'

const env = { ...process.env }
// VS Code et certains terminaux lancent Electron « comme Node » : désactivé pour la recette.
delete env.ELECTRON_RUN_AS_NODE
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: true })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run('php', ['tests/Support/prepare_e2e.php'], '../backend')
run('npx', ['playwright', 'test', ...process.argv.slice(2)], '.')
