import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadCsv } from '../lib/csv'
import { ITEM_TYPES, ITEM_STATUSES, type Item } from '../lib/types'

const PAGE_SIZE = 50

export default function ItemsList() {
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    setLoading(true)
    let query = supabase.from('items').select('*', { count: 'exact' })

    if (typeFilter) query = query.eq('type', typeFilter)
    if (statusFilter) query = query.eq('status', statusFilter)
    if (search.trim()) {
      const term = search.trim()
      query = query.or(
        [
          `brand.ilike.%${term}%`,
          `model.ilike.%${term}%`,
          `manufacturer_serial.ilike.%${term}%`,
          `specifics.ilike.%${term}%`,
          /^\d+$/.test(term) ? `id.eq.${term}` : null,
        ]
          .filter(Boolean)
          .join(','),
      )
    }

    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    query
      .order('id', { ascending: false })
      .range(from, to)
      .then(({ data, error, count }) => {
        if (error) setError(error.message)
        setItems((data as Item[]) ?? [])
        setTotal(count ?? 0)
        setLoading(false)
      })
  }, [search, typeFilter, statusFilter, page])

  // Revenir à la première page quand un filtre change
  useEffect(() => {
    setPage(0)
  }, [search, typeFilter, statusFilter])

  async function handleExport() {
    // Exporte tout le résultat filtré (pas seulement la page affichée), par lots de 1000.
    setError(null)
    let query = supabase.from('items').select('*')
    if (typeFilter) query = query.eq('type', typeFilter)
    if (statusFilter) query = query.eq('status', statusFilter)
    if (search.trim()) {
      const term = search.trim()
      query = query.or(
        [
          `brand.ilike.%${term}%`,
          `model.ilike.%${term}%`,
          `manufacturer_serial.ilike.%${term}%`,
          `specifics.ilike.%${term}%`,
          /^\d+$/.test(term) ? `id.eq.${term}` : null,
        ]
          .filter(Boolean)
          .join(','),
      )
    }

    const all: Item[] = []
    const batchSize = 1000
    for (let from = 0; ; from += batchSize) {
      const { data, error } = await query
        .order('id', { ascending: false })
        .range(from, from + batchSize - 1)
      if (error) {
        setError(error.message)
        return
      }
      all.push(...((data as Item[]) ?? []))
      if (!data || data.length < batchSize) break
    }

    downloadCsv(
      `inventaire-risc-${new Date().toISOString().slice(0, 10)}.csv`,
      all.map((item) => ({
        'ID RISC': item.id,
        Type: item.type,
        Marque: item.brand,
        Modèle: item.model,
        'Longueur textile (m)': item.textile_length_m,
        'N° fabricant': item.manufacturer_serial,
        'Date de fabrication': item.manufacture_date_unknown
          ? 'inconnue'
          : item.manufacture_date,
        'Date sortie de service': item.decommission_date,
        Statut: item.status,
        Remarques: item.remarks,
      })),
    )
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Matériel</h1>
        <button
          onClick={handleExport}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Exporter en CSV ({total})
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Rechercher (ID, marque, modèle, N° fabricant…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Tous les types</option>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Tous les statuts</option>
          {ITEM_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Marque</th>
              <th className="px-4 py-2">Modèle</th>
              <th className="px-4 py-2">N° fabricant</th>
              <th className="px-4 py-2">Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Chargement…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Aucun résultat.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link to={`/materiel/${item.id}`} className="font-medium text-slate-900 hover:underline">
                      #{item.id}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{item.type}</td>
                  <td className="px-4 py-2">{item.brand ?? '—'}</td>
                  <td className="px-4 py-2">{item.model ?? '—'}</td>
                  <td className="px-4 py-2">{item.manufacturer_serial ?? '—'}</td>
                  <td className="px-4 py-2">
                    {ITEM_STATUSES.find((s) => s.value === item.status)?.label}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {page + 1} / {pageCount} · {total} résultat{total > 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            Précédent
          </button>
          <button
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  )
}
