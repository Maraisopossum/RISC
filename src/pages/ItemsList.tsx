import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadCsv } from '../lib/csv'
import { useAuth } from '../auth/AuthContext'
import { ITEM_TYPES, ITEM_STATUSES, type ItemWithAlerts } from '../lib/types'

const PAGE_SIZE = 50

type SortColumn = 'id' | 'type' | 'brand' | 'model' | 'manufacturer_serial' | 'manufacture_date' | 'status' | 'last_inspection_on'

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'type', label: 'Type' },
  { key: 'brand', label: 'Marque' },
  { key: 'model', label: 'Modèle' },
  { key: 'manufacturer_serial', label: 'N° fabricant' },
  { key: 'manufacture_date', label: 'Date de fabrication' },
  { key: 'status', label: 'Statut' },
  { key: 'last_inspection_on', label: 'Dernier contrôle' },
]

export default function ItemsList() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState<ItemWithAlerts[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<string>(ITEM_STATUSES[0].value)
  const [bulkSaving, setBulkSaving] = useState(false)

  // Anti-rebond : on ne relance la recherche que 300ms après la dernière
  // frappe, pour éviter une requête (et un scintillement de la table) à
  // chaque caractère tapé.
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  function applyFilters<T>(query: T): T {
    // biome-ignore lint: chaînage générique sur le query builder Supabase
    let q: any = query
    if (typeFilter) q = q.eq('type', typeFilter)
    if (statusFilter) q = q.eq('status', statusFilter)
    if (search.trim()) {
      const term = search.trim()
      q = q.or(
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
    return q
  }

  useEffect(() => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    applyFilters(supabase.from('items_with_alerts').select('*', { count: 'exact' }))
      .order(sortColumn, { ascending: sortAsc, nullsFirst: sortAsc })
      .range(from, to)
      .then(({ data, error, count }: { data: ItemWithAlerts[] | null; error: { message: string } | null; count: number | null }) => {
        if (error) setError(error.message)
        setItems(data ?? [])
        setTotal(count ?? 0)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, statusFilter, page, sortColumn, sortAsc])

  // Revenir à la première page quand un filtre ou un tri change
  useEffect(() => {
    setPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, statusFilter, sortColumn, sortAsc])

  // La sélection ne doit pas survivre à un changement de page/filtre : les
  // lignes affichées changent, une sélection "invisible" prêterait à confusion.
  useEffect(() => {
    setSelected(new Set())
  }, [search, typeFilter, statusFilter, page, sortColumn, sortAsc])

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllOnPage() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id)),
    )
  }

  async function handleBulkStatusChange() {
    if (selected.size === 0) return
    setBulkSaving(true)
    setError(null)
    const { error } = await supabase
      .from('items')
      .update({ status: bulkStatus })
      .in('id', [...selected])
    setBulkSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setSelected(new Set())
    setLoading(true)
    applyFilters(supabase.from('items_with_alerts').select('*', { count: 'exact' }))
      .order(sortColumn, { ascending: sortAsc, nullsFirst: sortAsc })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data, count }: { data: ItemWithAlerts[] | null; count: number | null }) => {
        setItems(data ?? [])
        setTotal(count ?? 0)
        setLoading(false)
      })
  }

  function handleSort(col: SortColumn) {
    if (col === sortColumn) {
      setSortAsc((a) => !a)
    } else {
      setSortColumn(col)
      setSortAsc(col === 'id' ? false : true)
    }
  }

  async function handleExport() {
    // Exporte tout le résultat filtré (pas seulement la page affichée), par lots de 1000.
    setError(null)

    const all: ItemWithAlerts[] = []
    const batchSize = 1000
    for (let from = 0; ; from += batchSize) {
      const { data, error } = await applyFilters(supabase.from('items_with_alerts').select('*'))
        .order(sortColumn, { ascending: sortAsc, nullsFirst: sortAsc })
        .range(from, from + batchSize - 1)
      if (error) {
        setError(error.message)
        return
      }
      all.push(...((data as ItemWithAlerts[]) ?? []))
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
        'Dernier contrôle': item.last_inspection_on,
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
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
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

      {isAdmin && selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm">
          <span className="font-medium text-slate-700">{selected.size} sélectionné(s)</span>
          <span className="text-slate-400">·</span>
          <span>Passer au statut</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1"
          >
            {ITEM_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkStatusChange}
            disabled={bulkSaving}
            className="rounded-md bg-slate-900 text-white px-3 py-1.5 font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {bulkSaving ? 'Application…' : 'Appliquer'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-slate-500 hover:underline ml-auto"
          >
            Annuler la sélection
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {isAdmin && (
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selected.size === items.length}
                    onChange={toggleSelectAllOnPage}
                  />
                </th>
              )}
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-2">
                  <button
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 font-medium hover:text-slate-900"
                  >
                    {col.label}
                    {sortColumn === col.key && <span>{sortAsc ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
              {isAdmin && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-4 py-6 text-center text-slate-400">
                  Chargement…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-4 py-6 text-center text-slate-400">
                  Aucun résultat.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                  {isAdmin && (
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                      />
                    </td>
                  )}
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
                    {item.manufacture_date_unknown
                      ? 'Inconnue'
                      : (item.manufacture_date ?? '—')}
                  </td>
                  <td className="px-4 py-2">
                    {ITEM_STATUSES.find((s) => s.value === item.status)?.label}
                  </td>
                  <td className="px-4 py-2">{item.last_inspection_on ?? 'Jamais contrôlé'}</td>
                  {isAdmin && (
                    <td className="px-4 py-2">
                      <Link
                        to={`/materiel/${item.id}/modifier`}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Modifier
                      </Link>
                    </td>
                  )}
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
