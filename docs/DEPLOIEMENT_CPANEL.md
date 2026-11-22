> **Nouvelle destination : frontend et API sur le même domaine, dans `/backend`.** Voir [DEPLOIEMENT_LWS_DOSSIER.md](DEPLOIEMENT_LWS_DOSSIER.md).

# Mise en ligne de test sur cPanel (sans SSH)

> **Diagnostic en ligne du 20/11/2026 : le service ouvert est LWS Panel Perso, pas cPanel.** Ce guide reste réservé à une offre cPanel. Pour le service actuel, suivre d’abord la section « Correction de l’incident en ligne — LWS Panel » de [EXPLOITATION.md](EXPLOITATION.md) : routage vers `public` et vrais paramètres MySQL, avec l’IP serveur LWS.

> **Destination confirmée le 20/11/2026 : frontend directement sur `https://banguiweb-tech.com`, API conservée sur `https://api.hotel.banguiweb-tech.com`.** Les modèles de production suivent ces adresses. Pour le service LWS Panel actuel, suivre la section « Frontend sur le domaine principal » de [EXPLOITATION.md](EXPLOITATION.md). Ce guide ci-dessous reste la procédure générique cPanel quand le Terminal/SSH n’est pas disponible.

Ce guide installe JB Hôtel sur un hébergement cPanel **sans accès SSH**. Tout ce qui demande une ligne de commande se fait sur ton PC Windows. Le serveur reçoit seulement :
- deux fichiers ZIP, envoyés avec le Gestionnaire de fichiers ;
- un fichier SQL, importé avec phpMyAdmin ;
- une tâche cron, pour l'envoi des e-mails.

Les commandes ont été vérifiées sur ton poste le 20/11/2026 :
- copie propre du backend ;
- installation sans outils de développement (paquet de 12,9 Mo) ;
- base créée puis exportée (17 migrations, rôles et réglages, aucune donnée de démonstration).

## Principe

| Élément | Adresse (exemple) | Dossier sur le serveur |
|---|---|---|
| API Laravel (`backend`) | `https://api.mondomaine.cf` | `/home/UTILISATEUR/jbhotel/backend/public` |
| Application du personnel (`frontend` compilé) | `https://app.mondomaine.cf` | `/home/UTILISATEUR/app.mondomaine.cf` |

Remplace partout :
- `mondomaine.cf` par le domaine de l'hôtel ;
- `UTILISATEUR` par ton identifiant cPanel ;
- `cpuser_` par le préfixe que cPanel ajoute aux noms de bases.

**Pourquoi deux sous-domaines du même domaine :** la connexion utilise des cookies partagés entre l'application et l'API. Ils doivent appartenir au même domaine (`.mondomaine.cf`).

**Pourquoi le backend est hors de `public_html` :** les fichiers `.env` (mots de passe), `vendor` et `storage` ne doivent jamais être accessibles depuis le web. Seul le dossier `backend/public` est exposé.

---

## Étape 1 — Préparer cPanel

### 1.1 Sous-domaines

Dans cPanel > **Domaines** (ou **Sous-domaines**), crée les deux sous-domaines :

1. `api.mondomaine.cf`, avec pour **racine du document** : `jbhotel/backend/public`. Les dossiers n'existent pas encore : cPanel les crée vides, ce n'est pas grave.
2. `app.mondomaine.cf`, avec la racine proposée par défaut, par exemple `app.mondomaine.cf` ou `public_html/app`. Note-la.

Si cPanel refuse une racine hors de `public_html`, demande à l'hébergeur de l'autoriser. Ne mets pas le dossier `backend` complet dans `public_html`.

### 1.2 HTTPS

- cPanel > **SSL/TLS Status** : lance **AutoSSL** pour les deux sous-domaines.
- cPanel > **Domaines** : active **Forcer la redirection HTTPS** pour les deux.

### 1.3 Version de PHP

