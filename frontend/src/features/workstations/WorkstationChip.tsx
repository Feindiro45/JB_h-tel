import { useWorkstationPresence } from './useWorkstationPresence'
import './workstations.css'

/**
 * Pastille de la barre du haut : nom du poste et rôle (principal, consultation, révoqué). Elle
 * enregistre le navigateur au premier affichage puis signale sa présence.
 */
export function WorkstationChip() {
  const { data } = useWorkstationPresence()
  if (!data) return null

  let role = ''
  let tone = 'neutral'
  if (data.revoked) {
    role = 'révoqué'
    tone = 'red'
  } else if (data.is_main) {
    role = 'principal'
    tone = 'green'
  } else if (data.enforce_main_post && data.main) {
    role = 'consultation'
    tone = 'amber'
  }

  const title = data.is_main
    ? 'Ce poste est le poste principal : réservations et encaissements autorisés.'
    : data.enforce_main_post && data.main
      ? `Réservations et encaissements réservés au poste principal « ${data.main.name} ».`
      : 'Poste de caisse enregistré.'

  return (
    <span className={`workstation-chip workstation-chip--${tone}`} title={title}>
      <span className="sr-only">Poste de caisse : </span>
      {data.name}
      {role && <span className="workstation-chip__role"> · {role}</span>}
    </span>
  )
}
