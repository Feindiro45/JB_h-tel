# Décisions et arbitrages — JB Hôtel

Ce fichier consigne les choix techniques et les arbitrages entre documents, comme l'exige `06_PROMPT_AGENT_IA_IMPLEMENTATION.md`.

Chaque décision porte l'un des statuts suivants :
- **Validé** : décision confirmée par l'hôtel ou par la section « Décisions confirmées V6 ».
- **Technique** : choix d'implémentation, sans impact métier.
- **Provisoire** : valeur configurable, utilisée pour avancer et pour les tests. Elle **n'est pas une règle validée** et doit être confirmée avant la mise en production (voir `QUESTIONS.md`).

## Règle de priorité entre documents

Chaque document se termine par les sections « Règles validées : demi-journée, validation et messages » et « Décisions confirmées V6 ». Ces sections sont les plus récentes : elles priment sur le texte plus ancien du même document. Pour toute autre contradiction, on privilégie l'intégrité des données, la traçabilité et les exigences explicitement validées.

## Contradictions relevées et arbitrage

| # | Contradiction | Arbitrage |
|---|---|---|
| C-01 | 02 et 06 : « MySQL ou PostgreSQL » ; V6 : MySQL 8+ seul | **MySQL 8+ InnoDB, utf8mb4** (V6) — voir D-002 |
| C-02 | 06 : « ne pas coder arbitrairement 12 heures » ; règles validées : demi-journée ≤ 12 h | **Demi-journée = forfait pour toute durée positive jusqu'à 12 h incluses** — voir D-007 |
| C-03 | 09 et MCD : colonne `users.role` ; V6 : `spatie/laravel-permission` | Rôles gérés **uniquement par Spatie**, colonne `users.role` supprimée — voir D-006 |
| C-04 | 02 : fiche client réduite (nom, téléphone) ; V6 : fiche détaillée | Fiche détaillée de V6 (déjà présente dans 09) |
| C-05 | 09 incomplet par rapport aux spécifications | Compléter dans les migrations (phase 2) : `timestamps`, tables Spatie, paramètres (plafonds de remise), journal des modifications de réservation, arrivée et départ effectifs, motif d'annulation, numérotation des reçus. Le cas de la maintenance planifiée est ouvert (Q-12). |
| C-06 | 06 : documents dans `docs/` ; dossier livré à plat | Spécifications déplacées dans `docs/` ; ancienne version V2 archivée dans `docs/archive/` |

## Décisions

### D-001 — Organisation du dépôt (Technique)
Le dossier du projet est la racine du dépôt (`jb-hotel/` dans la fiche 06). Il contient deux applications indépendantes, `backend/` (API Laravel) et `frontend/` (React + TypeScript), ainsi que `docs/` et `infra/`. Le fichier `CHECK_LEVEL.md`, à la racine, suit l'avancement.

### D-002 — SGBD (Validé + Technique)
- **Cible : MySQL 8+ InnoDB, utf8mb4** (`utf8mb4_unicode_ci`).
- **Développement local : MariaDB 10.4 (XAMPP)**. Le poste de développement n'a ni MySQL 8 ni Docker. Le code doit donc fonctionner sur les deux moteurs :
  - éviter les fonctions propres à MariaDB ;
  - éviter les fonctions de MySQL 8 absentes de MariaDB 10.4 : `SKIP LOCKED`, index sur chemin JSON, colonnes générées sur JSON ;
  - ne pas dépendre du type JSON natif : MariaDB le stocke en `LONGTEXT`.
- La CI exécute les tests sur **MySQL 8.4**. La recette finale se fait sur MySQL 8.
- `infra/docker-compose.yml` fournit un service MySQL 8.4. Il n'a pas été testé localement, faute de Docker.

### D-003 — Version de Laravel (Technique)
**Laravel 12** sur PHP 8.2 : Laravel 13 exige PHP 8.3, absent du poste. Une montée de version reste possible plus tard.

### D-004 — Pile frontend (Technique)
React 19, TypeScript, Vite 8, React Router, TanStack Query, React Hook Form + Zod, Vitest + Testing Library, oxlint + Prettier.

