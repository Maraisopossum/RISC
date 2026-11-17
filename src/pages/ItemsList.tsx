import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadXlsx } from '../lib/xlsxExport'
import { useAuth } from '../auth/AuthContext'
import { downloadBackup } from '../lib/backup'
import { exportYearControls, markYearValidated, countYearUnvalidated } from '../lib/exportControls'
import {
  ITEM_TYPES,
  ITEM_STATUSES,
  INSPECTION_RESULTS,
  inspectionResultLabel,
  inspectionResultClass,
  todayLocal,
  type ItemWithAlerts,
} from '../lib/types'

const PAGE_SIZE = 50

type SortColumn = 'id' | 'type' | 'brand' | 'model' | 'color' | 'manufacturer_serial' | 'manufacture_date' | 'status' | 'last_inspection_on' | 'last_inspection_result'

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'type', label: 'Type' },
  { key: 'brand', label: 'Marque / Modèle' },
  { key: 'color', label: 'Coloris' },
  { key: 'manufacturer_serial', label: 'N° fabricant' },
  { key: 'manufacture_date', label: 'Date de fabrication' },
  { key: 'status', label: 'Statut' },
  { key: 'last_inspection_on', label: 'Dernier contrôle' },
  { key: 'last_inspection_result', label: 'Résultat' },
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
  const [resultFilter, setResultFilter] = useState('')
  const [validationFilter, setValidationFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [sortColumn, setSortColumn] = useState<SortColumn>('id')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<string>('declasse')
  const [bulkSaving, setBulkSaving] = useState(false)
  const currentYear = new Date().getFullYear()
  const [exportYear, setExportYear] = useState(currentYear)
  const [yearBusy, setYearBusy] = useState(false)
  const [yearMessage, setYearMessage] = useState<string | null>(null)
  const [knownTypes, setKnownTypes] = useState<string[]>([...ITEM_TYPES])

  // Types prédéfinis + ceux déjà utilisés (au cas où un type personnalisé
  // aurait été créé depuis le formulaire d'ajout).
  useEffect(() => {
    supabase
      .from('items')
      .select('type')
      .not('type', 'is', null)
      .then(({ data }) => {
        const unique = [...new Set([...ITEM_TYPES, ...(data ?? []).map((r) => r.type as string)])].sort()
        setKnownTypes(unique)
      })
  }, [])

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
    if (resultFilter === 'NONE') q = q.is('last_inspection_on', null)
    else if (resultFilter) q = q.eq('last_inspection_result', resultFilter)
    const yearStart = `${new Date().getFullYear()}-01-01`
    if (yearFilter === 'done') q = q.gte('last_inspection_on', yearStart)
    else if (yearFilter === 'todo') q = q.or(`last_inspection_on.is.null,last_inspection_on.lt.${yearStart}`)
    if (validationFilter === 'yes') q = q.not('last_inspection_validated_on', 'is', null)
    else if (validationFilter === 'no') q = q.not('last_inspection_on', 'is', null).is('last_inspection_validated_on', null)
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
  }, [search, typeFilter, statusFilter, resultFilter, validationFilter, yearFilter, page, sortColumn, sortAsc, reloadKey])

  // Revenir à la première page quand un filtre ou un tri change
  useEffect(() => {
    setPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, statusFilter, resultFilter, validationFilter, yearFilter, sortColumn, sortAsc])

  // La sélection survit aux changements de page, de recherche et de filtre :
  // on peut ainsi cocher des lignes au fil de plusieurs recherches, puis les
  // traiter d'un coup.

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(i.id))

  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) items.forEach((i) => next.delete(i.id))
      else items.forEach((i) => next.add(i.id))
      return next
    })
  }

  // Ajoute à la sélection tous les résultats de la recherche/des filtres en
  // cours (pas seulement la page affichée).
  async function selectAllResults() {
    setError(null)
    const ids: number[] = []
    const batchSize = 1000
    for (let from = 0; ; from += batchSize) {
      const { data, error } = await applyFilters(supabase.from('items_with_alerts').select('id'))
        .order('id', { ascending: true })
        .range(from, from + batchSize - 1)
      if (error) {
        setError(error.message)
        return
      }
      ids.push(...((data as { id: number }[]) ?? []).map((r) => r.id))
      if (!data || data.length < batchSize) break
    }
    setSelected((prev) => new Set([...prev, ...ids]))
  }

  async function handleBulkStatusChange() {
    if (selected.size === 0) return
    const label = ITEM_STATUSES.find((s) => s.value === bulkStatus)?.label ?? bulkStatus
    if (!confirm(`Passer ${selected.size} item(s) au statut « ${label} » ?`)) return
    setBulkSaving(true)
    setError(null)
    const ids = [...selected]
    // Par lots : une liste d'ID trop longue dépasserait la taille d'URL admise.
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const { error } = await supabase.from('items').update({ status: bulkStatus }).in('id', chunk)
      if (error) {
        setError(error.message)
        setBulkSaving(false)
        return
      }
      if (bulkStatus === 'declasse') {
        // Date de sortie de service = aujourd'hui, sans écraser une date déjà saisie.
        const { error: dateError } = await supabase
          .from('items')
          .update({ decommission_date: todayLocal() })
          .in('id', chunk)
          .is('decommission_date', null)
        if (dateError) {
          setError(dateError.message)
          setBulkSaving(false)
          return
        }
      }
    }
    setBulkSaving(false)
    setSelected(new Set())
    setReloadKey((k) => k + 1)
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    if (
      !confirm(
        `Supprimer DÉFINITIVEMENT ${selected.size} item(s) et tout leur historique de contrôles ? Cette action est irréversible.`,
      )
    )
      return
    setBulkSaving(true)
    setError(null)
    const ids = [...selected]
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from('items').delete().in('id', ids.slice(i, i + 200))
      if (error) {
        setError(error.message)
        setBulkSaving(false)
        setReloadKey((k) => k + 1)
        return
      }
    }
    setBulkSaving(false)
    setSelected(new Set())
    setReloadKey((k) => k + 1)
  }

  async function handleDeleteOne(id: number) {
    if (!confirm(`Supprimer définitivement l'item #${id} et son historique de contrôles ? Cette action est irréversible.`)) return
    setError(null)
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setReloadKey((k) => k + 1)
  }

  async function handleBackup() {
    setYearBusy(true)
    setYearMessage(null)
    try {
      const r = await downloadBackup()
      setYearMessage(`${r.filename} téléchargé (${r.items} items, ${r.inspections} contrôles).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.')
    }
    setYearBusy(false)
  }

  async function handleExportYear() {
    setYearBusy(true)
    setYearMessage(null)
    try {
      const n = await exportYearControls(exportYear)
      setYearMessage(n === 0 ? `Aucun contrôle enregistré en ${exportYear}.` : `${n} contrôles exportés.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.')
    }
    setYearBusy(false)
  }

  async function handleMarkYearValidated() {
    setYearBusy(true)
    setYearMessage(null)
    try {
      const pending = await countYearUnvalidated(exportYear)
      if (pending === 0) {
        setYearMessage(`Tous les contrôles de ${exportYear} sont déjà marqués comme validés.`)
      } else if (
        confirm(
          `Marquer les ${pending} contrôles de ${exportYear} non validés comme validés par l'organisme (à la date d'aujourd'hui) ?`,
        )
      ) {
        const n = await markYearValidated(exportYear, todayLocal())
        setYearMessage(`${n} contrôles marqués comme validés.`)
        setReloadKey((k) => k + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.')
    }
    setYearBusy(false)
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

    await downloadXlsx(
      `inventaire-risc-${new Date().toISOString().slice(0, 10)}.xlsx`,
      'Inventaire',
      all.map((item) => ({
        'ID RISC': item.id,
        Type: item.type,
        Marque: item.brand,
        Modèle: item.model,
        Coloris: item.color,
        'Longueur textile (m)': item.textile_length_m,
        'N° fabricant': item.manufacturer_serial,
        'Date de fabrication': item.manufacture_date_unknown
          ? 'inconnue'
          : item.manufacture_date,
        'Date sortie de service': item.decommission_date,
        Statut: item.status,
        'Dernier contrôle': item.last_inspection_on,
        'Résultat dernier contrôle': item.last_inspection_result
          ? inspectionResultLabel(item.last_inspection_result)
          : null,
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
          Exporter la liste en Excel ({total})
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
          {knownTypes.map((t) => (
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
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Tous les résultats de contrôle</option>
          {INSPECTION_RESULTS.map((r) => (
            <option key={r.value} value={r.value}>
              Dernier contrôle : {r.label}
            </option>
          ))}
          <option value="NONE">Jamais contrôlé</option>
        </select>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Contrôle {new Date().getFullYear()} : tous</option>
          <option value="done">Contrôlé en {new Date().getFullYear()}</option>
          <option value="todo">Pas encore contrôlé en {new Date().getFullYear()}</option>
        </select>
        <select
          value={validationFilter}
          onChange={(e) => setValidationFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Validation par l'organisme : tous</option>
          <option value="yes">Dernier contrôle validé</option>
          <option value="no">Dernier contrôle non validé</option>
        </select>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {isAdmin && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-slate-700">
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </span>
            <button onClick={selectAllResults} className="text-slate-600 hover:underline">
              Ajouter les {total} résultats
            </button>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">
                Vider la sélection
              </button>
            )}
            <span className="text-xs text-slate-400">
              La sélection est conservée quand on change de recherche, de filtre ou de page.
            </span>
          </div>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-3">
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
                onClick={handleBulkDelete}
                disabled={bulkSaving}
                className="rounded-md border border-red-300 text-red-600 px-3 py-1.5 font-medium hover:bg-red-50 disabled:opacity-50 ml-auto"
              >
                Supprimer la sélection
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
        <span className="font-medium text-slate-700">Contrôles de l'année</span>
        <select
          value={exportYear}
          onChange={(e) => setExportYear(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          {Array.from({ length: 6 }, (_, k) => currentYear - k).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          onClick={handleExportYear}
          disabled={yearBusy}
          className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
        >
          Exporter en Excel
        </button>
        {isAdmin && (
          <button
            onClick={handleMarkYearValidated}
            disabled={yearBusy}
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
          >
            Marquer comme validés par l'organisme
          </button>
        )}
        {isAdmin && (
          <button
            onClick={handleBackup}
            disabled={yearBusy}
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50 sm:ml-auto"
          >
            Sauvegarde datée (Excel)
          </button>
        )}
        {yearMessage && <span className="w-full text-slate-500">{yearMessage}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              {isAdmin && (
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                  />
                </th>
              )}
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-2 py-2">
                  <button
                    onClick={() => handleSort(col.key)}
                    className="flex items-center gap-1 font-medium hover:text-slate-900"
                  >
                    {col.label}
                    {sortColumn === col.key && <span>{sortAsc ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
              {isAdmin && <th className="px-2 py-2" />}
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
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <Link to={`/materiel/${item.id}`} className="font-medium text-slate-900 hover:underline">
                      #{item.id}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{item.type}</td>
                  <td className="px-2 py-2">
                    <span className="font-medium text-slate-900">{item.brand ?? '—'}</span>
                    {item.model && <span className="block text-xs text-slate-500">{item.model}</span>}
                  </td>
                  <td className="px-2 py-2">{item.color ?? '—'}</td>
                  <td className="px-2 py-2">{item.manufacturer_serial ?? '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {item.manufacture_date_unknown
                      ? 'Inconnue'
                      : (item.manufacture_date ?? '—')}
                  </td>
                  <td className="px-2 py-2">
                    {ITEM_STATUSES.find((s) => s.value === item.status)?.label}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{item.last_inspection_on ?? 'Jamais contrôlé'}</td>
                  <td className="px-2 py-2">
                    {item.last_inspection_result ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${inspectionResultClass(item.last_inspection_result)}`}
                      >
                        {inspectionResultLabel(item.last_inspection_result)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Link
                        to={`/materiel/${item.id}/modifier`}
                        title={`Modifier #${item.id}`}
                        aria-label={`Modifier #${item.id}`}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        ✏️
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteOne(item.id)}
                        title={`Supprimer #${item.id}`}
                        aria-label={`Supprimer #${item.id}`}
                        className="ml-1 rounded-md border border-red-300 px-2 py-1 text-xs hover:bg-red-50"
                      >
                        🗑️
                      </button>
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
