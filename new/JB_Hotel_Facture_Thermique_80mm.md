# JB Hôtel — Spécification fonctionnelle et technique de la facture thermique 80 mm

**Version :** 1.0  
**Projet :** JB Hôtel — gestion de caisse et séjours  
**Stack :** React + Vite (PWA), IndexedDB (Dexie.js), Laravel API, MySQL cloud  
**Statut :** Spécification à valider avant implémentation

## 1. Objectif

Remplacer l'impression A4 par un **ticket thermique de largeur nominale 80 mm**, émis depuis l'interface de caisse React. L'application doit permettre la préparation, l'enregistrement, l'impression et la réimpression d'un justificatif, **avec ou sans Internet**, tout en synchronisant les opérations avec Laravel lorsque la connexion revient.

**Important :** la largeur utile d'impression varie selon l'imprimante et ses marges (souvent environ 72 mm). Le modèle exact, le pilote et la réglementation locale de facturation devront être vérifiés avant la mise en production. Le ticket illustré ci-dessous est un modèle métier, pas une affirmation de conformité fiscale.

## 2. Périmètre

- Réservation immédiate ou future ; chambre VIP ou Standard ; séjour à la journée ou demi-journée ; durée et nombre de personnes.
- Client et informations de séjour ; remises autorisées ; prix figé au moment de la transaction.
- Encaissement en espèces ou autre moyen configuré ; prise en compte des paiements partiels, remboursements et annulations.
- Ticket de caisse 80 mm, aperçu avant impression, impression, réimpression et consultation de l'historique.
- Fonctionnement local-first : IndexedDB conserve les données et les événements à transmettre ; Laravel/MySQL cloud les contrôle et les consolide.
- Journal d'audit et suivi des états de synchronisation.

## 3. Maquette textuelle du ticket

```text
--------------------------------
            JB HÔTEL
     [Coordonnées configurées]
      REÇU / FACTURE [TYPE]
--------------------------------
N° document : LOC-01-000125
Date : 21/11/2026  13:42
Caisse : CAISSE-01
Caissière : [Nom]
Statut sync : LOCAL / SYNCHRONISÉ
--------------------------------
Client : [Nom]
Chambre : 105 (VIP)
Personnes : 2
Arrivée : [Date / heure]
Départ : [Date / heure]
--------------------------------
Désignation       Qté      Total
Chambre VIP        2     50 000
--------------------------------
Sous-total               50 000
Remise                    5 000
Taxes applicables         [X]
TOTAL À PAYER            [TOTAL]
Déjà réglé               [MONTANT]
RESTE DÛ                 [MONTANT]
Mode de paiement         Espèces
--------------------------------
Référence : [UUID court]
[Code QR facultatif]
      Merci de votre visite !
--------------------------------
```

**Tous les noms, montants et dates de la maquette sont illustratifs.** Ne pas afficher « PAYÉ » si le solde est non nul. Ne pas confondre reçu d'encaissement et facture fiscale : leur qualification dépend des règles applicables.

## 4. Données requises

### 4.1 En-tête
- Nom commercial, adresse, téléphone et mentions légales/fiscales **configurables**, après vérification locale.
- Identifiant stable de l'établissement et de la caisse.
- Type du document : facture, reçu de paiement, document provisoire, avoir/annulation selon les règles validées.
- Numéro de document, date/heure, opérateur et statut de synchronisation.

### 4.2 Client et séjour
- Identifiant client, nom et contact si nécessaire ; limiter les données personnelles imprimées.
- Numéro et type de chambre ; nombre de personnes.
- Dates/heures d'arrivée et de départ ; unité de facturation (journée, demi-journée) ; quantité.

### 4.3 Montants
- Lignes avec libellé, quantité, prix unitaire historique, total.
- Sous-total, remise (montant ou taux et justification), taxes uniquement si applicables, total dû.
- Montant payé, paiements antérieurs, solde restant, monnaie rendue le cas échéant.
- Devise configurée ; affichage cohérent des arrondis côté backend et frontend.

### 4.4 Traçabilité
- `invoice_id` UUID ; `payment_id` UUID ; `operation_id` UUID ; `device_id` ; `created_at`.
- Statut métier distinct du statut de synchronisation.
- Version du document, référence à l'original lors d'une correction, indicateur de réimpression.

## 5. Règles métier et de sécurité

1. Un prix de chambre utilisé dans une facture est conservé comme **instantané historique** ; modifier le tarif courant ne change pas les anciennes factures.
2. Toute remise requiert une permission et est enregistrée dans le journal d'audit.
3. Le montant payé ne doit pas dépasser les règles autorisées ; le total et le solde sont recalculés par une couche métier partagée et vérifiés par Laravel à la synchronisation.
4. Les opérations possèdent des UUID et des **clés d'idempotence** pour éviter un double enregistrement lors des tentatives répétées.
5. Une facture émise ne doit pas être écrasée silencieusement : prévoir annulation, avoir ou correction selon les obligations applicables.
6. La numérotation doit rester unique : réserver un préfixe de caisse (`LOC-01-...`) et une séquence persistante, ou utiliser un numéro provisoire jusqu'à l'attribution du numéro fiscal définitif. **Ne pas présumer qu'une numérotation locale satisfait aux obligations légales.**
7. Si une réservation distante entre en conflit avec une réservation locale pendant une coupure, conserver les preuves, signaler le conflit et demander résolution ; ne pas effacer le paiement.
8. Ne jamais stocker des données de carte bancaire sensibles dans IndexedDB.
9. Un paiement électronique dépendant d'une autorisation externe ne doit pas être annoncé comme confirmé hors ligne sans mécanisme officiel du prestataire.
10. L'impression est un effet secondaire : un échec d'impression n'annule pas l'encaissement ; la réimpression doit rester disponible.