### D-005 — Authentification (Technique, à implémenter en phase 2)
**Laravel Sanctum en mode SPA** : session par cookie et protection CSRF, sans jeton bearer stocké dans `localStorage`, pour limiter le risque de vol par XSS.
- Le frontend et l'API doivent partager le même domaine enregistrable : `localhost` en développement, des sous-domaines du même domaine en production.
- CORS est configuré avec `supports_credentials`.

### D-006 — Rôles et permissions (Validé)
`spatie/laravel-permission`. Rôles initiaux : `admin` et `caissiere`. Les autorisations sont vérifiées par des policies et des permissions fines, côté serveur. La colonne `users.role` de 09 n'est pas créée : Spatie est l'unique source de vérité. Le champ `active` est conservé.

### D-007 — Demi-journée (Validé)
- Forfait pour toute durée positive **jusqu'à 12 h incluses**, sans facturation horaire.
- Au-delà de 12 h, l'application affiche une alerte. La caissière doit valider explicitement la prolongation et le supplément, après vérification des conflits et affichage du montant proposé.
- L'opération est journalisée : auteur, date, ancien et nouveau montant.
- **Aucune conversion automatique en journée.** La durée de 12 h est un paramètre de configuration.

### D-008 — Montants et arrondis (Validé + Provisoire)
- Montants en **entiers FCFA (XAF)**, colonnes `BIGINT`. Aucun flottant dans les calculs.
- **Provisoire :** la remise en pourcentage est arrondie au FCFA le plus proche, demi supérieur (arrondi commercial), sur le montant de la remise. La règle est paramétrable (Q-05).

### D-009 — Période bloquée sans heure (Provisoire, politique conservatrice)
Tant que l'hôtel n'a pas tranché (Q-02, Q-03) :
- heure d'arrivée absente : la chambre est bloquée **dès 00:00** de la date de début ;
- heure de départ absente : la chambre est bloquée **jusqu'à la fin** (24:00) de la date de fin ;
- deux réservations le même jour sans heure sont donc **toujours en conflit** ;
- l'interface signale une réservation dont la période est déduite (« période ambiguë »).

La politique est paramétrable et couverte par des tests.

### D-010 — Fuseau horaire (Provisoire, à confirmer Q-13)
Fuseau de l'application : **`Africa/Bangui`** (UTC+1, sans heure d'été), configurable par `APP_TIMEZONE`. Les dates et heures de séjour sont des heures locales de l'hôtel.

### D-011 — Langue et contrat d'erreur API (Validé + Technique)
- Langue de l'application : `fr`. Tous les messages destinés aux utilisateurs sont en français.
- Les erreurs de l'API sont renvoyées en JSON : `{ "title", "message", "errors"? }`. Aucune trace technique n'est exposée.
- Le frontend affiche ces erreurs dans une modale accessible et conserve les saisies.
- Les codes traités sont 401, 403, 404, 409, 419, 422, 429, 500 et 503. Pour une erreur réseau, le message est « Connexion impossible. Vérifiez votre connexion et réessayez. »

### D-012 — Versionnement de l'API (Technique)
Toutes les routes métier sont préfixées par `/api/v1`.

### D-013 — Base de test (Technique)
Les tests backend tournent sur une base MySQL ou MariaDB dédiée (`jb_hotel_test`), **pas sur SQLite**. Le verrouillage, la concurrence et les contraintes doivent être testés sur le moteur réel.

### D-014 — Trop-perçu (Provisoire)
Pas de procédure de trop-perçu en V1. La somme des paiements nets (paiements validés moins remboursements) ne peut pas dépasser le montant net dû.

### D-015 — Numérotation des factures (Provisoire, à confirmer Q-09)
Format `FAC-AAAA-NNNNNN` : séquence annuelle continue, sans trou, attribuée dans la transaction d'émission. Le format reste à confirmer selon les obligations fiscales de la RCA.

### D-016 — Plafond de remise de la caissière (Provisoire, à confirmer Q-06)
Le plafond est enregistré dans les paramètres et modifiable par l'administrateur. Valeur provisoire par défaut : **10 %** du montant brut pour la caissière. L'administrateur n'a pas de plafond, mais le total net doit rester ≥ 0.
