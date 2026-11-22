import type { Tutorial } from '../shared/ui/Tutorial'

/**
 * Tutoriels des sections du menu (lot T, demande de l'utilisateur du 21/11/2026), indexés par le
 * chemin de la section dans `navigation.ts`. Le contenu suit les règles réellement appliquées ;
 * les règles provisoires sont signalées comme telles.
 */
export const TUTORIALS: Record<string, Tutorial> = {
  '/tableau-de-bord': {
    section: 'Vue d’ensemble',
    steps: [
      {
        title: 'Les chiffres du jour',
        icon: 'dashboard',
        body: 'Le haut de la page résume l’activité : encaissé aujourd’hui, encaissé sur 7 jours, facturé du mois et créances.',
        points: [
          'Encaissé : versements valides moins remboursements, à leur date.',
          'Facturé : montant des factures émises, avoirs déduits.',
          'Créances : reste à payer des séjours non soldés.',
        ],
        tip: 'Ces trois montants ne se confondent pas : un séjour peut être facturé sans être encore payé.',
      },
      {
        title: 'Arrivées et départs du jour',
        icon: 'calendar',
        body: 'Les listes du jour montrent les clients attendus et ceux qui doivent partir. Cliquez sur une ligne pour ouvrir la réservation.',
      },
      {
        title: 'Occupation des chambres',
        icon: 'rooms',
        body: 'Chaque chambre a un état calculé, jamais saisi à la main.',
        points: ['Libre : vert.', 'Réservée : bleu.', 'Occupée : rouge.', 'Maintenance : ambre.'],
      },
      {
        title: 'Alertes de départ',
        icon: 'bell',
        body: 'La cloche de la barre du haut compte les séjours dont l’heure de départ est dépassée. Elle s’actualise toutes les 30 secondes.',
        tip: 'Traitez les alertes depuis le menu « Alertes » : départ réel ou prolongation.',
      },
    ],
  },
  '/reservations': {
    section: 'Réservations',
    steps: [
      {
        title: 'Créer une réservation',
        icon: 'plus',
        body: 'Cliquez sur « + Nouvelle réservation ». Choisissez un client existant ou créez sa fiche, puis indiquez le titulaire et les autres occupants.',
        tip: 'La capacité de la chambre est vérifiée : le prix est par chambre, quel que soit le nombre d’occupants.',
        points: [
          'Sans réseau : chambres libres et prix sont calculés sur le poste ; la réservation, marquée « en attente d’envoi », part au retour du réseau.',
        ],
      },
      {
        title: 'Période et forfait',
        icon: 'calendar',
        body: 'Saisissez les dates ; les heures sont facultatives.',
        points: [
          'Journée : le nombre de jours se calcule entre les dates (du 20 au 23 = 3 jours, une journée au minimum).',
          'Demi-journée : 12 h au plus. Au-delà, une prolongation avec supplément doit être validée.',
          'Sans heure, la chambre est bloquée sur les journées entières (règle prudente, provisoire).',
        ],
      },
      {
        title: 'Remise et règlement',
        icon: 'cash',
        body: 'Une remise (pourcentage ou montant) exige un motif. Le règlement peut être différé, intégral ou une avance.',
        points: [
          'Plafond de remise de la caissière : 10 % (provisoire, réglable par l’administrateur).',
          'Chaque versement donne un reçu ; le prix est figé à la confirmation.',
        ],
      },
      {
        title: 'Suivre le séjour',
        icon: 'eye',
        body: 'Depuis la fiche : arrivée, départ, prolongation (aperçu du supplément puis validation), annulation avec remboursement de l’encaissé, facture et ticket 80 mm.',
        tip: 'Une même opération envoyée deux fois (double clic, réseau lent) n’est enregistrée qu’une fois.',
      },
      {
        title: 'Retrouver une réservation',
        icon: 'search',
        body: 'Les filtres s’appliquent tout seuls : la recherche attend une courte pause dans la saisie. Changez de page en bas du tableau.',
      },
    ],
  },
  '/alertes': {
    section: 'Alertes',
    steps: [
      {
        title: 'Départs dépassés',
        icon: 'bell',
        body: 'Un séjour en cours dont la fin est passée apparaît ici. La chambre reste bloquée tant que le départ n’est pas enregistré.',
      },
      {
        title: 'Traiter une alerte',
        icon: 'check',
        body: 'Ouvrez le séjour depuis sa ligne, puis enregistrez le départ réel ou prolongez le séjour.',
        tip: 'Aucun supplément n’est appliqué automatiquement : il faut toujours le valider.',
      },
      {
        title: 'Filtrer et suivre',
        icon: 'filter',
        body: 'Filtrez par chambre, client ou forfait. La liste s’actualise toutes les 30 secondes tant que la page est visible.',
      },
    ],
  },
  '/disponibilites': {
    section: 'Disponibilités',
    steps: [
      {
        title: 'Lire le planning',
        icon: 'rooms',
        body: 'Chaque ligne est une chambre, chaque colonne une journée. La couleur et le libellé donnent l’état : libre, réservée, occupée ou maintenance.',
      },
      {
        title: 'Changer la période',
        icon: 'calendar',
        body: 'Choisissez le premier jour et la durée (7 ou 14 jours), puis filtrez par catégorie de chambre.',
      },
      {
        title: 'Réserver depuis le planning',
        icon: 'plus',
        body: 'Le bouton « + Nouvelle réservation » ouvre la même saisie que dans « Réservations ». Le serveur vérifie toujours qu’il n’y a pas de double réservation.',
        tip: 'Une chambre en maintenance ne peut pas être réservée.',
      },
    ],
  },
  '/clients': {
    section: 'Clients',
    steps: [
      {
        title: 'Rechercher un client',
        icon: 'search',
        body: 'Tapez un nom, un téléphone ou une ville : la liste se filtre automatiquement.',
      },
      {
        title: 'Créer ou modifier une fiche',
        icon: 'people',
        body: 'La fiche reste minimale : nom, prénoms, téléphone, e-mail, ville et pays d’origine, adresse, pièce d’identité si nécessaire.',
        tip: 'Ne collectez que les informations utiles au séjour.',
      },
      {
        title: 'Historique et e-mails',
        icon: 'mail',
        body: 'La fiche liste les séjours du client. Les confirmations par e-mail ne partent que si le client les accepte ; il peut se désinscrire.',
      },
    ],
  },
  '/synchronisation': {
    section: 'Synchronisation et sauvegardes',
    steps: [
      {
        title: 'Lire l’état du poste',
        icon: 'dashboard',
        body: 'Quatre repères en haut de page : connexion au serveur, disque du poste, opérations à envoyer, dernière sauvegarde. Les camemberts détaillent le stockage, les opérations et les synchronisations ; survolez une part pour son chiffre.',
      },
      {
        title: 'Travailler sans réseau',
        icon: 'globe',
        body: 'Sans réseau, la pastille passe à « Hors ligne ». Les écrans gardés restent consultables. Réservations (chambres libres et prix calculés sur le poste), clients, encaissements (reçu provisoire LOC-…), arrivées, départs, prolongations et annulations sont gardés sur le poste.',
        tip: 'Au retour du réseau, tout part automatiquement ; le serveur revalide chaque opération.',
      },
      {
        title: 'Mettre à jour en local, en ligne',
        icon: 'refresh',
        body: '« Mettre à jour en local » télécharge les données et les écrans essentiels. « Mettre à jour en ligne » envoie les opérations en attente ; un refus garde sa cause : « Réessayer » ou « Abandonner » avec motif.',
        tip: 'Lancez la mise à jour en local avant une coupure annoncée.',
      },
      {
        title: 'Protéger les données du poste',
        icon: 'shield',
        body: 'Le disque du poste est « Protégé » quand le navigateur s’engage à ne rien effacer de lui-même. Sinon, installez l’application ou cliquez sur « Protéger ».',
      },
      {
        title: 'Sauvegarder et restaurer',
        icon: 'download',
        body: '« Exporter une sauvegarde » chiffre les opérations pas encore reçues par le serveur, avec un mot de passe. Un rappel s’affiche si une opération attend depuis plus d’une heure.',
        points: [
          'Gardez le fichier sur une clé USB, le mot de passe à part.',
          '« Restaurer » sur un autre poste : aucune opération n’est enregistrée deux fois.',
        ],
      },
      {
        title: 'Verrou de sécurité',
        icon: 'key',
        body: 'Hors ligne, l’écran se verrouille après 15 min sans activité ; votre mot de passe le déverrouille. Aucune limite de durée : le poste peut travailler un mois sans Internet.',
      },
    ],
  },
  '/caisse': {
    section: 'Caisse',
    steps: [
      {
        title: 'Le journal de caisse',
        icon: 'cash',
        body: 'Choisissez la période : le journal liste les versements et remboursements, avec les totaux encaissé, remboursé et net.',
        points: [
          'Totaux par moyen de paiement et par agent.',
          'Un encaissement annulé reste visible, mais n’est pas compté.',
        ],
      },
      {
        title: 'Encaisser',
        icon: 'wallet',
        body: 'Ouvrez la réservation puis « Encaisser ». Le montant ne peut pas dépasser le reste dû, et chaque versement reçoit un reçu numéroté.',
        tip: 'Une avance de 20 000 sur 50 000 laisse un solde de 30 000.',
      },
      {
        title: 'Reçu et ticket 80 mm',
        icon: 'print',
        body: 'Sur chaque ligne : « Reçu » (format A4) ou « Ticket » (imprimante thermique, 80 ou 58 mm). Réimprimer ne crée aucune opération.',
      },
      {
        title: 'Corriger une saisie',
        icon: 'undo',
        body: 'La caissière peut annuler, avec un motif, son propre encaissement du jour. Les remboursements et les autres annulations sont réservés à l’administrateur.',
        tip: 'Un encaissement n’est jamais supprimé : il est annulé et reste tracé.',
      },
    ],
  },
  '/documents': {
    section: 'Factures et reçus',
    steps: [
      {
        title: 'Factures et avoirs',
        icon: 'document',
        body: 'Une facture est figée à son émission : numéro unique et montants enregistrés. Elle ne se modifie jamais.',
      },
      {
        title: 'Imprimer ou vérifier',
        icon: 'print',
        body: 'Ouvrez le PDF A4 avec son QR code de vérification, ou imprimez le ticket 80 mm.',
        points: [
          'Le lien « Vérification » permet au client de contrôler l’authenticité de la facture.',
        ],
      },
      {
        title: 'Corriger par un avoir',
        icon: 'undo',
        body: 'Pour corriger une facture, l’administrateur émet un avoir motivé ; la facture passe « annulée par avoir ».',
      },
      {
        title: 'Reçus',
        icon: 'cash',
        body: 'L’onglet « Reçus » liste chaque versement, avec son reçu A4 et son ticket.',
      },
    ],
  },
  '/rapports': {
    section: 'Rapports',
    steps: [
      {
        title: 'Choisir la période',
        icon: 'calendar',
        body: 'Indiquez les dates : tous les indicateurs se recalculent sur cette période.',
      },
      {
        title: 'Trois montants distincts',
        icon: 'chart',
        body: 'Le rapport sépare le facturé, le chiffre d’affaires et l’encaissé. Chacun a sa définition et se rapproche des opérations enregistrées.',
      },
      {
        title: 'Exporter',
        icon: 'download',
        body: 'Exportez en CSV pour un tableur, ou en PDF pour l’archive.',
      },
    ],
  },
  '/admin/chambres': {
    section: 'Chambres et catégories',
    steps: [
      {
        title: 'Catégories',
        icon: 'layers',
        body: 'Une catégorie (VIP, Standard…) regroupe des chambres. Les tarifs sont définis par catégorie.',
      },
      {
        title: 'Chambres',
        icon: 'rooms',
        body: 'Chaque chambre a un numéro unique, une catégorie et une capacité. L’état actuel (libre, réservée, occupée) s’affiche à côté.',
      },
      {
        title: 'Maintenance et suppression',
        icon: 'tool',
        body: 'Une chambre en maintenance ne peut pas être réservée. La suppression définitive est réservée à l’administrateur, seulement pour une chambre jamais utilisée.',
      },
    ],
  },
  '/admin/tarifs': {
    section: 'Tarifs',
    steps: [
      {
        title: 'Tarifs versionnés',
        icon: 'cash',
        body: 'Chaque catégorie a un tarif par forfait (journée, demi-journée). Un changement crée une nouvelle version, avec une date d’effet.',
      },
      {
        title: 'Publier une version',
        icon: 'plus',
        body: 'La nouvelle version prend le relais à sa date d’effet. Une version encore programmée peut être retirée.',
      },
      {
        title: 'Les prix passés ne bougent pas',
        icon: 'shield',
        body: 'Une réservation garde le prix de sa confirmation et une facture reste figée. Passer de 50 000 à 60 000 FCFA ne change pas une facture déjà émise à 50 000.',
      },
    ],
  },
  '/admin/utilisateurs': {
    section: 'Utilisateurs et accès',
    steps: [
      {
        title: 'Créer un compte',
        icon: 'people',
        body: 'Saisissez le nom, l’e-mail et le rôle. Sans mot de passe, la personne reçoit une invitation valable 72 h pour choisir le sien.',
      },
      {
        title: 'Rôles et droits',
        icon: 'key',
        body: 'Deux rôles : administrateur et caissière. Les droits sensibles (suppression définitive, postes de caisse) sont réservés à l’administrateur.',
      },
      {
        title: 'Désactiver',
        icon: 'close',
        body: 'Un compte n’est jamais supprimé : désactivez-le pour couper l’accès en gardant l’historique.',
      },
    ],
  },
  '/admin/postes': {
    section: 'Postes de caisse',
    steps: [
      {
        title: 'Chaque navigateur est un poste',
        icon: 'cash',
        body: 'Un appareil connecté s’enregistre tout seul (« Poste 3 »). Renommez les postes de l’hôtel pour les reconnaître (« CAISSE-01 »).',
      },
      {
        title: 'Désigner le poste principal',
        icon: 'check',
        body: 'Le poste principal est le seul à enregistrer réservations et encaissements quand la règle est active.',
        points: [
          'Transfert planifié : l’ancien poste répond encore.',
          'Transfert forcé : l’ancien poste est silencieux (panne, vol) ; motif et confirmation obligatoires.',
        ],
      },
      {
        title: 'Activer la règle',
        icon: 'shield',
        body: 'Une fois le poste principal désigné et vérifié, activez la règle : les autres postes passent en consultation.',
      },
      {
        title: 'Révoquer un poste',
        icon: 'close',
        body: 'Un poste qui ne doit plus servir est révoqué, avec un motif. Il reste dans l’historique et peut être réactivé.',
      },
    ],
  },
  '/admin/parametres': {
    section: 'Paramètres',
    steps: [
      {
        title: 'Règles par domaine',
        icon: 'settings',
        body: 'Les règles sont rangées par domaine : remises, encaissements, réservations, facturation, postes de caisse.',
      },
      {
        title: 'Validé ou provisoire',
        icon: 'clock',
        body: 'Une règle « Provisoire » attend la validation de l’hôtel. Seules les règles marquées modifiables se changent ici ; les autres sont fixées par une décision.',
      },
      {
        title: 'Envoi des e-mails',
        icon: 'mail',
        body: 'En bas de page, vérifiez la configuration de l’envoi et envoyez un e-mail de test.',
      },
    ],
  },
  '/admin/audit': {
    section: 'Journal d’audit',
    steps: [
      {
        title: 'Ce qui est tracé',
        icon: 'document',
        body: 'Les actions sensibles sont inscrites : tarifs, remises, prolongations, annulations, remboursements, suppressions, droits, postes de caisse.',
      },
      {
        title: 'Retrouver une action',
        icon: 'filter',
        body: 'Filtrez par action, auteur ou période. Chaque ligne montre l’état avant et après le changement.',
      },
    ],
  },
  '/admin/etat': {
    section: 'État du système',
    steps: [
      {
        title: 'Les services',
        icon: 'settings',
        body: 'La page vérifie l’API, la base de données et l’envoi des e-mails.',
      },
      {
        title: 'En cas de problème',
        icon: 'bell',
        body: 'Un service injoignable est signalé en clair. Notez l’heure et l’écran concerné, puis prévenez l’administrateur du serveur.',
      },
    ],
  },
}
