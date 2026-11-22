# JB Hôtel — Cahier technique de l’architecture Offline-First

**Version :** 1.0 — 21 novembre 2026  
**Périmètre :** un poste de caisse, application de gestion hôtelière React, API Laravel cloud, base MySQL cloud, stockage local navigateur IndexedDB, tickets thermiques 80 mm.

## 1. Objectif

L’application doit proposer les mêmes écrans et opérations métier lorsque la connexion Internet est disponible ou interrompue. Le navigateur conserve les données nécessaires et les modifications locales ; dès que la connexion au serveur est possible, un moteur de synchronisation échange les changements avec Laravel. **La continuité locale ne signifie pas que les opérations sont déjà confirmées globalement** : des conflits avec des modifications réalisées dans le cloud peuvent survenir.

## 2. Architecture cible

```text
POSTE DE CAISSE — NAVIGATEUR
  React + Vite (PWA)
  ├─ Service Worker : cache des ressources applicatives
  ├─ IndexedDB via Dexie : données métier locales
  ├─ Outbox locale : opérations à transmettre
  ├─ Sync Engine : push/pull, reprise, conflits
  ├─ UI : caisse, chambres, clients, réservations, statistiques
  └─ Impression : ticket thermique 80 mm
              ⇅ HTTPS, authentification, idempotence
CLOUD
  Laravel API + Spatie Permission
  ├─ Validation métier et permissions
  ├─ Service de synchronisation (push/pull)
  ├─ Transactions SQL, journal d’événements et versions
  └─ MySQL (données centrales, audit, déduplication)
```

Aucun serveur Laravel ou MySQL local n’est requis. **IndexedDB est bien une base de données locale**, mais elle est fournie par le navigateur. Le Service Worker ne remplace ni IndexedDB ni le moteur de synchronisation. L’application doit être installée/chargée au moins une fois en ligne pour rendre ses ressources disponibles hors ligne.

## 3. Fonctionnalités métier

### 3.1 Authentification, utilisateurs et rôles
- Connexion en ligne avec Laravel ; rôles et permissions gérés côté serveur par Spatie.
- Pour l’usage hors ligne, conserver une session locale de durée limitée et une photographie minimale des permissions autorisées, protégées autant que possible ; prévoir expiration et verrouillage après inactivité.
- Les révocations de droits distantes ne peuvent pas être connues immédiatement hors ligne : limiter les opérations sensibles, enregistrer leur auteur et revalider au serveur.
- Ne jamais stocker le mot de passe en clair dans IndexedDB.

### 3.2 Chambres et tarification
- Enregistrer les chambres individuellement : numéro, type (VIP, Standard), capacité et état opérationnel.
- Définir les tarifs par type de chambre et durée (journée, demi-journée) ; possibilité de tarifs supplémentaires configurables.
- Afficher disponibilité selon **intervalle de séjour**, et non seulement un booléen `occupée`.
- Historiser le tarif réellement appliqué lors de chaque réservation/facture.
- La modification d’un tarif ne change pas les factures déjà émises.

### 3.3 Clients
- Fiche client : identité, nom, prénom si pertinent, téléphone, ville/provenance, coordonnées utiles et historique des séjours.
- Recherche, consultation et modification en ligne ou hors ligne.
- Collecte minimale de données personnelles, accès par rôle et politique de conservation.

### 3.4 Réservations et séjours
- Réservation immédiate ou future ; type/chambre, dates, heure facultative, durée, nombre de personnes, remise éventuelle.
- Calcul des disponibilités depuis les données locales les plus récentes ; indiquer la date de dernière synchronisation.
- Statuts distincts : `draft`, `local_pending`, `confirmed`, `conflict`, `cancelled`, `checked_in`, `checked_out` (adapter selon le modèle métier).
- Une réservation faite hors ligne est **enregistrée localement**, mais peut entrer en conflit avec une réservation créée dans le cloud ; ne pas promettre une disponibilité globale garantie.
- Check-in/check-out, prolongation, changement de chambre, annulation et traçabilité des corrections.

### 3.5 Caisse et paiements
- Encaissements espèces, et autres modes selon leur disponibilité réelle.
- Gestion du total, remises autorisées, acompte, paiement partiel, solde, remboursement/annulation contrôlée.
- Un encaissement espèces peut être enregistré hors ligne avec un identifiant unique ; le statut de synchronisation reste visible.
- Les paiements électroniques qui nécessitent une autorisation externe ne sont **pas réputés approuvés** hors ligne.
- Une erreur réseau ou d’impression ne doit jamais dupliquer ni annuler implicitement une transaction financière.
- Clôture de caisse, rapprochement et journal d’audit ; écarts à résoudre explicitement.

