# Sécurité hors ligne du poste Windows

> D-069. Complète D-064 (session hors ligne) et D-062 (poste principal).

## Authentification

- **Activation en ligne obligatoire** : la première connexion se fait avec le serveur (Sanctum, cookie
  de session). Aucun jeton administrateur n'est embarqué dans le logiciel ; aucun mot de passe stocké en clair.
- **Accès local** : à la connexion, une empreinte PBKDF2-SHA256 (150 000 itérations, sel aléatoire)
  du mot de passe est gardée (chiffrée, voir ci-dessous). Hors ligne, la session reste ouverte sans
  limite de durée (N-05 révisée) et **se verrouille après 15 min d'inactivité** ; le déverrouillage
  vérifie l'empreinte (comparaison sans court-circuit).
- **Cookies** : gardés par la session Electron (`%APPDATA%\JBHotel\session`), jamais exposés à
  l'interface (`Set-Cookie` filtré par le relais). Le jeton CSRF est ajouté par le processus principal.
- **Origine** : le relais présente l'origine de l'application web autorisée (`https://banguiweb-tech.com`)
  ; seules les requêtes de la page `app://jbhotel` passent par lui, et seulement vers le dossier de l'API.
- Limite connue : la protection contre la force brute du verrou local repose sur le coût PBKDF2 ;
  aucun compteur d'essais n'est encore imposé (à ajouter si l'hôtel le demande).

## Droits et révocation

- Les droits viennent de `/auth/me` (Spatie Permission) et sont gardés avec la copie.
- **Avant chaque envoi**, les droits sont relus au serveur ; un utilisateur désactivé ou un rôle
  réduit ne peut rien envoyer, et le serveur revalide chaque opération (403 gardé avec sa cause).
- Hors ligne, une révocation ne peut pas être reçue : le poste continue avec les derniers droits
  connus jusqu'au retour du réseau (limite inhérente, acceptée par D-064). Le changement d'un rôle
  est annoncé à tous les postes par le journal des changements (`role`).

## Données au repos

- SQLite n'est **pas** chiffré par lui-même. Chaque valeur sensible (opérations, copie des écrans,
  session, journal) est scellée en **AES-256-GCM** avant écriture.
- La clé (32 octets aléatoires) est protégée par **DPAPI** via `safeStorage` d'Electron
  (`cle-locale.bin`), donc liée au compte Windows. Sans DPAPI disponible, le logiciel fonctionne en
  clair et l'écran « Poste Windows » affiche « Non chiffrées : prévenir l'administrateur ».
- Vol du PC : les données ne sont lisibles que depuis la session Windows de la caissière.
  Recommandations : mot de passe Windows, BitLocker, session Windows verrouillée.
- `secure_delete` : une donnée effacée est écrasée sur le disque.
- Minimisation : écrans d'administration (utilisateurs, audit, paramètres, postes) jamais copiés.

## Electron

| Mesure | Réglage |
|---|---|
| Isolation | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` |
| Preload | pont figé `window.jbDesktop`, opérations nommées uniquement ; aucun module Node, aucun chemin, aucun SQL |
| IPC | émetteur vérifié (`app://jbhotel`), données validées (clés, versions, impression), erreurs sans détail technique |
| CSP | `default-src 'self'` ; scripts `'self'` ; connexions `'self'` ; `object-src 'none'` ; `frame-ancestors 'none'` |
| Navigation | limitée à `app://jbhotel` ; liens `https:`/`mailto:` ouverts dans le navigateur du système |
| Fenêtres | seulement les documents de l'API (rapport PDF), sans preload, en sandbox |
| Permissions | toutes refusées sauf écriture dans le presse-papiers |
| `<webview>` | interdit |
| Outils de développement | désactivés dans la version installée (sauf `--devtools`) |
| Instance unique | un seul écrivain de la base |

## Serveur

Inchangé : TLS, Sanctum, Spatie, contrôle par objet (policies), `throttle:api`, idempotence,
journal d'audit, `main.workstation`. Le module Sync est en **lecture seule** et filtre les types de
données par droit ; il ne contient aucune donnée personnelle (type, UUID public, action, date).
