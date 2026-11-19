import { queryOptions } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import type { Envelope, Room, RoomType } from '../../shared/api/types'

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
