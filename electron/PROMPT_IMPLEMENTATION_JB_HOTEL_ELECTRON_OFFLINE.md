# PROMPT MAÎTRE — Conversion du projet JB Hôtel existant en logiciel Windows Electron, offline-first

> **Destinataire :** agent IA de développement disposant d'un accès au dépôt existant.
> **Mission :** modifier le projet réel, et non produire une démonstration, une maquette ou une application générique.
> **État initial connu :** JB Hôtel est déjà développé et déployé en ligne ; il dispose d'une PWA. Le frontend utilise React et le backend Laravel/MySQL. Les chemins, versions, bibliothèques, modules et schémas exacts doivent être **vérifiés dans le dépôt** avant toute intervention.

## 1. Objectif non négociable

Transformer **l'application JB Hôtel existante** en un logiciel Windows installable (`.exe`) avec **Electron + frontend React existant + SQLite local**, tout en maintenant la **PWA web existante et le backend Laravel/MySQL en production**. Le logiciel doit démarrer sans Internet après extinction complète et redémarrage de Windows ; permettre les opérations métier autorisées hors ligne ; synchroniser automatiquement et de manière fiable avec Laravel dès que le serveur est accessible ; et préserver toutes les fonctionnalités et données existantes.

Ne pas réécrire arbitrairement le projet, ne pas créer de second produit divergent, ne pas supprimer des fonctionnalités, ne pas remplacer le schéma de données par un modèle fictif et ne pas modifier la production sans plan de migration, sauvegarde, validation et autorisation explicite.

## 2. Étape obligatoire : audit du dépôt AVANT de coder

1. Identifier l'organisation réelle du dépôt (monorepo ou dépôts séparés), les versions de Node, React, Vite/outil de build, Laravel, PHP, MySQL, les routes API, les environnements et le pipeline de déploiement.
2. Inventorier **tous les modules, écrans, formulaires, validations, rôles, permissions, états, filtres, rapports, exports, notifications, impressions, dashboards et intégrations réellement présents**. Ne rien inventer ni retirer. Distinguer les fonctions présentes, incomplètes et absentes.
3. Analyser le schéma MySQL, migrations, contraintes, transactions, modèles, services, endpoints, authentification et usage éventuel de Spatie Permission.
4. Repérer les appels réseau bloquants, le Service Worker/PWA, les états React, le cache, les appels directs à Laravel, les dépendances CDN et les assets non empaquetés.
5. Identifier les règles métier de réservation, séjour, occupation, tarification, remises, paiement, facture, annulation et droits d'accès **dans le code existant**.
6. Produire `docs/ELECTRON_AUDIT.md` avec inventaire, risques, schémas observés, dépendances et plan de migration. Si un détail est introuvable, le marquer « À CONFIRMER » et demander la précision nécessaire ; ne pas inventer.
7. Définir une matrice de parité : chaque fonctionnalité existante doit avoir un comportement Windows en ligne/hors ligne, ou une limitation justifiée et explicitement approuvée.

## 3. Architecture cible

```text
                   ┌──────────────────────────────────────┐
                   │ JB Hôtel Windows — Electron (.exe)   │
                   │ React existant (assets embarqués)    │
                   │ Preload API restreinte + IPC          │
                   │ Services métier locaux               │
                   │ SQLite + Outbox + sauvegardes        │
                   │ Impression thermique 80 mm           │
                   └──────────────────┬───────────────────┘
                                      │ HTTPS + authentification
                                      │ push / pull / accusés
                   ┌──────────────────▼───────────────────┐
                   │ Laravel API existante + API sync     │
                   │ MySQL, contrôles, idempotence        │
                   │ Événements temps réel si disponibles │
                   └──────────────────┬───────────────────┘
                                      │
                   ┌──────────────────▼───────────────────┐
                   │ PWA React existante / interface web  │
                   │ Données actualisées depuis le serveur│
                   └──────────────────────────────────────┘
```

