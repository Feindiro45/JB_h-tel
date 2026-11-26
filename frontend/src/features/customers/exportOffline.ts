import type { QueryClient } from '@tanstack/react-query'
import type { Customer } from '../../shared/api/types'
import { groupRows, monthlyRows, type LocalWorkbookSpec } from '../../shared/export/localWorkbook'
import { keptCustomers } from './api'

export interface CustomerExportFilters {
  search?: string
  email?: string
  origin_city?: string
  origin_country?: string
}

const normalize = (text: string | null | undefined) =>
  (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const origin = (value: string | null) => (value?.trim() ? value.trim() : 'Non renseigné')

/** Classeur simplifié des clients gardés sur le poste (export sans réseau). */
export function customersOfflineWorkbook(
  client: QueryClient,
  filters: CustomerExportFilters,
): LocalWorkbookSpec {
  const has = (value: string | null | undefined, needle?: string) =>
    !needle || normalize(value).includes(normalize(needle))
  const customers = keptCustomers(client)
    .filter((c) => has(`${c.full_name} ${c.phone ?? ''}`, filters.search))
    .filter((c) => has(c.email, filters.email))
    .filter((c) => has(c.origin_city, filters.origin_city))
    .filter((c) => has(c.origin_country, filters.origin_country))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'))
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const count = (test: (c: Customer) => boolean) => customers.filter(test).length

  return {
    title: 'Clients',
    module: 'clients',
    context: [
      filters.search && `Recherche : ${filters.search}`,
      filters.email && `E-mail : ${filters.email}`,
      filters.origin_city && `Ville : ${filters.origin_city}`,
      filters.origin_country && `Pays : ${filters.origin_country}`,
    ].filter(Boolean) as string[],
    kpis: [
      { label: 'Clients', value: customers.length, format: 'int', hint: 'Gardés sur ce poste' },
      {
        label: 'Nouveaux ce mois-ci',
        value: count((c) => !!c.created_at && new Date(c.created_at) >= monthStart),
        format: 'int',
        hint: 'Fiches créées depuis le 1er',
      },
      {
        label: 'Joignables par e-mail',
        value: count((c) => !!c.email && c.email_notifications),
        format: 'int',
        hint: 'E-mail renseigné, envois acceptés',
      },
      {
        label: 'Avec téléphone',
        value: count((c) => !!c.phone),
        format: 'int',
        hint: 'Numéro renseigné',
      },
    ],
    summaries: [
      {
        heading: 'Clients par pays d’origine',
        valueLabel: 'Clients',
        rows: groupRows(customers, (c) => origin(c.origin_country)).slice(0, 8),
      },
      {
        heading: 'Villes d’origine les plus fréquentes',
        valueLabel: 'Clients',
        rows: groupRows(customers, (c) => origin(c.origin_city)).slice(0, 10),
      },
      {
        heading: 'Nouveaux clients par mois',
        valueLabel: 'Clients',
        rows: monthlyRows(customers, (c) => c.created_at),
      },
    ],
    note: 'Données personnelles : conservez ce fichier en lieu sûr et ne le diffusez pas en dehors de l’hôtel.',
    sheets: [
      {
        name: 'Clients',
        description: 'Une fiche par ligne ; filtres automatiques',
        columns: [
          { label: 'Nom', width: 20 },
          { label: 'Prénoms', width: 22 },
          { label: 'Téléphone', width: 16 },
          { label: 'E-mail', width: 28 },
          { label: 'E-mails acceptés', width: 12 },
          { label: 'Ville d’origine', width: 18 },
          { label: 'Pays d’origine', width: 18 },
          { label: 'Adresse', width: 28 },
          { label: 'Pièce d’identité', width: 16 },
          { label: 'Numéro de la pièce', width: 18 },
          { label: 'Notes', width: 30 },
          { label: 'Créé le', type: 'datetime' },
        ],
        rows: customers.map((c) => [
          c.name,
          c.first_name,
          c.phone,
          c.email,
          c.email ? (c.email_notifications ? 'Oui' : 'Non') : null,
          c.origin_city,
          c.origin_country,
          c.address,
          c.identification_type,
          c.identification_number,
          c.notes,
          c.created_at,
        ]),
      },
    ],
  }
}
