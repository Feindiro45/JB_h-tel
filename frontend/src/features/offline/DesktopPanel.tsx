import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ApiError } from '../../shared/api/errors'
import {
  desktopBridge,
  type DesktopBridge,
  type DesktopUpdate,
  type PrinterSettings,
} from '../../shared/desktop/bridge'
import { useServerChanges } from '../../shared/offline/serverChanges'
import { Badge } from '../../shared/ui/Badge'
import { SelectField } from '../../shared/ui/fields'
import { Icon } from '../../shared/ui/Icon'
import { LoadingBlock, Pair, Panel } from '../../shared/ui/layout'
import { useErrorModal } from '../../shared/ui/errorModalContext'
import { useToast } from '../../shared/ui/toastContext'
import { formatDateTime, formatNumber, formatTime } from '../../shared/utils/format'

/**
 * Écran « Poste Windows » (D-069), visible seulement dans le logiciel installé : base locale
 * SQLite, chiffrement, sauvegardes du poste, imprimante des tickets 80 mm et mise à jour du
 * logiciel. Le navigateur (PWA) garde son propre panneau d'installation.
 */
const DESKTOP_KEY = ['desktop', 'info'] as const
const PRINTERS_KEY = ['desktop', 'printers'] as const

function bytes(value: number | null | undefined): string {
  if (!value) return '—'
  if (value < 1048576) return `${formatNumber(Math.max(1, Math.round(value / 1024)))} Ko`
  const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
  if (value < 1024 ** 3) return `${decimal.format(value / 1048576)} Mo`
  return `${decimal.format(value / 1024 ** 3)} Go`
}

const REASONS: Record<string, string> = {
  auto: 'automatique',
  manual: 'manuelle',
  migration: 'avant mise à niveau',
  restore: 'avant restauration',
  update: 'avant mise à jour',
  recovery: 'reprise',
}

function failure(message: string) {
  return new ApiError(503, 'Opération impossible sur ce poste', message)
}

function useDesktopUpdate(bridge: DesktopBridge, initial: DesktopUpdate | undefined) {
  // État envoyé par le processus principal (téléchargement, prête) ; sinon celui de l'écran.
  const [pushed, setPushed] = useState<DesktopUpdate | undefined>(undefined)
  useEffect(() => bridge.system.onUpdate(setPushed), [bridge])
  return pushed ?? initial
}

export function DesktopPanel() {
  const bridge = desktopBridge()
  if (!bridge) return null
  return <DesktopDetails bridge={bridge} />
}

