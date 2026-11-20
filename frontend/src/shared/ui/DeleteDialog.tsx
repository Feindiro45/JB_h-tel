import { useMutation } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { TextAreaField } from './fields'
import { Modal } from './Modal'
import { useToast } from './toastContext'

/**
 * Suppression définitive (D-058, administrateur) : fenêtre d'avertissement, motif obligatoire et
 * confirmation explicite. Le serveur refuse toute saisie encore utilisée (séjour, encaissement,
 * facture…) et garde une copie complète dans le journal d'audit.
 */
export function DeleteDialog({
  title,
  path,
  children,
  onDeleted,
  onClose,
}: {
  title: string
  /** Chemin de l'API, par exemple `/api/v1/customers/{uuid}`. */
  path: string
  /** Ce qui sera supprimé, en clair. */
  children: ReactNode
  onDeleted: () => void
  onClose: () => void
}) {
  const { notify } = useToast()
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string>()
  const mutation = useMutation({
    mutationFn: () => api.delete<{ message: string }>(path, { reason: reason.trim() }),
    onSuccess: (response) => {
      notify(response.message)
      onDeleted()
    },
  })

  return (
    <Modal
      title={title}
      subtitle="Suppression définitive"
      onClose={onClose}
      onSubmit={() =>
        reason.trim() ? mutation.mutate() : setError('Le motif de la suppression est obligatoire.')
      }
      submitLabel="Supprimer définitivement"
      submitIcon="trash"
      submitting={mutation.isPending}
      submitDisabled={!confirmed}
      danger
      alert
      size="small"
    >
      <div className="notice" role="note">
        <p>{children}</p>
        <p>
          Cette action est <strong>irréversible</strong>. Une copie complète est conservée dans le
          journal d’audit, avec votre nom, la date et le motif.
        </p>
      </div>
      <div className="fields" style={{ marginTop: 12 }}>
        <TextAreaField
          className="full"
          label="Motif de la suppression"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={error}
          maxLength={255}
          required
        />
        <label className="check full">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Je confirme la suppression définitive
        </label>
      </div>
    </Modal>
  )
}
