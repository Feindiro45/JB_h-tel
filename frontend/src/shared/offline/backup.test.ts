import { describe, expect, it } from 'vitest'
import {
  BACKUP_REMINDER_MS,
  BackupError,
  createBackup,
  needsBackupReminder,
  readBackup,
  restoreBackup,
} from './backup'
import { enqueueOperation, readOutbox, writeOperations, type QueuedOperation } from './outbox'

const NOW = new Date('2026-12-01T12:00:00+01:00')

function operation(overrides: Partial<QueuedOperation> = {}): QueuedOperation {
  return {
    id: 'op-1',
    kind: 'payment.record',
    label: 'Encaissement de 20 000 FCFA — chambre 101',
    method: 'POST',
    path: '/api/v1/reservations/r-1/payments',
    body: { amount_fcfa: 20000, method: 'CASH' },
    createdAt: NOW.getTime() - 2 * BACKUP_REMINDER_MS,
    userId: 'u-1',
    userName: 'Grâce',
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    error: null,
    provisionalNumber: 'LOC-CAISSE01-000001',
    definitiveNumber: null,
    localId: 'local-1',
    abandonReason: null,
    ...overrides,
  }
}

async function failure(promise: Promise<unknown>): Promise<BackupError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(BackupError)
  return error as BackupError
}

describe('Sauvegarde chiffrée des opérations en attente (N-06)', () => {
  it('chiffre les opérations non envoyées et les restitue avec le bon mot de passe', async () => {
    await writeOperations([
      operation(),
      operation({ id: 'op-2', status: 'rejected' }),
      operation({ id: 'op-3', status: 'accepted', definitiveNumber: 'REC-2026-000004' }),
      operation({ id: 'op-4', status: 'abandoned', abandonReason: 'Doublon' }),
    ])

    const backup = await createBackup('Coffre-2026', 'Caisse 01', NOW)
    // Envoyées et abandonnées n'ont plus besoin d'être protégées.
    expect(backup.record.ids).toEqual(['op-1', 'op-2'])
    expect(backup.fileName).toMatch(/^jb-hotel-sauvegarde-CAISSE01-2026-12-01-\d{4}\.json$/)
    // Rien de lisible dans le fichier : ni montant, ni libellé, ni auteur.
    expect(backup.content).not.toContain('Encaissement')
    expect(backup.content).not.toContain('Grâce')
    expect(backup.content).not.toContain('20000')

    const { file, operations } = await readBackup(backup.content, 'Coffre-2026')
    expect(file).toMatchObject({ station: 'Caisse 01', operations: 2 })
    expect(operations.map((o) => o.id)).toEqual(['op-1', 'op-2'])
    expect(operations[0]).toMatchObject({ body: { amount_fcfa: 20000 }, userName: 'Grâce' })
  })

  it('refuse un mot de passe faux, un fichier modifié ou étranger', async () => {
    await enqueueOperation(operation())
    const { content } = await createBackup('Coffre-2026', null, NOW)

    expect((await failure(readBackup(content, 'mauvais-mdp'))).field).toBe('password')

    const file = JSON.parse(content) as { data: string }
    // Un caractère du contenu chiffré change : le contrôle d’intégrité AES-GCM le détecte.
    const flipped = file.data[4] === 'A' ? 'B' : 'A'
    const tampered = JSON.stringify({
      ...file,
      data: `${file.data.slice(0, 4)}${flipped}${file.data.slice(5)}`,
    })
    expect((await failure(readBackup(tampered, 'Coffre-2026'))).message).toMatch(/modifié/)

    expect((await failure(readBackup('{"hello":1}', 'Coffre-2026'))).message).toBe(
      'Ce fichier n’est pas une sauvegarde JB Hôtel.',
    )
    expect((await failure(readBackup('pas du json', 'Coffre-2026'))).field).toBe('file')
  })

  it('exige un mot de passe de 8 caractères et des opérations à sauvegarder', async () => {
    expect((await failure(createBackup('court', null, NOW))).field).toBe('password')
    expect((await failure(createBackup('Coffre-2026', null, NOW))).message).toBe(
      'Aucune opération en attente à sauvegarder.',
    )
  })

  it('restaure seulement les opérations absentes, sans doublon', async () => {
    const later = NOW.getTime() - BACKUP_REMINDER_MS
    await writeOperations([operation(), operation({ id: 'op-2', createdAt: later })])
    const { content } = await createBackup('Coffre-2026', null, NOW)
    // Poste de reprise : il connaît déjà op-2, déjà envoyée.
    await writeOperations([operation({ id: 'op-2', createdAt: later, status: 'accepted' })])

    const { operations } = await readBackup(content, 'Coffre-2026')
    expect(await restoreBackup(operations)).toEqual({ added: 1, present: 1 })
    const outbox = await readOutbox()
    expect(outbox.map((o) => [o.id, o.status])).toEqual([
      ['op-1', 'pending'],
      ['op-2', 'accepted'],
    ])
    // Une deuxième restauration du même fichier n'ajoute rien.
    expect(await restoreBackup(operations)).toEqual({ added: 0, present: 2 })
  })

  it('rappelle de sauvegarder après une heure d’attente, sauf si l’opération est déjà exportée', () => {
    const now = NOW.getTime()
    const recent = operation({ id: 'op-r', createdAt: now - 10 * 60_000 })
    const old = operation({ id: 'op-o', createdAt: now - BACKUP_REMINDER_MS })

    expect(needsBackupReminder([recent], null, now)).toBe(false)
    expect(needsBackupReminder([recent, old], null, now)).toBe(true)
    const saved = { at: now, count: 1, ids: ['op-o'], fileName: 'f.json' }
    expect(needsBackupReminder([recent, old], saved, now)).toBe(false)
    expect(needsBackupReminder([{ ...old, status: 'accepted' }], null, now)).toBe(false)
  })
})