function DesktopDetails({ bridge }: { bridge: DesktopBridge }) {
  const client = useQueryClient()
  const { notify } = useToast()
  const { showError } = useErrorModal()
  const changes = useServerChanges()
  const info = useQuery({
    queryKey: DESKTOP_KEY,
    queryFn: () => bridge.system.info(),
    networkMode: 'always',
    staleTime: 0,
  })
  const update = useDesktopUpdate(bridge, info.data?.update)
  const refresh = () => void client.invalidateQueries({ queryKey: DESKTOP_KEY })

  const backup = useMutation({
    mutationFn: () => bridge.backups.create(),
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: (item) => {
      refresh()
      notify(`Sauvegarde du poste créée (${bytes(item.bytes)})`)
    },
    onError: () =>
      showError(
        failure(
          'La sauvegarde du poste a échoué. Vérifiez l’espace libre du disque, puis réessayez.',
        ),
      ),
  })
  const exportCopy = useMutation({
    mutationFn: () => bridge.backups.exportCopy(),
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: (result) => {
      refresh()
      if (result.saved) notify(`Copie enregistrée : ${result.name ?? 'sauvegarde'}`)
    },
    onError: () =>
      showError(
        failure(
          'La copie n’a pas pu être enregistrée à cet endroit. Choisissez un autre dossier ou une autre clé USB.',
        ),
      ),
  })
  const restore = useMutation({
    mutationFn: () => bridge.backups.restore(),
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: (result) => {
      if (result.restored) notify('Sauvegarde restaurée : l’application redémarre…')
    },
    onError: (error) =>
      showError(
        failure(
          error instanceof Error
            ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
            : 'Restauration impossible.',
        ),
      ),
  })

  if (info.isPending)
    return (
      <Panel title="Poste Windows">
        <LoadingBlock />
      </Panel>
    )
  if (!info.data) return null
  const data = info.data
  const ops = data.store.operations
  const latest = data.backups.latest

  return (
    <>
      <Panel
        title="Poste Windows"
        subtitle="Logiciel installé : données dans la base locale SQLite de ce poste."
        action={<Badge tone="green" label={`Version ${data.version}`} />}
      >
        <div className="panel-body">
          {data.recovery && (
            <p className="desktop-alert" role="status">
              <Icon name="shield" size={18} />
              {data.recovery.restored
                ? 'La base locale était endommagée : la dernière sauvegarde valide a été restaurée. Vérifiez les opérations en attente.'
                : 'La base locale était endommagée et aucune sauvegarde valide n’existait : le poste est reparti d’une base vide.'}
            </p>
          )}
          <div className="pairs">
            <Pair label="Base locale">{`${bytes(data.databaseBytes)} — schéma ${data.schemaVersion}`}</Pair>
            <Pair label="Protection des données">
              {data.sealing === 'dpapi'
                ? 'Chiffrées (compte Windows)'
                : 'Non chiffrées : prévenir l’administrateur'}
            </Pair>
            <Pair label="Opérations du poste">
              {`${formatNumber(ops.pending)} en attente, ${formatNumber(ops.rejected)} refusée(s), ${formatNumber(ops.accepted)} envoyée(s)`}
            </Pair>
            <Pair label="Données gardées">{`${formatNumber(data.store.cachedQueries)} écran(s)`}</Pair>
            <Pair label="Espace libre du disque">{bytes(data.freeBytes)}</Pair>
            <Pair label="Serveur">{data.serverUrl}</Pair>
            <Pair label="Changements du serveur">
              {!changes.supported
                ? 'Suivi indisponible (serveur à mettre à jour)'
                : changes.checkedAt
                  ? `Vérifiés à ${formatTime(new Date(changes.checkedAt).toISOString())} (${formatNumber(changes.lastCount)} reçu(s))`
                  : 'Pas encore vérifiés'}
            </Pair>
            <Pair label="Dernière sauvegarde du poste">
              {latest
                ? `${formatDateTime(latest.createdAt)} (${REASONS[latest.reason] ?? latest.reason})`
                : 'Aucune'}
            </Pair>
          </div>
          <div className="toolbar">
            <button
              type="button"
              className="primary"
              disabled={backup.isPending}
              onClick={() => backup.mutate()}
            >
              <Icon name="disk" size={17} />
              {backup.isPending ? 'Sauvegarde…' : 'Sauvegarder maintenant'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={exportCopy.isPending}
              onClick={() => exportCopy.mutate()}
            >
              <Icon name="upload" size={17} />
              Copier sur une clé USB…
            </button>
            <button
              type="button"
              className="primary"
              disabled={restore.isPending}
              onClick={() => restore.mutate()}
            >
              <Icon name="archive" size={17} />
              Restaurer une sauvegarde…
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void bridge.backups.openFolder()}
            >
              <Icon name="layers" size={17} />
              Ouvrir le dossier des sauvegardes
            </button>
          </div>
          <p className="hint">
            Une sauvegarde est faite chaque jour, avant chaque mise à jour et avant une restauration
            ({formatNumber(data.backups.count)} gardée(s)). Elle ne se restaure que sur ce compte
            Windows ; pour changer de poste, utilisez la sauvegarde chiffrée par mot de passe
            ci-dessous.
          </p>
          {update?.status === 'ready' && (
            <div className="toolbar">
              <button
                type="button"
                className="primary"
                onClick={() => void bridge.system.installUpdate()}
              >
                <Icon name="download" size={17} />
                Redémarrer et installer la version {update.version}
              </button>
            </div>
          )}
          {update?.status === 'downloading' && (
            <p className="hint">Téléchargement de la version {update.version} en cours…</p>
          )}
        </div>
      </Panel>
      <PrinterPanel
        key={JSON.stringify(data.printer)}
        bridge={bridge}
        settings={data.printer}
        onSaved={refresh}
      />
    </>
  )
}