- **Source opérationnelle du poste Windows :** SQLite local ; toutes les actions métier compatibles hors ligne passent par des services locaux.
- **Source de référence partagée :** Laravel/MySQL après acceptation des opérations ; définir explicitement la propriété de chaque donnée et la politique de conflits.
- **Frontend :** réutiliser au maximum composants, pages, styles, formulaires, stores, validations et règles partagées ; prévoir des adaptateurs `web` et `desktop` pour éviter de casser la PWA.
- **Electron :** `main` pour accès natifs et services, `preload` pour API contrôlée, `renderer` pour React. Aucune requête SQL arbitraire depuis le renderer.
- **Aucun serveur PHP, MySQL, XAMPP ou `npm run dev` requis sur le poste Windows en production.**

## 4. Modules métier à préserver et rendre disponibles hors ligne

La liste ci-dessous est un **périmètre de vérification**, non une affirmation que tous les modules sont déjà implémentés. L'agent doit s'aligner sur les fonctionnalités effectivement présentes et les spécifications du projet :

### 4.1 Chambres et types
- Types Standard/VIP et autres types existants ; chambres individuelles ; caractéristiques et états ; disponibilité par période ; chambres libres/occupées/réservées ; historique d'occupation.
- Interdire les chevauchements incohérents dans la base locale et contrôler à nouveau côté serveur lors de la synchronisation.

### 4.2 Réservations et séjours
- Réservation immédiate ou future ; dates, heures optionnelles selon les règles existantes ; journée/demi-journée et nombre de jours ; nombre de personnes ; check-in/check-out ; changement/annulation suivant droits et états.
- Réservations locales persistantes ; identifiants globaux stables ; gestion explicite des collisions avec les opérations créées en ligne.

### 4.3 Clients
- Identité, nom, contacts, ville/provenance et autres champs réellement présents ; historique de séjours et transactions ; recherche et validation ; respect de la minimisation et protection des données personnelles.

### 4.4 Tarifs, remises et facturation
- Tarifs configurables par type de chambre et durée ; règles de prix indépendantes du nombre de personnes si c'est bien la règle existante ; réductions autorisées ; conservation immuable des montants historiques sur factures.
- Numérotation de facture unique même hors ligne : définir une stratégie de séquence par poste ou d'identifiant global compatible avec les exigences comptables locales ; ne pas renuméroter silencieusement les factures émises.

### 4.5 Caisse et paiements
- Encaissements, moyens de paiement, clôture et rapports selon modules existants ; opérations financières atomiques, journalisées, idempotentes et non supprimées physiquement ; annulations/contre-écritures tracées.
- Montants en unités monétaires entières ou type décimal exact ; **jamais de calcul financier en flottants binaires**.

### 4.6 Administration, rôles et tableaux de bord
- Conserver les écrans admin et les autorisations existantes ; prise en charge hors ligne selon droits synchronisés ; tableaux de bord de chiffre d'affaires, transactions, taux d'occupation, chambres et tendances avec données locales ; affichage explicite de la fraîcheur des données distantes.
- Messages d'erreur et modales en français ; blocage des opérations invalides ; journal d'audit pour actions sensibles.

### 4.7 Impression thermique
- Factures/tickets de **80 mm** ; mise en page adaptée à la largeur imprimable réelle ; aperçu, impression, réimpression tracée, gestion imprimante absente/erreur ; fonctionnement sans Internet.
- Conserver le contenu réglementaire et métier des factures actuelles ; tester imprimantes/pilotes Windows réels.

## 5. SQLite local : modèle, durabilité et migrations

