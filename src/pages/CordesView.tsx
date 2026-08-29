import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ITEM_STATUSES, type ItemWithAlerts } from '../lib/types'

const NO_COLOR = 'Sans couleur renseignée'

export default function CordesView() {
  const [ropes, setRopes] = useState<ItemWithAlerts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('items_with_alerts')
      .select('*')
      .eq('type', 'Corde')
      .order('rope_color', { ascending: true, nullsFirst: false })
      .order('id')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setRopes((data as ItemWithAlerts[]) ?? [])
        setLoading(false)
      })
  }, [])

  if (loading) return <p className="text-slate-500">Chargement…</p>
  if (error) return <p className="text-red-600">Erreur : {error}</p>

  const byColor = new Map<string, ItemWithAlerts[]>()
  for (const rope of ropes) {
    const key = rope.rope_color || NO_COLOR
    if (!byColor.has(key)) byColor.set(key, [])
    byColor.get(key)!.push(rope)
  }

  const colorSummary = [...byColor.entries()].map(([color, items]) => ({
    color,
    total: items.length,
    parStatut: ITEM_STATUSES.map((s) => ({
      label: s.label,
      count: items.filter((i) => i.status === s.value).length,
    })).filter((s) => s.count > 0),
  }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Cordes</h1>
        <p className="text-slate-500">
          Suivi des cordes par couleur et rotation — {ropes.length} au total.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {colorSummary.map(({ color, total, parStatut }) => (
          <div key={color} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{color}</p>
            <p className="text-2xl font-semibold text-slate-900">{total}</p>
            <p className="text-xs text-slate-400">
              {parStatut.map((s) => `${s.label} : ${s.count}`).join(' · ')}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Couleur</th>
              <th className="px-4 py-2">Rotation</th>
              <th className="px-4 py-2">Marque / Modèle</th>
              <th className="px-4 py-2">Longueur</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Dernier contrôle</th>
            </tr>
          </thead>
          <tbody>
            {ropes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Aucune corde enregistrée.
                </td>
              </tr>
            ) : (
              ropes.map((rope) => (
                <tr key={rope.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/materiel/${rope.id}`} className="font-medium text-slate-900 hover:underline">
                      #{rope.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{rope.rope_color ?? '—'}</td>
                  <td className="px-4 py-2">{rope.rope_rotation ?? '—'}</td>
                  <td className="px-4 py-2">
                    {[rope.brand, rope.model].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-2">
                    {rope.textile_length_m ? `${rope.textile_length_m} m` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {ITEM_STATUSES.find((s) => s.value === rope.status)?.label}
                  </td>
                  <td className="px-4 py-2">{rope.last_inspection_on ?? 'Jamais contrôlé'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
