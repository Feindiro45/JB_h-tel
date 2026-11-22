import React, { useRef } from 'react';
import './thermal-receipt.css';

const money = (value, currency = 'XAF') => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency, maximumFractionDigits: 0
}).format(Number(value ?? 0));

export default function ThermalReceipt({ invoice, hotel }) {
  const receiptRef = useRef(null);
  if (!invoice || !hotel) return null;
  const print = () => window.print();
  return (
    <section className="receipt-shell">
      <div className="receipt-actions"><button type="button" onClick={print}>Imprimer le ticket</button></div>
      <article ref={receiptRef} className="thermal-receipt" aria-label="Ticket de facture">
        <header className="receipt-center">
          <h1>{hotel.name}</h1>
          {hotel.address && <p>{hotel.address}</p>}
          {hotel.phone && <p>Tél. : {hotel.phone}</p>}
          {hotel.legalId && <p>{hotel.legalId}</p>}
          <h2>FACTURE / REÇU</h2>
        </header>
        <div className="receipt-rule" />
        <p>N° : {invoice.number}</p>
        <p>Date : {invoice.issuedAtLabel}</p>
        <p>Caissier(ère) : {invoice.cashierName}</p>
        <div className="receipt-rule" />
        <p>Client : {invoice.clientName}</p>
        <p>Chambre : {invoice.roomNumber} ({invoice.roomType})</p>
        <p>Personnes : {invoice.guests}</p>
        <p>Arrivée : {invoice.checkInLabel}</p>
        <p>Départ : {invoice.checkOutLabel}</p>
        <div className="receipt-rule" />
        <table><thead><tr><th>Prestation</th><th>Qté</th><th>Montant</th></tr></thead>
          <tbody>{invoice.items.map((item) => <tr key={item.id}><td>{item.label}<small>{money(item.unitPrice, invoice.currency)} / unité</small></td><td>{item.quantity}</td><td>{money(item.total, invoice.currency)}</td></tr>)}</tbody>
        </table>
        <div className="receipt-rule" />
        <div className="receipt-pair"><span>Sous-total</span><span>{money(invoice.subtotal, invoice.currency)}</span></div>
        <div className="receipt-pair"><span>Remise</span><span>- {money(invoice.discount, invoice.currency)}</span></div>
        <div className="receipt-pair"><span>Taxes</span><span>{money(invoice.tax, invoice.currency)}</span></div>
        <div className="receipt-pair receipt-total"><strong>TOTAL</strong><strong>{money(invoice.total, invoice.currency)}</strong></div>
        <div className="receipt-pair"><span>Encaissé</span><span>{money(invoice.paid, invoice.currency)}</span></div>
        <div className="receipt-pair"><span>Reste dû</span><span>{money(invoice.balance, invoice.currency)}</span></div>
        <p>Mode : {invoice.paymentMethod}</p>
        <p>Statut : {invoice.paymentStatus}</p>
        <div className="receipt-rule" />
        <footer className="receipt-center"><p>Référence : {invoice.number}</p><p>Merci de votre visite !</p></footer>
      </article>
    </section>
  );
}
