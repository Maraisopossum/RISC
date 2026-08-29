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
  rope_color: string | null
  rope_rotation: string | null
  remarks: string | null
  legacy_notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ItemWithAlerts extends Item {
  last_inspection_on: string | null
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
  role: 'admin' | 'lecture'
}
