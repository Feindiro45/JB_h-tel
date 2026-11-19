/**
 * Normalisation des erreurs pour l'utilisateur.
 *
 * Toute erreur affichée doit être en français, sans trace technique, et se présenter
 * dans la modale accessible (voir `shared/ui/ErrorDialog`). Le backend renvoie
 * `{ title, message, errors? }` ; à défaut, on utilise les messages ci-dessous.
 */

export type FieldErrors = Record<string, string[]>

/** Statut 0 : erreur réseau (aucune réponse du serveur). */
export const NETWORK_ERROR_STATUS = 0
/** Statut -1 : erreur côté client, hors appel API. */
export const CLIENT_ERROR_STATUS = -1

export const NETWORK_ERROR_TITLE = 'Connexion impossible'
export const NETWORK_ERROR_MESSAGE = 'Connexion impossible. Vérifiez votre connexion et réessayez.'

interface UserMessage {
  title: string
  message: string
}

const MESSAGES_BY_STATUS: Record<number, UserMessage> = {
  401: {
    title: 'Session expirée',
    message:
      "Votre session a expiré ou vous n'êtes pas connecté. Veuillez vous reconnecter pour continuer.",
  },
  403: {
    title: 'Accès refusé',
    message: "Vous n'avez pas l'autorisation d'effectuer cette opération.",
  },
  404: {
    title: 'Élément introuvable',
    message: "L'élément demandé est introuvable. Il a peut-être été supprimé ou n'existe pas.",
  },
  409: {
    title: 'Opération impossible',
    message:
      "La chambre n'est pas disponible sur cette période ou les données ont été modifiées entre-temps. Actualisez puis réessayez.",
  },
  419: {
    title: 'Session expirée',
    message: 'Votre session a expiré. Rechargez la page puis réessayez.',
  },
  422: {
    title: 'Données invalides',
    message:
      'Certaines informations sont incorrectes ou incomplètes. Corrigez les champs signalés puis réessayez.',
  },
  429: {
    title: 'Trop de demandes',
    message:
      'Vous avez effectué trop de demandes en peu de temps. Patientez quelques instants puis réessayez.',
  },
  500: {
    title: 'Incident technique',
    message:
      "Une erreur inattendue est survenue. Réessayez dans quelques instants ; si le problème persiste, contactez l'administrateur.",
  },
  503: {
    title: 'Service indisponible',
    message: 'Le service est temporairement indisponible. Réessayez dans quelques instants.',
  },
}

const GENERIC_CLIENT_ERROR: UserMessage = {
  title: 'Demande refusée',
  message: "La demande n'a pas pu être traitée. Vérifiez les informations saisies puis réessayez.",
}

const UNEXPECTED_ERROR: UserMessage = {
  title: 'Erreur inattendue',
  message:
    "Une erreur inattendue est survenue. Réessayez ; si le problème persiste, contactez l'administrateur.",
}

export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly fieldErrors: FieldErrors
  /** Code métier stable renvoyé par le backend (ex. `room_unavailable`), si présent. */
  readonly code: string | null
  /** Aides à la correction renvoyées par le backend (conflits, supplément proposé…). */
  readonly details: string[]

  constructor(
    status: number,
    title: string,
    message: string,
    fieldErrors: FieldErrors = {},
    code: string | null = null,
    details: string[] = [],
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.fieldErrors = fieldErrors
    this.code = code
    this.details = details
  }

  get isNetworkError(): boolean {
    return this.status === NETWORK_ERROR_STATUS
  }

  /** Messages de champ aplatis, pour le résumé affiché dans la modale. */
  get fieldMessages(): string[] {
    return Object.values(this.fieldErrors).flat()
  }

  /** Tout ce qui aide l'utilisateur à corriger : champs invalides puis détails métier. */
  get helpMessages(): string[] {
    return [...this.fieldMessages, ...this.details]
  }
}

export function defaultMessageFor(status: number): UserMessage {
  const known = MESSAGES_BY_STATUS[status]
  if (known) return known
  if (status >= 500) return MESSAGES_BY_STATUS[500]
  return GENERIC_CLIENT_ERROR
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function parseFieldErrors(value: unknown): FieldErrors {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const result: FieldErrors = {}
  for (const [field, messages] of Object.entries(value)) {
    if (Array.isArray(messages)) {
      const strings = messages.filter(isNonEmptyString)
      if (strings.length > 0) result[field] = strings
    } else if (isNonEmptyString(messages)) {
      result[field] = [messages]
    }
  }
  return result
}

/**
 * Construit l'erreur à partir d'une réponse HTTP en échec.
 * Les 5xx utilisent toujours le message générique : un détail serveur ne doit jamais fuiter.
 */
export function errorFromResponse(status: number, payload: unknown): ApiError {
  const fallback = defaultMessageFor(status)
  const body =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}
  const trustBody = status < 500
  const title = trustBody && isNonEmptyString(body.title) ? body.title : fallback.title
  const message = trustBody && isNonEmptyString(body.message) ? body.message : fallback.message
  if (!trustBody) return new ApiError(status, title, message)

  const code = isNonEmptyString(body.code) ? body.code : null
  const details = Array.isArray(body.details) ? body.details.filter(isNonEmptyString) : []
  return new ApiError(status, title, message, parseFieldErrors(body.errors), code, details)
}

export function networkError(): ApiError {
  return new ApiError(NETWORK_ERROR_STATUS, NETWORK_ERROR_TITLE, NETWORK_ERROR_MESSAGE)
}

/** Convertit n'importe quelle valeur levée en erreur présentable à l'utilisateur. */
export function toUserError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError(CLIENT_ERROR_STATUS, UNEXPECTED_ERROR.title, UNEXPECTED_ERROR.message)
}
