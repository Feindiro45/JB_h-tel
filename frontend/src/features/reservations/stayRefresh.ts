import type { QueryClient } from '@tanstack/react-query'
import { CASH_KEYS, paymentsKey } from '../cashier'
import { invoicesKey } from '../invoices'
import { ALERTS_KEY } from './alerts'
import { reservationKeys } from './api'

/**
 * Données à relire après une opération sur un séjour (arrivée, départ, prolongation, annulation…) :
 * la fiche, son historique, sa caisse et ses factures, puis les listes, le planning, les chambres
 * libres, les alertes de départ et la caisse (D-053, D-056).
 */
export function refreshStay(queryClient: QueryClient, id: string): void {
  for (const key of [
    reservationKeys.detail(id),
    reservationKeys.history(id),
    paymentsKey(id),
    invoicesKey(id),
    ['reservations', 'list'],
    ['occupancy'],
    ['planning'],
    ['free-rooms'],
    ALERTS_KEY,
    ['invoices'],
    ...CASH_KEYS,
  ]) {
    void queryClient.invalidateQueries({ queryKey: key })
  }
}
