import { createWorker, type Worker } from 'tesseract.js'
import { supabase } from './supabase'

export type OcrSource = 'tesseract' | 'groq'

export interface OcrResult {
  text: string | null
  source: OcrSource | null
}

// Worker Tesseract réutilisé entre deux scans (son initialisation, ~1-2s,
// ne vaut la peine d'être payée qu'une fois par session).
let tesseractWorker: Promise<Worker> | null = null
function getTesseractWorker() {
  if (!tesseractWorker) tesseractWorker = createWorker('eng')
  return tesseractWorker
}

const MIN_CONFIDENCE = 65
const MIN_LENGTH = 4
const MAX_LENGTH = 40

// Un numéro de série ressemble à une suite de lettres/chiffres (avec éventuel
// tiret ou point) : si Tesseract renvoie moins que ça, ou avec peu de
// confiance, sa lecture est probablement "déconnante" sur du métal gravé.
function isPlausible(rawText: string, confidence: number): string | null {
  const cleaned = rawText.replace(/\s+/g, '').toUpperCase()
  if (confidence < MIN_CONFIDENCE) return null
  if (cleaned.length < MIN_LENGTH || cleaned.length > MAX_LENGTH) return null
  const alnum = cleaned.replace(/[^A-Z0-9]/g, '')
  if (alnum.length / cleaned.length < 0.8) return null
  return cleaned
}

async function tryTesseract(file: File): Promise<string | null> {
  const worker = await getTesseractWorker()
  const {
    data: { text, confidence },
  } = await worker.recognize(file)
  return isPlausible(text, confidence)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function tryGroq(file: File): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Connexion admin requise pour utiliser le scan.')

  const imageBase64 = await fileToBase64(file)

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-serial`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64, mimeType: file.type || 'image/jpeg' }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Erreur de lecture (${res.status})`)
  }

  const { text } = (await res.json()) as { text: string | null }
  return text
}

// Tente d'abord une lecture locale gratuite (Tesseract, fonctionne hors-ligne).
// Si le résultat est peu fiable (confiance trop basse, texte incohérent —
// fréquent sur du métal gravé), on ne consomme le quota Groq qu'à ce moment-là.
export async function readSerialFromPhoto(file: File): Promise<OcrResult> {
  const local = await tryTesseract(file).catch(() => null)
  if (local) return { text: local, source: 'tesseract' }

  try {
    const remote = await tryGroq(file)
    return { text: remote, source: remote ? 'groq' : null }
  } catch (err) {
    if (!navigator.onLine) {
      throw new Error(
        'Lecture locale peu fiable et pas de réseau pour la vérification Groq — saisissez le numéro à la main.',
      )
    }
    throw err
  }
}
