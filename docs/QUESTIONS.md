# Questions à valider avec l'hôtel — JB Hôtel

Ces questions doivent être tranchées **avant la mise en production**. En attendant, le développement avance avec des valeurs **provisoires et configurables**, décrites dans `DECISIONS.md`. Ces valeurs ne sont pas des règles validées.

**Priorité :**
- **P1** : bloque la mise en production.
- **P2** : nécessaire avant la phase concernée.
- **P3** : confort.

| # | Priorité | Phase | Question | Options et conséquences | Valeur provisoire |
|---|---|---|---|---|---|
| Q-01 | P1 | 4 | **Que couvre exactement une « journée »** (durée, plage horaire, arrondis) ? | a) Forfait jusqu'à 24 h ; b) nuitée jusqu'à une heure de départ fixée (contraire à « aucun horaire imposé ») ; c) libre : la caissière choisit la quantité, sans contrôle de cohérence. | La caissière choisit unité et quantité ; l'application contrôle seulement la règle des 12 h de la demi-journée. |
| Q-02 | P1 | 4 | **Quelle période est bloquée quand aucune heure n'est saisie ?** | a) Journée entière (prudent, peut perdre des ventes) ; b) plage par défaut paramétrable ; c) heures obligatoires pour une demi-journée. | a) — voir D-009. |
| Q-03 | P1 | 4 | Deux demi-journées le **même jour** dans la même chambre sont-elles possibles sans heures saisies ? | Si oui, les heures doivent devenir obligatoires dans ce cas. | Non : conflit (D-009). |
| Q-04 | P2 | 4 | La quantité peut-elle être **fractionnaire** (ex. 1,5 journée) ? Le schéma 09 prévoit `NUMERIC(10,2)`. | Entier seulement (la demi-journée existe déjà) : plus simple, sans arrondi. Fractionnaire : arrondi à définir. | Entier ≥ 1, implémenté (D-017). |
| Q-05 | P2 | 4 | **Arrondi des remises en pourcentage** ? | Au FCFA le plus proche, inférieur ou supérieur ; à la dizaine ou à la centaine de FCFA. | Au FCFA le plus proche, demi supérieur (D-008). |
| Q-06 | P2 | 4 | **Plafond de remise de la caissière** : quelle valeur, en % ou en montant ? | Une valeur trop basse impose une intervention de l'administrateur. | 10 % du brut (D-016). |
| Q-07 | P1 | 4-5 | **Confirmer une réservation non payée** est-il permis ? Faut-il un acompte minimum ? Une réservation en attente expire-t-elle ? | Le paiement différé est autorisé par le cahier des charges ; reste à fixer l'expiration éventuelle des réservations en attente. | Confirmation permise sans paiement ; pas d'expiration automatique. |
| Q-08 | P1 | 5 | **Conditions de remboursement** : qui rembourse, quel délai, remboursement partiel, départ anticipé ? | Cela détermine la permission « rembourser » et les contrôles associés. | Remboursement réservé à l'administrateur, partiel autorisé, motif obligatoire. |
| Q-09 | P1 | 5 | **Obligations de facturation en RCA** : mentions légales (NIF, RCCM, adresse), TVA applicable ou prix TTC, format de numérotation, avoirs. | Elles déterminent le gabarit de facture et la gestion des avoirs. | `FAC-AAAA-NNNNNN`, aucune taxe calculée (D-015). |
| Q-10 | P2 | 2 | **Données client obligatoires** : pièce d'identité requise ? Fiche de police hôtelière ? Durée de conservation ? | Collecte minimale imposée par le cahier des charges. | Nom et téléphone obligatoires ; les autres champs sont facultatifs. |
| Q-11 | P2 | 5 | **Moyens de paiement acceptés** (espèces, mobile money, carte, virement…) ? | Ils alimentent la liste des modes de paiement et les filtres de caisse. | Espèces, mobile money, carte, virement (liste paramétrable). |
| Q-12 | P2 | 3 | **Maintenance** : simple statut courant ou **périodes planifiées** (du… au…) ? | Les états étant calculés par période, des périodes planifiées sont plus justes. | Statut courant seulement, comme dans 09 (D-019). |
| Q-13 | P3 | 1 | Fuseau horaire `Africa/Bangui` (UTC+1) : à confirmer. | — | `Africa/Bangui` (D-010). |
| Q-14 | P2 | 4 | **Annulation** : y a-t-il des frais ? Qui peut annuler une réservation confirmée, une réservation déjà payée ? | Cela détermine les permissions et le traitement des paiements déjà reçus. | Annulation par la caissière avant l'arrivée ; **depuis D-053 (choix de l'utilisateur du 19/11/2026)**, l'annulation d'un séjour payé rembourse intégralement l'encaissé dans la même opération et exige le droit de rembourser (administrateur). Aucuns frais retenus tant que cette question n'est pas tranchée. |
| Q-15 | P2 | 4 | **Départ anticipé** : faut-il recalculer le montant ou rembourser ? | Le cahier des charges interdit tout recalcul silencieux. | Aucun recalcul automatique ; remboursement éventuel par une opération explicite. |
| Q-16 | P3 | 6 | **Identité visuelle et en-tête de facture** : logo, raison sociale, adresse, téléphone. | — | Texte « JB Hôtel » sans logo. |
| Q-17 | P2 | 8 | **Sauvegardes** : fréquence, lieu de stockage, durée de rétention, responsable de la restauration. | — | Sauvegarde quotidienne de la base, procédure de restauration documentée. |
| Q-18 | P2 | 4 | **Prix d'une prolongation** : au prix figé de la réservation, ou au tarif en vigueur le jour de la prolongation ? | Prix figé : le client garde son tarif et les montants restent simples. Tarif du jour : cohérent avec la règle de confirmation. | Prix figé de la réservation (D-030). |
| Q-19 | P2 | 4 | Une réservation **en attente** doit-elle bloquer la chambre ? Faut-il une expiration automatique ? | La bloquer évite les doubles réservations, mais une option non confirmée peut immobiliser une chambre. | Elle bloque la chambre ; pas d'expiration (D-029). |
| Q-20 | P3 | 4 | Faut-il pouvoir saisir **après coup** un séjour déjà commencé (arrivée la veille) ? | Aujourd'hui, une date d'arrivée passée est refusée. | Refusé (D-031). |
| Q-21 | P1 | 4 | Le tarif appliqué est celui **en vigueur à la confirmation** (document 02, invariant 3), et non celui de la date du séjour : à confirmer explicitement avec l'hôtel. | Une réservation faite aujourd'hui pour dans trois mois garde le tarif d'aujourd'hui, même si une hausse est programmée entre-temps. | Tarif du jour de la confirmation (implémenté). |
| Q-22 | P1 | 5 | **Envoi des e-mails aux clients** : quel serveur SMTP et quelle adresse d'expédition ? Le consentement oral du client à la réception suffit-il ? | Sans SMTP, aucun e-mail ne part en production. Le consentement conditionne la conformité. | E-mail saisi = consentement, désinscription en un clic (D-039). **20/11/2026 :** SMTP de l’hébergeur fourni (`mail.banguiweb-tech.com`, port 465) ; premier essai refusé par le serveur (535, identifiant ou mot de passe), à corriger dans `backend/.env` (D-054). |
| Q-23 | P3 | 6 | **Caisse** : la caissière doit-elle voir le journal de **tous** les agents, ou seulement le sien ? | Voir tous les agents facilite la passation entre équipes ; ne voir que le sien cloisonne les responsabilités. | Tous les agents, avec un filtre par agent (D-041). |
