import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { useFocusTrap } from './useFocusTrap'
import './tutorial.css'

/** Étape d'un tutoriel : un titre, une explication, des points clés et un conseil facultatif. */
export interface TutorialStep {
  title: string
  icon: IconName
  body: string
  points?: string[]
  tip?: string
}

/** Tutoriel d'une section du menu (lot T) : contenu propre à chaque section. */
export interface Tutorial {
  section: string
  steps: TutorialStep[]
}

/** Petit bouton « Tutoriel » placé dans l'en-tête de la page de la section. */
export function TutorialButton({ tutorial, icon }: { tutorial: Tutorial; icon?: IconName }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="secondary tutorial-button"
        aria-label={`Tutoriel : ${tutorial.section}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="help" size={17} />
        Tutoriel
      </button>
      {open && <TutorialDialog tutorial={tutorial} icon={icon} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * Fenêtre pas à pas : bandeau de la section, progression animée, illustration de chaque étape,
 * glissement selon le sens de lecture, points clés et conseil. Accessible : dialogue, focus
 * piégé, Échap, flèches du clavier, retour du focus ; animations coupées si l'utilisateur
 * demande de réduire les mouvements.
 */
export function TutorialDialog({
  tutorial,
  icon = 'help',
  onClose,
}: {
  tutorial: Tutorial
  icon?: IconName
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<'next' | 'previous'>('next')
  const dialogRef = useRef<HTMLDivElement>(null)
  const trapTab = useFocusTrap(dialogRef)
  const steps = tutorial.steps
  const step = steps[index]!
  const last = index === steps.length - 1
  const progress = ((index + 1) / steps.length) * 100

  function go(next: number) {
    if (next < 0 || next >= steps.length || next === index) return
    setDirection(next > index ? 'next' : 'previous')
    setIndex(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'ArrowRight') go(index + 1)
    if (event.key === 'ArrowLeft') go(index - 1)
    trapTab(event)
  }

  return createPortal(
    <div className="modal-backdrop tutorial-backdrop">
      <div
        ref={dialogRef}
        className="modal tutorial"
        role="dialog"
        aria-modal="true"
        aria-label={`Tutoriel — ${tutorial.section}`}
        onKeyDown={handleKeyDown}
      >
        <header className="tutorial-hero">
          <span className="tutorial-hero__icon" aria-hidden="true">
            <Icon name={icon} size={26} />
          </span>
          <div className="tutorial-hero__text">
            <p className="tutorial-hero__eyebrow">Tutoriel</p>
            <h2>{tutorial.section}</h2>
            <p aria-live="polite">
              Étape {index + 1} sur {steps.length}
            </p>
          </div>
          <button
            type="button"
            className="tutorial-hero__close"
            aria-label="Fermer"
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        <div
          className="tutorial-progress"
          role="progressbar"
          aria-label="Progression du tutoriel"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="dialog-body tutorial-body">
          <section
            key={index}
            className={`tutorial-step tutorial-step--${direction}`}
            aria-label={`Étape ${index + 1} : ${step.title}`}
          >
            <div className="tutorial-visual" aria-hidden="true">
              <span className="tutorial-visual__ring" />
              <span className="tutorial-visual__icon">
                <Icon name={step.icon} size={40} />
              </span>
              <span className="tutorial-visual__badge">{index + 1}</span>
            </div>
            <div className="tutorial-content">
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              {step.points && (
                <ul className="tutorial-points">
                  {step.points.map((point, i) => (
                    <li key={point} style={{ '--i': i } as CSSProperties}>
                      <span className="tutorial-points__check" aria-hidden="true">
                        <Icon name="check" size={13} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              )}
              {step.tip && (
                <div className="tutorial-tip">
                  <span className="tutorial-tip__icon" aria-hidden="true">
                    <Icon name="idea" size={18} />
                  </span>
                  <p>
                    <strong>Conseil :</strong> {step.tip}
                  </p>
                </div>
              )}
            </div>
          </section>

          <nav className="tutorial-dots" aria-label="Étapes du tutoriel">
            {steps.map((s, i) => (
              <button
                key={s.title}
                type="button"
                className={i === index ? 'is-current' : i < index ? 'is-done' : undefined}
                aria-label={`Étape ${i + 1} : ${s.title}`}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => go(i)}
              />
            ))}
          </nav>
        </div>

        <div className="dialog-foot tutorial-foot">
          <button type="button" className="secondary" onClick={onClose}>
            <Icon name="close" size={17} />
            Fermer
          </button>
          <span className="tutorial-foot__spacer" />
          <button
            type="button"
            className="secondary"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            <Icon name="back" size={17} />
            Précédent
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => (last ? onClose() : go(index + 1))}
          >
            <Icon name={last ? 'check' : 'arrow'} size={17} />
            {last ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
