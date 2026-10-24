export const ITEM_TYPES = [
  'Harnais',
  'Longe',
  'Frein',
  'Mousqueton',
  'Poulie',
  'Bloqueur',
  'Corde',
  'Sangle',
  'Plaque',
  'Civiere',
  'Swivel',
  'Autre',
] as const

export type ItemType = (typeof ITEM_TYPES)[number]

export const ITEM_STATUSES = [
  { value: 'stock', label: 'En stock' },
  { value: 'en_service', label: 'En service' },
  { value: 'declasse', label: 'Déclassé' },
  { value: 'disparu', label: 'Disparu' },
] as const

export type ItemStatus = (typeof ITEM_STATUSES)[number]['value']

export interface Item {
  id: number
  type: string
  is_textile: boolean | null
  brand: string | null
  model: string | null
  textile_length_m: number | null
  specifics: string | null
  manufacturer_serial: string | null
  manufacture_date: string | null
  manufacture_date_unknown: boolean
  decommission_date: string | null
  status: ItemStatus
  color: string | null
  rope_rotation: string | null
  remarks: string | null
  legacy_notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export const INSPECTION_RESULTS = [
  { value: 'OK', label: 'OK' },
  { value: 'A_REPARER', label: 'À réparer' },
  { value: 'A_DETRUIRE', label: 'À détruire' },
] as const

// Les anciens résultats (ex: "NON CONFORME") restent affichés tels quels.
export function inspectionResultLabel(result: string | null | undefined): string {
  if (!result) return '—'
  return INSPECTION_RESULTS.find((r) => r.value === result)?.label ?? result
}

export function inspectionResultClass(result: string | null | undefined): string {
  if (result === 'OK') return 'bg-green-100 text-green-800'
  if (result === 'A_REPARER') return 'bg-amber-100 text-amber-800'
  if (result === 'A_DETRUIRE') return 'bg-red-100 text-red-800'
  return 'bg-slate-100 text-slate-600'
}

export function todayLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface ItemWithAlerts extends Item {
  last_inspection_on: string | null
  last_inspection_result: string | null
  alert_age: boolean
  alert_control: boolean
}

export interface Inspection {
  id: number
  item_id: number
  inspected_on: string
  result: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type Profile = {
  id: string
  email: string | null
  role: 'admin' | 'controleur' | 'lecture'
}
