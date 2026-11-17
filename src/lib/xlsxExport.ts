// Télécharge des lignes (objets) sous forme de fichier Excel. La librairie
// xlsx est chargée à la demande pour ne pas alourdir le chargement de l'appli.
export async function downloadXlsx(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return

  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = Object.keys(rows[0])
  sheet['!cols'] = headers.map((h) => ({
    wch: Math.min(40, Math.max(h.length, ...rows.slice(0, 200).map((r) => String(r[h] ?? '').length)) + 2),
  }))
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1' }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, sheetName)
  XLSX.writeFile(wb, filename)
}
