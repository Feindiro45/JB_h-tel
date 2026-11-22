import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import {
  BackupError,
  canEncrypt,
  createBackup,
  lastBackupQuery,
  MIN_BACKUP_PASSWORD,
  readBackup,
  rememberBackup,
  restoreBackup,
  unsavedOperations,
  type BackupFile,
} from '../../shared/offline/backup'
import { notifyOutboxChanged, outboxQuery, type QueuedOperation } from '../../shared/offline/outbox'
import { offlineRules, reminderDelayLabel } from '../../shared/offline/rules'
import { Badge } from '../../shared/ui/Badge'
import { TextField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { Panel } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime } from '../../shared/utils/format'
import { useBackupReminder } from './useBackupReminder'

const LAST_BACKUP_KEY = lastBackupQuery.queryKey

/** Remet le fichier au navigateur, qui l'enregistre dans « Téléchargements ». */
function download(content: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Sauvegardes du poste (N-06, D-064) : export chiffré manuel des opérations pas encore reçues
 * par le serveur, et restauration sur ce poste ou sur un autre (panne, vol, navigateur effacé).
 */
export function BackupPanel() {
  const outbox = useQuery(outboxQuery)
  const last = useQuery(lastBackupQuery)
  const reminder = useBackupReminder()
  const client = useQueryClient()
  const unsaved = unsavedOperations(outbox.data ?? [])
  const [dialog, setDialog] = useState<'export' | 'restore' | null>(null)
  const anchor = useRef<HTMLDivElement>(null)
  const { hash } = useLocation()

  // Lien « Exporter une sauvegarde » du bandeau : la section est amenée à l'écran.
  useEffect(() => {
    if (hash === '#sauvegarde') anchor.current?.scrollIntoView?.({ block: 'start' })
  }, [hash])

  return (
    <div id="sauvegarde" ref={anchor} className="sync-card-anchor">
      <Panel
        title="Sauvegarde des opérations en attente"
        action={
          <Badge
            tone={reminder ? 'red' : unsaved.length ? 'amber' : 'green'}
            label={
              reminder ? 'Conseillée' : unsaved.length ? `${unsaved.length} à protéger` : 'À jour'
            }
          />
        }
      >
        <div className="panel-body action-card">
          <span className="action-card__icon" aria-hidden="true">
            <Icon name="archive" size={30} />
          </span>
          <div className="backup-body">
            {reminder && (
              <p className="notice" role="alert">
                <strong>Sauvegarde conseillée :</strong> des opérations attendent depuis{' '}
                {reminderDelayLabel(offlineRules(client).backup_reminder_minutes)} sans sauvegarde.
              </p>
            )}
            <p>
              <Icon name="key" size={15} /> Fichier chiffré, à garder sur une clé USB.
            </p>
            <p className="hint">
              {last.data
                ? `Dernière : ${formatDateTime(new Date(last.data.at))} · ${last.data.count} opération(s) · ${last.data.fileName}`
                : 'Aucune sauvegarde exportée depuis ce poste.'}
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="primary"
                disabled={unsaved.length === 0}
                onClick={() => setDialog('export')}
              >
                <Icon name="download" size={17} />
                Exporter une sauvegarde
              </button>
              <button type="button" className="secondary" onClick={() => setDialog('restore')}>
                <Icon name="undo" size={17} />
                Restaurer une sauvegarde
              </button>
            </div>
            <details className="backup-procedure">
              <summary>Procédure de restauration</summary>
              <ol>
                <li>Sur le poste qui reprend la caisse, connectez-vous en ligne une fois.</li>
                <li>« Restaurer une sauvegarde » : le fichier, puis son mot de passe.</li>
                <li>
                  Seules les opérations absentes sont ajoutées ; aucune n’est enregistrée deux fois
                  par le serveur.
                </li>
                <li>
                  Chaque auteur se connecte sur ce poste : ses opérations partent avec sa session.
                </li>
              </ol>
            </details>
          </div>
        </div>
      </Panel>
      {dialog === 'export' && (
        <ExportDialog count={unsaved.length} onClose={() => setDialog(null)} />
      )}
      {dialog === 'restore' && <RestoreDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

function ExportDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const client = useQueryClient()
  const { notify } = useToast()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({})
  const save = useMutation({
    mutationFn: async () => {
      const station = client.getQueryData<{ name: string } | null>(['workstation', 'self'])
      const backup = await createBackup(password, station?.name ?? null)
      download(backup.content, backup.fileName)
      await rememberBackup(backup.record)
      return backup
    },
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: (backup) => {
      void client.invalidateQueries({ queryKey: LAST_BACKUP_KEY })
      notify(`Sauvegarde exportée : ${backup.record.count} opération(s), ${backup.fileName}`)
      onClose()
    },
    onError: (error) =>
      setErrors({
        password: error instanceof Error ? error.message : 'Export impossible sur ce poste.',
      }),
  })
  return (
    <Modal
      title="Exporter une sauvegarde chiffrée"
      subtitle={`${count} opération(s) en attente ou refusée(s)`}
      onClose={onClose}
      onSubmit={() => {
        const next: typeof errors = {}
        if (password.length < MIN_BACKUP_PASSWORD)
          next.password = `Au moins ${MIN_BACKUP_PASSWORD} caractères.`
        if (confirmation !== password) next.confirmation = 'Les deux mots de passe diffèrent.'
        setErrors(next)
        if (Object.keys(next).length === 0) save.mutate()
      }}
      submitIcon="download"
      submitLabel="Exporter"
      submitting={save.isPending}
    >
      {!canEncrypt() && (
        <p className="notice" role="alert">
          Chiffrement indisponible : ouvrez l’application en adresse sécurisée (HTTPS).
        </p>
      )}
      <p>
        Le fichier est chiffré : sans ce mot de passe, personne ne peut le lire, ni vous. Notez-le à
        part, jamais sur la clé USB. Il n’est pas gardé par l’application.
      </p>
      <div className="fields">
        <TextField
          label="Mot de passe de la sauvegarde"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={`${MIN_BACKUP_PASSWORD} caractères au moins.`}
          required
        />
        <TextField
          label="Confirmer le mot de passe"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={errors.confirmation}
          required
        />
      </div>
    </Modal>
  )
}

function RestoreDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient()
  const { notify } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ file?: string; password?: string }>({})
  const restore = useMutation({
    mutationFn: async (): Promise<{
      file: BackupFile
      operations: QueuedOperation[]
      added: number
      present: number
    }> => {
      if (!file) throw new BackupError('Choisissez le fichier de sauvegarde.', 'file')
      const backup = await readBackup(await file.text(), password)
      return { ...backup, ...(await restoreBackup(backup.operations)) }
    },
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: ({ file: backup, added, present }) => {
      notifyOutboxChanged(client)
      notify(
        `Sauvegarde du ${formatDateTime(new Date(backup.createdAt))} restaurée : ${added} opération(s) ajoutée(s)${present ? `, ${present} déjà présente(s)` : ''}`,
      )
      onClose()
    },
    onError: (error) =>
      setErrors(
        error instanceof BackupError
          ? { [error.field]: error.message }
          : { file: 'Fichier illisible : choisissez le fichier exporté par JB Hôtel.' },
      ),
  })
  return (
    <Modal
      title="Restaurer une sauvegarde"
      subtitle="Ajoute à ce poste les opérations d’un fichier exporté."
      onClose={onClose}
      onSubmit={() => {
        if (!file) return setErrors({ file: 'Choisissez le fichier de sauvegarde.' })
        if (!password) return setErrors({ password: 'Saisissez le mot de passe de la sauvegarde.' })
        setErrors({})
        restore.mutate()
      }}
      submitIcon="undo"
      submitLabel="Restaurer"
      submitting={restore.isPending}
    >
      <p>
        Rien n’est effacé : seules les opérations absentes de ce poste sont ajoutées. Une opération
        déjà reçue par le serveur n’y est jamais enregistrée deux fois.
      </p>
      <div className="fields">
        <TextField
          className="full"
          label="Fichier de sauvegarde"
          type="file"
          icon="document"
          accept=".json,application/json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          error={errors.file}
          required
        />
        <TextField
          className="full"
          label="Mot de passe de la sauvegarde"
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          required
        />
      </div>
    </Modal>
  )
}
