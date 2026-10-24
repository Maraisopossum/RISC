import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import {
  ITEM_STATUSES,
  INSPECTION_RESULTS,
  inspectionResultLabel,
  inspectionResultClass,
  todayLocal,
  type Item,
  type Inspection,
} from '../lib/types'
import { cacheItem, getCachedItem } from '../lib/offlineCache'
import QrLabel from '../components/QrLabel'

export default function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, canInspect, profile } = useAuth()

  const [item, setItem] = useState<Item | null>(null)
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offlineSince, setOfflineSince] = useState<string | null>(null)
  const [audit, setAudit] = useState<{ createdBy: string | null; updatedBy: string | null }>({
    createdBy: null,
    updatedBy: null,
  })

  const [newDate, setNewDate] = useState(todayLocal)
  const [newResult, setNewResult] = useState('OK')
  const [newNotes, setNewNotes] = useState('')
  const [savingInspection, setSavingInspection] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editResult, setEditResult] = useState('OK')
  const [editNotes, setEditNotes] = useState('')

  async function loadAll() {
    if (!id) return

    const [itemRes, inspRes] = await Promise.all([
      supabase.from('items').select('*').eq('id', id).single(),
      supabase
        .from('inspections')
        .select('*')
        .eq('item_id', id)
        .order('inspected_on', { ascending: false }),
    ])

    if (itemRes.error) {
      // Pas de réseau (ou item introuvable) : on retombe sur la dernière
      // version déjà consultée en ligne, si elle existe.
      const cached = getCachedItem(id)
      if (cached) {
        setItem(cached.item)
        setInspections(cached.inspections)
        setOfflineSince(cached.cachedAt)
        setLoading(false)
        return
      }
      setError(itemRes.error.message)
      setLoading(false)
      return
    }

    setOfflineSince(null)
    setItem(itemRes.data as Item)
    setInspections((inspRes.data as Inspection[]) ?? [])
    setLoading(false)
    cacheItem(itemRes.data as Item, (inspRes.data as Inspection[]) ?? [])

    if (isAdmin) {
      const { data } = await supabase
        .from('items')
        .select(
          'created_by_profile:profiles!items_created_by_fkey(email), updated_by_profile:profiles!items_updated_by_fkey(email)',
        )
        .eq('id', id)
        .single()
      const row = data as unknown as {
        created_by_profile: { email: string | null } | null
        updated_by_profile: { email: string | null } | null
      } | null
      setAudit({
        createdBy: row?.created_by_profile?.email ?? null,
        updatedBy: row?.updated_by_profile?.email ?? null,
      })
    }
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
    setNewDate(todayLocal())
    setNewResult('OK')
    setNewNotes('')
    loadAll()
  }

  function startEdit(insp: Inspection) {
    setEditingId(insp.id)
    setEditDate(insp.inspected_on)
    setEditResult(insp.result ?? 'OK')
    setEditNotes(insp.notes ?? '')
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (editingId === null) return
    const { error } = await supabase
      .from('inspections')
      .update({ inspected_on: editDate, result: editResult, notes: editNotes || null })
      .eq('id', editingId)
    if (error) {
      setError(error.message)
      return
    }
    setEditingId(null)
    loadAll()
  }

  async function handleDeleteInspection(insp: Inspection) {
    if (!confirm(`Supprimer le contrôle du ${insp.inspected_on} ?`)) return
    const { error } = await supabase.from('inspections').delete().eq('id', insp.id)
    if (error) {
      setError(error.message)
      return
    }
    loadAll()
  }

  if (loading) return <p className="text-slate-500">Chargement…</p>
  if (error) return <p className="text-red-600">Erreur : {error}</p>
  if (!item) return <p className="text-slate-500">Item introuvable.</p>

  return (
    <div className="space-y-8 max-w-3xl">
      {offlineSince && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Hors-ligne — dernière version connue de cette fiche, consultée le{' '}
          {new Date(offlineSince).toLocaleString('fr-BE')}. Les modifications ne sont pas
          possibles sans réseau.
        </div>
      )}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            #{item.id} — {item.type}
          </h1>
          <p className="text-slate-500">
            {[item.brand, item.model].filter(Boolean).join(' · ') || 'Sans marque/modèle'}
          </p>
          {isAdmin && (audit.createdBy || audit.updatedBy) && (
            <p className="text-xs text-slate-400 mt-1">
              {audit.createdBy && <>Créé par {audit.createdBy}</>}
              {audit.createdBy && audit.updatedBy && audit.updatedBy !== audit.createdBy && (
                <> · Dernière modification par {audit.updatedBy}</>
              )}
              {!audit.createdBy && audit.updatedBy && <>Dernière modification par {audit.updatedBy}</>}
            </p>
          )}
        </div>
        {isAdmin && !offlineSince && (
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
        <Info label="Coloris" value={item.color} />
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

      {isAdmin && !offlineSince && <QrLabel itemId={item.id} itemType={item.type} />}

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Historique des contrôles SECT</h2>

        {inspections.length === 0 ? (
          <p className="text-slate-500 mb-4">Aucun contrôle enregistré.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {inspections.map((insp) =>
              editingId === insp.id ? (
                <li key={insp.id} className="rounded-lg border border-slate-300 bg-white p-3">
                  <form onSubmit={handleSaveEdit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="date"
                        required
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="input"
                      />
                      <select value={editResult} onChange={(e) => setEditResult(e.target.value)} className="input">
                        {INSPECTION_RESULTS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                        {!INSPECTION_RESULTS.some((r) => r.value === editResult) && (
                          <option value={editResult}>{editResult} (ancien)</option>
                        )}
                      </select>
                    </div>
                    <textarea
                      placeholder="Notes (optionnel)"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="input"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-slate-800"
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={insp.id} className="rounded-lg border border-slate-200 bg-white p-3 flex justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {insp.inspected_on}{' '}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${inspectionResultClass(insp.result)}`}>
                        {inspectionResultLabel(insp.result)}
                      </span>
                    </p>
                    {insp.notes && <p className="text-sm text-slate-500">{insp.notes}</p>}
                  </div>
                  {isAdmin && !offlineSince && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(insp)}
                        title="Modifier ce contrôle"
                        aria-label="Modifier ce contrôle"
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInspection(insp)}
                        title="Supprimer ce contrôle"
                        aria-label="Supprimer ce contrôle"
                        className="rounded-md border border-red-300 px-2 py-1 text-sm hover:bg-red-50"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        )}

        {canInspect && !offlineSince && (
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
                {INSPECTION_RESULTS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
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
