import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { similarity } from '../lib/fuzzy'
import { parseItemIdFromScan } from '../lib/qr'
import { fetchAllRows } from '../lib/fetchAll'
import { ITEM_STATUSES, type Item } from '../lib/types'
import RequireInspector from '../components/RequireInspector'
import { useAuth } from '../auth/AuthContext'

interface Match extends Item {
  score: number
}

const MIN_SCORE = 0.4 // en dessous, la suggestion n'a plus de sens

// Une douchette USB se comporte comme un clavier : elle "tape" le code lu
// dans le champ actif puis envoie Entrée, ce qui lance la recherche. Le champ
// reste donc simplement un champ texte, utilisable aussi à la main.
export default function ScanLookup() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [input, setInput] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchedText, setSearchedText] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [error, setError] = useState<string | null>(null)

  async function lookup(text: string) {
    // Étiquette QR RISC (URL de la fiche) : on ouvre directement la fiche.
    const ownItemId = parseItemIdFromScan(text)
    if (ownItemId) {
      navigate(`/materiel/${ownItemId}`)
      return
    }

    // Recherche exacte côté serveur : l'API plafonne les réponses à 1000
    // lignes par défaut, un "select *" côté client raterait des items.
    const { data: exactMatches, error: exactErr } = await supabase
      .from('items')
      .select('id')
      .ilike('manufacturer_serial', text)
    if (exactErr) {
      setError(exactErr.message)
      return
    }
    if (exactMatches && exactMatches.length > 0) {
      navigate(`/materiel/${exactMatches[0].id}`)
      return
    }

    let all: Item[]
    try {
      all = await fetchAllRows<Item>(() =>
        supabase.from('items').select('*').not('manufacturer_serial', 'is', null),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.')
      return
    }

    setSearchedText(text)
    setMatches(
      all
        .map((item) => ({ ...item, score: similarity(text, item.manufacturer_serial!) }))
        .filter((item) => item.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return

    setSearching(true)
    setError(null)
    setSearchedText(null)
    setMatches([])
    await lookup(text)
    setSearching(false)
  }

  return (
    <RequireInspector>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Scanner un item</h1>
          <p className="text-slate-500">
            Scannez le code avec la douchette (le curseur est déjà dans le champ), ou tapez le N°
            fabricant, pour retrouver une fiche existante
            {isAdmin ? ' ou en créer une nouvelle' : ''}.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="N° fabricant (ex: 22F0414A69072)"
            className="input font-mono text-base"
          />
          <button
            type="submit"
            disabled={searching}
            className="shrink-0 rounded-md bg-slate-900 text-white px-4 py-2 font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {searching ? 'Recherche…' : 'Rechercher'}
          </button>
        </form>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {searchedText !== null && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            <p className="text-sm text-slate-500">
              Aucune fiche avec le N° <span className="font-mono text-slate-900">{searchedText}</span>
              {matches.length > 0 ? ' — numéros proches :' : '.'}
            </p>

            {matches.length > 0 && (
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
                      onClick={() =>
                        navigate(isAdmin ? `/materiel/${m.id}/modifier` : `/materiel/${m.id}`)
                      }
                      className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                    >
                      C'est celui-ci
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {isAdmin ? (
              <button
                onClick={() =>
                  navigate('/materiel/nouveau', { state: { manufacturer_serial: searchedText } })
                }
                className="w-full rounded-md border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                + Créer un nouvel item avec ce numéro
              </button>
            ) : (
              <p className="text-sm text-slate-500">
                Un compte admin doit créer la fiche pour ce numéro.
              </p>
            )}
          </div>
        )}
      </div>
    </RequireInspector>
  )
}
