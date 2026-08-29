import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import type { ItemWithAlerts, ItemStatus } from '../lib/types'

const STATUS_LABEL: Record<ItemStatus, string> = {
  stock: 'En stock',
  en_service: 'En service',
  declasse: 'Déclassé',
  disparu: 'Disparu',
}

const TOP_ALERTS_LIMIT = 100

export default function Dashboard() {
  const { isAdmin } = useAuth()
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [toReview, setToReview] = useState<ItemWithAlerts[]>([])
  const [alertsTotal, setAlertsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const statuses: ItemStatus[] = ['stock', 'en_service', 'declasse', 'disparu']

      const alertFilter = 'alert_age.eq.true,alert_control.eq.true'

      const [counts, alertsCountRes, alertsRes] = await Promise.all([
        Promise.all(
          statuses.map((status) =>
            supabase
              .from('items')
              .select('*', { count: 'exact', head: true })
              .eq('status', status),
          ),
        ),
        supabase
          .from('items_with_alerts')
          .select('*', { count: 'exact', head: true })
          .or(alertFilter),
        // On n'affiche que les cas les plus urgents (jamais contrôlé, ou contrôle
        // le plus ancien en premier) — pas les 3000+ lignes d'un coup dans la page.
        supabase
          .from('items_with_alerts')
          .select('*')
          .or(alertFilter)
          .order('last_inspection_on', { ascending: true, nullsFirst: true })
          .limit(TOP_ALERTS_LIMIT),
      ])

      if (alertsRes.error) setError(alertsRes.error.message)

      const byStatus: Record<string, number> = {}
      statuses.forEach((status, i) => {
        byStatus[status] = counts[i].count ?? 0
      })

      setStatusCounts(byStatus)
      setAlertsTotal(alertsCountRes.count ?? 0)
      setToReview((alertsRes.data as ItemWithAlerts[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p className="text-slate-500">Chargement…</p>
  if (error) return <p className="text-red-600">Erreur : {error}</p>

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Tableau de bord</h1>
          <p className="text-slate-500">Vue d'ensemble de l'inventaire RISC</p>
        </div>
        {isAdmin && (
          <Link
            to="/scanner"
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 text-white px-4 py-2.5 font-medium hover:bg-slate-800"
          >
            📷 Scanner un numéro
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(Object.keys(STATUS_LABEL) as ItemStatus[]).map((status) => (
          <div key={status} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{STATUS_LABEL[status]}</p>
            <p className="text-2xl font-semibold text-slate-900">
              {statusCounts[status] ?? 0}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">
          À contrôler ({alertsTotal})
        </h2>
        {alertsTotal > TOP_ALERTS_LIMIT && (
          <p className="text-sm text-slate-500 mb-3">
            Les {TOP_ALERTS_LIMIT} cas les plus urgents (jamais contrôlés ou contrôle le plus
            ancien) sont affichés ci-dessous. Utilisez la page Matériel ou l'export CSV pour la
            liste complète.
          </p>
        )}
        {toReview.length === 0 ? (
          <p className="text-slate-500">Aucune alerte — tout est à jour.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white max-h-[70vh] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Marque / Modèle</th>
                  <th className="px-4 py-2">Dernier contrôle</th>
                  <th className="px-4 py-2">Motif</th>
                </tr>
              </thead>
              <tbody>
                {toReview.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link to={`/materiel/${item.id}`} className="font-medium text-slate-900 hover:underline">
                        #{item.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{item.type}</td>
                    <td className="px-4 py-2">
                      {[item.brand, item.model].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-2">
                      {item.last_inspection_on ?? 'Jamais contrôlé'}
                    </td>
                    <td className="px-4 py-2 space-x-1">
                      {item.alert_age && (
                        <span className="inline-block rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs">
                          &gt; 10 ans
                        </span>
                      )}
                      {item.alert_control && (
                        <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs">
                          contrôle &gt; 1 an
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
