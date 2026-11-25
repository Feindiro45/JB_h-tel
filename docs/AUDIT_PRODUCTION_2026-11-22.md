# Vérification de préparation à la production — 22 novembre 2026

## État après corrections D-067 / D-068

Les constats prioritaires P-01 à P-06 ci-dessous ont été traités localement à la demande de l'utilisateur. Le plan, les règles de fonctionnement et les résultats actuels sont dans `PLAN_CORRECTIONS_OFFLINE_RESERVATIONS.md`, `DECISIONS.md` et `../RAPPORT.md` : 271 tests backend, 203 frontend, analyses/build et parcours concernés réussis. Les anciens tests de reproduction ont été transformés en tests de non-régression ; leur succès confirme désormais le comportement corrigé, sauf le test de conservation des opérations après déconnexion qui décrit volontairement une propriété préservée.

Le reste du présent rapport décrit **l'état observé avant correction**. Les autres points d'exploitation, de protection des postes, d'authentification et de validation métier restent à considérer. Aucun déploiement distant n'a été effectué ; la publication conjointe backend/frontend et la recette à l'hôtel restent nécessaires.

## Verdict

**Mise en production déconseillée en l'état.** Les contrôles de compilation et d'analyse statique réussissent, mais le mode hors ligne présente des risques d'intégrité financière et de sécurité. Les validations métier et d'exploitation ne sont pas toutes établies.

Périmètre : copie de travail locale (commit de base `63b9719`, avec modifications préexistantes), Laravel, React, dépendances, CI, déploiement LWS et documentation. Le code déployé n'a pas été comparé au code local. Aucun correctif applicatif, déploiement, message électronique ou changement de données métier réelles pendant cet audit. Les essais utilisent `jb_hotel_test` et `jb_hotel_e2e`.

## Points prioritaires

### P-01 — Élevé : pertes d'opérations et collisions de numéros hors ligne

Dans `frontend/src/shared/offline/outbox.ts:76`, chaque ajout lit puis remplace toute la file. Deux appels concurrents peuvent lire la même version et s'écraser. `updateOperation` et la restauration font aussi une lecture puis une réécriture. `nextProvisionalNumber`, ligne 94, incrémente une valeur sans transaction atomique.

**Preuve locale :** les tests d'audit reproduisent deux ajouts simultanés ne conservant qu'une opération et deux allocations simultanées donnant le même numéro provisoire. Une reproduction complémentaire dans Edge avec le véritable IndexedDB donne `durable=true`, une seule opération conservée et deux fois `LOC-AUDIT-000001`. Elle utilise un contexte neuf avec données synthétiques et bloque tout appel au backend. Le script est `docs/audit-securite-2026-11-22/frontend.storage-browser.mjs`. La concurrence entre plusieurs onglets reste à ajouter ; le défaut est déjà reproduit dans un seul onglet.

**À faire :** opérations atomiques dans IndexedDB, coordination entre onglets, incrément et écriture dans une même transaction ; tester un encaissement pendant la synchronisation et deux onglets simultanés.

### P-02 — Élevé : rejeu financier après expiration de l'idempotence

`backend/app/Shared/Idempotency/IdempotencyRecord.php:29` conserve les clés seulement 30 jours. `backend/routes/console.php` programme leur purge quotidienne. Le mode hors ligne et ses sauvegardes permettent des reprises plus anciennes ; la date de tarification accepte même 62 jours.

**Scénario :** un paiement a été reçu, mais la réponse est perdue ou une ancienne sauvegarde est restaurée. Après purge de sa clé, la même opération peut être traitée comme nouvelle. Le contrôle du solde ne suffit pas lorsque la somme répétée reste sous le montant dû.

**À faire :** conserver une identité durable des opérations financières, distincte des réponses HTTP éventuellement purgées ; refuser ou faire examiner explicitement les anciens rejeux dont l'unicité ne peut plus être prouvée. Allonger simplement à 62 jours ne couvre pas une restauration sans limite d'âge.

**Preuve locale :** un paiement de 1 000 FCFA est accepté, le temps avance de 31 jours, la vraie commande `model:prune` supprime sa clé ; le même paiement avec la même clé est accepté une seconde fois, avec un nouvel identifiant. Deux paiements existent alors dans la base isolée.

### P-03 — Élevé : date déclarée par le client utilisée pour choisir le tarif

`backend/app/Shared/Offline/OfflineReplay.php:58` accepte une date contenue dans `X-Offline-Replay`, sans preuve de provenance. Les bornes de 62 jours empêchent certaines dates, mais ne prouvent pas que l'opération a été faite hors ligne à cette date.

**Scénario testé :** tarif actuel de 100 000 FCFA, en-tête antidaté de deux jours, création acceptée à l'ancien tarif de 50 000 FCFA. Cela nécessite une session autorisée à réserver et, si activé, un poste principal autorisé. Ce n'est pas une attaque anonyme.

**À faire :** préserver le besoin N-09 tout en ajoutant une validation du tarif historique par le serveur et un traitement administratif des dates non vérifiables. Le simple encodage ou une signature avec une clé disponible dans le navigateur ne prouve pas l'heure réelle.

