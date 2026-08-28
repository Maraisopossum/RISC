export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return

  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const s = value === null || value === undefined ? '' : String(value)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = [
    headers.join(';'),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(';')),
  ]

  // BOM pour qu'Excel ouvre correctement les accents en UTF-8
  const blob = new Blob(['﻿' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })

  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