## 6. Fonctionnement Offline-First

### 6.1 Enregistrement local

1. La caissière ouvre une réservation ou un séjour.
2. L'interface calcule un **aperçu** à partir des tarifs historisés et des règles connues localement.
3. Après confirmation, une transaction IndexedDB enregistre ensemble le document, le paiement associé et un événement `outbox` avec identifiant unique.
4. Le document devient consultable et imprimable localement avec un statut explicite (`local_pending_sync`).
5. La PWA réessaie la synchronisation lorsque l'application est ouverte et qu'une connexion utilisable est détectée ; un bouton manuel permet également de relancer. Ne pas dépendre exclusivement de Background Sync, dont le support navigateur varie.

### 6.2 Synchronisation

- `POST /api/sync/push` transmet les événements avec `operation_id`, `device_id`, version, horodatage et clé d'idempotence.
- Laravel vérifie l'authentification, les permissions, la cohérence des montants, les références, les contraintes métier et les doublons.
- Le serveur renvoie pour chaque événement `accepted`, `duplicate`, `rejected` ou `conflict`, avec une explication exploitable en français.
- `GET /api/sync/pull?cursor=...` fournit les changements serveur depuis un curseur confirmé.
- L'interface applique les changements reçus sans écraser un document local non résolu et conserve un journal des conflits.
- Le statut d'une facture ne passe à `synced` qu'après accusé de réception explicite.

**Attention :** IndexedDB peut être effacé par l'utilisateur ou le navigateur ; prévoir sauvegarde/export chiffré, procédure de reprise et information claire sur les opérations non synchronisées.

## 7. Modèle de données suggéré

### IndexedDB (Dexie)

- `invoices`: `id`, `local_number`, `server_number`, `reservation_id`, `client_snapshot`, `lines`, `totals`, `business_status`, `sync_status`, `created_at`, `updated_at`.
- `payments`: `id`, `invoice_id`, `amount`, `method`, `status`, `created_at`.
- `outbox`: `operation_id`, `entity_type`, `entity_id`, `action`, `payload`, `attempts`, `next_retry_at`, `status`.
- `sync_meta`: `device_id`, `pull_cursor`, `last_sync_at`.
- `print_jobs`: `id`, `invoice_id`, `printed_at`, `copies`, `result` (journal indicatif, non preuve matérielle absolue).

### MySQL cloud

- Tables métier normalisées `clients`, `room_types`, `rooms`, `reservations`, `stays`, `invoices`, `invoice_lines`, `payments`, `discounts` selon le MCD final.
- Tables techniques `sync_inbox`, `sync_conflicts`, `audit_logs`, `devices` et suivi des changements.
- Contraintes d'unicité sur `invoice_id`, `payment_id`, `(device_id, operation_id)` ; transactions SQL pour les écritures liées.

**Remarque :** les données structurées en snapshot dans IndexedDB servent au mode local ; la base MySQL cloud reste normalisée. Les règles de calcul doivent être versionnées pour éviter les divergences.

## 8. Architecture frontend React

```text
src/
  features/billing/
    components/ThermalReceipt.jsx
    components/ReceiptPreview.jsx
    components/PrintButton.jsx
    pages/InvoicesPage.jsx
    services/invoiceService.js
    styles/receipt-print.css
  offline/
    db.js
    outbox.js
    syncEngine.js
  shared/
    money.js
    dates.js
```

### Exemple minimal de composant

```jsx
export function ThermalReceipt({ invoice }) {
  return (
    <section id="thermal-receipt" className="thermal-receipt">
      <header className="receipt-center">
        <strong>JB HÔTEL</strong>
        <p>Reçu n° {invoice.localNumber}</p>
      </header>
      <p>Client : {invoice.clientName}</p>
      <p>Chambre : {invoice.roomLabel}</p>
      <hr />
      {invoice.lines.map((line) => (
        <div className="receipt-row" key={line.id}>
          <span>{line.label} × {line.quantity}</span>
          <span>{line.formattedTotal}</span>
        </div>
      ))}
      <hr />
      <div className="receipt-row receipt-total">
        <span>Total</span><span>{invoice.formattedTotal}</span>
      </div>
      <p>Synchronisation : {invoice.syncStatus}</p>
    </section>
  );
}
```

**Sécurité d'affichage :** utiliser le rendu texte React, sans injection HTML non contrôlée. Les montants formatés doivent provenir de valeurs calculées et vérifiées.

## 9. CSS d'impression thermique

