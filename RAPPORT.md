# Rapport de travail — JB Hôtel

**Date :** 22 novembre 2026.
**Objet :** tes trois dernières demandes :
- « retire les factures A4 et reçus et les boutons imprimer la page » ;
- « le client recevra le ticket par mail au lieu de la facture » ;
- « des exports Excel avec un bon design sur chaque module ».

Tu as aussi rappelé l'exigence SOLID et DTO.

## En bref

- **Ticket 80 mm seul (D-065).** Plus de facture A4, plus de reçu A4, plus de boutons « Imprimer » sur les pages.
  - Le client reçoit par e-mail le **ticket de sa facture en PDF** : une seule bande de 80 mm, avec le QR code de vérification.
  - Le ticket imprimé à la caisse porte le même QR code.
- **Exports Excel (D-066).** Chaque écran a un bouton **« Exporter (Excel) »** qui reprend les filtres de l'écran.
  - Chaque classeur commence par une feuille **Tableau de bord** : indicateurs, tableaux de synthèse et vrais graphiques Excel.
  - Les feuilles suivantes contiennent les données mises en forme.
  - **Sans réseau**, le poste construit lui-même un classeur simplifié à partir des données gardées.
- **SOLID et DTO.** Tu avais raison de poser la question : mes premiers contrôleurs d'export ne respectaient pas la règle. Ils sont refaits (détail en partie 3) et la règle est inscrite dans `CLAUDE.md` pour la suite.
- **Contrôles :** tout est vert : 263 tests backend, 195 tests frontend, 10 parcours navigateur (dont le téléchargement réel d’un classeur et le ticket avec QR code), 2 parcours hors ligne de production, analyse statique et mise en forme.

## 1. Ticket 80 mm à la place de l'A4 (D-065)

| Avant | Maintenant |
|---|---|
| Facture PDF A4 (lien « PDF » et « PDF A4 ») | Retirée. Le ticket 80 mm est le seul format |
| Reçu A4 (`/documents/recus/…`) | Retiré. L'ancienne adresse ouvre le ticket du reçu |
| Boutons « Imprimer », « Imprimer le journal » | Retirés. Seuls les tickets s'impriment |
| E-mail au client : facture A4 jointe | E-mail au client : `ticket-FAC-….pdf` joint, une seule bande, QR code |
| QR code seulement sur l'A4 | QR code sur le ticket (e-mail et caisse) |

Inchangé : factures et avoirs figés, numéros, avoirs, vérification publique par le QR code, exports CSV et PDF des rapports.

**À valider avec l'hôtel :** qu'un ticket 80 mm suffise comme facture pour les clients et la comptabilité (questions fiscales Q-09 et Q-16).

## 2. Exports Excel (D-066)

| Écran | Feuilles après le tableau de bord | Sans réseau |
|---|---|---|
| Réservations | Réservations, Occupants | Oui |
| Clients | Clients | Oui |
| Caisse | Mouvements, Par jour, Par moyen | Oui (période déjà ouverte) |
| Factures et reçus | Documents (avoirs en négatif) | Oui |
| Rapports | Par jour, Par catégorie, Soldes à encaisser, Définitions | Non |
| Chambres et Tarifs | Chambres, Catégories, Tarifs (toutes les versions) | Non |
| Utilisateurs | Utilisateurs (sans mot de passe) | Non |
| Journal d'audit | Journal | Non |
| Postes de caisse | Postes, Désignations | Non |
| Mode hors ligne | Opérations rejouées | Non |

**Présentation de chaque classeur :**
- bandeau vert et or avec les filtres, la date et l'auteur ;
- montants en FCFA entiers et dates au format jour/mois/année ;
- filtres automatiques et en-tête figé ;
- totaux qui suivent les filtres ;
- impression paysage à la largeur de la page.

**Classeur sans réseau :**
- même présentation, sans graphiques (des barres dans les cellules les remplacent) ;
- la mention « Données gardées sur ce poste » sur chaque feuille ;
- « Tout télécharger pour le hors ligne » prépare aussi l'outil des classeurs.

**Sécurité :**
- chaque export exige le droit de son écran ;
- un texte saisi qui commence par « = » reste du texte, jamais une formule ;
- le classeur des clients rappelle qu'il contient des données personnelles.

## 3. SOLID et DTO

Pour chaque module, la chaîne est désormais la même :
1. une requête validée (FormRequest) ;
2. un objet de filtres typé (DTO), le même pour la liste et pour l'export ;
3. une seule requête de lecture, partagée ;
4. une classe d'export qui ne fait que le rendu Excel ;
5. un contrôleur d'une ligne.

