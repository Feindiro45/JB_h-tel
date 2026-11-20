# Menu latéral réductible sur PC

**Date :** 20 novembre 2026.

Un bouton dans la barre du haut permet de **réduire ou déployer le menu latéral sur ordinateur**. Le mode réduit garde un rail de 80 pixels avec le logo, les icônes de navigation, la page active et la déconnexion. Le contenu central récupère automatiquement l’espace disponible, y compris sur les grands moniteurs. Le mode déployé conserve sa présentation habituelle.

Le choix est mémorisé dans le navigateur, conservé entre les pages et restauré au rechargement. Si le stockage local est interdit, le bouton continue de fonctionner pendant l’affichage courant. Les libellés restent accessibles aux lecteurs d’écran ; les liens ont des infobulles et le bouton fonctionne au clavier.

Sur mobile, le tiroir reste complet avec tous ses libellés, même si le mode PC était réduit. Le bouton PC est masqué. Les règles de réduction sont limitées à l’écran et n’affectent pas l’impression. Le fil d’Ariane s’adapte à la place disponible dans la barre du haut.

Validation : **99 tests frontend réussis**, lint, Prettier, TypeScript et build verts. Le contrôle navigateur vérifie les largeurs réelles, l’élargissement du contenu, le rechargement, le passage PC/mobile, le clavier et l’accessibilité. La recette visuelle globale a également été rejouée avec succès. Contrôles à 1 024, 1 440 et 1 920 pixels, ainsi que sur mobile ; captures du menu réduit et déployé enregistrées dans `frontend/test-results/`. Le serveur Vite actif reste sans page blanche ni erreur JavaScript.

Aucune modification backend ni remise à zéro de base pour cette évolution. Le catalogue compte désormais 6 scénarios navigateur, dont les 2 contrôlés pour cette modification. Le build conserve son avertissement non bloquant sur la taille du bundle (~527 ko). CHECK_LEVEL.md, CHANGELOG.md, la décision D-057 et CLAUDE.md sont à jour.