```css
.thermal-receipt {
  width: 72mm; /* largeur utile indicative, à calibrer */
  max-width: 100%;
  margin: 0 auto;
  padding: 2mm;
  box-sizing: border-box;
  background: white;
  color: black;
  font: 11px/1.35 Arial, sans-serif;
}
.receipt-center { text-align: center; }
.receipt-row { display: flex; justify-content: space-between; gap: 3mm; }
.receipt-total { font-weight: 700; font-size: 13px; }
.thermal-receipt hr { border: 0; border-top: 1px dashed #000; }
@media print {
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; }
  body * { visibility: hidden; }
  #thermal-receipt, #thermal-receipt * { visibility: visible; }
  #thermal-receipt { position: absolute; top: 0; left: 0; width: 72mm; }
}
```

**Compatibilité :** `@page { size: 80mm auto; }` et les marges peuvent être interprétés différemment selon le navigateur et le pilote. Tester le format réel avec une imprimante thermique 80 mm ; si nécessaire configurer un format personnalisé dans le pilote. L'impression depuis le navigateur utilise `window.print()` et peut afficher une boîte de dialogue. L'impression silencieuse ou le découpage automatique exige généralement un pilote, un logiciel local ou une intégration spécifique à l'imprimante.

## 10. Interface de caisse et impression

- Bouton **Aperçu du ticket** avant validation, avec distinction entre aperçu et document émis.
- Bouton **Valider l'encaissement** : confirmation explicite, stockage local atomique, puis mise en file de synchronisation.
- Bouton **Imprimer 80 mm** : `window.print()` après rendu du ticket.
- Bouton **Réimprimer** depuis l'historique ; ne crée ni nouveau paiement ni nouvelle facture.
- État visible : **Enregistré localement**, **Synchronisation en attente**, **Synchronisé**, **Conflit à traiter**.
- Modales d'erreur en français ; pas de suppression de l'opération en cas d'échec d'impression.
- Les informations de connexion ne doivent pas être présentées comme une garantie de synchronisation ; utiliser l'accusé du serveur.

## 11. Exigences de qualité

- Interface claire, lisible sur écran et sur papier monochrome.
- Montants alignés à droite ; libellés tronqués ou répartis proprement sur plusieurs lignes.
- Pas de coupure de montant ni de chevauchement ; caractères accentués testés sur l'imprimante cible.
- Impression sur une seule bande continue, avec hauteur variable.
- Formatage des nombres et des dates adapté à la configuration de l'hôtel.
- Accessibilité clavier pour la validation et la réimpression.
- Journalisation de la création, de l'impression et de la synchronisation.

## 12. Scénarios de recette

1. **Hors ligne** : créer client, séjour, encaissement en espèces et ticket ; fermer puis rouvrir la PWA et retrouver le document.
2. **Reconnexion** : synchroniser une fois ; répéter l'envoi et vérifier qu'aucun paiement n'est dupliqué.
3. **Échec serveur** : conserver l'opération locale, afficher l'erreur et réessayer ultérieurement.
4. **Conflit de chambre** : détecter une réservation concurrente distante et suspendre la confirmation globale.
5. **Prix historique** : changer le tarif courant et vérifier qu'une ancienne facture ne change pas.
6. **Paiement partiel** : afficher le solde restant ; ne pas afficher « intégralement payé ».
7. **Imprimante indisponible** : conserver le document et permettre une réimpression sans réencaissement.
8. **58 mm accidentel** : vérifier que l'application avertit ou que le format d'impression peut être corrigé.
9. **Données sensibles** : vérifier qu'aucune information bancaire sensible n'est imprimée ni stockée localement.
10. **Effacement navigateur** : tester la procédure de restauration et documenter les limites pour les opérations jamais synchronisées.

## 13. Critères d'acceptation

- [ ] La facture thermique 80 mm est lisible sur l'imprimante cible.
- [ ] Les montants, remises, taxes et soldes sont exacts et traçables.
- [ ] Les tickets peuvent être imprimés sans Internet après installation de la PWA.
- [ ] Les documents locaux persistent après redémarrage normal du navigateur.
- [ ] La synchronisation reprend et ne duplique pas les paiements.
- [ ] Les conflits sont signalés sans perte silencieuse de données.
- [ ] La réimpression ne crée aucune transaction supplémentaire.
- [ ] Les mentions fiscales et la numérotation sont validées pour le pays d'exploitation.
- [ ] La restauration après incident est testée.

## 14. Décisions restant à confirmer

1. Modèle exact de l'imprimante thermique (pilote, USB/Bluetooth/réseau, découpe automatique).
2. Pays d'exploitation et mentions fiscales obligatoires ; statut juridique du ticket.
3. Modes de paiement réellement acceptés et prise en charge éventuelle des paiements partiels.
4. Politique de numérotation locale définitive ou provisoire et traitement des conflits.
5. Format exact des coordonnées, du logo et du pied de ticket.

---

**Livrable attendu :** un module React de facturation thermique 80 mm intégré à la caisse JB Hôtel, utilisable hors ligne via IndexedDB, synchronisé avec Laravel/MySQL cloud et testé sur le matériel réel.
