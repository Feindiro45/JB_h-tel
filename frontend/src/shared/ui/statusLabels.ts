/** Libellés français des statuts de réservation (miroir de ReservationStatus côté serveur). */
export const RESERVATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
}

/** États calculés d'une chambre sur une période (jamais stockés). */
export const ROOM_STATE_LABELS: Record<string, string> = {
  FREE: 'Libre',
  RESERVED: 'Réservée',
  OCCUPIED: 'Occupée',
  MAINTENANCE: 'Maintenance',
}