### 3.6 Factures et tickets thermiques 80 mm
- Impression de ticket depuis React avec feuille CSS `@media print` et largeur de contenu adaptée à 80 mm ; configurer l’imprimante et tester les marges réelles.
- En-tête : JB Hôtel, coordonnées et mentions obligatoires à valider selon la juridiction applicable.
- Corps : identifiant de reçu/facture, date, caissière, client, chambre, durée, lignes tarifaires, remises, taxes applicables, total, encaissé, reste, mode de paiement et statut.
- Pied : remerciement, identifiant de vérification, code-barres/QR facultatif.
- Pour un ticket créé hors ligne : utiliser un identifiant local mondialement unique ; la numérotation légale doit suivre une politique définie (par exemple séries préallouées ou régularisation), validée selon les exigences fiscales applicables. Ne pas inventer une numérotation définitive susceptible d’entrer en collision.
- Réimpression fidèle des montants historiques ; corrections par opérations tracées, sans écrasement silencieux.
- `window.print()` dépend du navigateur ; impression silencieuse, découpe automatique et ouverture du tiroir-caisse nécessitent éventuellement un pilote, un logiciel compagnon ou une intégration constructeur.

### 3.7 Tableau de bord analytique
- Chiffre d’affaires encaissé, réservations, occupation par période, nuitées/demi-journées, modes de paiement, remises, créances, annulations et performances par type de chambre.
- Graphiques : tendances temporelles, histogrammes, camemberts, comparaisons et filtres de période.
- Indiquer si les indicateurs sont **locaux/non synchronisés** ou **consolidés cloud** pour éviter de présenter des données partielles comme définitives.

### 3.8 Administration
- Paramétrage hôtel, chambres, types, tarifs, utilisateurs, permissions, remises autorisées et modèles de tickets.
- Historique des opérations, réimpressions, erreurs, conflits et synchronisations.
- Messages d’erreur en français, modales explicites et arrêt de l’opération si une validation critique échoue.

## 4. Fonctionnement hors ligne

1. L’application PWA charge les fichiers React déjà mis en cache par le Service Worker.
2. React lit les chambres, clients et réservations depuis IndexedDB.
3. Chaque modification est enregistrée **atomiquement** dans IndexedDB avec une entrée `outbox` dans la même transaction locale.
4. L’interface confirme l’**enregistrement local** et affiche l’état `À synchroniser`.
5. À la reconnexion, le moteur envoie les opérations puis récupère les modifications cloud.
6. Laravel valide permissions, cohérence, versions et contraintes ; les opérations acceptées sont confirmées, les conflits restent visibles.

La détection de reconnexion (`online`) est seulement un signal ; une requête de santé API doit vérifier l’accessibilité effective. La synchronisation se lance au démarrage, au retour au premier plan, sur demande et périodiquement tant que l’application est ouverte. Ne pas dépendre exclusivement de Background Sync, dont la prise en charge varie selon les navigateurs.

## 5. Modèle de données

### 5.1 MySQL cloud (schéma logique indicatif)
- `users`, `roles`, `permissions` et tables Spatie associées.
- `clients(id UUID, nom, telephone, ville, version, updated_at, deleted_at)`.
- `room_types(id UUID, libelle, capacite, version, ...)`.
- `rooms(id UUID, room_type_id, numero UNIQUE, etat_technique, version, ...)`.
- `room_rates(id UUID, room_type_id, duration_type, amount, currency, effective_from, effective_to, ...)`.
- `reservations(id UUID, client_id, room_id, starts_at, ends_at, status, version, ...)`.
- `stays(id UUID, reservation_id, check_in_at, check_out_at, ...)`.
- `invoices(id UUID, reservation_id, invoice_number, total, discount_total, tax_total, status, issued_at, ...)`.
- `invoice_lines(id UUID, invoice_id, description, quantity, unit_price_snapshot, amount, ...)`.
- `payments(id UUID, invoice_id, amount, method, status, idempotency_key UNIQUE, paid_at, ...)`.
- `sync_events(event_id UUID UNIQUE, device_id, entity_type, entity_id, operation, payload, entity_version, created_at, ...)`.
- `sync_receipts(event_id UUID UNIQUE, result, processed_at, ...)`.
- `sync_conflicts(id UUID, event_id, entity_id, reason, local_payload, server_payload, status, resolved_by, ...)`.
- `audit_logs(id UUID, actor_id, action, entity_type, entity_id, occurred_at, ...)`.

Les relations et contraintes seront précisées dans le MCD/MLD. Pour la disponibilité, protéger les validations concurrentes par transactions/verrous appropriés et vérification des chevauchements d’intervalles ; MySQL n’offre pas à lui seul une contrainte générale d’exclusion d’intervalles comparable à certains autres SGBD.

