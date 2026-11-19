# Recette technique — 19 novembre 2026

Résultats finaux : **183 tests backend (1 281 assertions), 74 tests frontend et 4 tests navigateur réussis (2 parcours réels, pagination sur données simulées et charte visuelle sur données réelles de recette), plus 60 contrôles de contrats réels pour l’administration et les filtres**, rejoués lors de la relecture finale du 19/11/2026. Pint, Larastan, lint, Prettier, TypeScript et build de production sont verts. Les résultats ci-dessous concernent le code local. Une ancienne CI verte ne vaut pas validation des changements actuels sur MySQL 8.4.

| Exigence | Vérification | Résultat |
|---|---|---|
| Sessions, comptes actifs, permissions, dernier administrateur | `AuthenticationTest`, `UserAdministrationTest`, `RolePermissionTest` | Validé en API |
| Absence de fuite technique et erreurs françaises | `ErrorContractTest`, tests des modales | Validé |
| UUID publics, routes et annuaires d’agents | `PublicIdentifiersTest`, `ListFiltersTest` | Validé |
| Contraintes SQL et migrations | `SchemaConstraintsTest`, `RefreshDatabase`, préparation E2E | Validé sur MariaDB locale ; contrôle MySQL 8.4 dans la CI |
| Concurrence de réservation | `ConcurrencyTest`, deux processus PHP réels | Validé |
| Capacité, maintenance, forfait demi-journée, remise et prolongation explicite | `PricingTest`, `BookingTest`, `ExtensionTest`, `RoomTypeAndRoomTest` | Validé |
| Avance, solde et remboursements sans suppression | `CashierTest`, `CashJournalTest` | Validé |
| Factures figées, avoirs, PDF et QR code | `InvoiceTest`, `InvoiceVerificationTest`, `InvoiceListTest` | Validé en API |
| E-mails après transaction et désinscription | `CustomerNotificationTest` | Validé avec transport de test ; SMTP réel à fournir |
| Paramètres et journal d’audit | `SettingsTest`, `AuditLogTest`, `AdminPages.test.tsx` | Validé |
| Filtres client/catégorie/forfait/provenance et taille de page | `ListFiltersTest`, tests frontend et composant commun | Validé |
| Rapprochement des encaissements, remboursements et annulations | `FinancialReportTest` : totaux = série quotidienne = catégories = journal | Validé |
| Factures moins avoirs, sans double déduction | `FinancialReportTest` | Validé |
| Exports CSV/PDF et permission d’export distincte | `FinancialReportTest`, parcours Playwright | Validé en API et dans le navigateur ; PDF A4 de deux pages rendu et inspecté |
| Connexion réelle avec CSRF, chambre, client, réservation, avance, facture | `frontend/e2e/hotel.spec.ts` | 2 E2E réussis sur `jb_hotel_e2e`, indépendants des données de travail |
| Administration et rapports accessibles | Axe : tags WCAG 2 A/AA, 2.1 AA et 2.2 AA sur les nouveaux écrans | Contrôle automatique ; ne remplace pas une certification ni une recette humaine complète |
| Affichage bureau, tablette et mobile | Captures Playwright, absence de débordement global | Contrôlé sur les formats de recette |
| Sauvegarde et restauration | `php infra/database-backup.php --verify` | 27 tables restaurées dans `jb_hotel_restore_test`, nombres de lignes identiques et SHA-256 enregistré |
| Design et interactions des paginations | `e2e/pagination.spec.ts` : pages, limites, taille, état vide, 1440/768/390/320 px et Axe | Validé sur données de recette simulées ; captures inspectées |
| Charte du contenu et aside inchangé | `e2e/visual-design.spec.ts` : pages, icônes des boutons, Axe, captures et géométrie/couleur de l’aside | Validé sur 17 pages/fiches et le formulaire, 31 captures ; styles et JSX de l’aside conservés |
| Filtres automatiques sans validation | `useAutoFilters.test.ts` (5 cas) et parcours pagination : recherche, e-mail, effacement, retour page 1 | 68 tests frontend et 4 tests navigateur verts |
| Charte des factures et avoirs | Facture et avoir d’une page, document long de 36 lignes sur trois pages ; rendu puis inspection des cinq pages | Vérifié ; QR décodés depuis chaque document rendu, montants figés conservés ; facture E2E d’une page avec avance/solde et adresse QR exacts contrôlés |
| Démarrage sur le serveur de développement actif | `npm run check:dev` : quatre routes anonymes et rechargement, erreurs de modules/JavaScript surveillées | Validé après réparation du cache Vite sur 5173 ; aucune préparation de base |
| Synthèses de chaque page et périmètre des chiffres | Parcours visuel et test clients : total de 217 résultats avec indicateurs d’une seule page | Données réelles, aucune extrapolation |
| Tableaux secondaires filtrables et paginés | `LocalTable.test.tsx` : recherche sans accents, page 1, état vide, impression de toutes les lignes et restauration | Trois tests dédiés ; contrôles navigateur de chaque tableau |
| Champs avec icônes, espacements et actions voisines vert/bleu | Contrôle navigateur des icônes, position du texte, espacement des formulaires et couleurs voisines | Validé en navigateur : 17 pages/fiches, formulaire, couleurs voisines, centrage des icônes et formats mobiles |
| Chambres occupées en rouge et filtre d’occupation | `AdminPages.test.tsx`, pastille et filtre dans la liste des chambres ; planning et graphique | Test d’intégration et contrôle visuel |
| Impression papier | PDF A4 et CSS d’impression | Validation physique par l’hôtel encore requise |

## Rejouer les vérifications

Dans `backend/` :

```powershell
composer lint
composer analyse
php artisan test
```

Dans `frontend/` :

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Les E2E créent puis réinitialisent **uniquement** `jb_hotel_e2e`. Le compte SQL local doit avoir le droit de créer cette base. Les serveurs temporaires utilisent 8011 et 5174, un cookie dédié, des identifiants aléatoires locaux et un transport e-mail de test. Sous Windows, Microsoft Edge est utilisé ; sous Linux, installer Chromium avec `npx playwright install --with-deps chromium`. `E2E_BROWSER_CHANNEL` permet de choisir un autre canal installé.

Les captures, traces et le PDF de contrôle restent dans `frontend/test-results/`, ignoré par Git. Les mots de passe E2E restent dans `backend/storage/framework/testing/e2e.local.json`, également ignoré. Ne pas partager les traces d’un environnement contenant de vraies données clients.

## Validation avant production

Faire valider Q-01, Q-02, Q-03, Q-07, Q-08 et Q-09 par l’hôtel, fournir le SMTP (Q-22), renseigner les mentions de facturation, vérifier les sauvegardes hors site et exécuter la CI sur MySQL 8.4. Les règles provisoires restent signalées dans l’interface. Aucun déploiement n’a été effectué pendant cette session.

Incident complémentaire : le contrôle sur serveur neuf des E2E ne détectait pas la transformation vide conservée par l’ancien processus Vite. L’export source était présent ; redémarrer Vite avec `--force` a rétabli l’affichage. Le nouveau contrôle `check:dev` a été exécuté sur le serveur actif.

Dernière recette UI : 73 tests frontend verts. Les deux parcours réels et le test de pagination passent ; le contrôle visuel a été rejoué après la correction de priorité CSS de l’alternance et de l’alignement vertical des champs. Résultat final : 1 test visuel vert, 17 pages/fiches, formulaire et 31 captures. Le contrôle du serveur actif `check:dev` passe également. Le build réussit avec un avertissement non bloquant sur le bundle principal d’environ 508 Ko avant gzip.