1. Construire les migrations SQLite **à partir du schéma et des invariants MySQL existants**, en adaptant uniquement les différences de moteur ; normalisation, clés étrangères, index et contraintes appropriées.
2. Ajouter les métadonnées techniques nécessaires : UUID global, versions, dates, poste d'origine, `sync_outbox`, `sync_inbox`/journal d'application si utile, `sync_state`, `sync_conflicts`, `audit_logs`, `schema_migrations`.
3. Conserver la base dans un dossier persistant d'Electron (`app.getPath('userData')` ou emplacement administré), **jamais** dans `app.asar`, le répertoire d'installation ou le dossier de build. Définir les permissions Windows et le comportement multi-comptes.
4. Utiliser un pilote SQLite natif maintenu et compatible avec la version d'Electron choisie ; prévoir la reconstruction des modules natifs dans le packaging, et les tests d'installation sur un Windows propre.
5. Transactions atomiques : **écriture métier + entrée outbox dans une même transaction SQLite**. Activer les clés étrangères et paramétrer WAL, `busy_timeout` et `synchronous` selon la durabilité exigée.
6. Migrations versionnées, idempotentes, testées sur une copie de la base ; sauvegarde préalable et stratégie de restauration en cas d'échec.
7. Sauvegardes cohérentes via API SQLite dédiée, contrôle d'intégrité, rotation, restauration testée, protection contre perte/vol de l'ordinateur ; la synchronisation n'est pas une sauvegarde complète.
8. Prévoir le chiffrement des données sensibles et la protection des clés selon les possibilités réelles de la plateforme ; ne pas prétendre que SQLite est chiffré par défaut.

## 6. Synchronisation fiable, bidirectionnelle et automatique

### 6.1 Contrat et API

Définir, versionner, documenter et tester une API de synchronisation, par exemple :

```http
POST /api/v1/sync/push
GET  /api/v1/sync/pull?cursor=...
GET  /api/v1/sync/status
```

Ce sont des **routes proposées** ; les adapter aux conventions du backend existant. Transport HTTPS, authentification de l'appareil et de l'utilisateur, autorisation par opération, validation serveur systématique.

### 6.2 Envoi local vers Laravel

1. Lors d'une action, valider localement et créer la modification métier + un événement `outbox` dans **une seule transaction**.
2. L'événement comporte `operation_id` global unique, `device_id`, type, version de schéma, horodatage informatif, version attendue, données nécessaires et références métier.
3. Le worker Electron tente un envoi immédiat si le serveur est joignable ; sinon conserve l'événement `pending`.
4. Laravel traite les événements de manière transactionnelle, conserve les identifiants déjà appliqués et renvoie un accusé durable ; les répétitions doivent être idempotentes.
5. Après accusé serveur, marquer l'événement `synced` localement. Si la réponse se perd, renvoyer le **même** identifiant d'opération et récupérer le même résultat.
6. Traiter les dépendances (client avant réservation, réservation avant paiement) et les lots partiels explicitement. Ne jamais marquer un lot entier comme confirmé si seuls certains événements ont réussi.
7. Retenter avec backoff exponentiel plafonné et jitter ; éviter les boucles rapides, les doublons et les opérations perdues après crash.

### 6.3 Réception serveur vers SQLite

1. Utiliser un flux de changements serveur ordonné, avec curseur opaque stable, pagination, versionnement et conservation suffisante pour les postes longtemps déconnectés.
2. Appliquer les changements reçus en transaction SQLite ; avancer le curseur **dans la même transaction** seulement après application réussie.
3. Ne jamais écraser silencieusement des modifications locales non synchronisées ; gérer les versions et conflits.
4. Prévoir un rechargement initial et un resnapshot contrôlé lorsque le curseur est périmé.
5. Les événements WebSocket (Laravel Reverb/Echo si présents ou retenus) servent à déclencher un rafraîchissement rapide, **pas** à remplacer le journal durable et le rattrapage après déconnexion.

### 6.4 Déclencheurs

- Au démarrage de l'application ; après nouvelle opération ; au retour d'accessibilité de l'API ; périodiquement (valeur initiale configurable, p. ex. 30 s) ; après réveil de Windows ; après échec temporaire.
- Détecter la disponibilité **réelle de l'API**, pas uniquement `navigator.onLine`.
- Afficher état `offline/online`, dernière synchronisation confirmée, nombre en attente, erreurs et conflits ; prévoir un bouton « Réessayer » sans permettre la double exécution métier.
- Ne pas promettre la synchronisation lorsque l'ordinateur est éteint : elle reprend au prochain démarrage.

### 6.5 Conflits et source d'autorité

