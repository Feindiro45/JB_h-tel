# 02 — CORS et authentification

Référence : `PROMPT_CONFIGURATION_JB_HOTEL.md`, section 6.

## 1. Authentification réellement en place

**Sanctum en mode SPA, session par cookie** (`docs/DECISIONS.md` D-005) — pas de jeton Bearer, pas
de JWT. Cela a des conséquences directes sur le CORS, et le mécanisme n'a pas été changé.

```
bootstrap/app.php        $middleware->statefulApi()      session + CSRF pour le frontend
config/cors.php          supports_credentials => true    obligatoire avec des cookies
frontend/.../client.ts   credentials: 'include'          + en-tête X-XSRF-TOKEN
```

Déroulé d'une connexion :

1. `GET /sanctum/csrf-cookie` → dépose les cookies `XSRF-TOKEN` et de session ;
2. le client lit `XSRF-TOKEN` **en JavaScript** (`document.cookie`) et le renvoie dans
   `X-XSRF-TOKEN` sur chaque écriture ;
3. `POST /api/v1/auth/login` → session ouverte ;
4. les appels suivants portent le cookie de session.

L'étape 2 est la contrainte structurante : le cookie CSRF doit être **lisible** par le domaine du
frontend, donc jamais `HttpOnly` et jamais limité au seul hôte de l'API.

## 2. Configuration retenue

`backend/config/cors.php` (inchangé, déjà correct) :

```php
'paths'            => ['api/*', 'sanctum/csrf-cookie'],   // l'appel CSRF est hors de /api
'allowed_methods'  => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
'allowed_origins'  => /* FRONTEND_URL, découpé sur les virgules */,
'allowed_headers'  => ['Accept', 'Content-Type', 'X-Requested-With', 'X-XSRF-TOKEN',
                       'X-Workstation-Token', 'Idempotency-Key', 'X-Offline-Replay'],
'exposed_headers'  => ['Retry-After', 'Idempotent-Replayed', 'Content-Disposition'],
'supports_credentials' => true,
```

Écarts assumés par rapport à la configuration de référence de la section 6 du prompt, qui décrit une
authentification par jetons Bearer :

| Clé | Prompt | Ici | Raison |
|---|---|---|---|
| `supports_credentials` | `false` | `true` | cookies de session Sanctum |
| `paths` | `api/*` | `+ sanctum/csrf-cookie` | la route CSRF est hors de `/api` |
| `allowed_headers` | `*` | liste explicite | `*` est interdit avec des identifiants |
| `exposed_headers` | vide | 3 en-têtes | nom des fichiers Excel, `Retry-After`, rejeu idempotent |
| `allowed_origins` | `env(FRONTEND_URL)` | liste découpée | plusieurs origines locales nécessaires |

Jamais de joker `*` : il est refusé par les navigateurs dès que `supports_credentials` est actif.
Les requêtes `OPTIONS` (preflight) sont traitées par le middleware `HandleCors` de Laravel ; aucun
en-tête CORS n'est ajouté par Apache, ce qui éviterait un doublon (`Access-Control-Allow-Origin`
présent deux fois fait échouer la requête).

## 3. Variables par environnement

| Variable | Local | Production |
|---|---|---|
| `FRONTEND_URL` | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173` | `https://app.jb-hotel.com` |
| `SANCTUM_STATEFUL_DOMAINS` | `localhost:5173,127.0.0.1:5173,localhost:4173` | `app.jb-hotel.com` |
| `SESSION_DOMAIN` | `null` | `.jb-hotel.com` |
| `SESSION_SECURE_COOKIE` | absent | `true` |
| `SESSION_SAME_SITE` | `lax` | `lax` |
| `VITE_API_URL` | `http://localhost:8000` | `https://api.jb-hotel.com` |

### `SESSION_DOMAIN=.jb-hotel.com` — le point à ne pas manquer

En local, frontend et API partagent l'hôte `localhost` : le cookie `XSRF-TOKEN` est lisible et
`SESSION_DOMAIN=null` suffit. En production, les deux applications sont sur **deux sous-domaines
différents**. Avec `SESSION_DOMAIN=null`, le cookie reste privé à `api.jb-hotel.com` : le JavaScript
de `app.jb-hotel.com` ne peut pas le lire, l'en-tête `X-XSRF-TOKEN` part vide et **toutes les
écritures échouent en 419**, alors que les lectures peuvent sembler fonctionner. Le point initial
(`.jb-hotel.com`) autorise les deux sous-domaines.