### P-04 — Élevé sous condition : promotion au rôle administrateur avec users.manage

`backend/app/Modules/Identity/Policies/UserPolicy.php:25` autorise la mise à jour d'un compte avec `users.manage`. `UserAdministrationService.php:125` applique alors le rôle demandé, sans exiger `roles.manage` ou le rôle administrateur.

**Scénario testé :** un administrateur délègue `users.manage` à la caissière ; elle modifie ensuite son propre rôle en `admin` et acquiert notamment `records.delete`. Le rôle caissière standard n'a pas ce droit ; le défaut devient exploitable après délégation de gestion des utilisateurs.

**À faire :** réserver l'attribution d'un rôle privilégié et les modifications des comptes administrateurs à une autorisation distincte, contrôlée côté serveur pour la création comme pour la modification.

### P-05 — Élevé sous condition : URL de sauvegarde non validée

`frontend/src/shared/offline/backup.ts:202` déchiffre le contenu puis le considère comme une liste d'opérations sans validation de schéma. La restauration, ligne 232, garde le chemin fourni. `frontend/src/shared/api/client.ts:22` accepte une URL absolue et lui ajoute ensuite les en-têtes CSRF et de poste.

**Preuve locale :** après restauration d'une opération pointant vers `https://audit.invalid/collect`, la synchronisation prépare une requête vers cette origine avec `X-Workstation-Token` et `X-XSRF-TOKEN`. Toutes les requêtes de cette preuve sont simulées ; aucun secret réel n'a été transmis.

**Conditions :** une sauvegarde malveillante doit être importée puis synchronisée par l'utilisateur correspondant ; le serveur destinataire doit autoriser le précontrôle CORS. Le chiffrement protège un fichier contre une modification sans mot de passe, mais n'authentifie pas son auteur. Le cookie de session du domaine de l'hôtel n'est pas démontré comme divulgué.

**À faire :** valider strictement le schéma, les méthodes et les chemins autorisés ; refuser toute origine différente dans le client HTTP avant d'ajouter les en-têtes.

### P-06 — Élevé pour la fiabilité : stockage volatile déclaré réussi

`frontend/src/shared/offline/storage.ts:62` retourne `true` lorsque IndexedDB n'est pas disponible et que l'écriture n'a lieu que dans une Map en mémoire. `writeOperations` ne distingue pas ce cas d'une sauvegarde durable. Une fermeture de page peut donc perdre des opérations pourtant annoncées comme gardées.

**Preuve locale :** un test force l'absence d'IndexedDB, vérifie que l'ajout est déclaré réussi, puis recharge les modules pour simuler la perte de la mémoire de la page : la file est vide. Cette preuve n'est pas une simulation d'une panne de stockage dans un navigateur réel.

**À faire :** refuser les écritures financières hors ligne sans stockage durable confirmé et afficher une erreur explicite ; garder éventuellement le repli mémoire pour la consultation.

## Autres points à traiter

- **Dépendances :** `npm audit` signale deux entrées modérées (`exceljs` et sa dépendance `uuid`) correspondant au même avis [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). L'usage trouvé dans ExcelJS appelle `uuid.v4`, alors que l'avis concerne v3/v5/v6 avec buffers ; aucune exploitation dans l'application n'est démontrée. Éviter un `npm audit fix --force` aveugle : npm propose un retour majeur à ExcelJS 3.4.0. Composer ne signale aucun avis de vulnérabilité, mais deux paquets sont abandonnés.
- **Secrets locaux :** `backend/.env copy.example`, non suivi et non protégé par les motifs actuels d'exclusion, contient des valeurs non vides pour `APP_KEY` et `MAIL_PASSWORD`. Il ne faut pas l'ajouter à Git ni aux archives de livraison. Des sauvegardes d'environnement contenant des identifiants existent aussi localement ; elles sont ignorées par Git. Aucune fuite distante ou dans l'historique Git n'est démontrée par cet examen.
- **Confidentialité du poste :** les opérations restent dans le stockage après nettoyage de la session et du cache. Le test d'audit le confirme. Conserver les opérations non synchronisées évite une perte, mais exige une politique de protection du poste et des données locales ; la déconnexion ne constitue pas un chiffrement.
- **Authentification :** limitation par couple e-mail/IP ; pas de limite cumulée par compte face à plusieurs IP. Les réponses différentes de réinitialisation de mot de passe permettent de distinguer les comptes (décision D-059). Voir aussi `docs/AUDIT_SECURITE.md` ; ne pas assimiler l'ensemble de cet ancien audit à une validation actuelle.
- **En-têtes distants :** HSTS présent, mais CSP, protection de cadre et `X-Content-Type-Options` absents sur les deux réponses publiques contrôlées.
- **Performances :** build réussi, avertissement Vite sur les gros fichiers : environ 722 ko pour le JS principal et 929 ko pour ExcelJS avant gzip. Évaluer les temps sur le réseau réel de l'hôtel.
- **CI :** ne lance ni l'audit des dépendances ni `test:e2e:offline`. Le résultat du dernier workflow distant n'a pas été vérifié et ne validerait pas à lui seul les modifications locales.
- **Livraison :** documentation ancienne et nouvelle coexistent pour le sous-domaine API et `/backend`. Choisir une procédure unique ; `docs/EXPLOITATION.md` contient encore une ancienne destination. Le fichier `.env` local est en développement, ce qui est normal ; cela ne renseigne pas la configuration privée distante.

