import { supabase } from './supabase'
import { fetchAllRows } from './fetchAll'
import { ITEM_STATUSES, INSPECTION_RESULTS, inspectionResultLabel } from './types'

interface YearInspectionRow {
  id: number
  inspected_on: string
  result: string | null
  notes: string | null
  validated_on: string | null
  items: {
    id: number
    type: string
    brand: string | null
    model: string | null
    color: string | null
    manufacturer_serial: string | null
    manufacture_date: string | null
    manufacture_date_unknown: boolean
    status: string
  }
}

function yearBounds(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

// Exporte en Excel tous les contrôles SECT d'une année civile, pour les faire
// valider par l'organisme de contrôle. Retourne le nombre de contrôles exportés.
export async function exportYearControls(year: number): Promise<number> {
  const { from, to } = yearBounds(year)
  const rows = await fetchAllRows<YearInspectionRow>(() =>
    supabase
      .from('inspections')
      .select(
        'id, inspected_on, result, notes, validated_on, items!inner(id, type, brand, model, color, manufacturer_serial, manufacture_date, manufacture_date_unknown, status)',
      )
      .gte('inspected_on', from)
      .lte('inspected_on', to)
      .order('inspected_on', { ascending: true })
      .order('id', { ascending: true }),
  )
  if (rows.length === 0) return 0

  const detail = rows.map((r) => ({
    'ID RISC': r.items.id,
    Type: r.items.type,
    Marque: r.items.brand ?? '',
    Modèle: r.items.model ?? '',
    Coloris: r.items.color ?? '',
    'N° fabricant': r.items.manufacturer_serial ?? '',
    'Date de fabrication': r.items.manufacture_date_unknown ? 'inconnue' : (r.items.manufacture_date ?? ''),
    Statut: ITEM_STATUSES.find((s) => s.value === r.items.status)?.label ?? r.items.status,
    'Date du contrôle': r.inspected_on,
    Résultat: inspectionResultLabel(r.result),
    Notes: r.notes ?? '',
    'Validé par l\'organisme le': r.validated_on ?? '',
  }))

  const count = (pred: (r: YearInspectionRow) => boolean) => rows.filter(pred).length
  const summary: (string | number)[][] = [
    [`Contrôles SECT ${year}`],
    [],
    ['Nombre de contrôles', rows.length],
    ...INSPECTION_RESULTS.map((res) => [res.label, count((r) => r.result === res.value)]),
    ['Autres résultats (anciennes valeurs)', count((r) => !INSPECTION_RESULTS.some((x) => x.value === r.result))],
    ['Déjà validés par l\'organisme', count((r) => r.validated_on !== null)],
  ]

  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const sheet = XLSX.utils.json_to_sheet(detail)
  sheet['!cols'] = [8, 14, 16, 26, 14, 18, 18, 12, 16, 14, 40, 22].map((wch) => ({ wch }))
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1' }
  XLSX.utils.book_append_sheet(wb, sheet, `Contrôles ${year}`)

  const summarySheet = XLSX.utils.aoa_to_sheet(summary)
  summarySheet['!cols'] = [{ wch: 40 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Résumé')

  XLSX.writeFile(wb, `controles-sect-risc-${year}.xlsx`)
  return rows.length
}

// Marque comme validés (à la date du jour) tous les contrôles de l'année qui
// ne le sont pas encore. Retourne le nombre de contrôles mis à jour.
export async function markYearValidated(year: number, validatedOn: string): Promise<number> {
  const { from, to } = yearBounds(year)
  const { error, count } = await supabase
    .from('inspections')
    .update({ validated_on: validatedOn }, { count: 'exact' })
    .gte('inspected_on', from)
    .lte('inspected_on', to)
    .is('validated_on', null)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function countYearUnvalidated(year: number): Promise<number> {
  const { from, to } = yearBounds(year)
  const { count, error } = await supabase
    .from('inspections')
    .select('id', { count: 'exact', head: true })
    .gte('inspected_on', from)
    .lte('inspected_on', to)
    .is('validated_on', null)
  if (error) throw new Error(error.message)
  return count ?? 0
}
