import { useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { readSerialFromPhoto } from '../lib/ocr'
import { similarity } from '../lib/fuzzy'
import { ITEM_STATUSES, type Item } from '../lib/types'
import RequireAdmin from '../components/RequireAdmin'

interface Match extends Item {
  score: number
}

const MIN_SCORE = 0.4 // en dessous, la suggestion n'a plus de sens

export default function ScanLookup() {
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [scannedText, setScannedText] = useState<string | null>(null)
  const [scanSource, setScanSource] = useState<'tesseract' | 'groq' | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleScan(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setScanning(true)
    setError(null)
    setMatches([])
    setScannedText(null)

    try {
      const { text, source } = await readSerialFromPhoto(file)
      if (!text) {
        setError("Aucun numéro n'a pu être lu sur cette photo. Réessayez avec une photo plus nette et cadrée sur le numéro.")
        return
      }
      setScannedText(text)
      setScanSource(source)

      const { data, error: dbError } = await supabase
        .from('items')
        .select('*')
        .not('manufacturer_serial', 'is', null)
      if (dbError) throw new Error(dbError.message)

      const scored = (data as Item[])
        .map((item) => ({ ...item, score: similarity(text, item.manufacturer_serial!) }))
        .filter((item) => item.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)

      setMatches(scored)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de lecture.')
    } finally {
      setScanning(false)
    }
  }

  function handleCreateNew() {
    navigate('/materiel/nouveau', { state: { manufacturer_serial: scannedText } })
  }

  return (
    <RequireAdmin>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Scanner un numéro de série</h1>
          <p className="text-slate-500">
            Photographiez le numéro gravé ou imprimé sur une pièce de matériel pour retrouver sa
            fiche existante, ou en créer une nouvelle si elle n'existe pas encore.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 rounded-md bg-slate-900 text-white px-4 py-2.5 font-medium hover:bg-slate-800 cursor-pointer">
          {scanning ? 'Lecture en cours…' : '📷 Prendre une photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleScan}
            disabled={scanning}
            className="hidden"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {scannedText && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <p className="text-sm text-slate-500">
              Numéro lu ({scanSource === 'tesseract' ? 'lecture locale' : 'Groq'}) :{' '}
              <span className="font-mono text-base text-slate-900">{scannedText}</span>
              {' '}— la lecture sur métal gravé n'est pas garantie à 100 %, vérifiez la correspondance
              avant de valider.
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