`SameSite=lax` convient : `app.jb-hotel.com` et `api.jb-hotel.com` partagent le domaine enregistrable
`jb-hotel.com`, donc les appels sont *same-site* même s'ils sont *cross-origin*. Si le frontend était
un jour hébergé sur un **autre domaine**, il faudrait `SESSION_SAME_SITE=none` avec
`SESSION_SECURE_COOKIE=true`.

`SESSION_SECURE_COOKIE=true` exige HTTPS sur les deux sous-domaines : sans certificat, aucun cookie
n'est accepté et la connexion est impossible.

## 4. Après toute modification de configuration

```bash
php artisan optimize:clear          # local
php artisan config:cache            # serveur, après avoir installé le vrai .env
```

Un `config:cache` obsolète est la première cause d'un CORS « qui ne prend pas » : les valeurs
compilées ignorent le nouveau `.env`.

## 5. Tests

Le CORS ne se vérifie pas avec `curl` : un client en ligne de commande n'applique aucune politique
d'origine et répondra correctement même sur une configuration refusée par un navigateur. `curl` ne
sert qu'à **lire les en-têtes de réponse** ; la validation se fait dans le navigateur.

Preflight, origine autorisée :

```bash
curl -i -X OPTIONS http://localhost:8000/api/v1/auth/login \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-xsrf-token"
# Attendu : 204, Access-Control-Allow-Origin: http://localhost:5173,
#           Access-Control-Allow-Credentials: true
```

Origine non autorisée :

```bash
curl -i -X OPTIONS http://localhost:8000/api/v1/auth/login \
  -H "Origin: https://exemple-non-autorise.test" \
  -H "Access-Control-Request-Method: POST"
# Attendu : aucun en-tête Access-Control-Allow-Origin, le navigateur bloquerait l'appel
```

Validation réelle, dans le navigateur : ouvrir le frontend, se connecter, enregistrer un paiement sur
une réservation de test, puis vérifier dans l'onglet Réseau que l'appel `OPTIONS` précède le `POST` et
qu'aucune erreur CORS n'apparaît en console. Les tests automatisés `php artisan test` ne couvrent pas
le CORS : ils passent par le noyau HTTP sans en-tête `Origin` imposé.

## 6. Dépannage

| Symptôme | Cause probable | Correction |
|---|---|---|
| « No Access-Control-Allow-Origin header » | origine absente de `FRONTEND_URL`, ou `config:cache` obsolète | ajouter l'origine, `php artisan config:cache` |
| Lectures correctes, écritures en **419** | `SESSION_DOMAIN` ne couvre pas le frontend, ou `GET /sanctum/csrf-cookie` non appelé | `SESSION_DOMAIN=.jb-hotel.com` |
| **401** après une connexion réussie | hôte absent de `SANCTUM_STATEFUL_DOMAINS`, ou mélange `localhost` / `127.0.0.1` | aligner l'origine et la variable |
| Cookie refusé en production | `SESSION_SECURE_COOKIE=true` sans HTTPS | installer le certificat sur les deux sous-domaines |
| `Access-Control-Allow-Origin` en double | en-têtes ajoutés par Apache **et** par Laravel | retirer les `Header set` du `.htaccess` |
| Nom du fichier Excel perdu | `Content-Disposition` absent de `exposed_headers` | déjà exposé, ne pas le retirer |
| 404 sur `/sanctum/csrf-cookie` | `VITE_API_URL` terminé par `/api` | retirer le suffixe (racine de Laravel) |

Une erreur réseau côté JavaScript ne suffit pas à conclure à un problème de CORS : coupure, DNS,
certificat invalide et 500 produisent le même `TypeError: Failed to fetch`. Le diagnostic se fait dans
la console du navigateur (qui nomme explicitement le blocage CORS) et dans les journaux Laravel.
Le projet en tient compte : `shared/offline/connectivity.ts` distingue serveur injoignable et erreur
applicative, et ne déduit pas une absence de réseau d'une erreur de requête.