## Exploitation et validation par l'hôtel

Les questions P1 restent indiquées ouvertes dans `docs/QUESTIONS.md` : horaires du forfait journée, périodes sans heures, réservations sans paiement, remboursements et obligations de facturation. Vérifier avec l'hôtel leur statut réel et le consigner, notamment les mentions et l'usage du ticket 80 mm comme facture. Ce rapport ne constitue pas une analyse juridique ou fiscale.

Avant ouverture effective, fournir une preuve de fonctionnement des notifications en file, de l'ordonnanceur, des sauvegardes externalisées et d'une restauration récente. La présence des scripts ne prouve pas leur exécution en production. Le suivi précédent signalait un cron d'e-mails restant à activer ; son état actuel n'est pas établi ici.

La version locale est PHP 8.2.12 et les tests DB locaux utilisent MariaDB, sans validation actuelle sur la cible MySQL 8.4. Vérifier les versions PHP web et CLI du serveur et leurs correctifs. PHP 8.2 arrive en fin de support de sécurité le 31 décembre 2026 selon le [calendrier officiel](https://www.php.net/supported-versions.php). Respecter aussi la [procédure Laravel de déploiement](https://laravel.com/docs/12.x/deployment), notamment `APP_DEBUG=false`, l'exposition du seul répertoire public et le redémarrage des workers.

La recette physique de `docs/RECETTE_HORS_LIGNE.md` reste à signer : imprimante, coupure, redémarrage, reprise, transfert de poste et restauration.

## Contrôles de cette session

Les tests généraux et les reproductions d'audit sont distincts : les reproductions réussissent lorsqu'elles démontrent la faiblesse recherchée, pas lorsque le code est sécurisé.

| Contrôle | Résultat |
|---|---|
| Lint, TypeScript, build frontend | Réussis ; avertissement de taille des fichiers |
| Prettier | Réussi |
| Composer validate --strict | Réussi |
| Exigences de plateforme Composer hors développement | Réussies localement |
| Pint et Larastan | Réussis |
| Composer audit --locked | Aucun avis ; 2 paquets abandonnés |
| npm audit | Échec : 2 entrées modérées pour le même avis transitif |
| Tests frontend | Suite initiale : 194/196 réussis, 2 échecs d'attente d'éléments ; relance des deux fichiers concernés avec un seul worker : 6/6 réussis, sans correction. Instabilité sous charge à traiter, pas de nouvelle suite complète entièrement verte |
| Tests backend | 263/263 réussis, 2 177 assertions |
| Tests navigateur | Suite initiale : 9/10 réussis, délai de 5 s dépassé en attendant le numéro de facture ; le parcours complet concerné réussit seul à la relance, sans correction |
| Tests navigateur hors ligne sur build de production | 2/2 réussis : conflit entre postes et parcours complet avec retour du réseau |
| Tests ciblés d'audit frontend | 5/5 réussis, ce qui confirme les faiblesses recherchées |
| Stockage réel dans Edge / IndexedDB | Perte d'une des deux opérations concurrentes et collision de numéros reproduites dans un contexte isolé |
| Tests ciblés d'audit backend | 3/3 réussis, 15 assertions : ancien tarif imposé par le client, autopromotion après délégation et double paiement après purge |
| Contrôle public distant | 22/11/2026 vers 22 h 26, Africa/Tunis : frontend HTTP 200 ; santé API HTTP 200, JSON, database=ok |

La réponse de santé prouve la disponibilité au moment du contrôle, pas la validité des traitements financiers, du SMTP, des sauvegardes ou de la configuration privée.

## Rejouer les reproductions d'audit

Ces commandes sont réservées à l'environnement local préparé. Le test PHP impose `jb_hotel_test` ; ne pas exécuter les suites sur une base de production et ne pas lancer plusieurs suites PHP simultanément sur la même base.

- Depuis `backend/` : `php vendor/bin/phpunit --configuration phpunit.xml ../docs/audit-securite-2026-11-22/BackendSecurityProbeTest.php`.
- Depuis `frontend/` : `npx vitest run --config ../docs/audit-securite-2026-11-22/frontend.vitest.config.mts` (requêtes simulées).
- Depuis la racine, avec Vite déjà disponible sur 5173 et Edge installé : `node docs/audit-securite-2026-11-22/frontend.storage-browser.mjs` (contexte neuf, requêtes backend bloquées).

Après correction, transformer ces preuves en tests de non-régression intégrés aux suites normales : les assertions actuelles attendent volontairement les comportements défectueux.