Dans cPanel > **MultiPHP Manager** (ou **Sélectionner une version de PHP**), mets **PHP 8.4** sur `api.mondomaine.cf`. PHP 8.3 convient aussi ; PHP 8.2 aussi, mais il n'a plus de correctifs après le 31/12/2026 (voir l'audit, S-02).

Extensions nécessaires (cases à cocher dans « Sélectionner une version de PHP », sinon à demander à l'hébergeur) :
- `pdo_mysql`, `mbstring`, `openssl`, `gd` (QR code des factures) ;
- `dom`, `xml`, `fileinfo`, `iconv`, `tokenizer`, `ctype`, `json`, `session`, `filter`.

Dans **MultiPHP INI Editor** (si disponible) : `display_errors = Off` et `expose_php = Off`.

### 1.4 Base de données

cPanel > **Bases de données MySQL** :
1. Crée la base `cpuser_jbhotel`.
2. Crée l'utilisateur `cpuser_jbhotel` avec un **mot de passe fort** (bouton « Générateur ») et note-le.
3. **Ajoute l'utilisateur à la base** avec **tous les privilèges**.

---

## Étape 2 — Préparer la base sur le PC

Sans SSH, on ne peut pas lancer `php artisan migrate` sur le serveur. On crée donc la base complète sur ton PC (tables, rôles, réglages, catégories de chambres et ton compte administrateur), puis on l'exporte.

Ouvre PowerShell :

```powershell
cd "D:\dev\JB Hôtel\backend"

# 1. Base vide sur ton PC (XAMPP)
& C:\xampp\mysql\bin\mysql.exe -u root -e "DROP DATABASE IF EXISTS jb_hotel_deploy; CREATE DATABASE jb_hotel_deploy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. Les commandes suivantes travaillent sur cette base, pas sur ta base de travail
$env:DB_DATABASE = 'jb_hotel_deploy'
php artisan migrate --force
php artisan db:seed --class=RolesAndPermissionsSeeder --force
php artisan db:seed --class=SettingsSeeder --force
php artisan db:seed --class=RoomTypesSeeder --force

# 3. Ton compte administrateur : le mot de passe est demandé de façon masquée
#    (10 caractères minimum, lettres et chiffres). Évite les accents dans le nom ici,
#    tu pourras le corriger ensuite dans Utilisateurs.
php artisan jb:create-admin --name="Nom Prenom" --email="ton.adresse@mondomaine.cf"
php artisan cache:clear

# 4. Export, puis retour à ta base de travail
New-Item -ItemType Directory -Force C:\jbhotel-deploy | Out-Null
& C:\xampp\mysql\bin\mysqldump.exe -u root --single-transaction --no-tablespaces --result-file=C:\jbhotel-deploy\jbhotel-base.sql jb_hotel_deploy
Remove-Item Env:DB_DATABASE
```

Résultat : `C:\jbhotel-deploy\jbhotel-base.sql`, d'environ 45 Ko.

Garde ce fichier privé : il contient l'empreinte du mot de passe administrateur. Ne lance **pas** `php artisan db:seed` sans `--class` : cela ajouterait les comptes et chambres de démonstration.

Un e-mail de bienvenue pour l'administrateur attend dans la file. Il partira tout seul une fois la tâche cron en place (étape 8).

---

## Étape 3 — Préparer le backend (ZIP)

```powershell
cd "D:\dev\JB Hôtel"
# Copie propre du code enregistré dans Git (sans .env, sans journaux, sans vendor)
Remove-Item -Recurse -Force C:\jbhotel-deploy\backend -ErrorAction SilentlyContinue
git archive --format=zip -o C:\jbhotel-deploy\source.zip HEAD backend
tar -xf C:\jbhotel-deploy\source.zip -C C:\jbhotel-deploy

# Dépendances de production seulement
cd C:\jbhotel-deploy\backend
composer install --no-dev --optimize-autoloader --no-interaction

# Clé de chiffrement de l'application : copie la ligne « base64:… » affichée, elle servira à l'étape 6
php artisan key:generate --show

# ZIP à envoyer
cd C:\jbhotel-deploy
tar -a -cf jbhotel-backend.zip backend
```

Résultat : `C:\jbhotel-deploy\jbhotel-backend.zip`, d'environ 13 Mo.

---

## Étape 4 — Préparer l'application du personnel (ZIP)

L'adresse de l'API est inscrite dans l'application au moment de la compilation.

```powershell
cd "D:\dev\JB Hôtel\frontend"
Set-Content .env.production.local "VITE_API_URL=https://api.mondomaine.cf`nVITE_TIMEZONE=Africa/Bangui"
npm run build
```

Le fichier `.env.production.local` est ignoré par Git. Il resservira aux prochaines compilations.

Crée ensuite le fichier `frontend\dist\.htaccess` (Bloc-notes > Enregistrer sous > Type « Tous les fichiers ») avec ce contenu :

```apache
# JB Hôtel — application du personnel
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  # Les adresses de l'application (/reservations, /caisse…) renvoient index.html.
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ /index.html [END]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Frame-Options "DENY"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  <FilesMatch "^index\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  # À activer après le premier test complet (étape 9, point 7) :
  # Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.mondomaine.cf; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
</IfModule>
```

Puis :

```powershell
tar -a -cf C:\jbhotel-deploy\jbhotel-frontend.zip -C dist .
```

Résultat : `C:\jbhotel-deploy\jbhotel-frontend.zip`.

---

## Étape 5 — Envoyer les fichiers

Dans cPanel > **Gestionnaire de fichiers**, active d'abord **Paramètres > Afficher les fichiers cachés**, pour voir `.env` et `.htaccess`.

1. **Backend :**
   1. Va dans `/home/UTILISATEUR/jbhotel`.
   2. Supprime le dossier `backend` vide que cPanel a pu créer à l'étape 1.
   3. **Charger** `jbhotel-backend.zip`, puis clic droit > **Extraire**. Tu obtiens `/home/UTILISATEUR/jbhotel/backend`.
   4. Supprime ensuite le ZIP.
2. **Application :**
   1. Va dans la racine de `app.mondomaine.cf` (étape 1.1).
   2. **Charger** `jbhotel-frontend.zip`, puis **Extraire**. `index.html`, `.htaccess` et `assets` doivent être directement dans ce dossier.
   3. Supprime le ZIP.
3. **Droits d'écriture :** `backend/storage` et `backend/bootstrap/cache` doivent être en **755**. Le Gestionnaire de fichiers les met en général ainsi.

---

## Étape 6 — Créer le fichier `.env` sur le serveur

Dans `/home/UTILISATEUR/jbhotel/backend` : **+ Fichier**, nomme-le `.env`, puis **Modifier** et colle ce contenu en l'adaptant :

```dotenv
APP_NAME="JB Hôtel"
APP_ENV=production
APP_KEY=base64:COLLE_ICI_LA_CLE_DE_L_ETAPE_3
APP_DEBUG=false
APP_URL=https://api.mondomaine.cf
APP_TIMEZONE=Africa/Bangui
APP_LOCALE=fr
APP_FALLBACK_LOCALE=fr

FRONTEND_URL=https://app.mondomaine.cf
SANCTUM_STATEFUL_DOMAINS=app.mondomaine.cf
SESSION_DRIVER=database
SESSION_DOMAIN=.mondomaine.cf
SESSION_SECURE_COOKIE=true
SESSION_LIFETIME=60
SESSION_EXPIRE_ON_CLOSE=true
SESSION_ENCRYPT=true

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=cpuser_jbhotel
DB_USERNAME=cpuser_jbhotel
DB_PASSWORD='MOT_DE_PASSE_DE_LA_BASE'

CACHE_STORE=database
QUEUE_CONNECTION=database
BCRYPT_ROUNDS=12
LOG_CHANNEL=stack
LOG_STACK=daily
LOG_LEVEL=warning

MAIL_MAILER=smtp
MAIL_SCHEME=smtps
MAIL_HOST=serveur.smtp.de.l.hebergeur
MAIL_PORT=465
MAIL_USERNAME=adresse@mondomaine.cf
MAIL_PASSWORD='MOT_DE_PASSE_SMTP'
MAIL_FROM_ADDRESS=adresse@mondomaine.cf
MAIL_FROM_NAME="${APP_NAME}"

VERIFICATION_BASE_URL=https://api.mondomaine.cf
HOTEL_NAME="JB Hôtel"
HOTEL_ADDRESS=
HOTEL_PHONE=
HOTEL_EMAIL=
HOTEL_TAX_ID=
HOTEL_RCCM=
```

Points importants :
- **Mots de passe :** mets-les entre apostrophes `'…'` s'ils contiennent `$`, `#`, `!` ou des espaces.
- **`SESSION_DOMAIN` commence par un point.** Sans lui, la connexion échoue avec « Page expirée ».
- **`APP_DEBUG=false` obligatoirement :** sinon les erreurs affichent des détails techniques (audit, S-07).
- **SMTP :** reprends les réglages qui fonctionnent dans ton `backend\.env` local.
- **`HOTEL_*` :** ce sont les informations imprimées sur les factures.

---

## Étape 7 — Importer la base

1. cPanel > **phpMyAdmin**, puis sélectionne `cpuser_jbhotel` à gauche.
2. Onglet **Importer**, choisis `C:\jbhotel-deploy\jbhotel-base.sql`, puis **Importer**.
3. Tu dois voir une vingtaine de tables, dont `users` avec une seule ligne : ton compte.

Ensuite, sur ton PC, supprime la base locale de préparation :

```powershell
& C:\xampp\mysql\bin\mysql.exe -u root -e "DROP DATABASE jb_hotel_deploy;"
```

---

## Étape 8 — Tâche cron pour les e-mails

Les e-mails (confirmations, reçus, factures, alertes de connexion) partent en file d'attente. Sans SSH, une tâche cron les traite chaque minute.

cPanel > **Tâches Cron** > réglage **« Une fois par minute »**, puis la commande :

```bash
cd /home/UTILISATEUR/jbhotel/backend && /usr/local/bin/php artisan queue:work --stop-when-empty --tries=3 --max-time=50 >/dev/null 2>&1
```

`/usr/local/bin/php` est la version de PHP par défaut du serveur. Si elle n'est pas en 8.2 au moins, utilise le chemin de la version choisie :
- `/opt/cpanel/ea-php84/root/usr/bin/php` (cPanel classique) ;
- `/opt/alt/php84/usr/bin/php` (CloudLinux).

En cas de doute, demande à l'hébergeur le chemin de PHP 8.4 en ligne de commande.

---

## Étape 9 — Vérifier

1. **API :** ouvre `https://api.mondomaine.cf/api/v1/health`. Tu dois lire `"status":"ok"` et `"database":"ok"`.
2. **Application :** ouvre `https://app.mondomaine.cf`. La page de connexion s'affiche ; connecte-toi avec ton compte administrateur.
3. **Rechargement :** va dans Réservations et appuie sur F5. La page doit se recharger sans erreur 404, ce qui confirme que le `.htaccess` fonctionne.
4. **E-mails :**
   1. Administration > Paramètres > **Envoyer un e-mail de test** : l'envoi doit réussir.
   2. Le compteur « en attente » doit revenir à 0 en une à deux minutes, ce qui confirme que la tâche cron fonctionne.
   3. Tu dois aussi avoir reçu l'e-mail de bienvenue de l'étape 2.
5. **Parcours complet :**
   1. Crée une chambre et son tarif.
   2. Crée un client et une réservation, puis encaisse une avance.
   3. Émets la facture et ouvre le PDF.
   4. **Scanne le QR code avec un téléphone** : la page de vérification doit s'ouvrir.
6. **Pages d'erreur :** `https://api.mondomaine.cf/page-inexistante` affiche la page 404 de l'hôtel, sans détail technique.
7. **Politique de contenu (facultatif) :**
   1. Retire le `#` devant la ligne `Content-Security-Policy` du `.htaccess` de l'application.
   2. Recharge avec Ctrl+F5 et parcours tous les écrans.
   3. Dans la console du navigateur (F12), aucun message « Content Security Policy » ne doit apparaître. Si un écran ne fonctionne plus, remets le `#`.

---

## En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| Erreur 500 sur l'API | `.env` absent ou incomplet, `APP_KEY` vide, mauvais mot de passe de base, PHP trop ancien ou extension manquante | Lire `backend/storage/logs/laravel-AAAA-MM-JJ.log` dans le Gestionnaire de fichiers ; vérifier les étapes 1.3 et 6 |
| « Page expirée » (419) ou « Session expirée » juste après la connexion | Cookies non partagés | `SESSION_DOMAIN=.mondomaine.cf` (avec le point), `SANCTUM_STATEFUL_DOMAINS=app.mondomaine.cf`, les deux sites en HTTPS |
| « Connexion impossible… » dans l'application | Adresse de l'API fausse dans la compilation, ou API en panne | Vérifier le point 1 de l'étape 9 et `VITE_API_URL`, puis recompiler (étape 4) |
| Erreur CORS dans la console (F12) | API non atteinte (page d’attente/404 hébergeur), puis origine à vérifier | `https://app.mondomaine.cf`, sans `/` final |
| Erreur 404 en rechargeant une page de l'application | `.htaccess` absent du site de l'application | L'envoyer (fichier caché, voir l'étape 5) |
| E-mails bloqués « en attente » | Tâche cron absente ou mauvais chemin de PHP | Étape 8 |
| E-mails « en échec » | Identifiants SMTP refusés | Corriger `MAIL_*` dans `.env`, puis Paramètres > « Relancer les envois en échec » |
| QR code ou PDF en erreur | Extension `gd` absente | Étape 1.3 |

