import { lazy, Suspense, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { readSerialFromPhoto, type OcrSource } from '../lib/ocr'
import { similarity } from '../lib/fuzzy'
import { parseItemIdFromScan } from '../lib/qr'
import { ITEM_STATUSES, type Item } from '../lib/types'
import RequireAdmin from '../components/RequireAdmin'

// html5-qrcode (~400 Ko) n'est chargé que si on ouvre vraiment le scanner,
// pas sur les autres pages de l'appli.
const CodeScanner = lazy(() => import('../components/CodeScanner'))

interface Match extends Item {
  score: number
}

type Mode = 'code' | 'photo'
type Source = OcrSource | 'code'

const MIN_SCORE = 0.4 // en dessous, la suggestion n'a plus de sens

export default function ScanLookup() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('code')
  const [scanning, setScanning] = useState(false)
  const [scannedText, setScannedText] = useState<string | null>(null)
  const [scanSource, setScanSource] = useState<Source | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [error, setError] = useState<string | null>(null)

  async function lookupSerial(text: string, source: Source) {
    setScannedText(text)
    setScanSource(source)

    const { data, error: dbError } = await supabase
      .from('items')
      .select('*')
      .not('manufacturer_serial', 'is', null)
    if (dbError) {
      setError(dbError.message)
      return
    }

    const scored = (data as Item[])
      .map((item) => ({ ...item, score: similarity(text, item.manufacturer_serial!) }))
      .filter((item) => item.score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)

    setMatches(scored)
  }

  function resetResult() {
    setError(null)
    setMatches([])
    setScannedText(null)
    setScanSource(null)
  }

  async function handleCodeResult(text: string) {
    resetResult()
    const ownItemId = parseItemIdFromScan(text)
    if (ownItemId) {
      navigate(`/materiel/${ownItemId}`)
      return
    }
    // Code fabricant (datamatrix, code-barres...) sans lien vers notre appli :
    // on le traite comme un numéro de série à rapprocher de l'existant.
    await lookupSerial(text, 'code')
  }

  async function handlePhotoScan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setScanning(true)
    resetResult()
    try {
      const { text, source } = await readSerialFromPhoto(file)
      if (!text) {
        setError("Aucun numéro n'a pu être lu sur cette photo. Réessayez avec une photo plus nette et cadrée sur le numéro.")
        return
      }
      await lookupSerial(text, source!)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de lecture.')
    } finally {
      setScanning(false)
    }
  }

  function handleCreateNew() {
    navigate('/materiel/nouveau', { state: { manufacturer_serial: scannedText } })
  }

  const sourceLabel: Record<Source, string> = {
    code: 'code-barres / QR',
    tesseract: 'lecture locale',
    groq: 'Groq',
  }

  return (
    <RequireAdmin>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Scanner un item</h1>
          <p className="text-slate-500">
            Scannez un QR/code-barres (étiquette RISC ou code fabricant), ou photographiez un
            numéro gravé sans code lisible, pour retrouver une fiche existante ou en créer une
            nouvelle.
          </p>
        </div>

        <div className="flex gap-1 rounded-md border border-slate-300 p-1 w-fit">
          <button
            onClick={() => {
              setMode('code')
              resetResult()
            }}
            className={`rounded px-3 py-1.5 text-sm font-medium ${mode === 'code' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Code-barres / QR
          </button>
          <button
            onClick={() => {
              setMode('photo')
              resetResult()
            }}
            className={`rounded px-3 py-1.5 text-sm font-medium ${mode === 'photo' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Numéro gravé (photo)
          </button>
        </div>

        {mode === 'code' ? (
          <Suspense fallback={<p className="text-sm text-slate-500">Chargement du scanner…</p>}>
            <CodeScanner onResult={handleCodeResult} onCancel={() => setMode('photo')} />
          </Suspense>
        ) : (
          <label className="inline-flex items-center gap-2 rounded-md bg-slate-900 text-white px-4 py-2.5 font-medium hover:bg-slate-800 cursor-pointer">
            {scanning ? 'Lecture en cours…' : '📷 Prendre une photo'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoScan}
              disabled={scanning}
              className="hidden"
            />
          </label>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {scannedText && scanSource && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <p className="text-sm text-slate-500">
              Numéro lu ({sourceLabel[scanSource]}) :{' '}
              <span className="font-mono text-base text-slate-900">{scannedText}</span>
              {scanSource !== 'code' && (
                <>
                  {' '}— la lecture sur métal gravé n'est pas garantie à 100 %, vérifiez la
                  correspondance avant de valider.
                </>
              )}
            </p>

            {matches.length === 0 ? (
              <p className="text-slate-500">
                Aucun item existant ne s'en approche. Il s'agit probablement d'un nouvel article.
              </p>
            ) : (
              <ul className="space-y-2">
                {matches.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        #{m.id} — {m.type} · {[m.brand, m.model].filter(Boolean).join(' ') || 'Sans marque'}
                      </p>
                      <p className="text-sm text-slate-500">
                        N° fabricant : <span className="font-mono">{m.manufacturer_serial}</span> ·{' '}
                        {ITEM_STATUSES.find((s) => s.value === m.status)?.label} ·{' '}
                        {Math.round(m.score * 100)}% de correspondance
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/materiel/${m.id}/modifier`)}
                      className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                    >
                      C'est celui-ci
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={handleCreateNew}
              className="w-full rounded-md border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + Aucun ne correspond — créer un nouvel item avec ce numéro
            </button>
          </div>
        )}
      </div>
    </RequireAdmin>
  )
}
