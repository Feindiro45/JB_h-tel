# JB Hôtel — Facture thermique 80 mm

Composant React autonome de prévisualisation et d'impression d'un reçu thermique 80 mm.

## Installation dans votre frontend React

1. Copier `src/components/ThermalReceipt.jsx` et `src/components/thermal-receipt.css`.
2. Importer `ThermalReceipt` dans la page de facture.
3. Fournir `invoice` et `hotel` depuis l'API Laravel. `src/App.jsx` illustre la structure des données avec des valeurs fictives.
4. Cliquer sur « Imprimer le ticket », choisir l'imprimante thermique, régler la largeur à 80 mm, marges nulles et échelle 100 %.

## Intégration backend

- Exposer une route authentifiée de lecture de facture validée (`GET /api/invoices/{id}`), avec contrôles d'autorisation.
- Calculer et figer côté serveur sous-total, remise, taxes, total, encaissements et solde, en unités monétaires entières.
- Ne pas utiliser les prix actuels du catalogue pour réimprimer une facture historique.
- Retourner des libellés de dates et des modes de paiement localisés, ou les formater dans le frontend.
- Journaliser les réimpressions si requis.

## Limites

`window.print()` ouvre la boîte de dialogue du navigateur. L'impression silencieuse et la découpe automatique exigent une configuration du poste, du pilote ou une solution locale ESC/POS. Les réglages `@page` peuvent être ignorés par certains navigateurs/pilotes ; choisir aussi le papier 80 mm dans le pilote. Vérifier le rendu sur l'imprimante réelle avant mise en production.