- **Un seul poste de caisse** est prévu initialement, mais le web peut créer des modifications concurrentes ; identifier précisément qui peut modifier quoi.
- Définir un tableau de règles par entité : réservations concurrentes, attribution de chambre, changement de tarif, modification client, paiement, annulation, permissions.
- **Jamais de stratégie `last-write-wins` aveugle pour réservations, paiements ou factures.** Les conflits doivent être rejetés, compensés ou soumis à validation selon une règle métier explicite.
- Une réservation locale ne peut pas garantir l'absence de conflit global si d'autres postes/canaux peuvent réserver pendant la coupure. Proposer soit une autorité exclusive d'attribution des chambres au poste unique, soit un statut provisoire et une résolution de conflit explicite.
- Garantir l'idempotence des paiements et éviter les doubles encaissements logiques.

## 7. Mise à jour automatique du tableau de bord web

Après commit réussi dans MySQL, diffuser un événement serveur (via infrastructure existante ou Laravel Broadcasting/Reverb si choisi). Le frontend web React doit invalider/refetch les requêtes concernées et actualiser tableaux de bord, chambres, réservations et paiements sans rechargement manuel. Prévoir reconnexion, reprise, permissions des canaux et rafraîchissement de secours : un événement temps réel manqué ne doit pas laisser des données obsolètes indéfiniment.

**Distinguer :** synchronisation des **données** (SQLite ↔ MySQL), actualisation de l'**interface web** (événements/refetch), et mise à jour du **binaire Windows** (nouvelle version Electron).

## 8. Authentification et sécurité hors ligne

- Analyser l'authentification existante et Spatie Laravel Permission si utilisé. Prévoir une activation initiale en ligne et un mécanisme d'accès local sécurisé (PIN/secret dérivé, protections contre brute force, verrouillage de session).
- Stocker le minimum de secrets ; aucun mot de passe en clair, aucun jeton administrateur embarqué ; stockage protégé via OS lorsque pertinent.
- Cache local des rôles/permissions avec politique d'expiration et limites explicites des révocations impossibles à recevoir hors ligne ; réévaluation côté Laravel à la synchronisation.
- Electron : `contextIsolation: true`, `nodeIntegration: false`, `sandbox` si compatible, preload restreint, validation de chaque IPC, CSP, navigation externe bloquée/contrôlée, aucune API Node exposée directement à React.
- API Laravel : TLS, contrôle d'accès par objet, protection contre rejeu, rate limiting, audit, validation des charges utiles, isolation du poste autorisé.

## 9. Packaging Windows et mise à jour de l'EXE

1. Utiliser une solution de packaging Electron adaptée au projet (p. ex. electron-builder), choisir installateur Windows (p. ex. NSIS), architecture cible, nom, icône et raccourcis.
2. Compiler React en assets locaux, charger l'interface depuis l'application installée ; aucun appel obligatoire à un CDN, au serveur web ou à Vite dev pour afficher l'interface.
3. Produire un installateur `.exe` reproductible ; vérifier l'installation sur une machine Windows propre, sans Node, PHP, MySQL ni Internet après installation/activation initiale.
4. Prévoir signature du binaire et mises à jour depuis un canal sécurisé ; tester compatibilité de la version Electron, de la bibliothèque SQLite native et des migrations.
5. Télécharger les mises à jour en ligne, demander/planifier le redémarrage de l'application, préserver le fichier SQLite et permettre un retour arrière compatible. Ne jamais écraser les données locales lors d'une mise à jour.
6. Le logiciel installé doit se lancer par double-clic après arrêt complet et redémarrage Windows, sans connexion et sans service de développement.

## 10. Compatibilité de la PWA existante

- Ne pas casser les URL, API, écrans, authentification, rôles, styles, formulaires ou déploiements web actuels.
- Isoler les implémentations `desktop` et `web` derrière des interfaces de services communes quand c'est utile ; ne pas importer les modules Node/Electron dans le bundle web.
- Garder les migrations backend rétrocompatibles durant le déploiement ; prévoir gestion des versions de protocole de synchronisation.
- Déployer les évolutions Laravel de façon progressive, avec tests de non-régression web et plan de retour arrière.

## 11. Tests obligatoires et critères de réception

Automatiser autant que possible et fournir des preuves :

