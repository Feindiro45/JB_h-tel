import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiDownload } from '../api/client'
import { ApiError } from '../api/errors'
import { buildLocalWorkbook, localFilename, type LocalWorkbookSpec } from '../export/localWorkbook'
import { saveFile } from '../export/saveFile'
import { getConnectivity } from '../offline/connectivity'
import { useErrorModal } from './errorModalContext'
import { Icon } from './Icon'
import { useToast } from './toastContext'

type Query = Record<string, string | number | boolean | null | undefined>

/**
 * « Exporter (Excel) » d'un écran : le classeur complet du serveur (tableau de bord avec
 * graphiques et feuilles de données, filtres de l'écran) ; sans réseau, un classeur simplifié
 * construit sur le poste à partir des données gardées, quand l'écran sait le faire (`offline`).
 */
export function ExportButton({
  path,
  query,
  module,
  offline,
  label = 'Exporter (Excel)',
}: {
  /** Route de l'export, ex. `/api/v1/reservations/export`. */
  path: string
  /** Filtres de l'écran, envoyés tels quels. */
  query?: Query
  /** Nom court pour le fichier (jb-hotel-<module>-<date>.xlsx). */
  module: string
  /** Classeur simplifié sans réseau, à partir des données du poste ; absent : serveur seulement. */
  offline?: (client: QueryClient) => LocalWorkbookSpec
  label?: string
}) {
  const client = useQueryClient()
  const { showError } = useErrorModal()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)

  const local = async () => {
    if (!offline) return false
    saveFile(await buildLocalWorkbook(offline(client)), localFilename(module))
    notify('Classeur simplifié créé sans réseau, à partir des données de ce poste.')
    return true
  }

  const run = async () => {
    setBusy(true)
    try {
      if (!getConnectivity().online && (await local())) return
      try {
        const file = await apiDownload(path, { query, fallbackName: localFilename(module) })
        saveFile(file.blob, file.filename)
        notify('Classeur Excel téléchargé.')
      } catch (error) {
        if (error instanceof ApiError && error.isNetworkError && (await local())) return
        throw error
      }
    } catch (error) {
      showError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className="secondary" onClick={run} disabled={busy} aria-busy={busy}>
      <Icon name="download" size={17} />
      {busy ? 'Préparation du classeur…' : label}
    </button>
  )
}