### 5.2 IndexedDB local (Dexie)
- `clients`, `rooms`, `roomTypes`, `rates`, `reservations`, `stays`, `invoices`, `invoiceLines`, `payments` : projections locales nécessaires.
- `outbox` : événements en attente avec `eventId`, `entityId`, `type`, `payload`, `baseVersion`, `createdAt`, `attempts`, `status`.
- `syncMeta` : `deviceId`, curseur serveur, dernière synchronisation et état.
- `conflicts` : conflits à résoudre.
- `settings` : configuration locale non sensible.

Ne pas stocker de secrets serveur ou jetons longue durée sans stratégie de protection adaptée. Demander un stockage persistant lorsque possible, mais prévoir que les données du navigateur puissent être effacées. Effectuer des sauvegardes externes adaptées.

## 6. Protocole de synchronisation bidirectionnelle

### 6.1 Envoi (push)
`POST /api/v1/sync/push`

Exemple indicatif :

```json
{
  "device_id": "uuid-poste-caisse",
  "events": [
    {
      "event_id": "uuid-evenement",
      "entity": "reservation",
      "entity_id": "uuid-reservation",
      "action": "create",
      "base_version": 0,
      "payload": {"room_id": "uuid-chambre", "starts_at": "2026-11-22T14:00:00+01:00", "ends_at": "2026-11-23T12:00:00+01:00"}
    }
  ]
}
```

- Authentifier l’utilisateur/appareil ; vérifier les permissions et valider chaque charge utile.
- Traiter chaque événement de manière idempotente grâce à `event_id` et aux clés métier.
- Retourner pour chaque événement : `accepted`, `already_processed`, `conflict` ou `rejected`, avec version serveur et raison.
- Les dépendances doivent respecter l’ordre logique : client avant réservation, réservation avant facture, facture avant paiement si nécessaire.
- Ne marquer un événement `synced` qu’après accusé de réception durable du serveur.

### 6.2 Réception (pull)
`GET /api/v1/sync/pull?cursor=<curseur>`

- Le serveur renvoie les changements autorisés depuis un curseur **monotone serveur** et un `next_cursor`.
- IndexedDB applique les changements dans une transaction locale ; enregistrer le nouveau curseur **dans la même transaction** pour éviter les pertes après interruption.
- Prévoir pagination, suppressions logiques (tombstones), réinitialisation de curseur et resynchronisation complète contrôlée.
- Le `updated_at` client n’est pas un ordre fiable ; préférer séquence/version serveur.

### 6.3 Algorithme de reprise
1. Vérifier l’accès à l’API.
2. Envoyer les événements `pending` dans l’ordre de dépendance.
3. Appliquer les réponses, sans effacer les événements en conflit.
4. Récupérer les changements distants.
5. Appliquer atomiquement les changements et le curseur.
6. Répéter tant que des changements restent disponibles ; limiter la fréquence et appliquer un backoff en cas d’échec.

## 7. Politique de résolution des conflits

**Principe :** ni le local ni le cloud ne gagne automatiquement pour toutes les entités.

| Cas | Politique |
|---|---|
| Réservation même chambre et dates chevauchantes | Détecter côté Laravel ; bloquer la confirmation concurrente et demander une réaffectation ou annulation supervisée. |
| Paiement envoyé deux fois | Dédupliquer par clé d’idempotence ; ne jamais encaisser deux fois. |
| Modification concurrente d’un client | Comparer `base_version` ; fusion manuelle ou par champs explicitement non conflictuels. |
| Modification de tarif | Versionner les tarifs ; préserver les prix figés sur les factures existantes. |
| Facture déjà émise | Ne pas écraser ; appliquer une correction traçable selon règles comptables/fiscales. |
| Suppression concurrente | Suppression logique et contrôle des dépendances ; intervention si nécessaire. |

**Limite fondamentale :** si le cloud et la caisse hors ligne acceptent tous deux des réservations, aucune synchronisation différée ne peut garantir à l’avance qu’une chambre ne sera jamais doublement réservée. Pour une garantie stricte, il faut réserver l’autorité de confirmation à un seul endroit, ou accepter des réservations provisoires sur les autres canaux.

## 8. États d’interface et UX

- Indicateur permanent : `Hors ligne`, `Synchronisation en cours`, `Synchronisé`, `Conflits`.
- Pour chaque objet sensible : `Enregistré localement`, `Confirmé par le serveur`, `Conflit à résoudre`, `Rejeté`.
- Écran **Centre de synchronisation** : opérations en attente, dernier échange, erreurs, bouton « Réessayer », détails et résolution de conflits.
- Les opérations de caisse doivent être utilisables hors ligne sans masquer les limites de confirmation globale.
- Les erreurs doivent être formulées en français et ne pas effacer la saisie de l’utilisateur.