- Installation `.exe` sur Windows propre ; démarrage sans `npm run dev` ; démarrage après arrêt complet et redémarrage **sans Internet**.
- Navigation dans toutes les pages prévues hors ligne, sans ressources CDN bloquantes.
- Création/modification de clients, chambres, réservations, séjours, encaissements, factures ; vérification des validations, droits et règles métier.
- Impression thermique 80 mm sans Internet et gestion d'imprimante déconnectée.
- 100 opérations hors ligne, plusieurs redémarrages, reprise sans perte, envoi au retour d'Internet.
- Crash entre commit SQLite et envoi ; crash pendant l'envoi ; commit MySQL réussi mais accusé perdu ; répétition du même événement ; absence de doublons.
- Réception paginée de changements distants, curseur et transactions atomiques ; récupération après interruption.
- Deux réservations concurrentes de la même chambre ; modification concurrente de tarif/client ; paiement rejoué ; annulation ; conflit visible et traité.
- Vérification que l'interface web se met à jour après confirmation serveur, y compris après reconnexion WebSocket.
- Sauvegarde/restauration SQLite ; corruption simulée et procédure de reprise ; migration après mise à jour du logiciel.
- Contrôles de sécurité Electron/IPC, authentification locale, révocation distante différée et autorisations serveur.
- Non-régression PWA et API existantes.

**Ne jamais déclarer « terminé » sans rapport de tests, limites connues et preuves de fonctionnement.**

## 12. Livrables attendus

1. Code source réellement intégré au dépôt existant : Electron Main/Preload, services locaux, SQLite, adaptateurs React, endpoints Laravel et migrations.
2. Installateur Windows `.exe` construit, ou explication vérifiable des prérequis bloquants si l'environnement ne permet pas le build Windows.
3. `docs/ELECTRON_AUDIT.md` — audit initial et matrice de parité.
4. `docs/ELECTRON_ARCHITECTURE.md` — architecture, responsabilités, flux et décisions techniques.
5. `docs/SQLITE_SCHEMA_AND_MIGRATIONS.md` — modèle local, migrations, sauvegarde/restauration.
6. `docs/SYNC_PROTOCOL.md` — contrats API, outbox, pull, idempotence, erreurs, curseurs et conflits.
7. `docs/OFFLINE_SECURITY.md` — authentification locale, permissions, protection des données.
8. `docs/WINDOWS_BUILD_AND_INSTALL.md` — prérequis de build, commandes exactes, installation, mises à jour et diagnostic.
9. `docs/TEST_REPORT.md` — scénarios exécutés, résultats, preuves, défauts restants.
10. Guide d'exploitation en français pour caissière et administrateur : démarrage, travail hors ligne, impression, état sync, sauvegarde et récupération.

## 13. Méthode d'exécution imposée à l'agent

**Étape A — Audit :** examiner le vrai code, dresser l'inventaire et signaler les ambiguïtés bloquantes. **Étape B — Conception :** présenter l'architecture détaillée et les risques de migration. **Étape C — Implémentation incrémentale :** intégrer Electron et SQLite sans perturber la PWA ; construire les services métier et la synchronisation. **Étape D — Validation :** tests unitaires, intégration, end-to-end Windows, coupures et redémarrages. **Étape E — Livraison :** produire l'installateur et les documents, avec liste précise des changements.

À chaque étape, fournir : fichiers modifiés, commandes réellement exécutées, résultats de tests, décisions prises, blocages et prochaine action. Ne pas prétendre avoir exécuté des tests ou généré un `.exe` si ce n'est pas le cas.

## 14. Critère de réussite final

> JB Hôtel reste utilisable en PWA en ligne. Le même produit métier est installable sur Windows. Après arrêt complet et redémarrage du PC sans Internet, la caissière ouvre JB Hôtel, s'authentifie localement et travaille avec SQLite, imprime les tickets de 80 mm et conserve toutes ses opérations. Quand Laravel redevient accessible, les opérations sont synchronisées de manière idempotente, les changements distants sont récupérés, les conflits sont traités selon des règles explicites et le tableau de bord web est actualisé. Les mises à jour de l'exécutable sont gérées séparément sans perte de données.

**Commence maintenant par auditer le dépôt existant. N'écris pas une nouvelle application générique et ne suppose pas que des fonctionnalités non vérifiées sont déjà présentes.**
