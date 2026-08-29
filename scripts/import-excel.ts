// Script d'import unique : migre le fichier Excel existant vers Supabase.
// Usage : npm run import -- "chemin/vers/Inventaire RISC.xlsx"
//
// Nécessite SUPABASE_SERVICE_ROLE_KEY dans .env.local (jamais commit, jamais
// utilisé côté frontend : cette clé contourne les règles de sécurité RLS).

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })
import xlsx from 'xlsx'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'VITE_SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local',
  )
  process.exit(1)
}

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage : npm run import -- "chemin/vers/fichier.xlsx"')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Normalise la casse des types (le fichier mélange "Corde"/"corde" etc.)
const TYPE_MAP: Record<string, string> = {
  poulie: 'Poulie',
  plaque: 'Plaque',
  bloqueur: 'Bloqueur',
  mousqueton: 'Mousqueton',
  sangle: 'Sangle',
  frein: 'Frein',
  longe: 'Longe',
  harnais: 'Harnais',
  autre: 'Autre',
  corde: 'Corde',
  civiere: 'Civiere',
  swivel: 'Swivel',
}

function normalizeType(raw: unknown): string {
  const key = String(raw ?? '').trim().toLowerCase()
  return TYPE_MAP[key] ?? String(raw ?? '').trim() ?? 'Autre'
}

// Dates aberrantes connues (bug de saisie Excel -> ~1900/1905) : on les marque
// "inconnue" plutôt que de fausser le calcul d'âge/alerte.
// Les dates Excel très anciennes arrivent parfois avec une imprécision de
// quelques minutes (bug d'arrondi connu de SheetJS sur les numéros de série
// anciens) : on arrondit au jour UTC le plus proche pour ne pas se tromper
// de jour au moment de tronquer en "YYYY-MM-DD".
function toIsoDate(date: Date): string {
  const rounded = new Date(Math.round(date.getTime() / 86_400_000) * 86_400_000)
  return rounded.toISOString().slice(0, 10)
}

function parseManufactureDate(raw: unknown): { date: string | null; unknown: boolean } {
  if (!(raw instanceof Date) || isNaN(raw.getTime())) return { date: null, unknown: false }
  if (raw.getUTCFullYear() < 1980) return { date: null, unknown: true }
  return { date: toIsoDate(raw), unknown: false }
}

function parseDate(raw: unknown): string | null {
  if (!(raw instanceof Date) || isNaN(raw.getTime())) return null
  return toIsoDate(raw)
}

interface RawRow {
  [key: string]: unknown
}

type ItemInsert = {
  id?: number
  type: string
  brand: string | null
  model: string | null
  textile_length_m: number | null
  specifics: string | null
  manufacturer_serial: string | null
  manufacture_date: string | null
  manufacture_date_unknown: boolean
  decommission_date: string | null
  status: 'stock' | 'en_service' | 'declasse'
  remarks: string | null
  legacy_notes: string | null
}

// Colonnes communes aux feuilles Inventaire / Stock / Déclassé-Disparu :
// ID RISC, Type, Textile?, Marque, Modèle, Longueur textile, Remarques & spécificité,
// N° fabriquant, Date fabrication, Date sortie service, Contrôle x3, Remarques, Alerte
function rowToItem(row: RawRow, status: ItemInsert['status'], legacyId?: number): ItemInsert {
  const mfg = parseManufactureDate(row['Date de fabrication'])
  return {
    id: legacyId, // conserve l'ID RISC physique déjà gravé/étiqueté sur le matériel
    type: normalizeType(row['Type']),
    brand: (row['Marque'] as string) || null,
    model: (row['Modèle'] as string) || null,
    textile_length_m: typeof row['Longueur textile (m)'] === 'number' ? (row['Longueur textile (m)'] as number) : null,
    specifics: (row['Remarques & spécificité'] as string) || null,
    manufacturer_serial: (row['N° fabriquant'] as string) || null,
    manufacture_date: mfg.date,
    manufacture_date_unknown: mfg.unknown,
    decommission_date: parseDate(row['Date sortie de service']),
    status,
    remarks: (row['Remarques'] as string) || null,
    legacy_notes: (row['Alerte'] as string) || null,
  }
}

