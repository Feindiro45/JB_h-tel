import React from 'react';
import ThermalReceipt from './components/ThermalReceipt';

// Données fictives pour la démonstration. En production : charger la facture validée via l'API Laravel.
const hotel = { name: 'JB HÔTEL', address: 'Adresse à configurer', phone: 'Téléphone à configurer' };
const invoice = {
  number: 'FAC-2026-000125', issuedAtLabel: '21/11/2026 13:42', cashierName: 'Caissière démo',
  clientName: 'Jean Dupont', roomNumber: '105', roomType: 'VIP', guests: 2,
  checkInLabel: '21/11/2026 14:00', checkOutLabel: '23/11/2026 12:00', currency: 'XAF',
  items: [{ id: '1', label: 'Chambre VIP - journée', quantity: 2, unitPrice: 25000, total: 50000 }],
  subtotal: 50000, discount: 5000, tax: 0, total: 45000, paid: 45000,
  balance: 0, paymentMethod: 'Espèces', paymentStatus: 'PAYÉ'
};
export default function App() { return <ThermalReceipt hotel={hotel} invoice={invoice} />; }
