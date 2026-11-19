# Journal des modifications — JB Hôtel

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Ajouté
- Phase 0 : audit des spécifications ; `docs/DECISIONS.md` (contradictions et arbitrages), `docs/QUESTIONS.md` (questions métier à valider) ; suivi d'avancement `CHECK_LEVEL.md`.
- Phase 1 : dépôt git ; application `backend/` (Laravel 12, Sanctum, API `/api/v1`, contrat d'erreur JSON en français, endpoint de santé) ; application `frontend/` (React 19 + TypeScript + Vite, routeur, TanStack Query, client API typé, modale d'erreur accessible) ; `infra/docker-compose.yml` (MySQL 8.4) ; CI GitHub Actions ; README.

### Modifié
- Spécifications déplacées de la racine vers `docs/` ; ancienne version V2 archivée dans `docs/archive/`.
