# Journal des modifications — JB Hôtel

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté
- Phase 0 : audit des spécifications ; `docs/DECISIONS.md` (contradictions et arbitrages), `docs/QUESTIONS.md` (questions métier à valider) ; suivi d'avancement `CHECK_LEVEL.md`.
- Phase 1 : dépôt git ; application `backend/` (Laravel 12, Sanctum, API `/api/v1`, contrat d'erreur JSON en français, endpoint de santé) ; application `frontend/` (React 19 + TypeScript + Vite, routeur, TanStack Query, client API typé, modale d'erreur accessible) ; `infra/docker-compose.yml` (MySQL 8.4) ; CI GitHub Actions ; README.

- Phase 2 :
  - **Schéma de base complet** : 10 migrations, clés étrangères en `RESTRICT`, 20 contraintes `CHECK`, intervalle bloqué indexé ; documenté dans `docs/SCHEMA.md`.
  - **Module Identity** : connexion, déconnexion et profil (Sanctum SPA, CSRF, 5 essais/min) ; gestion des utilisateurs par l'administrateur, avec protections « soi-même » et « dernier administrateur » ; 27 permissions et 2 rôles (spatie/laravel-permission) ; permissions de la caissière modifiables ; commande `jb:create-admin`.
  - **Journal d'audit** (`AuditTrail`), append-only et transactionnel.
  - **Seeders** : rôles, paramètres provisoires (`settings`) et comptes de démonstration (local uniquement).
  - Décisions D-017 à D-025.

### Modifié
- Spécifications déplacées de la racine vers `docs/` ; ancienne version V2 archivée dans `docs/archive/`.
- Phase 2 : le modèle `User` passe de `App\Models` à `App\Modules\Identity\Models` ; la colonne `users.role` du schéma 09 n'est pas créée (rôles Spatie).
