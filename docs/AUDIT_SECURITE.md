# Audit de sécurité — JB Hôtel

**Date :** 20 novembre 2026
**Périmètre :** l'API Laravel (`backend/`), l'application du personnel (`frontend/`), les pages publiques (vérification de facture, désinscription, pages d'erreur), la configuration et les dépendances.
**Consigne :** audit seul, **aucune correction appliquée**. Les recommandations ci-dessous restent à décider et à réaliser.

## Méthode et limites

- **Lecture du code :** toutes les routes des 8 modules, la connexion et les mots de passe, les droits, les requêtes SQL, les vues Blade et PDF, les exports CSV, la vérification publique, la configuration (session, CORS, Sanctum) et le code React (rendu HTML, liens, stockage, redirections).
- **Essais en lecture seule** sur le serveur local : en-têtes renvoyés par l'API (`/api/v1/health`).
- **Audit des dépendances :** `composer audit` et `npm audit`.
- **Non couvert :** pas de test d'intrusion actif, ni d'essai sur le futur serveur de production ou chez l'hébergeur. Leur configuration (HTTPS, pare-feu, PHP, base de données) devra être vérifiée à la mise en ligne.

## Synthèse

**Aucune faille critique trouvée.** Les risques les plus graves pour une application de ce type sont absents :
- pas d'injection SQL ;
- pas de contournement de la connexion ou des droits ;
- pas d'accès direct aux données d'un autre dossier par un identifiant deviné ;
- pas d'injection de code HTML ou JavaScript ;
- pas de secret dans le dépôt.

Les faiblesses portent sur les **protections autour du code** : la résistance aux essais de mots de passe, les en-têtes de sécurité HTTP, l'usage sur des postes partagés et la configuration de la mise en production.

| N° | Gravité | Constat | Côté |
|---|---|---|---|
| S-01 | **Élevée** | Essais de mots de passe limités seulement par couple e-mail + adresse IP ; comptes devinables via « Mot de passe oublié » ; pas de double authentification pour l'administrateur | Serveur |
| S-02 | **Élevée** (échéance) | PHP 8.2 n'aura plus de correctifs de sécurité après le 31/12/2026 ; poste local en PHP 8.2.12 (2023) | Serveur |
| S-03 | Moyenne | Aucun en-tête de sécurité HTTP sur l'API et les pages publiques | Serveur |
| S-04 | Moyenne | Application du personnel sans politique de contenu (CSP) ni protection contre l'affichage dans un cadre (clickjacking) | Navigateur |
| S-05 | Moyenne | Postes de caisse partagés : session ouverte 2 h sans activité, conservée à la fermeture du navigateur ; données qui peuvent rester dans le cache | Les deux |
| S-06 | Moyenne | Proxys et noms d'hôte de confiance non configurés pour un hébergement derrière un intermédiaire | Serveur |
| S-07 | Élevée en cas d'oubli | `APP_DEBUG=true` en production afficherait le détail technique des erreurs sur les pages web | Serveur |
| S-08 | Faible | Version de PHP affichée dans chaque réponse (`X-Powered-By`) | Serveur |
| S-09 | Faible | Sessions lisibles dans la base et ses sauvegardes | Serveur |
| S-10 | Faible | Journal technique sans rotation | Serveur |
| S-11 | Faible | Mots de passe : pas de contrôle des mots de passe déjà divulgués ; limite de 72 octets de bcrypt | Serveur |
| S-12 | Faible | Journal d'audit infalsifiable dans l'application, mais pas au niveau de la base | Serveur |
| S-13 | Info | Point de santé public, paquets abandonnés, conservation des données personnelles | Les deux |

## Constats détaillés

### S-01 — Essais de mots de passe et comptes devinables (Élevée)

**Où :**
- `AuthenticationService::login` ;
- `AuthenticationService::requestPasswordReset` ;
- les routes `auth/login` et `auth/forgot-password`.

**Constat :**
- La connexion bloque après **5 échecs par minute pour un même couple e-mail + adresse IP**. Il n'existe aucune limite par compte, toutes adresses IP confondues, ni de limite par adresse IP sur plusieurs comptes. Seule s'applique la limite générale de 120 requêtes par minute.
- « Mot de passe oublié » répond différemment selon que le compte existe (202), n'existe pas (404) ou est désactivé (403). C'est une décision volontaire (D-059, ta demande), limitée à 5 demandes par minute et par adresse IP.
- Les échecs de connexion ne sont pas inscrits au journal d'audit : l'administrateur ne voit pas une attaque en cours.
- Il n'y a pas de double authentification (code par e-mail ou application).

**Risque :**
1. Un attaquant obtient la liste des adresses valides par « Mot de passe oublié ».
2. Il essaie ensuite des mots de passe depuis de nombreuses adresses IP : 100 adresses donnent 500 essais par minute sur le compte administrateur.
3. Un compte administrateur pris donne la main sur la caisse, les remboursements, les suppressions et les droits.

L'e-mail d'alerte de connexion prévient la victime, mais seulement après la prise du compte.

**Recommandations :**
- Limiter aussi **par compte**, toutes adresses IP confondues. Par exemple : 10 échecs en 15 minutes, puis blocage temporaire, avec un message clair.
- Limiter aussi **par adresse IP**, tous comptes confondus. Par exemple : 20 échecs en 10 minutes.
- Inscrire les échecs et les blocages au **journal d'audit**, avec un filtre dédié.
- **Double authentification** au moins pour l'administrateur, par exemple un code envoyé par e-mail.
- Réexaminer D-059 : une réponse neutre (« si ce compte existe, un e-mail a été envoyé ») supprimerait la découverte des comptes. C'est une décision à prendre de ton côté.

### S-02 — Fin des correctifs de PHP 8.2 (Élevée, échéance au 31/12/2026)

**Où :**
- `composer.json` (`"php": "^8.2"`) ;
- la CI (`php-version: '8.2'`) ;
- le poste local (XAMPP, PHP 8.2.12 compilé en octobre 2023).

**Constat :** la branche PHP 8.2 ne reçoit plus de correctifs de sécurité après le **31 décembre 2026**, soit dans six semaines. La version locale 8.2.12 n'a même pas les correctifs 8.2 publiés depuis 2023. MariaDB 10.4, en local, n'est plus maintenue non plus ; la production prévoit MySQL 8.4, qui reste suivi.

**Risque :** une faille de PHP découverte après cette date ne serait jamais corrigée sur le serveur.

**Recommandations :**
- Mettre la production sur **PHP 8.4**, que Laravel 12 prend en charge.
- Passer la CI en 8.4, puis relever l'exigence de `composer.json`.
- Mettre à jour le poste de développement.

### S-03 — Aucun en-tête de sécurité HTTP (Moyenne)

**Où :** `bootstrap/app.php`. Aucun middleware n'ajoute d'en-tête de sécurité.

**Vérifié** sur `GET /api/v1/health`. La réponse contient seulement `Cache-Control: no-cache, private`, `Content-Type`, `X-RateLimit-*`, `Vary`… et `X-Powered-By: PHP/8.2.12`. Aucun en-tête de sécurité n'est présent dans le dépôt.

**Risque :**
- **Sans HSTS :** sur un Wi-Fi public, la première connexion peut être détournée vers HTTP.
- **Sans `X-Frame-Options` ni `frame-ancestors` :** la page publique de vérification peut être affichée dans un site piégé.
- **Sans `X-Content-Type-Options` :** les navigateurs peuvent deviner le type des fichiers.
- **Sans `Referrer-Policy`** sur la page de vérification, dont l'adresse contient le code secret (`?code=`), ce code peut être transmis à un autre site. Le risque est faible aujourd'hui, car la page ne contient que des liens `mailto:` et `tel:`.

**Recommandations :** un middleware global qui ajoute :
- `Strict-Transport-Security: max-age=31536000`, en HTTPS seulement ;
- `X-Content-Type-Options: nosniff` ;
- `X-Frame-Options: DENY` ;
- `Referrer-Policy: no-referrer` ;
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` ;
- pour les pages HTML, une CSP stricte : `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'nonce-…'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.

**À savoir :** le bouton « Revenir en arrière » des pages d'erreur (`errors/layout.blade.php`) utilise un `onclick` dans le HTML. Il faudra le passer en script avec nonce, sinon la CSP le bloquera. Ne pas mettre de CSP sur les réponses PDF : certains lecteurs PDF intégrés aux navigateurs ne s'affichent plus.

### S-04 — Application du personnel sans CSP ni protection anti-cadre (Moyenne)

**Où :** l'hébergement de `frontend/dist`. Rien n'est prévu dans le dépôt ni dans `docs/EXPLOITATION.md`, qui ne mentionne que HTTPS et le renvoi vers `index.html`.

**Risque :**
- **Clickjacking :** un site piégé peut afficher l'application dans un cadre invisible et faire cliquer une caissière connectée sur « Rembourser », « Annuler » ou « Supprimer ».
- **Pas de seconde barrière :** si une faille d'injection de script apparaissait plus tard (dépendance compromise, futur code), rien ne la contiendrait. React échappe bien le texte aujourd'hui.

**Recommandations :** faire envoyer par le serveur web du frontend (Apache `.htaccess`, nginx ou panneau de l'hébergeur) :
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://<adresse-de-l-api>; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` ;
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` et HSTS.

Vérifier ensuite tous les écrans sur la version compilée : la recette navigateur actuelle tourne sur le serveur de développement.

### S-05 — Postes de caisse partagés (Moyenne)

**Où :**
- `config/session.php` : `lifetime` 120 min, `expire_on_close` désactivé ;
- l'API répond avec `Cache-Control: no-cache, private`.

**Constat :**
- Une caissière qui quitte le poste sans se déconnecter laisse sa session ouverte **deux heures**, même navigateur fermé.
- Avec `no-cache`, le navigateur peut garder sur le disque les réponses (fiches clients, montants) et les PDF de factures. Il faudrait `no-store`.

**Recommandations :**
- `SESSION_EXPIRE_ON_CLOSE=true`, et une durée de 30 à 60 minutes, à décider avec l'hôtel.
- **Déconnexion automatique** de l'écran après une période d'inactivité, avec un avertissement une minute avant.
- `Cache-Control: no-store` sur les réponses de l'API.
- Sessions Windows distinctes, ou verrouillage automatique des postes de caisse.

### S-06 — Hébergement derrière un intermédiaire : proxys et hôtes de confiance (Moyenne)

**Où :** `bootstrap/app.php`. `trustProxies` et `trustHosts` ne sont pas configurés.

**Constat :** chez un hébergeur, l'API passe souvent par un intermédiaire (proxy inverse, Cloudflare, LiteSpeed). Laravel voit alors **la même adresse IP pour tout le monde**.

**Risque :**
- **Blocages globaux :** la limite de « Mot de passe oublié » (5 par minute) et celle de la vérification de facture (30 par minute) deviennent communes à tous. Quelques requêtes suffisent à bloquer le service pour tout le monde.
- **Adresses IP fausses :** celles des alertes de connexion et des limites de connexion ne correspondent plus aux vrais clients.
- **En-tête `Host` non filtré :** il est repris tel quel dans le lien « Réessayer » des pages d'erreur. Les liens des e-mails ne sont pas concernés, car ils viennent de la configuration.

**Recommandations :**
- Déclarer les adresses du proxy de l'hébergeur (`trustProxies`).
- Activer `trustHosts` avec l'hôte de l'API et celui de `VERIFICATION_BASE_URL`.
- Documenter ces réglages dans `docs/EXPLOITATION.md`.

### S-07 — Mode debug en production (Élevée en cas d'oubli)

**Constat :**
- L'API ne divulgue jamais de trace, même en debug : c'est le rôle de `ApiExceptionRenderer`.
- En revanche, si `APP_DEBUG=true` reste actif en production, une erreur sur une **page web** (vérification de facture, désinscription) affiche la page de débogage de Laravel. On y voit le code source, le chemin des fichiers et les détails de la requête.
- `docs/EXPLOITATION.md` demande bien `APP_DEBUG=false`, mais rien ne l'impose techniquement.

**Recommandations :**
- Garder ce point dans la liste de contrôle de mise en ligne (ci-dessous).
- Envisager un refus de démarrer, ou une alerte dans « État du système », quand `APP_ENV=production` et `APP_DEBUG=true`.

### S-08 — Version de PHP affichée (Faible)

**Constat :** chaque réponse contient `X-Powered-By: PHP/8.2.12`. C'est vérifié.

**Risque :** l'attaquant sait quelles failles connues essayer. Combiné à S-02, ce risque grandit après le 31/12/2026.

**Recommandation :** `expose_php = Off` dans `php.ini` du serveur, ou retrait de l'en-tête par le middleware de S-03.

### S-09 — Sessions lisibles dans la base et les sauvegardes (Faible)

**Constat :** les sessions sont dans la table `sessions`, en clair (`SESSION_ENCRYPT=false`), et l'identifiant de session en est la clé. Une copie de la base ou d'une sauvegarde permettrait de reprendre une session encore active.

**Recommandations :**
- Accès restreint à la base, sauvegardes chiffrées (déjà conseillées dans EXPLOITATION).
- `SESSION_ENCRYPT=true`.
- Durée de session courte (S-05).

### S-10 — Journal technique sans rotation (Faible)

**Constat :** `LOG_STACK=single` écrit tout dans un seul `storage/logs/laravel.log`. Le fichier grossit sans limite. Les messages d'erreur peuvent contenir des données personnelles (adresse e-mail dans une erreur SMTP, par exemple).

**Recommandations :**
- `LOG_STACK=daily`, avec une conservation de 14 jours (déjà prévue dans la configuration).
- `LOG_LEVEL=warning` en production.
- Droits de lecture réservés à l'exploitant.

### S-11 — Politique des mots de passe (Faible)

**Constat :** les règles sont correctes : 10 caractères au moins, avec lettres et chiffres, chiffrés par bcrypt à 12 tours. Deux limites cependant :
- les mots de passe déjà publiés dans des fuites connues ne sont pas refusés ;
- bcrypt n'utilise que les 72 premiers octets d'un mot de passe.

**Recommandations :**
- `Password::uncompromised()`, qui interroge un service externe de façon anonymisée : à valider, puisque c'est un appel sortant.
- Une limite `max:72`, ou le passage à Argon2id.

### S-12 — Journal d'audit modifiable au niveau de la base (Faible)

**Constat :** le modèle `AuditLog` refuse toute modification ou suppression dans l'application. Mais le compte MySQL de l'application a tous les droits : quelqu'un qui a accès à la base pourrait effacer des traces.

**Recommandations :**
- En production, un compte MySQL applicatif sans droits de structure (pas de `DROP` ni d'`ALTER` hors migrations).
- Retirer `UPDATE` et `DELETE` sur `audit_logs` à ce compte.
- Exporter régulièrement le journal.

### S-13 — Informations et points à suivre (Info)

- **Point de santé public** (`/api/v1/health`) : il indique l'état de la base et l'heure du serveur. C'est acceptable ; on peut le restreindre à l'adresse IP de supervision.
- **Dépendances :**
  - `composer audit` : aucune vulnérabilité ;
  - `npm audit` : 0 vulnérabilité ;
  - deux paquets abandonnés (`dragon-code/contracts`, `dragon-code/support`), tirés par `laravel-lang`, en développement seulement ;
  - relancer ces deux audits chaque mois, ou les ajouter à la CI.
- **Données personnelles :**
  - le journal d'audit garde indéfiniment une copie complète des fiches supprimées (D-058) ;
  - les sauvegardes contiennent les données des clients ;
  - la durée de conservation est à fixer avec l'hôtel.
- **E-mail de test :** l'administrateur peut envoyer un e-mail de test à n'importe quelle adresse (5 par minute). C'est normal, mais à garder en tête si le compte administrateur est compromis (S-01).
- **PDF (dompdf) :** l'accès aux fichiers distants et le PHP intégré sont bien désactivés, et le dossier de lecture est restreint (`chroot`). Le JavaScript dans les PDF est actif par défaut, sans risque aujourd'hui puisque tout le contenu est échappé ; on peut le couper par principe.

## Points vérifiés et conformes

### Côté serveur

- **Connexion :**
  - cookie de session `HttpOnly`, `SameSite=lax` ;
  - session régénérée à la connexion et invalidée à la déconnexion ;
  - jeton CSRF exigé pour les requêtes de l'application ;
  - connexion refusée hors de l'application, sans session ;
  - message d'échec identique, que le compte existe ou non ;
  - compte désactivé déconnecté à la requête suivante (`EnsureUserIsActive`).
- **Liens de mot de passe :**
  - « Mot de passe oublié » : usage unique, 60 minutes ;
  - invitation : 72 heures, sur une table distincte ;
  - jetons supprimés avec le compte ;
  - Sanctum est configuré pour invalider les autres sessions après un changement de mot de passe (`authenticate_session`), point non rejoué par un test dans cet audit.
- **Droits :**
  - les routes des 8 modules relues : chaque route métier exige la connexion et un droit précis ;
  - la suppression est réservée à l'administrateur et ce droit ne peut pas être donné à un autre rôle ;
  - impossible de se retirer ses propres droits ou de supprimer le dernier administrateur ;
  - l'annulation d'un encaissement par la caissière est contrôlée par le serveur (ses saisies du jour seulement).
- **Identifiants :** les adresses utilisent des UUID, impossibles à deviner ; aucun identifiant numérique n'est exposé.
- **Injection SQL :** les rares requêtes SQL écrites à la main ne contiennent que des expressions fixes ; aucun tri ni filtre n'est construit à partir de ce qu'envoie le navigateur.
- **Affectation de masse :** aucune donnée envoyée n'est enregistrée telle quelle (`$request->all()` n'est jamais utilisé) ; tout passe par des formulaires validés et des objets typés.
- **Injection HTML :**
  - aucune sortie non échappée (`{!! !!}`) dans les vues ;
  - e-mails et PDF construits avec échappement ;
  - PDF sans accès distant ni PHP intégré.
- **Exports CSV :** les libellés qui commencent par `=`, `+`, `-` ou `@` sont neutralisés contre l'exécution de formules dans Excel.
- **Vérification publique de facture :**
  - code aléatoire de 24 caractères, comparé à temps constant ;
  - même réponse 404 pour un document inconnu ou un code faux ;
  - 30 essais par minute ;
  - seules les initiales du client sont montrées.
- **Désinscription :** lien signé, limité à 30 par minute.
- **Paramètres :** une clé inconnue ou verrouillée est refusée par le service, même si l'écran est contourné.
- **Erreurs :**
  - l'API répond en JSON, sans trace ;
  - les pages d'erreur web restent sans détail technique, avec `APP_DEBUG=false` ;
  - pas de lien vers l'espace du personnel sur les pages publiques.
- **Journal d'audit :** non modifiable par l'application ; mots de passe, jetons et codes de vérification jamais copiés.
- **Secrets :**
  - `.env` et le fichier de mot de passe de la recette sont ignorés par Git ;
  - les identifiants SMTP ne sont que dans `backend/.env` ;
  - aucun secret trouvé dans les fichiers du dépôt.
- **Production :** les commandes destructrices (`migrate:fresh`, `db:wipe`…) y sont bloquées.
- **CORS :** seules les origines listées dans `FRONTEND_URL` sont acceptées, avec des méthodes et des en-têtes limités.

### Côté navigateur

- **Rendu HTML :** aucun HTML injecté à partir des données. Le seul `dangerouslySetInnerHTML` sert aux icônes, dont le contenu est fixe dans le code.
- **Code dynamique :** ni `eval`, ni `new Function`, ni `document.write`.
- **Stockage :** aucun jeton ou donnée sensible dans le navigateur. Seule la préférence du menu latéral est enregistrée (`localStorage`). La session vit dans un cookie inaccessible au JavaScript.
- **Retour après connexion :** la page demandée avant la connexion passe par l'état interne du routeur, pas par l'adresse. Un lien piégé ne peut donc pas renvoyer vers un autre site.
- **Liens externes :** les liens « nouvel onglet » portent `rel="noopener"`, et leurs adresses viennent du serveur.
- **Ressources externes :** aucun script, police ou image chargé depuis un site tiers ; pas de fichiers `.map` dans la version compilée (réglage par défaut de Vite).
- **Erreurs :** les messages techniques des erreurs 5xx ne sont jamais affichés ; l'interface masque les actions non autorisées, et le serveur reste l'autorité.

## Liste de contrôle avant la mise en production

- [ ] PHP 8.4 à jour, `expose_php = Off` (S-02, S-08)
- [ ] `APP_ENV=production`, `APP_DEBUG=false`, `APP_KEY` propre à la production et sauvegardé à part (S-07)
- [ ] HTTPS partout, `SESSION_SECURE_COOKIE=true`, HSTS (S-03)
- [ ] En-têtes de sécurité sur l'API et sur le frontend (S-03, S-04)
- [ ] Proxys et hôtes de confiance déclarés selon l'hébergeur (S-06)
- [ ] `SESSION_EXPIRE_ON_CLOSE=true`, durée de session décidée avec l'hôtel (S-05)
- [ ] Compte MySQL dédié avec droits minimaux, sans `UPDATE` ni `DELETE` sur `audit_logs` (S-12)
- [ ] Journal `daily`, `LOG_LEVEL=warning`, dossier `storage` illisible depuis le web (S-10)
- [ ] Seul `backend/public` exposé : jamais `.env`, `storage` ni `vendor`
- [ ] Pas de seeders de démonstration ; premier administrateur créé avec `php artisan jb:create-admin`
- [ ] Sauvegardes chiffrées, restauration testée, durée de conservation fixée (S-09, S-13)
- [ ] `composer audit` et `npm audit` relancés juste avant la livraison

## Ordre conseillé des corrections

1. **S-01**, limites de connexion par compte et par adresse IP, plus échecs au journal ; puis **S-02**, passage à PHP 8.4. Ce sont les deux risques les plus concrets.
2. **S-03 et S-04**, en-têtes de sécurité, en vérifiant tous les écrans sur la version compilée.
3. **S-05 et S-06**, au moment du choix de l'hébergement et des réglages des postes de caisse.
4. Les points faibles, à traiter pendant la mise en production avec la liste de contrôle.

## Annexe — Commandes et vérifications exécutées

| Vérification | Résultat |
|---|---|
| `composer audit` (backend) | Aucune vulnérabilité ; 2 paquets abandonnés, en développement seulement |
| `npm audit` (frontend) | 0 vulnérabilité |
| En-têtes de `GET /api/v1/health` (serveur local) | Aucun en-tête de sécurité ; `X-Powered-By: PHP/8.2.12` présent |
| Recherche des requêtes SQL brutes (`DB::raw`, `whereRaw`, `selectRaw`…) | Expressions fixes seulement |
| Recherche des sorties non échappées (`{!! !!}`, `HtmlString`) | Aucune |
| Recherche d'enregistrement direct des données reçues (`$request->all()`) | Aucun |
| Recherche côté React (`dangerouslySetInnerHTML`, `eval`, `localStorage`, `target="_blank"`) | Icônes fixes, préférence du menu, liens avec `noopener` |
| Recherche des en-têtes de sécurité dans tout le dépôt | Aucun |
| Fichiers sensibles suivis par Git (`.env`, sauvegardes, clés) | Aucun |