## 9. Sécurité, sauvegarde et disponibilité

- HTTPS, validation Laravel, autorisations serveur, journaux d’audit, contrôle des sessions et protection des données personnelles.
- Cache PWA versionné ; mises à jour contrôlées pour ne pas interrompre une caisse en cours d’opération.
- Protéger l’ordinateur (compte utilisateur, verrouillage, chiffrement du disque si disponible).
- Les données IndexedDB sont liées à l’origine et au profil du navigateur ; changement d’origine, nettoyage du navigateur ou perte du poste peuvent les rendre indisponibles.
- Sauvegardes cloud versionnées et restauration testée ; ne pas confondre synchronisation et sauvegarde.
- Imprimante thermique configurée et testée ; un navigateur seul ne garantit pas une impression silencieuse universelle.

## 10. Structure frontend recommandée

```text
src/
  app/                  # routing, providers, bootstrap
  modules/
    auth/
    clients/
    rooms/
    reservations/
    stays/
    cashdesk/
    invoices/
    analytics/
    admin/
    synchronization/
  db/                   # Dexie schema, migrations, repositories
  sync/                 # push, pull, conflict resolution, retry
  services/             # API clients, validation, printing
  components/           # UI réutilisable, modales FR
  pwa/                  # Service Worker et manifest
```

Séparer présentation, règles métier côté client, repositories IndexedDB, API et synchronisation. Les règles critiques restent revalidées par Laravel.

## 11. Phases de réalisation

1. **Cadrage :** parcours caisse, statuts, règles de réservation, droits et mentions de facturation.
2. **Backend cloud :** MCD/MLD, migrations, API Laravel, transactions, Spatie, tests.
3. **Frontend React :** modules de caisse, chambres, clients, réservations, tickets 80 mm.
4. **PWA locale :** Service Worker, Dexie, opérations atomiques, états hors ligne.
5. **Synchronisation :** outbox, endpoints push/pull, versions, idempotence, conflits, reprise.
6. **Analytics :** indicateurs locaux et consolidés, filtres, traçabilité.
7. **Sécurité et production :** tests de coupure, déduplication, restauration, impression et déploiement.

## 12. Tests d’acceptation indispensables

- Couper Internet, créer un client, une réservation, un paiement espèces et imprimer un ticket ; vérifier la persistance après fermeture/réouverture du navigateur.
- Rétablir Internet ; vérifier que chaque opération est envoyée **une seule fois logiquement**, même si les requêtes sont répétées.
- Couper Internet pendant l’envoi puis réessayer ; vérifier l’idempotence.
- Créer une réservation concurrente dans le cloud ; vérifier l’affichage d’un conflit, sans écrasement silencieux.
- Modifier un tarif pendant une coupure ; vérifier que la facture historique conserve son prix.
- Vérifier le calcul du solde après paiement partiel et la réimpression fidèle.
- Vérifier l’expiration de session hors ligne, les permissions et les messages d’erreur en français.
- Tester le navigateur cible, l’imprimante réelle 80 mm, le stockage, les mises à jour PWA et la restauration après perte du poste.

## 13. Décisions à confirmer avant développement

1. Le cloud autorise-t-il la confirmation de réservations pendant que la caisse est hors ligne ? Si oui, accepter le risque de conflit et prévoir un traitement opérationnel.
2. Quelle politique de numérotation des factures/tickets est conforme aux obligations locales ?
3. Quels modes de paiement sont disponibles et lesquels nécessitent une validation externe ?
4. Quelle durée maximale de session hors ligne et quelles permissions restent autorisées ?
5. Quels navigateurs, systèmes d’exploitation et modèles d’imprimantes seront utilisés ?
6. Quelle politique de sauvegarde, conservation des données et reprise après perte du poste ?

## 14. Documentation de référence

- MDN — IndexedDB : https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- MDN — Progressive Web Apps : https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps
- MDN — Service Worker API : https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- MDN — Storage API : https://developer.mozilla.org/en-US/docs/Web/API/Storage_API
- Laravel — Database Transactions : https://laravel.com/docs/12.x/database#database-transactions
- Laravel — Queues : https://laravel.com/docs/12.x/queues
- Dexie : https://dexie.org/docs/

---

**Statut du document :** spécification technique proposée, à valider avant implémentation. Elle ne constitue pas un logiciel déjà développé ni une certification de conformité fiscale ou de sécurité.
