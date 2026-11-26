# PWA — fichiers publics à republier

Contrôle du 23 novembre 2026 : le manifeste et le service worker servis sur `banguiweb-tech.com` sont identiques au build livré. Les quatre fichiers `/icons/*.png` référencés répondent en revanche 404. Ces fichiers sont bien présents dans le ZIP public complet.

Le correctif `correctif-pwa-public.zip` contient uniquement `manifest.webmanifest`, `sw.js` et les quatre icônes dans `icons/`. Extraire son contenu directement dans `/htdocs/`, avec remplacement des fichiers de même nom, sans dossier parent supplémentaire. Le backend reste dans `/home/jb-hotel-backend` ; aucun fichier privé ni donnée métier n'est concerné.

Après extraction, contrôler dans le navigateur que ces adresses affichent les icônes :

- `https://banguiweb-tech.com/icons/icon-192.png`
- `https://banguiweb-tech.com/icons/icon-512.png`
- `https://banguiweb-tech.com/icons/icon-maskable-512.png`
- `https://banguiweb-tech.com/icons/apple-touch-icon.png`

Recharger ensuite l'application en ligne. Dans « Synchronisation », le panneau « Installation sur ce poste » propose « Installer l'application » si le navigateur autorise la demande. L'affichage dépend notamment du navigateur et d'une éventuelle installation existante. Préparer aussi la copie locale des données avec « Tout télécharger pour le hors ligne » ; une installation ne remplace pas ce téléchargement.

Ne pas effacer les données du site ni IndexedDB pour forcer la proposition d'installation : le poste peut contenir des opérations non synchronisées. La synchronisation automatique garantie exige l'ouverture ou la réouverture de l'application. Ce ZIP corrige la publication des ressources PWA ; la mise à jour séparée du backend et la recette finale restent nécessaires.

Référence : [conditions d'installation PWA et icônes du manifeste](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).
