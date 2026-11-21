import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Envelope, Room, RoomType } from '../../shared/api/types'
import { registerOfflineEssential } from '../../shared/offline/essentials'

export const roomsQuery = queryOptions({
  queryKey: ['catalog', 'rooms'],
  queryFn: async ({ signal }) =>
    (await api.get<Envelope<Room[]>>('/api/v1/rooms', { signal })).data,
  staleTime: 60_000,
})

export const roomTypesQuery = queryOptions({
  queryKey: ['catalog', 'room-types'],
  queryFn: async ({ signal }) =>
    (await api.get<Envelope<RoomType[]>>('/api/v1/room-types', { signal })).data,
  staleTime: 5 * 60_000,
})

// Gardés pour le travail sans réseau (lot 2).
registerOfflineEssential('rooms.view', () => roomsQuery)
registerOfflineEssential('rooms.view', () => roomTypesQuery)