// Abréviations de mois FR/EN/NL rencontrées dans le fichier ("janv/22", "Jul/25",
// "août/23 & août/24", "Aug/24"...), accents retirés.
const MONTH_MAP: Record<string, number> = {
  jan: 1, janv: 1,
  fev: 2, feb: 2,
  mar: 3, mars: 3,
  avr: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6,
  juil: 7, jul: 7,
  aou: 8, aug: 8,
  sep: 9, sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Extrait chaque "mois/année" mentionné dans une cellule texte (il peut y en
// avoir plusieurs, ex: "juil/23 & août/24" = 2 contrôles distincts).
function parseApproxDates(text: string): string[] {
  const dates: string[] = []

  const numericRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g
  let numMatch: RegExpExecArray | null
  const consumedRanges: [number, number][] = []
  while ((numMatch = numericRe.exec(text)) !== null) {
    const day = numMatch[1].padStart(2, '0')
    const month = numMatch[2].padStart(2, '0')
    dates.push(`${numMatch[3]}-${month}-${day}`)
    consumedRanges.push([numMatch.index, numMatch.index + numMatch[0].length])
  }

  const re = /([a-zA-Zéèûôâî]{3,7})[.\/]\s*['’]?\s*(\d{2,4})/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const overlaps = consumedRanges.some(([s, e]) => match!.index < e && match!.index + match![0].length > s)
    if (overlaps) continue
    const monthKey = stripAccents(match[1].toLowerCase()).slice(0, 5)
    const monthNum =
      MONTH_MAP[monthKey] ?? MONTH_MAP[monthKey.slice(0, 4)] ?? MONTH_MAP[monthKey.slice(0, 3)]
    if (!monthNum) continue
    let year = parseInt(match[2], 10)
    if (year < 100) year += 2000
    dates.push(`${year}-${String(monthNum).padStart(2, '0')}-01`)
  }
  return dates
}

// Reconstruit les contrôles SECT historiques à partir des colonnes annuelles
// (une ligne "inspections" par contrôle identifié dans le texte de la cellule).
function extractInspections(row: RawRow, itemId: number) {
  const columns = ['Contrôle SECT 2022 à 2024', 'Contrôle SECT 2025', 'Contrôle SECT 2026']

  const inspections: { item_id: number; inspected_on: string; result: string; notes: string | null }[] = []

  for (const col of columns) {
    const raw = row[col]
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      inspections.push({
        item_id: itemId,
        inspected_on: raw.toISOString().slice(0, 10),
        result: 'OK',
        notes: null,
      })
    } else if (typeof raw === 'string' && raw.trim()) {
      const parsed = parseApproxDates(raw)
      if (parsed.length === 0) {
        console.warn(`Item #${itemId} : texte de contrôle non reconnu dans "${col}" : "${raw}"`)
        continue
      }
      for (const inspected_on of parsed) {
        inspections.push({
          item_id: itemId,
          inspected_on,
          result: 'OK',
          notes: `Jour approximatif (1er du mois) — reprise du fichier Excel : "${raw.trim()}"`,
        })
      }
    }
  }

  return inspections
}

async function importSheet(
  workbook: xlsx.WorkBook,
  sheetName: string,
  status: ItemInsert['status'],
  // Stock : matériel neuf, pas encore d'ID RISC attribué -> laisser la BDD
  // générer un nouvel ID. Inventaire / Déclassé-Disparu : l'ID RISC existant
  // (déjà gravé/étiqueté sur le matériel physique) doit être conservé tel quel.
  useLegacyId: boolean,
) {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    console.warn(`Feuille "${sheetName}" introuvable, ignorée.`)
    return
  }

  const rows: RawRow[] = xlsx.utils.sheet_to_json(sheet, { raw: true, cellDates: true })
  console.log(`\n--- ${sheetName} : ${rows.length} lignes ---`)

  let imported = 0
  let skippedNoId = 0

  for (const row of rows) {
    const legacyIdRaw = row['ID RISC']
    const hasLegacyId = !(legacyIdRaw === undefined || legacyIdRaw === null || legacyIdRaw === '')

    if (useLegacyId && !hasLegacyId) {
      skippedNoId += 1
      continue
    }

    const item = rowToItem(row, status, useLegacyId ? Number(legacyIdRaw) : undefined)
    if (!useLegacyId) delete item.id

    const { data, error } = await supabase.from('items').insert(item).select('id').single()

    if (error) {
      console.error(`Erreur import ID legacy ${legacyIdRaw} :`, error.message)
      continue
    }

    imported += 1
    const newId = (data as { id: number }).id

    const inspections = extractInspections(row, newId)
    if (inspections.length > 0) {
      const { error: inspError } = await supabase.from('inspections').insert(inspections)
      if (inspError) {
        console.error(`Erreur import contrôles pour item #${newId} :`, inspError.message)
      }
    }
  }

  console.log(`Importés : ${imported} / lignes sans ID RISC ignorées : ${skippedNoId}`)
}

async function main() {
  console.log(`Lecture de ${filePath}...`)
  const workbook = xlsx.readFile(filePath, { cellDates: true })

  await importSheet(workbook, 'Stock', 'stock', false)
  await importSheet(workbook, 'Inventaire', 'en_service', true)
  await importSheet(workbook, 'Déclassé-Disparu', 'declasse', true)

  // Remet la séquence d'auto-incrémentation après le plus grand ID RISC importé,
  // pour que les prochains items créés depuis l'appli continuent la numérotation.
  const { data: maxRow } = await supabase
    .from('items')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single()

  if (maxRow) {
    const { error: seqError } = await supabase.rpc('set_items_id_seq', {
      new_value: (maxRow as { id: number }).id,
    })
    if (seqError) {
      console.warn(
        `\nImpossible de mettre à jour automatiquement la séquence d'ID (${seqError.message}).\n` +
          `Exécutez manuellement dans le SQL Editor Supabase :\n` +
          `  select setval('items_id_seq', (select max(id) from items));`,
      )
    }
  }

  console.log(
    '\nTerminé. Note : toutes les lignes de "Déclassé-Disparu" ont été importées ' +
      'avec le statut "declasse" (le fichier source ne distingue pas fiablement ' +
      'déclassé de disparu) — à corriger manuellement au cas par cas si besoin.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
