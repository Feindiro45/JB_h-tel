import { Link } from 'react-router'
import { EmptyState, PageHeading, Panel } from '../../shared/ui/layout'

/** Écran annoncé dans la navigation mais livré dans une étape suivante de la phase 6. */
export function UpcomingPage({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <>
      <PageHeading eyebrow={eyebrow} title={title} description={description} />
      <Panel title="Écran en préparation">
        <EmptyState title="Bientôt disponible">
          Cet écran arrive dans la prochaine étape. En attendant, les encaissements et les factures
          se gèrent depuis la <Link to="/reservations">fiche de chaque réservation</Link>.
        </EmptyState>
      </Panel>
    </>
  )
}

/** Compte actif mais sans aucune permission d'écran. */
export function NoAccessPage() {
  return (
    <PageHeading
      eyebrow="Accès"
      title="Accès à configurer"
      description="Votre compte est actif, mais aucun écran ne vous est encore attribué. Contactez l’administrateur."
    />
  )
}
