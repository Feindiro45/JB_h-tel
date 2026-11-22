import { Icon, type IconName } from '../../shared/ui/Icon'
import { Panel } from '../../shared/ui/layout'

interface Situation {
  icon: IconName
  title: string
  cashier: string[]
  admin: string[]
}

/** Guide « Comment gérer » (lot 4A.7) : une fiche caissière et une fiche administrateur par cas. */
const SITUATIONS: Situation[] = [
  {
    icon: 'cloudOff',
    title: 'Coupure d’Internet',
    cashier: [
      'La pastille passe à « Hors ligne » : continuez à travailler normalement.',
      'Réservations, encaissements, arrivées, départs, factures : tout est gardé sur le poste, avec des numéros provisoires LOC-… et FAC-LOC-….',
      'Remettez au client le reçu ou la facture provisoire ; la version définitive sera imprimable au retour du réseau.',
      'Au-delà d’une heure, exportez une sauvegarde chiffrée (Synchronisation → Exporter une sauvegarde) sur une clé USB.',
    ],
    admin: [
      'Le poste principal apparaît « Silencieux » ici : c’est normal pendant une coupure.',
      'Aucune limite de durée : le poste peut travailler un mois sans Internet.',
      'Vérifiez avec la caissière qu’une sauvegarde est exportée régulièrement.',
    ],
  },
  {
    icon: 'refresh',
    title: 'Retour du réseau',
    cashier: [
      'Tout part automatiquement, dans l’ordre, en quelques minutes s’il y a beaucoup d’opérations.',
      'Ouvrez Synchronisation : chaque opération passe « Envoyée » ; une opération « Refusée » donne sa cause.',
      'Réimprimez les reçus et factures définitifs (REC-…, FAC-…) si le client les demande.',
    ],
    admin: [
      'Ouvrez le centre de synchronisation : les refus « À examiner » apparaissent en premier.',
      'Pour chaque refus, ressaisissez l’opération en ligne si elle est justifiée, puis notez « Ressaisie » avec un motif ; sinon « Rejet confirmé ».',
    ],
  },
  {
    icon: 'cash',
    title: 'Changement de poste planifié',
    cashier: [
      'Avant le changement : « Mettre à jour en ligne » pour envoyer toutes les opérations en attente.',
      'Vérifiez dans Synchronisation qu’il ne reste rien « En attente ».',
    ],
    admin: [
      'Postes de caisse → désigner le nouveau poste principal (transfert planifié).',
      'Sur le nouveau poste : « Tout télécharger pour le hors ligne » avant la prochaine coupure.',
    ],
  },
  {
    icon: 'close',
    title: 'Panne ou vol du poste',
    cashier: [
      'Les opérations encore sur le poste ne sont que dans son navigateur : seule la dernière sauvegarde exportée permet de les retrouver.',
      'Sur un autre poste : Synchronisation → Restaurer une sauvegarde, avec son mot de passe.',
    ],
    admin: [
      'Postes de caisse → transfert forcé vers un autre poste, avec motif ; révoquez le poste volé.',
      'Les opérations restaurées partent avec la session de leur auteur : chaque caissière concernée se connecte sur le nouveau poste.',
      'Rien n’est enregistré deux fois : une opération déjà reçue est reconnue (doublon évité).',
    ],
  },
  {
    icon: 'rooms',
    title: 'Chambre prise entre-temps (conflit)',
    cashier: [
      'Une réservation faite hors ligne peut être refusée si un autre poste a pris la chambre pendant la coupure.',
      'Les opérations qui en dépendent (avance, facture) sont refusées avec la même cause.',
    ],
    admin: [
      'Proposez une autre chambre au client, créez la réservation en ligne et ressaisissez l’avance.',
      'Notez ensuite la réservation refusée « Ressaisie », avec le nouveau numéro en motif.',
    ],
  },
  {
    icon: 'archive',
    title: 'Sauvegardes et restauration',
    cashier: [
      'Exporter : Synchronisation → Exporter une sauvegarde ; choisissez un mot de passe (8 caractères au moins) et notez-le à part.',
      'Restaurer : Synchronisation → Restaurer une sauvegarde ; seules les opérations absentes sont ajoutées.',
    ],
    admin: [
      'La date de la dernière sauvegarde du poste principal est affichée ci-dessus.',
      'Le fichier est chiffré : sans le mot de passe, personne ne peut le lire.',
    ],
  },
]

export function OfflineGuide() {
  return (
    <Panel
      title="Comment gérer"
      subtitle="Une fiche pour la caissière et une pour l’administrateur, situation par situation."
    >
      <div className="panel-body offline-guide">
        {SITUATIONS.map((situation) => (
          <details key={situation.title} className="offline-guide__item">
            <summary>
              <span className="offline-guide__icon" aria-hidden="true">
                <Icon name={situation.icon} size={20} />
              </span>
              {situation.title}
            </summary>
            <div className="offline-guide__sheets">
              <section aria-label={`${situation.title} : caissière`}>
                <h3>
                  <Icon name="people" size={16} /> Caissière
                </h3>
                <ol>
                  {situation.cashier.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
              <section aria-label={`${situation.title} : administrateur`}>
                <h3>
                  <Icon name="shield" size={16} /> Administrateur
                </h3>
                <ol>
                  {situation.admin.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            </div>
          </details>
        ))}
      </div>
    </Panel>
  )
}
