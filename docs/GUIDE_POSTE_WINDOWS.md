# Guide du poste Windows JB Hôtel — caissière et administrateur

> Logiciel « JB Hôtel » installé sur le PC de la caisse. Il fonctionne **avec ou sans Internet**.
> Les écrans sont les mêmes que sur le site web.

## Pour la caissière

### Ouvrir le logiciel
- Double-cliquez sur **JB Hôtel** (Bureau ou menu Démarrer). Pas besoin d'Internet, de navigateur
  ni d'autre programme : le logiciel s'ouvre même juste après avoir rallumé le PC.
- Si l'écran **« Session verrouillée »** apparaît (15 min sans activité sans Internet) : tapez votre
  mot de passe habituel.
- Si l'écran de connexion apparaît : connectez-vous (il faut Internet pour une toute première
  connexion ou après une déconnexion).

### Savoir si Internet fonctionne
- En haut à droite : **« En ligne »** (vert) ou **« Hors ligne »** (orange).
- Hors ligne, un bandeau orange rappelle combien d'opérations attendent l'envoi.

### Travailler sans Internet
Vous pouvez : créer un client, une réservation, la confirmer, la modifier ou la prolonger, enregistrer
l'arrivée, le départ, les occupants, **encaisser**, annuler une réservation, imprimer les tickets.
- Un encaissement donne un **reçu provisoire `LOC-…`**, une facture une **facture provisoire `FAC-LOC-…`**.
  Imprimez-les normalement ; le numéro définitif arrive au retour d'Internet.
- Rien ne se perd si le PC s'éteint ou si le courant coupe : tout est gardé sur le disque du poste.
- Ne sont **pas** possibles sans Internet : remboursement, annulation d'un encaissement, avoir,
  rapports PDF, écrans d'administration. Un message l'explique.

### Mise à jour automatique du poste
Vous n'avez **rien à faire** : le logiciel tient tout seul sa copie à jour pour le travail hors ligne.
Il télécharge tout le poste au démarrage puis toutes les 3 heures, les écrans toutes les
15 minutes, et ce qui a changé sur un autre poste ou sur le site en moins de 2 minutes.
L'écran Synchronisation affiche « Mise à jour automatique… » pendant ce temps ; vous pouvez
continuer à travailler. Le bouton « Tout télécharger » reste utile avant une coupure annoncée.

### Au retour d'Internet
- Tout part **tout seul**, dans l'ordre, une seule fois (pas de double encaissement).
- Écran **Synchronisation** : « Opérations à envoyer » doit revenir à 0.
- Si une opération est **refusée** (ex. chambre déjà prise par un autre poste), elle reste affichée
  avec la raison : prévenez l'administrateur, ne la refaites pas vous-même sans son accord.

### Imprimer un ticket 80 mm
- Bouton **« Imprimer le ticket »** sur le ticket du reçu ou de la facture.
- Imprimante éteinte ou débranchée : un message le dit ; rebranchez-la puis réessayez.
  Chaque impression et réimpression est notée sur le poste.

## Pour l'administrateur

### Mise en service du poste
1. Installer `JB-Hotel-Setup-<version>.exe` (voir `docs/WINDOWS_BUILD_AND_INSTALL.md`).
2. Première connexion en ligne, puis **Postes de caisse** → désigner ce poste comme poste principal (D-062).
3. Attendre la fin du premier téléchargement automatique (écran Synchronisation, « Tout télécharger pour le hors ligne » : date et nombre d'éléments) ; le bouton « Tout télécharger » le lance à la main si besoin.
4. **Synchronisation → Poste Windows → Imprimante des tickets** : choisir l'imprimante thermique,
   la largeur (80 ou 58 mm) et « Imprimer directement » pour éviter la fenêtre à chaque ticket.
   Faire un ticket d'essai.

### Écran Synchronisation → « Poste Windows »
- **Base locale** : taille ; **Protection des données** : « Chiffrées (compte Windows) » attendu.
- **Opérations du poste** : en attente, refusées, envoyées.
- **Changements du serveur** : dernière vérification (les données faites ailleurs arrivent toutes les 30 s).
- **Sauvegarder maintenant** ; **Copier sur une clé USB…** ; **Restaurer une sauvegarde…** ;
  **Ouvrir le dossier des sauvegardes**.

### Sauvegardes
- Automatiques : une par jour, et avant chaque mise à jour, migration ou restauration (30 gardées),
  dans `%APPDATA%\JBHotel\sauvegardes`.
- Copie hebdomadaire conseillée sur clé USB (bouton dédié).
- Une sauvegarde du poste ne se restaure que **sur ce même compte Windows**. Pour changer de PC :
  sur l'ancien, « Sauvegarde des opérations » (fichier chiffré par mot de passe) ; sur le nouveau,
  l'importer, puis se connecter en ligne.
- Restaurer : les opérations faites **après** la sauvegarde sont conservées automatiquement ; une
  sauvegarde de l'état actuel est faite avant.

### Si le logiciel signale « Base locale réparée »
La base était endommagée (coupure brutale, disque) : elle a été mise de côté et la dernière
sauvegarde valide restaurée. Vérifiez l'écran Synchronisation (opérations en attente) et le
« Mode hors ligne » côté serveur ; le fichier endommagé reste dans `%APPDATA%\JBHotel` pour analyse.

### Opérations refusées
Menu **Mode hors ligne** (site web ou logiciel en ligne) : chaque refus avec sa cause ; décider
« ressaisi » ou « rejet confirmé ». Le poste ne supprime jamais une opération refusée.

### Mises à jour du logiciel
Si le canal est configuré, une nouvelle version se télécharge seule ; l'écran Poste Windows propose
**« Redémarrer et installer »**. Les données du poste ne sont jamais effacées par une mise à jour.

### En cas de problème
Journal technique : `%APPDATA%\JBHotel\journal\main.log` (à transmettre au support).
