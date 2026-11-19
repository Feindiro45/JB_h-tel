import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorDialog } from './ErrorDialog'

function Harness() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  return (
    <>
      <label>
        Nom du client
        <input value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <button type="button" onClick={() => setOpen(true)}>
        Enregistrer
      </button>
      {open && (
        <ErrorDialog
          title="Données invalides"
          message="Corrigez les champs signalés."
          details={['Le champ téléphone est obligatoire.']}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

describe('ErrorDialog', () => {
  it('est une alertdialog nommée et décrite, avec les détails de correction', () => {
    render(
      <ErrorDialog
        title="Accès refusé"
        message="Opération non autorisée."
        details={['Détail']}
        onClose={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('alertdialog', { name: /Accès refusé/ })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/Opération non autorisée\./)
    expect(screen.getByText('Détail')).toBeInTheDocument()
  })

  it('place le focus sur « Fermer », le piège dans la modale et le rend à la fermeture', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Nom du client'), 'Mbaïkoua')
    const trigger = screen.getByRole('button', { name: 'Enregistrer' })
    await user.click(trigger)

    const close = screen.getByRole('button', { name: 'Fermer' })
    expect(close).toHaveFocus()

    await user.tab()
    expect(close).toHaveFocus()

    await user.click(close)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    // Les saisies sont conservées après la fermeture.
    expect(screen.getByLabelText('Nom du client')).toHaveValue('Mbaïkoua')
  })

  it('se ferme avec la touche Échap', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ErrorDialog title="Erreur" message="Message." onClose={onClose} />)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