function PrinterPanel({
  bridge,
  settings,
  onSaved,
}: {
  bridge: DesktopBridge
  settings: PrinterSettings
  onSaved: () => void
}) {
  const { notify } = useToast()
  const { showError } = useErrorModal()
  const [draft, setDraft] = useState<PrinterSettings>(settings)
  const printers = useQuery({
    queryKey: PRINTERS_KEY,
    queryFn: () => bridge.printing.printers(),
    networkMode: 'always',
  })
  const history = useQuery({
    queryKey: ['desktop', 'prints'],
    queryFn: () => bridge.printing.history(),
    networkMode: 'always',
  })
  const save = useMutation({
    mutationFn: (value: PrinterSettings) => bridge.printing.settings(value),
    networkMode: 'always',
    meta: { silentError: true },
    onSuccess: () => {
      onSaved()
      notify('Imprimante des tickets enregistrée')
    },
    onError: () => showError(failure('Le réglage de l’imprimante n’a pas pu être enregistré.')),
  })
  const missing = draft.name && printers.data && !printers.data.some((p) => p.name === draft.name)
  const last = history.data?.[0]

  return (
    <Panel
      title="Imprimante des tickets"
      subtitle="Tickets 80 mm (ou 58 mm), imprimés sans Internet."
    >
      <form
        className="panel-body"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate(draft)
        }}
      >
        <div className="fields">
          <SelectField
            label="Imprimante"
            icon="print"
            value={draft.name ?? ''}
            onChange={(event) => setDraft({ ...draft, name: event.target.value || null })}
            error={
              missing
                ? 'Imprimante introuvable : branchez-la ou choisissez-en une autre.'
                : undefined
            }
          >
            <option value="">Imprimante par défaut de Windows</option>
            {draft.name && missing && <option value={draft.name}>{draft.name} (absente)</option>}
            {printers.data?.map((printer) => (
              <option key={printer.name} value={printer.name}>
                {printer.displayName}
                {printer.isDefault ? ' (par défaut)' : ''}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Largeur du rouleau"
            icon="layers"
            value={String(draft.widthMm)}
            onChange={(event) =>
              setDraft({ ...draft, widthMm: event.target.value === '58' ? 58 : 80 })
            }
          >
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </SelectField>
          <SelectField
            label="Mode d’impression"
            icon="settings"
            value={draft.silent ? 'direct' : 'dialog'}
            onChange={(event) => setDraft({ ...draft, silent: event.target.value === 'direct' })}
          >
            <option value="dialog">Afficher la fenêtre d’impression</option>
            <option value="direct">Imprimer directement</option>
          </SelectField>
        </div>
        <div className="toolbar">
          <button type="submit" className="primary" disabled={save.isPending}>
            <Icon name="check" size={17} />
            Enregistrer l’imprimante
          </button>
        </div>
        <p className="hint">
          {last
            ? `Dernière impression : ${last.document} à ${formatDateTime(last.at.replace(' ', 'T'))}${last.reprint ? ' (réimpression)' : ''} — ${last.status === 'printed' ? 'imprimé' : last.status === 'cancelled' ? 'annulé' : 'échec'}.`
            : 'Aucune impression depuis ce poste pour l’instant.'}
        </p>
      </form>
    </Panel>
  )
}
