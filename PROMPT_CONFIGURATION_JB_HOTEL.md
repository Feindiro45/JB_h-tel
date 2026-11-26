# Prompt agent IA — Configuration locale et préparation au déploiement de JB Hôtel

## 1. Mission

Interviens directement sur le projet existant JB Hôtel (React, Laravel, MySQL et PWA). Configure et teste la communication frontend/backend en local avant de préparer le déploiement. Ne déploie rien en production et ne recrée pas le projet.

## 2. Architecture cible

| Composant | Local | Production | Répertoire serveur indicatif |
|---|---|---|---|
| React | http://localhost:5173 | https://app.jb-hotel.com | htdocs/frontend |
| Laravel | http://localhost:8000 | https://api.jb-hotel.com | htdocs/backend/public |
| API REST | http://localhost:8000/api | https://api.jb-hotel.com/api | Laravel |

Conserve les noms de dossiers existants. Les ports locaux sont indicatifs. Les applications restent indépendantes et communiquent via HTTP/HTTPS.

## 3. Audit préalable

- Identifier les versions de Laravel, React, Vite et des dépendances.
- Identifier l'authentification réelle : Sanctum avec cookies, jetons Bearer, JWT ou autre.
- Examiner les routes, middlewares, variables d'environnement, CORS, Axios/Fetch et URL codées en dur.
- Examiner le service worker, le manifeste PWA, le stockage local et la synchronisation hors ligne.
- Identifier les dépendances entre applications et les fonctionnalités existantes.
- Préserver les modifications utilisateur et les secrets ; ne pas remplacer une architecture fonctionnelle sans justification.

## 4. Configuration React

Si Vite est utilisé, préparer `.env.development` :

```env
VITE_APP_NAME="JB Hôtel"
VITE_APP_URL=http://localhost:5173
VITE_API_URL=http://localhost:8000/api
```

Préparer `.env.production` :

```env
VITE_APP_NAME="JB Hôtel"
VITE_APP_URL=https://app.jb-hotel.com
VITE_API_URL=https://api.jb-hotel.com/api
```

Fournir `.env.example` documenté. Vérifier les éventuelles surcharges par les fichiers `.env.local` et les variables système. Ne jamais placer de secrets dans les variables VITE. Adapter la configuration au bundler réel si Vite n'est pas utilisé.

## 5. Configuration Laravel

Adapter le `.env` local sans écraser les paramètres existants :

```env
APP_NAME="JB Hôtel"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173
```

Préparer `.env.production.example` sans secrets :

```env
APP_NAME="JB Hôtel"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.jb-hotel.com
FRONTEND_URL=https://app.jb-hotel.com
```

Préserver APP_KEY, les identifiants MySQL, la messagerie et les autres services. Ne jamais versionner les secrets. Utiliser une base locale ou de test, jamais la base de production pour les tests.

## 6. Configuration CORS

Publier la configuration si nécessaire et si la version Laravel le permet :

```bash
php artisan config:publish cors
```

Configuration de référence pour une authentification par jetons Bearer :

```php
<?php
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => [env('FRONTEND_URL')],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 3600,
    'supports_credentials' => false,
];
```

Adapter les chemins aux routes réelles. Autoriser uniquement les origines nécessaires, gérer OPTIONS (preflight), les méthodes et en-têtes nécessaires. Éviter les doublons d'en-têtes Apache/Laravel. Ne pas utiliser `no-cors`, désactiver la sécurité du navigateur ou autoriser toutes les origines en production.

Si Sanctum utilise des cookies, adapter `supports_credentials`, `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN`, `SESSION_SECURE_COOKIE`, CSRF et `/sanctum/csrf-cookie`, ainsi que `withCredentials` et `withXSRFToken` selon la version Axios. Utiliser une origine cohérente en local (localhost, sans mélange avec 127.0.0.1). Prévoir le domaine de session `.jb-hotel.com` en production si nécessaire et HTTPS. Vérifier les routes de connexion et CSRF hors du préfixe `/api`.

Ne pas changer le mécanisme d'authentification existant sans justification.

```bash
php artisan optimize:clear
```

En production, reconstruire le cache de configuration après installation du véritable `.env`.

## 7. Centralisation des appels API

Adapter le service HTTP existant, par exemple :

```javascript
import axios from 'axios';
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    headers: { Accept: 'application/json' },
    timeout: 30000
});
export default api;
```

Supprimer les URL d'API codées en dur au profit de la configuration centralisée. Préserver les intercepteurs, jetons, sessions, téléversements, téléchargements, factures, synchronisation et gestion des erreurs. Adapter les appels CSRF si nécessaire. Ne pas imposer JSON aux requêtes multipart.

## 8. Gestion des erreurs

