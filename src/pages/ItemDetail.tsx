import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { ITEM_STATUSES, type Item, type Inspection } from '../lib/types'

export default function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, profile } = useAuth()

  const [item, setItem] = useState<Item | null>(null)
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newDate, setNewDate] = useState('')
  const [newResult, setNewResult] = useState('OK')
  const [newNotes, setNewNotes] = useState('')
  const [savingInspection, setSavingInspection] = useState(false)

  async function loadAll() {
    const [itemRes, inspRes] = await Promise.all([
      supabase.from('items').select('*').eq('id', id).single(),
      supabase
        .from('inspections')
        .select('*')
        .eq('item_id', id)
        .order('inspected_on', { ascending: false }),
    ])
    if (itemRes.error) setError(itemRes.error.message)
    setItem((itemRes.data as Item) ?? null)
    setInspections((inspRes.data as Inspection[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleDelete() {
    if (!confirm(`Supprimer définitivement l'item #${id} ? Cette action est irréversible.`)) return
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/materiel')
  }

  async function handleAddInspection(e: FormEvent) {
    e.preventDefault()
    setSavingInspection(true)
    const { error } = await supabase.from('inspections').insert({
      item_id: Number(id),
      inspected_on: newDate,
      result: newResult,
      notes: newNotes || null,
      created_by: profile?.id ?? null,
    })
    setSavingInspection(false)
    if (error) {
      setError(error.message)
      return
    }
    setNewDate('')
    setNewResult('OK')
    setNewNotes('')
    loadAll()
  }

  if (loading) return <p className="text-slate-500">Chargement…</p>
  if (error) return <p className="text-red-600">Erreur : {error}</p>
  if (!item) return <p className="text-slate-500">Item introuvable.</p>

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            #{item.id} — {item.type}
          </h1>
          <p className="text-slate-500">
            {[item.brand, item.model].filter(Boolean).join(' · ') || 'Sans marque/modèle'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Link
              to={`/materiel/${item.id}/modifier`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Modifier
            </Link>
            <button
              onClick={handleDelete}
              className="rounded-md border border-red-300 text-red-600 px-3 py-1.5 text-sm hover:bg-red-50"
            >
              Supprimer
            </button>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <Info label="Statut" value={ITEM_STATUSES.find((s) => s.value === item.status)?.label} />
        <Info label="N° fabricant" value={item.manufacturer_serial} />
        <Info
          label="Date de fabrication"
          value={item.manufacture_date_unknown ? 'Inconnue (à vérifier)' : item.manufacture_date}
        />
        <Info label="Longueur textile" value={item.textile_length_m ? `${item.textile_length_m} m` : null} />
        <Info label="Date sortie de service" value={item.decommission_date} />
        {item.type === 'Corde' && <Info label="Couleur" value={item.rope_color} />}
        {item.type === 'Corde' && <Info label="Rotation" value={item.rope_rotation} />}
        {item.specifics && (
          <div className="col-span-full">
            <Info label="Remarques & spécificité" value={item.specifics} />
          </div>
        )}
        {item.remarks && (
          <div className="col-span-full">
            <Info label="Remarques" value={item.remarks} />
          </div>
        )}
      </dl>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Historique des contrôles SECT</h2>

        {inspections.length === 0 ? (
          <p className="text-slate-500 mb-4">Aucun contrôle enregistré.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {inspections.map((insp) => (
              <li key={insp.id} className="rounded-lg border border-slate-200 bg-white p-3 flex justify-between">
                <div>
                  <p className="font-medium text-slate-900">{insp.inspected_on} — {insp.result}</p>
                  {insp.notes && <p className="text-sm text-slate-500">{insp.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <form onSubmit={handleAddInspection} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <p className="font-medium text-slate-900">Ajouter un contrôle</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="input"
              />
              <select value={newResult} onChange={(e) => setNewResult(e.target.value)} className="input">
                <option value="OK">OK</option>
                <option value="NON CONFORME">Non conforme</option>
                <option value="NON CONTRÔLÉ">Non contrôlé</option>
              </select>
            </div>
            <textarea
              placeholder="Notes (optionnel)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="input"
              rows={2}
            />
            <button
              type="submit"
              disabled={savingInspection}
              className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {savingInspection ? 'Enregistrement…' : 'Ajouter le contrôle'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-900">{value ?? '—'}</dd>
    </div>
  )
}
