import { z } from 'zod'
import type { QueuedOperation } from './outbox'

const identifier = '[A-Za-z0-9-]+'
const routes: Record<QueuedOperation['kind'], { method: 'POST' | 'PUT'; path: RegExp }> = {
  'customer.create': { method: 'POST', path: /^\/api\/v1\/customers$/ },
  'reservation.create': { method: 'POST', path: /^\/api\/v1\/reservations$/ },
  'payment.record': {
    method: 'POST',
    path: new RegExp(`^/api/v1/reservations/${identifier}/payments$`),
  },
  'invoice.issue': {
    method: 'POST',
    path: new RegExp(`^/api/v1/reservations/${identifier}/invoices$`),
  },
  'reservation.confirm': {
    method: 'POST',
    path: new RegExp(`^/api/v1/reservations/${identifier}/confirm$`),
  },
  'reservation.check-in': {
    method: 'POST',
    path: new RegExp(`^/api/v1/reservations/${identifier}/check-in$`),
  },
  'reservation.check-out': {
    method: 'POST',
    path: new RegExp(`^/api/v1/reservations/${identifier}/check-out$`),
  },
  'reservation.cancel': {
    method: 'POST',
    path: new RegExp(`^/api/v1/reservations/${identifier}/cancel$`),
  },
  'reservation.extend': {
    method: 'POST',
    path: new RegExp(`^/api/v1/reservations/${identifier}/extension$`),
  },
  'reservation.modify': {
    method: 'POST',
    path: new RegExp(`^/api/v1/reservations/${identifier}/modification$`),
  },
  'reservation.occupants': {
    method: 'PUT',
    path: new RegExp(`^/api/v1/reservations/${identifier}/occupants$`),
  },
}

const text = z.string().max(1000)
const nullableText = text.nullable()
const operationSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9-]+$/),
    kind: z.enum(Object.keys(routes) as [QueuedOperation['kind'], ...QueuedOperation['kind'][]]),
    label: text.min(1),
    method: z.enum(['POST', 'PUT']),
    path: z.string().max(500),
    body: z.unknown().optional(),
    createdAt: z.number().int().nonnegative().max(8_640_000_000_000_000),
    userId: text.min(1),
    userName: text,
    status: z.enum(['pending', 'accepted', 'rejected', 'abandoned']),
    attempts: z.number().int().nonnegative(),
    lastAttemptAt: z.number().nonnegative().nullable(),
    error: z.object({ title: text, message: z.string().max(10000), code: nullableText }).nullable(),
    provisionalNumber: nullableText.refine((value) => value === null || /-\d{1,12}$/.test(value)),
    definitiveNumber: nullableText,
    localId: nullableText,
    abandonReason: z.string().max(10000).nullable(),
    resultId: nullableText.optional(),
    automaticInvoiceId: nullableText.optional(),
    localResult: z.unknown().optional(),
  })
  .superRefine((operation, context) => {
    const route = routes[operation.kind]
    if (route.method !== operation.method || !route.path.test(operation.path)) {
      context.addIssue({ code: 'custom', message: 'Opération ou adresse non autorisée.' })
    }
  })

/** Les sauvegardes sont des données non fiables, même après déchiffrement. */
export function validatedOperations(input: unknown): QueuedOperation[] {
  const result = z.array(operationSchema).max(10000).safeParse(input)
  if (!result.success)
    throw new Error(
      'Cette sauvegarde contient une opération invalide ou une adresse non autorisée.',
    )
  return result.data as QueuedOperation[]
}