Préserver les modals et messages en français. Traiter les statuts 400, 401, 403, 404, 409, 419, 422, 429, 500 et 503 selon leur signification et le contexte. Distinguer erreurs HTTP, réseau, hors ligne et CORS lorsque les éléments disponibles le permettent. Une erreur réseau côté JavaScript ne suffit pas à identifier avec certitude un problème CORS. Ne pas exposer de données sensibles.

## 9. PWA et fonctionnement hors ligne

- Vérifier le manifeste, le service worker, les caches et le stockage local.
- Tester le démarrage hors ligne après fermeture et redémarrage de la machine, dans un environnement compatible avec les service workers.
- Préserver les opérations non synchronisées, la reprise après reconnexion, la prévention des doublons et la gestion des conflits.
- Vérifier les changements d'origine et de version des caches ; ne pas effacer les données locales en attente.
- Ne pas assimiler automatiquement une erreur CORS à une absence de connexion.
- Ne pas mettre en cache les réponses sensibles sans stratégie explicite et sécurisée.
- Ne pas remplacer le stockage existant sans justification. Documenter les limites réelles du fonctionnement hors ligne.

## 10. Préparation Apache et production

Préparer le `.htaccess` React pour React Router si Apache et mod_rewrite sont disponibles :

```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^ index.html [L]
</IfModule>
```

Vérifier que ce fichier est inclus dans le build ou documenter sa copie.

- Faire pointer `app.jb-hotel.com` vers le dossier contenant le contenu de `dist`.
- Faire pointer `api.jb-hotel.com` uniquement vers `backend/public`.
- Conserver le `.htaccess` Laravel dans `public`.
- Protéger les fichiers privés, notamment `.env`, `vendor`, `config` et `storage`, y compris depuis le domaine principal si htdocs est accessible publiquement. Préférer un backend privé hors de toute racine web lorsque l'hébergement le permet.
- Prévoir SSL/HTTPS sur les deux sous-domaines et les permissions Laravel nécessaires.
- Documenter `composer install --no-dev --optimize-autoloader`, la configuration, les migrations non destructives et le cache de production.
- Vérifier `npm run build` et l'utilisation de l'URL de production dans le build, sans effectuer de requêtes modifiant la production.
- Ne pas effectuer le déploiement réel.

## 11. Tests obligatoires

Créer ou adapter un endpoint de santé non sensible si nécessaire :

```php
Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'application' => 'JB Hôtel']);
});
```

Vérifier `http://localhost:8000/api/health`, puis effectuer les tests depuis le navigateur pour valider réellement le CORS.

Tester :

- Démarrage local des deux applications.
- Requêtes OPTIONS et en-têtes CORS, origine autorisée et origine non autorisée.
- Authentification, déconnexion, rôles et permissions.
- Clients, chambres, réservations, caisse, paiements, factures et tickets thermiques.
- Tableau de bord analytique.
- Fonctionnement hors ligne et synchronisation.
- Build de production et routes React après actualisation.

Utiliser des données de test pour les opérations financières. Ne jamais déclarer réussi un test non exécuté. Documenter les tests impossibles et leurs causes.

## 12. Contraintes

Respecter SOLID, DRY, séparation des responsabilités, architecture modulaire existante, sécurité des API, intégrité des données et transactions ACID. Préserver toutes les fonctionnalités. Ne pas effectuer de migration destructive, réinitialisation ou suppression de données sans autorisation.

## 13. Documentation attendue

Créer `docs/deployment/` avec :

- `01_CONFIGURATION_LOCALE.md` : prérequis, dépendances, variables, base de données, commandes de démarrage et vérifications.
- `02_CONFIGURATION_CORS.md` : configuration retenue, authentification, tests et dépannage.
- `03_DEPLOIEMENT_PRODUCTION.md` : sous-domaines, htdocs, Apache, build React, Laravel, SSL, sécurité, permissions et procédure de mise à jour.
- `04_RAPPORT_IMPLEMENTATION.md` : audit, fichiers modifiés/créés, problèmes, solutions, résultats réels, tests non exécutés, risques et recommandations.

## 14. Critères d'acceptation

React et Laravel fonctionnent localement et communiquent sans erreur CORS. L'authentification et les fonctionnalités existantes sont préservées. Les capacités hors ligne sont testées et leurs limites documentées. Le build de production utilise `https://api.jb-hotel.com/api` et le frontend est prêt pour `https://app.jb-hotel.com`. La documentation est complète.

## 15. Instructions finales

Commence par l'audit, puis applique directement les modifications nécessaires dans le code. Ne te limite pas à des recommandations théoriques. Travaille exclusivement en local. Si un blocage survient, identifie sa cause et documente-le. Présente à la fin le rapport des modifications et des tests effectivement exécutés.

## Références techniques

- https://laravel.com/docs/12.x/sanctum
- https://laravel.com/docs/12.x/deployment
- https://vite.dev/guide/env-and-mode
- https://developer.mozilla.org/fr/docs/Web/HTTP/CORS
- https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html

Adapter les références aux versions réellement installées.
