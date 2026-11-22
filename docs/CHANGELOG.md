# Journal des modifications — JB Hôtel

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Module administrateur « Mode hors ligne » (lot 4A) et hors ligne vérifié écran par écran — 22/11/2026
- **Administration → Mode hors ligne** : état du poste principal (en ligne, silencieux depuis…), opérations en attente, dernière synchronisation et sauvegarde, tous les postes ; chiffres du jour ; **centre de synchronisation** (acceptées, doublons évités, refus avec leur cause) et examen des refus, inscrit au journal d’audit ; **guide « Comment gérer »** ; encart sur le tableau de bord de l’administrateur.
- Paramètres → **Hors ligne** : opérations permises sans Internet, verrouillage, rappel de sauvegarde, préfixe des numéros provisoires (valeurs provisoires), appliqués aussi sans réseau.
- Hors ligne, **tous les écrans métier** s’ouvrent après « Tout télécharger » : soldes de la caisse, reçus, rapports et tarifs ajoutés ; planning et occupation calculés sur le poste pour toute période.
- `npm run hors-ligne` : version de production sur ce PC (http://localhost:4173) pour essayer le vrai mode hors ligne.
- Utilisateurs, journal d’audit et paramètres ne sont jamais copiés sur le poste.
- Corrigé : en-tête de rejeu hors ligne autorisé par la configuration CORS (sans lui, le poste se croyait hors ligne au retour du réseau).
- Tests : 253 tests backend, 192 tests frontend.

### Tout fonctionne hors ligne, fin du lot 4 (4.13, N-08) — 22/11/2026
- Hors ligne : **confirmer** une réservation en attente, **changer les occupants**, **modifier** une réservation (mêmes règles qu’en ligne) et **émettre une facture provisoire** `FAC-LOC-…`, imprimable en ticket 80 mm marqué « Provisoire » ; le serveur lui donne son numéro FAC définitif au retour du réseau (décision N-08).
- Sur une réservation créée hors ligne, toutes les actions sont possibles, sauf la suppression.
- Tests : 186 tests frontend ; recette de production : 5 opérations faites hors ligne acceptées par le serveur, facture `FAC-LOC-… → FAC-…`.

### Réservation hors ligne (lot 4, 4.5) — 22/11/2026
- Hors ligne, **nouvelle réservation** comme en ligne : chambres libres et prix calculés sur le poste avec les règles du serveur ; **nouveau client** et recherche parmi les clients gardés ; **prolongation** et **annulation**.
- Un élément créé hors ligne peut déjà servir : encaisser une avance sur une réservation qui n’est pas encore sur le serveur. Au retour du réseau, tout part dans l’ordre, chaque élément reçoit son identifiant définitif et la fiche s’ouvre d’elle-même sur la version du serveur.
- Page Synchronisation : la vue d’ensemble reprend les tuiles communes à toutes les pages.
- Tests : 183 tests frontend ; recette de production : coupure, nouveau client, réservation, paiement intégral, retour du réseau, 4 opérations acceptées.

### Hors ligne sans limite de durée, sauvegardes et page Synchronisation visuelle (lot 4, D-064) — 22/11/2026
- **Aucune durée maximale hors ligne** (N-05 révisée par l’utilisateur : l’hôtel peut rester un mois sans Internet) ; le verrou après 15 min d’inactivité reste.
- **« Tout télécharger pour le hors ligne »** : toutes les pages et leurs fiches gardées en un clic, avec barre de progression, au rythme accepté par le serveur.
- **Sauvegarde chiffrée** des opérations en attente (export, restauration sans doublon, rappel après une heure) ; **tableau de bord** : opérations faites hors ligne signalées tant qu’elles ne sont pas confirmées.
- Page **Synchronisation et sauvegardes** refaite : repères à icônes, camemberts (poste et serveur, stockage, opérations, synchronisations), barres du contenu de la copie.
- **Stockage protégé** contre l’effacement par le navigateur ; écritures confirmées sur le disque ; envoi cadencé après une longue coupure.
- **Corrigé :** une donnée non affichée depuis 5 minutes disparaissait de la copie du poste.
- Tests : 169 tests frontend.

### Tout fonctionne hors ligne, première étape (lot 4, D-064) — 22/11/2026
- Hors ligne, **encaissement**, **arrivée** et **départ** sont gardés sur le poste et visibles aussitôt (reçu et ticket `LOC-…` provisoires, solde recalculé, fiche « en attente d’envoi ») ; au retour du réseau, ils partent automatiquement, avec leur clé anti-doublon, et le serveur donne le numéro `REC-…` définitif.
- Menu Synchronisation : panneau « Mettre à jour en ligne » (en attente, envoyées, refusées avec leur cause, « Réessayer », « Abandonner » motivé) ; bandeau des opérations en attente.
- En ligne, les données restaurées de la copie du poste sont toujours rechargées à l’affichage.
- Tests : 153 tests frontend ; recette de production : coupure, encaissement hors ligne, retour du réseau, `REC-…` attribué, un seul enregistrement en base.

### Tutoriels intégrés (lot T) — 21/11/2026
- Bouton « Tutoriel » dans l’en-tête de chaque section du menu (16 sections) : fenêtre pas à pas au contenu propre à chaque section, fidèle aux règles réelles (forfaits, remises, poste principal, mode hors ligne…).
- Design animé : bandeau de la section, barre de progression, illustration par étape, glissement selon le sens de lecture, points clés cochés, conseil, pastilles ; clavier (flèches, Échap) et lecteurs d’écran ; animations coupées si le système demande de réduire les mouvements.

### Consultation hors ligne, synchronisation et application installable (D-064, lot 2) — 21/11/2026
- Compléments après retour de l’utilisateur : listes principales (réservations, alertes, clients, factures, journal du jour) téléchargées par « Mettre à jour en local » ; un écran jamais gardé affiche « Pas encore disponible hors ligne » au lieu d’un chargement sans fin.
- L’application s’ouvre sans réseau une fois chargée en ligne (service worker, production seulement) et **s’installe** comme une application (manifeste, icônes, bouton « Installer l’application »).
- Données consultées gardées sur le poste (IndexedDB) 12 h au plus ; pastille « En ligne / Hors ligne » vérifiée par le serveur ; bandeau hors ligne ; écritures refusées avec le message réseau (enregistrement hors ligne : lot 4).
- Verrou après 15 min d’inactivité hors ligne, mot de passe vérifié localement (empreinte PBKDF2) ; session hors ligne refusée au-delà de 12 h (D-064).
- Nouveau menu **Synchronisation et sauvegardes** : « Mettre à jour en local », historique des synchronisations (résultat, éléments, durée, auteur, cause de chaque échec), dernière copie automatique, contenu de la copie, effacement.
- Tests : 13 tests frontend (143 au total) ; recette navigateur `npm run test:e2e:offline` sur la version de production (coupure, consultation, échec journalisé, verrou, retour du réseau, installabilité).

### Écritures idempotentes, sans doublon (D-063) — 21/11/2026
- En-tête `Idempotency-Key` sur 14 routes d’écriture (réservations, caisse, factures, fiche client) : un envoi répété rend la réponse déjà enregistrée, sans deuxième encaissement ni deuxième séjour ; erreurs jamais mémorisées ; même clé avec d’autres valeurs refusée en français.
- Clé écrite dans la même transaction que l’opération ; deux envois simultanés : un seul enregistrement (test à vrais processus PHP). Table `idempotency_keys`, purge après 30 jours.
- Frontend : une clé par dialogue (encaissement, remboursement, annulation, nouvelle réservation, fiche client), gardée pour les nouveaux essais.
- Tests : 7 tests backend (suite 250/250), 4 tests frontend (130/130).

### Postes de caisse et poste principal unique (D-062) — 21/11/2026
- Chaque navigateur connecté s’enregistre comme poste (jeton secret, empreinte SHA-256 en base) et signale sa présence toutes les 30 s ; pastille « Poste … · principal / consultation » dans la barre du haut.
- Nouvelle page **Administration → Postes de caisse** (droit `workstations.manage`, admin seul) : renommer, désigner le poste principal (première désignation, transfert planifié, transfert forcé avec motif et confirmation), révoquer, réactiver, historique numéroté, procédure « Comment changer de poste principal ».
- Règle provisoire `workstations.enforce_main_post` (désactivée par défaut) : une fois activée, réservations et encaissements sont refusés hors du poste principal (403 en français) ; consultation, devis et fiches clients restent permis. Délai « silencieux » réglable (`workstations.silent_after_minutes`, 5 min). Groupe « Postes de caisse » dans Paramètres, réglage Oui/Non éditable.
- Tables `workstations` et `workstation_assignments` (migrations `2026_11_21_100000` et `100100`). Tests : 6 tests backend, 8 tests frontend, scénario navigateur `workstations`.

### Ticket thermique 80 mm (D-061) — 21/11/2026
- Tickets 80 mm (ou 58 mm) du **reçu d’un versement** (`/documents/recus/:id/ticket`) et d’une **facture ou d’un avoir** (`/documents/factures/:id/ticket`), construits depuis l’API existante ; la facture uniquement depuis l’instantané figé. Jamais « Payé » tant qu’un reste dû subsiste ; aucune taxe ajoutée.
- Impression sur une seule bande : format de page = largeur du rouleau × hauteur mesurée du ticket, injecté seulement sur la page du ticket (les impressions A4 ne changent pas).
- Boutons « Ticket » sur le reçu A4, les actions de paiement, la liste des factures et la fiche réservation. API : `GET /payments/{id}` renvoie aussi la période du séjour (`stay`).
- Tests : 8 tests Vitest (118 au total), `CashierTest` étendu ; scénario navigateur `thermal-ticket` (PDF émulé à 80 et 58 mm).

### Dossier new/ : lancement local et plan — 21/11/2026
- Lecture des spécifications « ticket thermique 80 mm » et « architecture hors ligne ». Plan en lots et décisions N-01 à N-07 dans `SUIVI_NEW.md`.
- Configuration remise entièrement en local à la demande de l’utilisateur (`backend/.env`, `frontend/.env.local`, API sur le port 8000) ; configuration de production sauvegardée dans `backend/.env.production.backup` et `frontend/.env.production.backup` (ignorés par git). Compte de démo administrateur local réactivé.
- Décisions D-061 (ticket 80 mm en complément de l’A4) et D-062 (poste principal unique pour les écritures hors ligne).

### Pages d’erreur et page Paramètres — 20/11/2026 (D-060)
- Pages d’erreur de l’application redessinées sur un composant commun : 404 « Page introuvable », 403 « Accès refusé », « Accès à configurer » et 500 « Erreur inattendue », avec code, message, aide et boutons (accueil, page précédente, recharger).
- Pages d’erreur du serveur pour les liens ouverts hors de l’application (QR code, liens d’e-mail) : 403, 404, 419, 429, 500, 503 et pages génériques 4xx/5xx (par exemple 505), en français, aux couleurs de l’hôtel, sans détail technique ni lien vers l’espace du personnel. L’API garde ses erreurs JSON.
- Page Paramètres redessinée : vue d’ensemble, légende, règles regroupées par domaine (Remises, Encaissements, Réservations, Facturation et caisse), valeur mise en avant, statut Validé/Provisoire, référence et date de modification ; « Modifier » seulement si la règle est modifiable. Aucune règle ni valeur changée.
- Tests : 3 backend (234 au total), 2 frontend nouveaux et le test Paramètres réécrit (109 au total), 1 parcours navigateur qui audite l’accessibilité des pages 404 (8 au total, tous verts). L’audit Axe a révélé un gris trop pâle sur la page Paramètres (contraste 4,41), corrigé à 5,56. Captures PC et mobile inspectées.

### Pages d’accès, mot de passe oublié et vérification de facture — 20/11/2026 (D-059)
- Connexion, mot de passe oublié et choix du mot de passe redessinés sur une mise en page commune (carte centrée sans image, bandeau vert et or, règles du mot de passe vérifiées en direct).
- Mot de passe oublié : le compte est vérifié avant l’envoi du lien (60 minutes, usage unique) ; invitations sur une table de jetons distincte.
- Page publique de vérification de facture redessinée : en-tête de l’hôtel, verdict lisible, montant mis en avant, aide si le document est introuvable.
- CI GitHub entièrement verte depuis la désactivation du JIT de PHP.

### Corrections de la caissière et suppression par l’administrateur — 20/11/2026 (D-058)
- La caissière annule elle-même, avec motif, un encaissement qu’elle a saisi aujourd’hui, puis le ressaisit ; le reste demeure à l’administrateur.
- « Modifier la réservation » : chambre, dates, heures et forfait avant le séjour, avec disponibilité revérifiée, nouveau prix, motif, journal et e-mail au client ; facture remplacée si l’administrateur modifie un séjour facturé.
- « Supprimer » (administrateur seulement) : clients sans séjour, réservations sans argent ni facture, chambres et catégories inutilisées, comptes jamais utilisés ; fenêtre d’avertissement, motif obligatoire, copie complète dans le journal d’audit. Encaissements et factures ne se suppriment jamais.
- Nouveau droit `records.delete`, réservé au rôle administrateur.

### Menu latéral réductible sur PC — 20/11/2026
- Bouton de réduction/déploiement dans la barre du haut ; rail compact de 80 px avec icônes et contenu central qui récupère automatiquement l’espace disponible. Libellés accessibles et infobulles conservés.
- Préférence mémorisée dans le navigateur et restaurée au rechargement ; fonctionnement maintenu si le stockage local est bloqué. Le tiroir mobile reste complet. Décision D-057.
- Tests : conservation du contenu et de la préférence pendant la navigation, restauration et stockage refusé ; contrôle navigateur du clavier, des largeurs réelles, du rechargement, de la déconnexion accessible et du passage PC/mobile, avec audit d’accessibilité.
- Validation : 99 tests frontend, lint, Prettier, TypeScript, build et serveur actif réussis. Deux tests navigateur rejoués (menu PC et charte globale) ; contrôles de largeur à 1 024/1 440/1 920 px et affichages mobiles. Aucun changement de base ni de serveur applicatif.

### Départs dépassés et menu Alertes — 20/11/2026
- Une occupation dont le départ est dépassé ne redevient plus libre dans le planning, la recherche de chambres ou les contrôles de réservation. Le blocage reste actif jusqu’au départ réel ou à une prolongation explicite ; règle commune côté serveur et verrouillage cohérent lors du départ.
- Menu « Alertes », cloche avec compteur réel et page avec vue d’ensemble, recherche client/chambre, filtre par forfait, pagination et liens vers les séjours. Mise à jour toutes les 30 secondes et au retour sur la fenêtre ; suppression de l’alerte après départ ou prolongation. Message de dépassement sur la fiche du séjour.
- Accès protégé par `reservations.view`, UUID publics, aucune nouvelle table ni modification automatique des montants ou factures. Sans heure, la fin de journée demeure la référence. Décision D-056.
- Tests ajoutés : bornes de l’échéance, disponibilité et réservation bloquées, départ/prolongation, conflits avec le client suivant, absence d’heure, pagination, recherche, droits et actualisation du compteur. Contrôle navigateur dédié aux alertes et ajout de la page à la recette visuelle.
- Validation : 222 tests backend, 96 tests frontend et 5 tests navigateur réussis ; Pint, Larastan, lint, Prettier, TypeScript, build et serveur actif vérifiés. Affichages bureau/mobile inspectés et audits d’accessibilité verts. Débordement du fil d’Ariane à 320 px corrigé après ajout de la cloche.

### Calcul automatique des jours — 20/11/2026
- Choix confirmé par l’utilisateur : du 20 au 23 = 3 jours. La création calcule le forfait Journée à chaque changement de date (une unité minimum le même jour), actualise le devis et transmet la quantité calculée. Champ en lecture seule, aide et icône calendrier.
- Prolongation : jours ajoutés calculés entre l’ancien et le nouveau départ ; conservation du prix et de la quantité déjà enregistrés. Demi-journée, contrôle des 12 h et validation du supplément conservés.
- API : refus d’une quantité Journée incohérente au devis, à la création et à la prolongation. Tests sur dates absentes/inversées, changements d’année, année bissextile et réservations existantes ; fixtures des anciens tests alignées en conservant leurs montants et périmètres.
- Décision D-055 et question Q-01 actualisées. Validation complète : 216 tests backend (1 539 assertions), 90 tests frontend, Pint, Larastan, lint, Prettier, TypeScript, build et contrôle du serveur actif réussis. Base de développement préservée ; e-mails simulés pendant les tests.

### Nouvelle invitation — 20/11/2026
- Invitation du compte administrateur réel renvoyée sur demande explicite ; nouveau lien de 72 h, précédent remplacé, envoi confirmé par l’audit applicatif. Aucun jeton enregistré dans la documentation.


### Mot de passe facultatif à la création d’un compte — 20/11/2026
- Formulaire : mention explicite « Mot de passe (facultatif) » et aide précisant l’envoi d’un lien pour choisir son mot de passe ; confirmation à remplir seulement si un mot de passe est saisi.
- Comportement existant vérifié : création sans mot de passe, invitation, définition du mot de passe et connexion. Aucun mot de passe vide imposé ni transmis.
- Validation : 12 tests frontend d’administration, 1 test backend avec 15 assertions, TypeScript, lint, build et contrôle du serveur actif réussis. Tests avec mails simulés, aucun envoi réel supplémentaire.


### Nouveau départ et compte administrateur réel — 20/11/2026
- Base `jb_hotel` sauvegardée puis données métier remises à zéro sur demande explicite ; suppression des 42 anciens envois, sans transmission. Schéma, paramètres, droits et administrateur de référence conservés.
- Nouveau compte administrateur réel créé à l’adresse demandée ; invitation pour choisir son mot de passe envoyée et confirmée par l’audit applicatif.
- Worker propre à la base de l’application démarré pour les notifications futures. L’ancien processus de queue a été identifié sur une autre base et laissé intact.
- Vérifications : données métier vides, zéro envoi en attente/échec, API et base disponibles, connexion frontend affichée sans erreur.


### Authentification SMTP rétablie — 20/11/2026
- Mot de passe SMTP fourni par l’utilisateur appliqué uniquement dans la configuration locale ignorée par Git.
- Connexion chiffrée et authentification LOGIN vérifiées avec succès, sans transmission d’e-mail et sans journaliser le secret.
- 41 notifications restent en attente (36 clients, 5 personnel) ; la remise effective et le démarrage de leur traitement attendent l’accord de l’utilisateur.


### Diagnostic e-mails — 20/11/2026
- Configuration effective vérifiée sans exposer de secret : SMTP de l’hébergeur actif sur 465/SMTPS ; les journaux locaux montrent un refus d’authentification 535.
- File de travail : 41 tâches en attente, aucune réservée, aucun échec définitif. Ancien constat « aucun worker » corrigé : un processus est présent mais antérieur à la configuration actuelle.
- Aucun message envoyé, aucun traitement forcé, aucune tâche supprimée ; les identifiants doivent être vérifiés auprès de l’hébergeur.


### E-mails jamais perdus et CI des parcours — 20/11/2026
- Chaque e-mail (clients et personnel) est retenté pendant 24 h ; après 3 refus du serveur SMTP en 10 minutes, tous les envois se mettent en pause 10 minutes au lieu de répéter des connexions refusées. Bouton « Relancer les envois en échec » dans Paramètres.
- Limite d’API réglable (`API_RATE_LIMIT_PER_MINUTE`, 120 par défaut) : la recette navigateur, qui enchaîne les pages bien plus vite qu’un humain, l’utilise à 1 000. La fenêtre d’erreur d’un test en échec est publiée en annotation GitHub.

### Envoi réel des e-mails, alerte de connexion et invitations — 20/11/2026 (D-054)
- SMTP de l’hébergeur configurable dans `backend/.env` (documenté dans `.env.example` et EXPLOITATION). Panneau « Envoi des e-mails » dans Paramètres et commande `php artisan jb:mail-test` : mode, serveur, expéditeur, file d’attente, e-mail de test, causes d’échec expliquées en français ; aucun secret affiché.
- Alerte par e-mail à chaque connexion d’un membre du personnel (date, heure, adresse IP, navigateur).
- Création de compte sans mot de passe : invitation par e-mail avec un lien à usage unique valable 72 h vers le nouvel écran « Choisir mon mot de passe » ; bouton « Inviter » pour renvoyer un lien ; e-mail de bienvenue quand un mot de passe est saisi.
- Aucun e-mail vers les domaines réservés (`.local`, `.test`…), dont les comptes de démonstration.
- Vérifié par un vrai échange SMTP (serveur de capture local) : 12 contrôles verts. Le serveur de l’hébergeur refuse pour l’instant l’identifiant fourni (535).
- CI : retour à un seul processus PHP pour la recette ; l’état de la page en échec est publié en annotation.

### CI des parcours navigateur — 20/11/2026
- Annotations GitHub : chaque échec Playwright et les dernières erreurs du journal Laravel sont publiés (le journal d’exécution exige les droits d’administrateur du dépôt).
- Performance : le PDF d’une facture n’est plus rendu pour une notification qui ne partira pas (client sans e-mail) ; l’émission redevient immédiate au lieu d’environ 4 secondes, et 8 pour une prolongation facturée.
- Recette : serveur PHP à 4 processus sous Linux (`--no-reload`), parcours complet limité à 2 minutes.

### Annulation et prolongation alignées sur la caisse et la facture — 20/11/2026 (D-053)
- Corrigé : une réservation annulée restait comptée dans la caisse. L’annulation rembourse désormais intégralement ce qui a été encaissé, dans la même opération (montant confirmé, moyen au choix, droit de rembourser exigé), et annule la facture active par un avoir, que le séjour ait été payé ou non.
- Montant dû à 0 pour une réservation annulée sur la fiche, le tableau de bord et les séjours du client, prix initial affiché pour mémoire. Les annulations antérieures encore payées apparaissent dans « Annulations à rembourser » de la caisse.
- Prolongation d’un séjour facturé : l’ancienne facture est annulée par un avoir et une nouvelle facture, émise dans la même opération, détaille le séjour initial et la prolongation (« Facture remplaçant la facture n° … »). Chaque prolongation est enregistrée dans la nouvelle table `reservation_extensions`.
- Tout ou rien : si le remboursement ou la facturation échoue, l’annulation ou la prolongation n’est pas enregistrée. 10 tests backend, 5 tests frontend, 21 contrôles contre un vrai serveur ; MCD complété (28 tables).
- CI : les échecs des parcours navigateur sont publiés en annotations GitHub.

### Relecture finale avant envoi — 19/11/2026
- Relecture des écrans d’administration, des filtres et des rapports produits en parallèle, puis de toute la suite : 183 tests backend, 74 tests frontend, 4 tests navigateur, Pint, Larastan, lint, Prettier, TypeScript et build verts.
- Corrigé : la modification d’une catégorie de chambre renvoyait son code, que le serveur refuse en modification ; chaque enregistrement échouait en 422. Le code n’est plus envoyé, il apparaît dans le titre, et sa saisie à la création suit le format du serveur. Test ajouté.
- Contrats réels de l’administration et des filtres rejoués avec une vraie session sur la base de recette `jb_hotel_e2e` (60 contrôles) : catégories, chambres, maintenance, tarifs immédiat et daté puis retrait, utilisateurs, droits, paramètres, audit, recherche par client, lignes par page et refus de la caissière.
- Suivi : lignes UUID et catalogue de la phase 3 restées non cochées alors qu’elles étaient faites et testées, désormais cochées.

### Vues d’ensemble et tableaux complets — 19/11/2026
- Synthèses réelles sur les pages métier et fiches, périmètres des compteurs précisés, espacement accru entre éléments et icônes sémantiques dans les champs.
- Boutons verts et bleus, alternés lorsqu’ils sont voisins ; cartes différenciées. Aside conservé.
- Filtres et paginations propres aux tableaux secondaires (caisse, dashboard, catégories, tarifs, détails de séjour, planning, rapports et reçu). Recherche locale immédiate, états vides et impression complète des lignes reçues.
- Chambres occupées en rouge, y compris le graphique et les cartes ; occupation courante affichée et filtrable dans la liste des chambres, sous permission.


### Page blanche du serveur de développement — 19/11/2026
- Reproduction de l’erreur d’export `ReservationDetailPage` sur le serveur actif : Vite conservait une transformation vide, alors que le fichier contenait son export.
- Redémarrage du serveur frontend et réoptimisation forcée ; affichage rétabli sur le port 5173.
- Ajout de `npm run check:dev` pour vérifier le chargement réel sur un serveur déjà lancé, sans connexion ni réinitialisation de base. Quatre routes et un rechargement vérifiés, lint vert.


### Facture vert/or et filtres automatiques — 19/11/2026
- PDF inspiré de « Facture élégante du JB Hôtel.webp » : bandeau illustré, monogramme or, icônes, blocs client/séjour, tableau vert, totaux, statut, versements, QR et pied de page numéroté ; même charte pour les avoirs.
- Données figées et historiques conservées. Aucune TVA, échéance, prestation offerte, signature ni cachet ajoutés depuis l’image de référence. Illustration dérivée de l’image déjà utilisée par l’application.
- Recherches serveur différées de 300 ms, choix et dates valides immédiats, retour en première page, suppression des boutons Filtrer/Rechercher des listes. Périodes invalides retenues pendant correction, filtres clients/réservations effaçables ensemble.
- Tests du comportement des filtres, parcours navigateur étendu à la recherche et à l’effacement sans validation. Facture et avoir d’une page, document long de trois pages contrôlés ; QR décodés depuis les PDF rendus. Aside conservé.


### Référence visuelle et boutons — 19/11/2026
- Style du contenu aligné sur l’image fournie : fil d’Ariane, titres avec icônes, cartes pastel, filtres, onglets, tableaux et actions. L’aside est explicitement conservé.
- Page Factures et reçus réorganisée autour des indicateurs réels, des filtres et de la liste ; type des pièces et icônes ajoutés, impression accessible.
- Boutons harmonisés avec icônes, actions sensibles distinctes, confirmations et chargements ; fenêtre de connexion et dialogues cohérents avec la même charte.
- Navigation clavier des onglets conservée malgré leur nouvelle disposition ; affichage monétaire zéro normalisé.


### Design des paginations — 19/11/2026
- Pied de liste commun avec boutons numérotés, page active vert profond et accent doré, ellipses, plage de résultats et sélecteur compact.
- Disposition adaptée à la largeur du panneau, navigation accessible et contrôle aux formats 1440/768/390/320 px ; test navigateur des changements de page, de taille et des résultats vides.
- Correction du débordement mobile des libellés masqués des tableaux ; pagination exclue de l’impression.


### Compléments du 19/11/2026 — Administration, filtres, rapports et livraison locale
- Écrans d’administration complets : chambres/catégories et maintenance, grille/historique et publication/retrait des tarifs, comptes et droits, paramètres signalés comme provisoires/validés, audit filtré avec détail avant/après.
- Filtres client, catégorie et forfait sur les séjours, recherche client sur reçus et instantanés de facture, provenance des clients, annuaires d’agents en UUID, pagination commune et taille de page.
- Rapports financiers filtrés, courbe quotidienne, ventilation par catégorie, soldes et occupation actuels, exports CSV/PDF protégés, rapprochement avec le journal et traitement correct des avoirs/remboursements/annulations.
- Moyens de paiement chargés depuis la configuration ; correction d’une erreur de syntaxe préexistante dans la recherche client et des liens PDF qui supprimaient le Referer nécessaire à Sanctum.
- Playwright : parcours réels sur base isolée, contrôle CSRF, droits, responsive et Axe WCAG ; ajout à la CI MySQL 8.4.
- Sauvegarde native, empreinte SHA-256 et restauration contrôlée dans une base vide distincte ; MCD draw.io aligné sur les 27 tables réelles ; matrice de recette et guide d’exploitation.
- Les validations métier/fiscales, SMTP et papier restent en attente ; aucune mise en production.


### Ajouté
- Phase 0 : audit des spécifications ; `docs/DECISIONS.md` (contradictions et arbitrages), `docs/QUESTIONS.md` (questions métier à valider) ; suivi d'avancement `CHECK_LEVEL.md`.
- Phase 1 : dépôt git ; application `backend/` (Laravel 12, Sanctum, API `/api/v1`, contrat d'erreur JSON en français, endpoint de santé) ; application `frontend/` (React 19 + TypeScript + Vite, routeur, TanStack Query, client API typé, modale d'erreur accessible) ; `infra/docker-compose.yml` (MySQL 8.4) ; CI GitHub Actions ; README.

- Phase 2 :
  - **Schéma de base complet** : 10 migrations, clés étrangères en `RESTRICT`, 20 contraintes `CHECK`, intervalle bloqué indexé ; documenté dans `docs/SCHEMA.md`.
  - **Module Identity** : connexion, déconnexion et profil (Sanctum SPA, CSRF, 5 essais/min) ; gestion des utilisateurs par l'administrateur, avec protections « soi-même » et « dernier administrateur » ; 27 permissions et 2 rôles (spatie/laravel-permission) ; permissions de la caissière modifiables ; commande `jb:create-admin`.
  - **Journal d'audit** (`AuditTrail`), append-only et transactionnel.
  - **Seeders** : rôles, paramètres provisoires (`settings`) et comptes de démonstration (local uniquement).
  - Décisions D-017 à D-025.

- **Identifiants publics UUID** (D-026) :
  - colonne `uuid` sur les 11 tables d'entités ;
  - routes et réponses de l'API uniquement en UUID ;
  - un entier dans une route donne 404.
- Phase 3, module **RoomCatalog** :
  - types de chambre (VIP et Standard en référence) ;
  - chambres individuelles avec tri naturel, recherche, filtres et maintenance tracée ;
  - **tarifs versionnés** demi-journée et journée : publication immédiate ou programmée, chaîne de versions continue, retrait d'une version programmée, historique (ancien et nouveau tarif, auteur, motif) et grille des tarifs en vigueur ;
  - contrats publics `CurrentPriceProvider` et `RoomDirectory` pour le module Reservations ;
  - catalogue de démonstration (local uniquement) ;
  - décisions D-027 et D-028.
- CI : Composer authentifié auprès de GitHub et cache des dépendances.
- Phase 4, module **Customers** : fiche client détaillée en UUID ; recherche (nom, prénoms, téléphone, e-mail, pièce) ; création et modification tracées ; contrat public `CustomerDirectory`.
- Phase 4, module **Reservations** :
  - **période bloquée** calculée (politique provisoire sans heure, D-009) ;
  - **demi-journée jusqu'à 12 h**, au-delà refus avec la quantité nécessaire et le supplément proposés, sans conversion automatique ;
  - **prix figé** (tarif en vigueur à la confirmation, prix par chambre, capacité contrôlée) ;
  - **remises** en pourcentage arrondies au FCFA ou en montant fixe, avec motif, auteur et plafond de la caissière ;
  - devis sans enregistrement ;
  - **anti double réservation** par verrou sur la chambre, testé avec deux vrais processus concurrents ;
  - statuts, confirmation, arrivée, départ, annulation motivée, occupants ;
  - **prolongation** en deux temps (aperçu du supplément, puis confirmation explicite) ;
  - historique des modifications ;
  - **disponibilités** par période et **occupation** à un instant (libre, réservée, occupée, maintenance, réservée plus tard) ;
  - décisions D-029 à D-034 et questions Q-18 à Q-21.
- Erreurs métier : champ `details` (aides à la correction), affiché par la modale du frontend.
- Phase 5A, module **Cashier** :
  - paiements intégraux, partiels ou différés, avec plusieurs versements par réservation ;
  - **un reçu numéroté par versement** (`REC-AAAA-NNNNNN`, numérotation continue sous verrou) ;
  - situation de caisse : montant dû, encaissé, remboursé, encaissé net, solde, statut ;
  - **trop-perçu refusé** ;
  - annulation d'encaissement et **remboursements** tracés, sans jamais supprimer le paiement initial ;
  - données du reçu imprimable ;
  - contrat public `ReservationLedger` côté Reservations ;
  - décision D-035.
- Phase 5B, module **Billing** :
  - factures `FAC-AAAA-NNNNNN` **figées** (instantané complet, versements et solde à l'émission) et immuables ;
  - une facture active par réservation ;
  - **avoirs** `AV-AAAA-NNNNNN` ;
  - **PDF A4** généré côté serveur (dompdf, sous-ensemble de police, environ 30 Ko) ;
  - contrats publics `PaymentHistory` (Cashier) et `invoiceData` (Reservations) ;
  - décision D-037.
- Phase 5C, **QR code de vérification** sur chaque facture et avoir :
  - page publique sans connexion (`/verification/factures/{id}?code=`) et API JSON publique ;
  - code aléatoire par document, réponse identique si le document est inconnu ou le code faux ;
  - données minimales (initiales du client), débit limité ;
  - décision D-038.
- Phase 5D, **e-mails au client** (module Notifications) :
  - si le client a donné son e-mail, un message en français part à chaque opération : confirmation et bienvenue, arrivée, prolongation, annulation, départ, reçu, remboursement, **facture PDF jointe**, avoir ;
  - envoi en file d'attente après validation de la transaction ;
  - lien de désinscription signé, préférence modifiable sur la fiche client ;
  - nouveaux événements métier : `ReservationCheckedIn`, `ReservationCheckedOut`, `ReservationCancelled`, `ReservationExtended`, `PaymentRefunded` ;
  - contrats `InvoiceDocuments` (Billing) et `PaymentHistory::receipt/refund` (Cashier) ;
  - décision D-039 et question Q-22.

- Phase 6A, **écrans de la réception** (design du prototype, amélioré) :
  - système de design repris du prototype : barre latérale par groupes, cartes, badges, modales, notifications brèves, états vides et de chargement, impression ;
  - **connexion réelle** (cookie CSRF puis session Sanctum) avec la photo de l'hôtel ; retour à la page demandée après connexion ; session expirée gérée ;
  - **menu et routes filtrés selon les permissions du serveur** ; accueil sur la première page autorisée ;
  - **tableau de bord** : encaissé du jour, facturé du mois, soldes à recevoir, chambres occupées, encaissements des 7 derniers jours, occupation, arrivées et départs du jour, réservations récentes ;
  - **réservations** : liste filtrable et paginée, fiche avec confirmation, arrivée, départ, prolongation (aperçu du supplément puis validation), occupants, annulation motivée, encaissement, émission de facture, PDF, lien de vérification et historique ;
  - **nouvelle réservation guidée** : client existant ou nouveau, chambres réellement libres, devis du serveur en direct, remise, paiement différé, intégral ou avance ;
  - **disponibilités** : planning par chambre sur 7 ou 14 jours ;
  - **clients** : répertoire avec recherche, fiche, séjours, création et modification ;
  - nouveaux endpoints `GET /api/v1/dashboard` (module Reporting) et `GET /api/v1/planning` ;
  - 47 tests frontend ; décision D-040.
- Phase 6B, **caisse et documents** :
  - écran **Caisse** : journal d'une période (raccourcis aujourd'hui, hier, 7 jours, mois), encaissé, remboursé, net et annulés, ventilation par moyen de paiement et par agent, mouvements chronologiques, soldes à encaisser avec encaissement direct, impression ;
  - **remboursement** (plafonné au remboursable, motif obligatoire) et **annulation d'encaissement** (motif) pour l'administrateur, depuis la caisse, la liste des reçus et la fiche réservation ;
  - écran **Factures et reçus** : onglets accessibles au clavier, filtres, totaux « factures − avoirs », PDF, vérification publique, **avoir motivé** ;
  - **reçu imprimable A4** (`/documents/recus/:id`) avec l'en-tête de l'hôtel, les remboursements et le reste à payer ;
  - nouveaux endpoints `GET /api/v1/cash-journal`, `GET /api/v1/payments`, `GET /api/v1/invoices` et `GET /api/v1/receivables` ; contrat `ReservationLedger::findMany` ;
  - 7 tests backend, 8 tests frontend ; décision D-041.
### Corrigé
- Connexion : la page demandée avant la connexion n'était pas toujours retrouvée (deux redirections concurrentes).
- Champs de formulaire : l'aide et le message d'erreur ne font plus partie du nom lu par les lecteurs d'écran ; ils sont reliés au champ par `aria-describedby`.
- Fiche client : le type et le numéro de pièce d'identité sont toujours contrôlés ensemble (la règle était ignorée quand un seul des deux était envoyé).
- Le modèle `User` a des attributs par défaut : un utilisateur tout juste créé ne provoque plus d'erreur 500 en mode strict.

### Modifié
- Spécifications déplacées de la racine vers `docs/` ; ancienne version V2 archivée dans `docs/archive/`.
- Phase 2 : le modèle `User` passe de `App\Models` à `App\Modules\Identity\Models` ; la colonne `users.role` du schéma 09 n'est pas créée (rôles Spatie).
