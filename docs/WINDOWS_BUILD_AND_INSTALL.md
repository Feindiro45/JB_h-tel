# Construire, installer et mettre à jour JB Hôtel pour Windows

> D-069. Dossier : `electron/`. Installateur de production vérifié le 25/11/2026 :
> `electron/release/JB-Hotel-Setup-1.0.3.exe` (≈ 122 Mo, x64), branché sur `https://api.jb-hotel.com`
> (API) avec l'origine `https://app.jb-hotel.com` (application web), mises à jour par
> `https://app.jb-hotel.com/desktop`.
> SHA-256 : `4ce1356421b8897795b01b3479587de7892c1efac04a0a7019eb6a16efc9dfa3`.
>
> **Ne pas distribuer les 1.0.0 à 1.0.2** : elles ont été construites sans canal déclaré
> (`build.publish`), donc sans `app-update.yml`, et ne peuvent télécharger aucune mise à jour. Un
> poste qui en a une doit installer la 1.0.3 à la main une fois ; ensuite les mises à jour arrivent seules.

## Prérequis de construction (poste du développeur)

- Windows 10/11 x64, Node.js 24 (npm 11), accès Internet (téléchargements d'Electron et de NSIS au premier build).
- Le dépôt complet (le build reconstruit `frontend/`).
- PHP/MySQL seulement pour la recette de bout en bout (pas pour le build).

## Commandes

```powershell
cd electron
npm install                 # une fois ; si Electron n'est pas téléchargé : node node_modules/electron/install.js
npm run typecheck           # types du processus principal
npm test                    # 28 tests (SQLite, relais, réglages) sous Node 24
npm run build               # interface (frontend → electron/renderer) + processus principal (build/)
npm run dist                # installateur NSIS → electron/release/JB-Hotel-Setup-<version>.exe
npm run test:e2e            # recette Electron contre l'API locale (base jb_hotel_e2e préparée)
```

Variables de construction (facultatives, aucun secret) lues par `scripts/build-main.mjs`. Sans
variable, ce sont les valeurs de production (`PRODUCTION` dans `src/main/config.ts`) :

| Variable | Défaut | Rôle |
|---|---|---|
| `JBH_SERVER_URL` | `https://api.jb-hotel.com` | racine de Laravel (l'API est à la racine du sous-domaine, sans `/backend`) |
| `JBH_ORIGIN` | `https://app.jb-hotel.com` | origine de l'application web autorisée par Sanctum et CORS |
| `JBH_UPDATE_URL` | `https://app.jb-hotel.com/desktop` | canal des mises à jour (dossier HTTPS contenant `latest.yml`) |

Construction de production (les variables reprennent les défauts, pour être explicites) :
```powershell
cd electron
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:JBH_SERVER_URL = 'https://api.jb-hotel.com'
$env:JBH_ORIGIN = 'https://app.jb-hotel.com'
$env:JBH_UPDATE_URL = 'https://app.jb-hotel.com/desktop'
npm run dist
```

Conditions côté serveur (vérifiées le 25/11/2026) : `FRONTEND_URL` et `SANCTUM_STATEFUL_DOMAINS`
contiennent `app.jb-hotel.com`, `SESSION_DOMAIN=.jb-hotel.com` (cookies `XSRF-TOKEN` et session
posés sur `.jb-hotel.com`, en `secure`).

Recette sur la version empaquetée : `JBH_E2E_EXECUTABLE=<chemin>\JBHotel.exe npm run test:e2e`.
Sous VS Code, `ELECTRON_RUN_AS_NODE=1` est souvent défini : les scripts de recette le retirent ; pour
lancer à la main, `Remove-Item Env:ELECTRON_RUN_AS_NODE` avant `npx electron .`.

Essai local contre l'API de développement :
```powershell
npm run build
npx electron . --server=http://localhost:8000 --origin=http://localhost:5173
```

## Installation sur le poste de caisse

1. Copier `JB-Hotel-Setup-<version>.exe` (clé USB ou téléchargement) et l'exécuter.
   Installation **par utilisateur** (pas besoin d'administrateur), dossier modifiable, raccourcis
   Bureau et menu Démarrer « JB Hôtel ». Sans certificat de signature, Windows SmartScreen affiche
   « Éditeur inconnu » : « Informations complémentaires » → « Exécuter quand même ».
2. Premier lancement **en ligne** : connexion de la caissière (le serveur enregistre le poste ;
   l'administrateur peut le désigner poste principal dans « Postes de caisse »).
3. Synchronisation → « Tout télécharger pour le hors ligne », puis régler l'imprimante des tickets
   (Synchronisation → Poste Windows → Imprimante des tickets).
4. Désormais le logiciel s'ouvre par double-clic, même après extinction du PC et sans Internet.

Installation silencieuse (parc) : `JB-Hotel-Setup-<version>.exe /S /D=C:\Chemin` ;
désinstallation : `"Uninstall JBHotel.exe" /S` (les données restent dans `%APPDATA%\JBHotel`).

Réglages du poste : `%APPDATA%\JBHotel\config.json` (créé quand l'imprimante est réglée ; il ne
contient normalement que l'imprimante, les adresses venant de l'installateur). Une adresse écrite
dans ce fichier remplace celle de l'installateur :
```json
{ "serverUrl": "https://api.jb-hotel.com", "origin": "https://app.jb-hotel.com",
  "updateUrl": "https://app.jb-hotel.com/desktop", "printer": { "name": "XP-80C", "silent": true, "widthMm": 80 } }
```

Passage d'un poste 1.0.0/1.0.1 (ancien serveur `banguiweb-tech.com/backend`) à la 1.0.3 : installer
par-dessus ; la base locale et l'imprimante sont gardées. La session de l'ancien domaine n'est pas
valable sur le nouveau : la caissière se reconnecte une fois **en ligne**. Envoyer les opérations en
attente (Synchronisation) **avant** de changer de version.

## Mises à jour du logiciel

Le canal est déclaré dans `package.json` (`build.publish`, fournisseur `generic`,
`https://app.jb-hotel.com/desktop`). Sans cette déclaration, electron-builder n'écrit ni
`latest.yml` ni `resources/app-update.yml`, et le poste échoue à chaque téléchargement (le module
lit `app-update.yml` avant de télécharger). Ne jamais la retirer.

1. Augmenter `version` dans `electron/package.json` (et `package-lock.json`), puis `npm run dist`.
2. `npm run update-channel` : prépare `deploiement/desktop/` (installateur, `.blockmap` de toutes
   les versions, `latest.yml`, `.htaccess`, `SHA256SUMS.txt`). Le script refuse un canal incohérent :
   `latest.yml` absent ou d'une autre version, empreinte ou taille de l'installateur différente de
   celle annoncée, `app-update.yml` absent ou visant une autre adresse. Il retire l'ancien
   installateur du dossier et garde les anciens `.blockmap`.
3. Téléverser le **contenu** de `deploiement/desktop/` dans `/desktop` à la racine de
   `app.jb-hotel.com` (à côté d'`index.html`), `.htaccess` compris. **`latest.yml` en dernier** : tant
   qu'il annonce l'ancienne version, aucun poste ne réclame le nouvel installateur à moitié envoyé.
   Ce `.htaccess` coupe le renvoi vers l'application React pour ce dossier (un fichier absent répond
   404) et empêche la mise en cache de `latest.yml`. Vérifier ensuite dans un navigateur que
   `https://app.jb-hotel.com/desktop/latest.yml` affiche la nouvelle version, pas la page de connexion.
   Un gestionnaire de fichiers web limite parfois la taille d'envoi : passer par FTP pour l'installateur
   (≈ 122 Mo).
4. Les postes vérifient au démarrage (après 30 s) puis toutes les 6 h ; la nouvelle version est
   téléchargée (seulement les blocs changés quand le `.blockmap` de la version installée est dans
   le canal), puis installée à la fermeture ou par « Redémarrer et installer » (écran Poste Windows).
   Une sauvegarde `update` de la base est faite avant ; la base et les réglages ne sont jamais
   écrasés. Une version plus ancienne refuse d'ouvrir une base d'un schéma plus récent (message clair).
5. Retour arrière : réinstaller l'ancienne version n'est possible que si le schéma local n'a pas
   changé ; sinon restaurer la sauvegarde `update` avec l'ancienne version.

## Diagnostic

| Symptôme | Où regarder |
|---|---|
| Le logiciel ne démarre pas | `%APPDATA%\JBHotel\journal\main.log` |
| « Base locale réparée » | fichier mis de côté `jbhotel.sqlite.endommagee-*` ; prévenir l'administrateur |
| Toujours « Hors ligne » | adresse du serveur (journal : « Démarrage … — serveur … », `config.json`), pare-feu, `https://api.jb-hotel.com/api/v1/health` dans un navigateur |
| Connexion refusée (419/401) | `SANCTUM_STATEFUL_DOMAINS` du serveur doit contenir le domaine de `origin` |
| Ticket non imprimé | Poste Windows → Imprimante des tickets (imprimante absente signalée), pilote Windows |
