import { supabase } from './supabase'
import { fetchAllRows } from './fetchAll'

function stamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}h${pad(d.getMinutes())}`
}

// Sauvegarde complète (articles + historique des contrôles) dans un fichier
// Excel horodaté téléchargé sur le poste. Colonnes brutes, telles qu'en base :
// le fichier sert de copie de secours et peut être rouvert/filtré dans Excel.
export async function downloadBackup(): Promise<{ items: number; inspections: number; filename: string }> {
  const items = await fetchAllRows<Record<string, unknown>>(() =>
    supabase.from('items').select('*').order('id', { ascending: true }),
  )
  const inspections = await fetchAllRows<Record<string, unknown>>(() =>
    supabase.from('inspections').select('*').order('id', { ascending: true }),
  )

  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items), 'items')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inspections), 'inspections')

  const filename = `sauvegarde-risc-${stamp()}.xlsx`
  XLSX.writeFile(wb, filename)
  return { items: items.length, inspections: inspections.length, filename }
}
