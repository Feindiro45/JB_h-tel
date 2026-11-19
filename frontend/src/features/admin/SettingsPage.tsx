import { PageOverview } from '../../shared/ui/PageOverview'
import { Icon } from '../../shared/ui/Icon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../shared/api/client'
import type { Envelope } from '../../shared/api/types'
import { Badge } from '../../shared/ui/Badge'
import { LoadingBlock, PageHeading, Panel } from '../../shared/ui/layout'
import { Modal } from '../../shared/ui/Modal'
import { useToast } from '../../shared/ui/toastContext'
import { adminQuery, type Setting } from './api'
import { EditDialog } from './EditDialog'

export function SettingsPage() {
  const settings = useQuery(adminQuery<Envelope<Setting[]>>('settings'))
  const [editing, setEditing] = useState<Setting | null>(null)
  return (
    <>
      <PageHeading
        icon="settings"
        eyebrow="Administration"
        title="Paramètres"
        description="Les règles provisoires restent soumises à la validation de l’hôtel."
      />
      <PageOverview
        items={[
          {
            label: 'Paramètres',
            value: settings.data?.data.length,
            hint: 'Règles de configuration',
            icon: 'settings',
          },
          {
            label: 'Validés',
            value: settings.data
              ? settings.data.data.filter((s) => s.status === 'VALIDATED').length
              : undefined,
            hint: 'Règles déjà confirmées',
            icon: 'check',
          },
          {
            label: 'Provisoires',
            value: settings.data
              ? settings.data.data.filter((s) => s.status !== 'VALIDATED').length
              : undefined,
            hint: 'À faire valider par l’hôtel',
            icon: 'clock',
          },
          {
            label: 'Modifiables',
            value: settings.data ? settings.data.data.filter((s) => s.editable).length : undefined,
            hint: 'Réglages autorisés dans l’interface',
            icon: 'edit',
          },
        ]}
      />
      {settings.isPending ? (
        <LoadingBlock />
      ) : (
        settings.data?.data.map((s) => (
          <Panel
            key={s.key}
            title={s.label}
            subtitle={s.help}
            action={
              <Badge
                tone={s.status === 'VALIDATED' ? 'green' : 'amber'}
                label={s.status === 'VALIDATED' ? 'Validé' : 'Provisoire'}
              />
            }
          >
            <div className="filterbar">
              <strong>
                {Array.isArray(s.value)
                  ? s.value.map((v) => s.options?.[v] ?? v).join(', ')
                  : typeof s.value === 'boolean'
                    ? s.value
                      ? 'Oui'
                      : 'Non'
                    : (s.options?.[String(s.value)] ?? String(s.value ?? 'Non défini'))}
              </strong>
              <span className="caption">{s.reference}</span>
              {s.editable && (
                <button className="secondary" onClick={() => setEditing(s)}>
                  <Icon name="edit" size={17} />
                  Modifier
                </button>
              )}
            </div>
          </Panel>
        ))
      )}
      {editing &&
        (editing.type === 'methods' ? (
          <MethodsDialog setting={editing} onClose={() => setEditing(null)} />
        ) : (
          <EditDialog
            title={editing.label}
            path={`settings/${editing.key}`}
            method="put"
            fields={[
              {
                name: 'value',
                label: editing.label,
                type: 'number',
                required: true,
                min: editing.min ?? 0,
                max: editing.max ?? 100,
              },
            ]}
            initial={{ value: String(editing.value) }}
            transform={(v) => ({ value: Number(v.value) })}
            onClose={() => setEditing(null)}
          />
        ))}
    </>
  )
}
function MethodsDialog({ setting, onClose }: { setting: Setting; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(setting.value) ? setting.value : [],
  )
  const cache = useQueryClient()
  const { notify } = useToast()
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/settings/${setting.key}`, { value: selected }),
    onSuccess: () => {
      void cache.invalidateQueries()
      notify('Moyens de paiement mis à jour')
      onClose()
    },
  })
  return (
    <Modal
      title={setting.label}
      onClose={onClose}
      onSubmit={() => save.mutate()}
      submitting={save.isPending}
      submitDisabled={selected.length === 0}
    >
      <div className="fields">
        {Object.entries(setting.options ?? {}).map(([value, label]) => (
          <label className="check" key={value}>
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={(e) =>
                setSelected(
                  e.target.checked ? [...selected, value] : selected.filter((v) => v !== value),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
    </Modal>
  )
}
