import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/fetchAll'
import { ITEM_STATUSES, type Item } from '../lib/types'
import RequireAdmin from '../components/RequireAdmin'

interface FlaggedItem extends Item {
  reasons: string[]
}

export default function ToReview() {
  const [items, setItems] = useState<FlaggedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [unknownDateRes, declasseNoDateRes, allWithSerial] = await Promise.all([
        supabase.from('items').select('*').eq('manufacture_date_unknown', true),
        supabase.from('items').select('*').eq('status', 'declasse').is('decommission_date', null),
        fetchAllRows<Item>(() =>
          supabase.from('items').select('*').not('manufacturer_serial', 'is', null),
        ).catch((err) => {
          setError(err instanceof Error ? err.message : 'Erreur inconnue.')
          return [] as Item[]
        }),
      ])

      if (unknownDateRes.error) setError(unknownDateRes.error.message)

      const flagged = new Map<number, FlaggedItem>()

      function flag(item: Item, reason: string) {
        const existing = flagged.get(item.id)
        if (existing) {
          existing.reasons.push(reason)
        } else {
          flagged.set(item.id, { ...item, reasons: [reason] })
        }
      }

      for (const item of (unknownDateRes.data as Item[]) ?? []) {
        flag(item, 'Date de fabrication inconnue')
      }
      for (const item of (declasseNoDateRes.data as Item[]) ?? []) {
        flag(item, 'Déclassé sans date de sortie de service')
      }

      // N° fabricant identique utilisé par plusieurs items actifs : probable
      // erreur de saisie ou de scan (numéro attribué deux fois par erreur).
      const bySerial = new Map<string, Item[]>()
      for (const item of allWithSerial) {
        if (item.status === 'disparu') continue
        const key = item.manufacturer_serial!.trim().toUpperCase()
        if (!bySerial.has(key)) bySerial.set(key, [])
        bySerial.get(key)!.push(item)
      }
      for (const group of bySerial.values()) {
        if (group.length > 1) {
          for (const item of group) {
            flag(item, `N° fabricant dupliqué (${group.length} items : ${group.map((i) => `#${i.id}`).join(', ')})`)
          }
        }
      }

      setItems([...flagged.values()].sort((a, b) => a.id - b.id))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p className="text-slate-500">Chargement…</p>
  if (error) return <p className="text-red-600">Erreur : {error}</p>

  return (
    <RequireAdmin>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">À vérifier</h1>
          <p className="text-slate-500">
            Incohérences de données détectées automatiquement, à corriger au cas par cas —{' '}
            {items.length} item{items.length > 1 ? 's' : ''}.
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-slate-500">Aucune incohérence détectée.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Marque / Modèle</th>
                  <th className="px-4 py-2">Statut</th>
                  <th className="px-4 py-2">À vérifier</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900">#{item.id}</td>
                    <td className="px-4 py-2">{item.type}</td>
                    <td className="px-4 py-2">
                      {[item.brand, item.model].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-2">
                      {ITEM_STATUSES.find((s) => s.value === item.status)?.label}
                    </td>
                    <td className="px-4 py-2 space-y-0.5">
                      {item.reasons.map((r) => (
                        <p key={r} className="text-amber-700 text-xs">
                          {r}
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        to={`/materiel/${item.id}/modifier`}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Corriger
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequireAdmin>
  )
}