Les doublons sont supprimés (requêtes copiées, validations répétées, appels d'un contrôleur à un autre). La règle est écrite dans `CLAUDE.md` et gardée en mémoire.

## Ce qui reste

- **Hôtel :** ticket 80 mm comme seule facture (Q-09, Q-16), essais sur l'imprimante (5.2 du hors ligne).
- **Commits :** le lot 5, D-065 et D-066 ne sont pas encore commités. Les fichiers de la session de déploiement (LWS, `.env copy.example` qui contient de vrais secrets) restent hors des commits.

---

# Rapports précédents

**Date :** 20 novembre 2026.
**Objet :** tout ce qui a été fait pendant ton absence, puis le bilan de la journée. Ta dernière demande était : « ajoute les pages d'erreur 404, 505, etc. avec un design et le message », et « un bon design pour la page Paramètres du système » (décision D-060).

## En bref

- Les **pages d'erreur** sont en place, dans l'application comme sur les liens publics (QR code de facture, liens des e-mails).
- La **page Paramètres** est redessinée : règles rangées par domaine, valeurs et statuts lisibles.
- **Tous les contrôles sont verts** : 234 tests backend, 109 tests frontend, 8 parcours navigateur, analyse statique et mise en forme. La CI GitHub du commit précédent est verte, et celui de ce soir est poussé (voir plus bas).
- **Rien à faire de ton côté pour le code.** Il reste seulement des validations de l'hôtel (liste en fin de rapport).

## 1. Pages d'erreur (D-060)

### Dans l'application (personnel connecté)

Chaque page affiche le code en grand, un titre clair, une explication, une aide et des boutons pour repartir :

| Cas | Titre | Boutons |
|---|---|---|
| Adresse inconnue (404) | Page introuvable | Retour à l'accueil, Page précédente |
| Écran non autorisé pour le rôle (403) | Accès refusé | Retour à l'accueil |
| Compte sans aucun écran attribué | Accès à configurer | Aucun : l'aide invite à contacter l'administrateur (la déconnexion reste dans le menu) |
| Panne inattendue de l'écran (500) | Erreur inattendue | Recharger la page, Retour à l'accueil |

Aucun détail technique n'est jamais affiché.

### Sur les liens publics (client ou personnel hors de l'application)

Ce sont les pages qu'on voit par exemple en scannant un QR code abîmé ou en ouvrant un lien expiré. Elles reprennent le bandeau vert et or de l'hôtel et son contact :

- **403** Accès refusé, **404** Page introuvable, **419** Page expirée, **429** Trop de demandes ;
- **500** Erreur interne, **503** Service momentanément indisponible ;
- **pages génériques** pour les autres codes : un **505**, par exemple, affiche « 505 » avec un message adapté.

Deux choix de prudence :
- ces pages **ne renvoient pas vers l'écran de connexion du personnel**, car un client peut les voir ; elles proposent « Revenir en arrière », et « Réessayer » quand l'erreur est passagère ;
- en production, le message technique de l'erreur n'apparaît jamais. Un test le vérifie.

## 2. Page Paramètres

- **En haut :** la vue d'ensemble (nombre de règles, validées, provisoires, modifiables) et une légende des trois états : Validé, Provisoire, Fixé par décision.
- **Règles rangées par domaine :** Remises, Encaissements, Réservations, Facturation et caisse.
- **Pour chaque règle :**
  - la valeur en grand (par exemple « 10 % », « 12 h », les moyens de paiement en pastilles) ;
  - son statut ;
  - sa référence (D-016, Q-06…) ;
  - la date de sa dernière modification.
- **Bouton « Modifier » :** il n'apparaît que pour les deux règles modifiables, le plafond de remise et les moyens de paiement. Les autres affichent « Fixé par décision ».
- **En bas :** le panneau « Envoi des e-mails », avec le test d'envoi.

Aucune règle ni aucune valeur n'a changé : c'est uniquement la présentation. J'ai contrôlé l'affichage sur PC et sur téléphone.

## 3. Rappel de la journée

| Décision | Ta demande | Ce qui est en place |
|---|---|---|
| D-053 | Une réservation annulée restait comptée dans la caisse ; la prolongation ne refaisait pas la facture | L'annulation rembourse l'encaissé et crédite la facture (payée ou non). La prolongation remplace la facture par une nouvelle facture détaillée : séjour initial + prolongation. |
| D-054 | Envoi réel des e-mails | SMTP de l'hébergeur, alerte à chaque connexion, invitation ou bienvenue à la création d'un compte. Chaque envoi est retenté pendant 24 h, avec un bouton « Relancer les envois en échec ». |
| D-058 | Correction des erreurs de la caissière ; « Supprimer » réservé à l'administrateur | La caissière annule ses encaissements du jour et modifie une réservation avant le séjour. L'administrateur supprime définitivement, avec avertissement, motif et copie au journal. Encaissements et factures ne se suppriment jamais. |
| D-059 | Beau design pour la vérification de facture, le mot de passe oublié et la connexion ; vérifier que le compte existe avant d'envoyer le lien | Pages redessinées. Le compte est vérifié avant l'envoi : introuvable, désactivé ou adresse non joignable sont signalés. Le lien est valable 60 min et à usage unique. |
| D-060 | Pages d'erreur et page Paramètres | Voir plus haut. |

## 4. E-mails : état actuel

- **Authentification SMTP :** l'autre session a rétabli l'authentification auprès de l'hébergeur (les premiers essais étaient refusés, erreur 535). Une invitation réelle est partie.
- **Ce soir :**
  - la file d'attente est vide, sans aucun échec ;
  - le worker de l'application tourne ;
  - la configuration utilise le SMTP de l'hébergeur (port 465, connexion chiffrée).
- **À confirmer de ton côté :** la **réception** dans la boîte du destinataire. Pense aussi à vérifier le dossier « Spam ».
- **Si l'ordinateur redémarre :** relance `composer queue` dans `backend/`, sinon les e-mails attendent dans la file sans partir.

## 5. Vérifications de ce soir

| Contrôle | Résultat |
|---|---|
| Tests backend (base MariaDB de test) | 234 réussis, dont 3 nouveaux sur les pages d'erreur ; Pint et Larastan sans erreur |
| Tests frontend | 109 réussis, dont 2 nouveaux sur les pages d'erreur et le test Paramètres réécrit ; lint, Prettier, TypeScript et build verts |
| Parcours navigateur (vrai serveur, base de recette isolée) | 8 réussis, dont 1 nouveau qui contrôle les pages 404 (application et serveur), leur accessibilité et l'affichage mobile |
| Accessibilité | Le premier passage a trouvé un gris trop pâle sur la page Paramètres (« Modifié le… », « Fixé par décision ») : contraste 4,41 au lieu de 4,5 minimum. Corrigé (5,56), puis toute la suite rejouée avec succès |
| Captures | Paramètres, erreur 404 de l'application et erreur 404 du serveur, sur PC et sur mobile, inspectées |

Ta base de travail n'a pas été touchée : les captures ont été faites sur la base de recette isolée.

## 6. CI GitHub

- Le commit précédent (D-059) est **vert** : backend avec MySQL 8.4 et parcours navigateur, frontend.
- Le commit de ce soir (D-060, `d742202`) est **vert** lui aussi : backend avec MySQL 8.4 et les 8 parcours navigateur, frontend.

## 7. Ce qui reste (hors code)

- **Hôtel :**
  - valider les règles provisoires (priorité P1) ;
  - frais d'annulation (Q-14) ;
  - mentions légales de la facture ;
  - essai d'impression sur papier des factures et reçus.
- **E-mails :** confirmer la réception réelle, puis garder le worker lancé (`composer queue`).

## Complément — configuration du test LWS cPanel

L’utilisateur a précisé l’hébergement **LWS mutualisé cPanel** et le domaine **banguiweb-tech.com**. Deux modèles sans secrets ont été préparés : `backend/.env.production.example` et `frontend/.env.production.example`, avec `hotel.banguiweb-tech.com` pour l’interface et `api.hotel.banguiweb-tech.com` pour Laravel. Ils sont cohérents pour les cookies Sanctum, les invitations, les QR et les e-mails. Huit contrôles Dotenv ont réussi. La procédure détaillée, y compris le cron pour la file d’e-mails, figure dans `docs/EXPLOITATION.md`. Aucun domaine, secret local, serveur ou base de production n’a été modifié.

La demande de login simple sans image a également été contrôlée : carte centrée sur fond clair, captures PC et mobile inspectées, 4 tests d’authentification et 1 test navigateur réussis, ainsi que build, lint et contrôle du serveur actif. Les évolutions déjà présentes des écrans d’accès et les autres travaux du projet ont été conservés.

## Diagnostic de la connexion en ligne — 20 novembre 2026

Les contrôles HTTP identifient une API qui sert encore la page d’attente LWS, avec des routes en 404 et des requêtes OPTIONS génériques sans CORS. Le panneau observé est LWS Panel Perso, pas cPanel. L’utilisateur confirme le backend dans `/htdocs/api.hotel.banguiweb-tech.com`. L’accès direct à `public/index.php` atteint Laravel et présente les bons en-têtes CORS.

Le journal fourni identifie aussi l’erreur 500 : `DB_HOST=localhost` et base/utilisateur d’exemple `CPANELUSER_...`. La correction préparée comprend le routage racine vers `public`, le `.htaccess` original dans `public`, la saisie des vraies valeurs MySQL du panneau et le rechargement de la configuration. Le fichier racine prêt à copier est `infra/lws/api-root.htaccess`. Aucun secret ni correctif distant n’a été envoyé.

Les 3 tests CORS Laravel passent (10 assertions). Leur première exécution utilisait la configuration de production copiée dans l’environnement local ; une réexécution avec des variables de test explicites a réussi, sans réécrire le `.env`. Un essai complémentaire de serveur Apache temporaire a été refusé par l’outil d’exécution ; aucune validation Apache locale n’est revendiquée. Les contrôles finaux en ligne restent dépendants de l’application du correctif et des identifiants réels sur l’hébergement.

## Rechargement des routes React en ligne

À la demande de l’utilisateur, `frontend/public/.htaccess` a été ajouté. Il est copié automatiquement dans `frontend/dist/.htaccess` lors du build (compilation réussie et copie vérifiée). Le fichier doit être envoyé dans `/htdocs/hotel.banguiweb-tech.com`, au même niveau que `index.html` : les liens directs et rechargements des routes de l’application sont alors transmis à React, tout en préservant les fichiers et dossiers existants. Aucun fichier distant ni paramètre MySQL n’a été modifié. Le contrôle après mise en ligne reste à effectuer.

## Frontend LWS : 500 sur les routes après publication

La capture est confirmée par les contrôles HTTP : le frontend répond 200 sur la racine et index.html, mais 500 sur les routes React. Une variante simplifiée du `.htaccess` a été préparée avec une cible absolue et `[END]`, sans directives Options/DirectoryIndex. Le fichier distant doit être remplacé entièrement. La cause précise reste à confirmer par le journal Apache demandé ; aucune correction distante réussie n’est encore revendiquée.


## Frontend sur banguiweb-tech.com — 20 novembre 2026

À la demande de l’utilisateur, le frontend utilise désormais directement `https://banguiweb-tech.com` ; l’API reste sur `https://api.hotel.banguiweb-tech.com`. L’ancien diagnostic du sous-domaine frontend est abandonné. La page de connexion a été observée dans le navigateur, puis quatre routes directes ont renvoyé 200 avec l’index React : racine, connexion, réservations et choix du mot de passe. Cette publication distante a été constatée ; aucun fichier serveur n’a été modifié par l’agent.

Les modèles et la configuration locale déjà en mode production ont été adaptés pour l’origine CORS, les nouvelles invitations, le domaine Sanctum et le cookie `.banguiweb-tech.com`, sans modifier les identifiants ni la clé de chiffrement. Le guide actif indique la publication du contenu de `frontend/dist` directement dans `/htdocs`, avec son `.htaccess`. Un fichier local de production frontend a été préparé depuis le modèle public. Le build réussit, les 11 contrôles des domaines réussissent et le fichier de routage est bien inclus dans le build.

Il reste à reporter ces paramètres dans le `.env` distant du backend et à reconstruire son cache. Le précontrôle OPTIONS de l’API répond encore sans en-tête CORS : la migration du frontend ne résout pas le routage Laravel ni les paramètres MySQL de l’incident précédent. La connexion complète n’est pas déclarée fonctionnelle.


## Vérification du fichier CORS fourni

Le fichier local `backend/config/cors.php` est déjà valide. Les caractères de formatage du texte collé ne doivent pas être copiés dans le fichier PHP. La syntaxe PHP et les deux précontrôles locaux vers `/api/v1/auth/me` et `/sanctum/csrf-cookie` réussissent : 204, origine `https://banguiweb-tech.com` et `Access-Control-Allow-Credentials: true`. Aucune connexion à la base ni modification du serveur distant pendant ce contrôle. Une version propre est fournie avec le réglage `FRONTEND_URL` et les commandes de rechargement du cache.


## Demande de correction des headers

Les quatre en-têtes envoyés par le frontend sont déjà autorisés par Laravel. Les précontrôles locaux de connexion et CSRF le confirment (204, origine exacte et cookies). En revanche, les routes CSRF et santé de l’API distante renvoient maintenant exactement le même index React que le domaine principal : 573 octets et même empreinte SHA-256. Le défaut se situe dans le routage ou la racine servie avant Laravel.

Le repli React de `frontend/public/.htaccess` a été limité au domaine principal, sans ajouter d’en-têtes CORS dans Apache. Le build réussit et le fichier est copié à l’identique dans `dist`. Aucun fichier distant modifié ; publier ce fichier dans `/htdocs/.htaccess` puis confirmer le routage indépendant du sous-domaine API vers Laravel. La correction distante n’est pas encore déclarée réussie.


## API dans un dossier du domaine principal

À la demande de l’utilisateur, la nouvelle cible est `https://banguiweb-tech.com/backend`, donc les routes métier sont sous `/backend/api/v1`. Le client HTTP supprimait le dossier de sa racine configurée ; cette erreur est corrigée pour les appels, le cookie CSRF et les documents. Six tests client et trois tests de montage Laravel (13 assertions) passent. Les erreurs initiales de ces contrôles provenaient du cache de modules du test frontend et de la clé de chiffrement absente dans la configuration locale de production ; les variables de test sont maintenant isolées sans génération de clé de production.

L’entrée publique de `infra/lws/backend-public` charge le projet privé depuis `/home/jb-hotel-backend`, hors du dossier web. Le routage frontend laisse passer `/backend`. Les configurations locales de production et leurs modèles utilisent cette adresse, le cookie limité à l’hôte et le chemin `/`. La clé et les identifiants existants sont conservés.

Le build réussit. L’archive `output/lws/deploiement-dossier.zip` contient sept fichiers publics vérifiés, sans secret ; le guide `docs/DEPLOIEMENT_LWS_DOSSIER.md` décrit la copie du projet existant, la configuration et la bascule du cron. Aucun déplacement de fichiers ni changement de base sur LWS n’a été exécuté. Une première exécution élargie des tests backend a utilisé `APP_URL` de production avec le sous-dossier et a échoué sur des chemins de test sans dossier ; la réexécution isole aussi cette variable. La suite frontend élargie a passé 109 tests sur 110 ; le test Caisse ayant dépassé son délai repasse avec les quatre tests Caisse lors de la réexécution ciblée. Lint et build réussis. Les neuf tests d’authentification passent. Les deux échecs restants de facturation étaient dus à VERIFICATION_BASE_URL de production dans les tests ; les sept tests de vérification des factures passent après isolation de cette variable (56 assertions).


## 404 au login après publication dans /backend

Le build contenant le dossier backend est publié, mais les contrôles HTTP donnent une 404 Laravel sur toutes les routes de l’entrée publique, y compris santé et CSRF. Une reproduction locale exécutant le véritable index avec des métadonnées PHP sans le dossier reproduit exactement la 404. L’entrée publique normalise désormais le nom, le chemin et le fichier du script pour le montage `/backend`, sans modifier la méthode, le corps, les paramètres ni l’URI demandée. La reproduction donne ensuite 200 à la racine, 401 pour l’utilisateur non connecté et 204 pour CSRF ; syntaxe PHP valide.

L’archive `output/lws/correctif-login.zip` contient uniquement `backend/index.php`, à extraire dans `/htdocs`. L’archive complète a aussi été mise à jour et contrôlée. Aucun fichier distant ni donnée modifié pendant cette correction ; la confirmation sur LWS reste attendue après remplacement du fichier.


## 503 : projet privé absent à l’emplacement attendu

Les contrôles HTTP montrent maintenant le JSON 503 de la garde du point d’entrée public, avant Laravel. L’utilisateur confirme le projet complet dans `/htdocs/backend`, alors que l’entrée charge `/home/jb-hotel-backend`.

Un correctif CLI autonome est fourni : `output/lws/correctif-emplacement.zip`, à extraire dans `/htdocs`, puis `php ~/htdocs/reparer-emplacement-backend.php`. Le script vérifie les fichiers, refuse une destination privée existante, prépare l’entrée publique, déplace le projet complet hors du Web et remet les deux fichiers publics dans `/htdocs/backend`. Il ne supprime rien et conserve la configuration et les données. Le scénario a été vérifié sur fixture locale, ainsi que le refus d’une seconde exécution et la conservation du `.env`. Aucune exécution sur l’hébergement par l’agent ; la santé et la connexion restent à confirmer après exécution par l’utilisateur.


## Correction de la précondition du réparateur

Le premier réparateur exigeait à tort `index.php` et `.htaccess` à la racine du projet complet ; ces fichiers ne sont pas requis à cet endroit dans Laravel. L’arrêt signalé par l’utilisateur a eu lieu avant tout déplacement. La version 2 embarque les deux modèles publics et les génère sans dépendre de leur présence dans le projet source. Les contrôles sur `artisan`, l’autoloader, le bootstrap et `.env`, ainsi que le refus d’écrasement, restent actifs.

La syntaxe PHP et trois scénarios sur fixtures locales passent : projet sans fichiers publics déplacé en conservant la configuration et un document, projet incomplet refusé sans déplacement, destination existante conservée sans écrasement. Le contrôle des modèles a été refait en normalisant les fins de lignes Windows/Unix. L’archive `output/lws/correctif-emplacement-v2.zip` est vérifiée ; le script et l’ancienne archive ont également été mis à jour. Aucun déplacement sur LWS par l’agent.


## Variante sans commande

À la demande de l’utilisateur, une procédure entièrement réalisable dans le gestionnaire de fichiers LWS a été préparée. L’archive `output/lws/backend-public.zip` contient uniquement les deux fichiers publics, avec contenu vérifié. Le guide explique le déplacement du projet dans `/home/jb-hotel-backend`, l’édition du `.env` et la suppression des deux caches générés pour relire configuration et routes. Les noms des caches ont été vérifiés dans Laravel installé. Aucun fichier distant modifié pendant cette préparation.


## 503 persistant : vérification visuelle de l’arborescence LWS

La vue du gestionnaire de fichiers révèle le projet complet dans `/htdocs/jb-hotel-backend`, ainsi qu’un index PHP et le routage API à la racine `/htdocs`, sans index HTML frontend dans cette vue. Cela ne correspond pas aux chemins de l’entrée PHP, qui attend `/home/jb-hotel-backend` et doit être dans `/htdocs/backend`. Aucun fichier distant déplacé ou édité pendant l’observation.

La publication complète `output/lws/publication-complete-v3.zip` a été préparée et vérifiée avec sept fichiers publics, sans secret, et le routage frontend donne désormais priorité à index.html. La correction demandée à l’utilisateur est un déplacement précis du projet vers home, puis une extraction de cette archive dans htdocs en vérifiant les chemins finaux. La confirmation de la santé et de la connexion reste à effectuer après ces opérations.


## 419 au login : cookies de l’ancien sous-domaine

La santé distante répond maintenant 200 avec base OK et le point d’entrée CSRF 204. Les deux réponses émettent cependant les cookies XSRF et session avec `domain=.hotel.banguiweb-tech.com` depuis `banguiweb-tech.com`. Un client HTTP avec gestion normale des cookies les rejette et conserve un cookie jar vide ; une soumission vide de connexion reproduit alors 419 sans tentative de connexion réelle ni envoi d’e-mail.

La correction est limitée à la configuration distante active : `SESSION_DOMAIN=null` dans `/home/jb-hotel-backend/.env`, chemin `/`, puis retrait de `bootstrap/cache/config.php` pour relire le fichier et suppression des anciens cookies du navigateur. Les modèles locaux ont déjà la bonne valeur ; aucun changement de code ou fichier distant pendant ce contrôle.


## Vérification directe des mails automatiques

L’application de production connectée affiche dans Paramètres un SMTP réel, 5 messages en attente et aucun en échec. La page LWS Tâches cron indique 0 tâche utilisée sur 1 disponible. Le code confirme que le mail de test est envoyé immédiatement, tandis que les alertes de connexion, invitations et notifications clients passent par des listeners ShouldQueue. La file attend donc un traitement qui n’est pas planifié dans LWS.

La recommandation est un worker court périodique lancé sur `/home/jb-hotel-backend/artisan`, puis la vérification de la baisse du compteur et de la réception effective. Le chemin PHP explicite proposé vient de la documentation LWS ; son exécution n’a pas été validée sur cet hébergement. Aucune tâche créée, aucun secret modifié, aucun message envoyé par l’agent pendant cette demande de vérification.


## Format cron refusé

Vérification du formulaire LWS : Minute contient `*`, mais Heure, Jour du mois, Mois et Jour de la semaine sont vides. Le rejet de format est expliqué par ces quatre champs manquants ; renseigner les cinq champs séparément. Aucune tâche créée par l’agent.