---

## Mettre à jour plus tard

1. **Sauvegarde :** phpMyAdmin > Exporter (format SQL rapide).
2. **Backend :**
   1. Refais l'étape 3, sauf `key:generate`.
   2. Sur le serveur, supprime `jbhotel/backend/vendor`.
   3. Charge et extrais le nouveau ZIP dans `/home/UTILISATEUR/jbhotel`, en écrasant les fichiers. Le fichier `.env` et le dossier `storage` sont conservés, car ils ne sont pas dans le ZIP.
3. **Si la mise à jour ajoute des migrations :**
   1. Crée une tâche cron temporaire « Une fois par minute » avec :
      `cd /home/UTILISATEUR/jbhotel/backend && /usr/local/bin/php artisan migrate --force >> storage/logs/mise-a-jour.log 2>&1`
   2. Attends deux minutes.
   3. Lis `storage/logs/mise-a-jour.log`.
   4. **Supprime cette tâche cron.**
4. **Application :**
   1. Refais l'étape 4 ; garde ton `.htaccess` ou recrée-le.
   2. Sur le serveur, supprime l'ancien dossier `assets`, puis extrais le nouveau ZIP.

---

## Sécurité du serveur de test

- Pas de comptes ni de données de démonstration en ligne. Mots de passe forts pour l'administrateur, la base et le SMTP.
- `APP_DEBUG=false`, HTTPS forcé, et le dossier `backend` hors de `public_html`.
- Supprime les ZIP du serveur après extraction. Garde `jbhotel-base.sql` et la clé `APP_KEY` en lieu sûr, hors du serveur.
- Si de vraies données de clients sont saisies pendant le test, elles relèvent des mêmes précautions qu'en production.
- Les autres recommandations sont dans [AUDIT_SECURITE.md](AUDIT_SECURITE.md) : limites de connexion, en-têtes de l'API, PHP 8.4.
