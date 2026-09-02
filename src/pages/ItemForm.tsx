import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { readSerialFromPhoto } from '../lib/ocr'
import { ITEM_TYPES, ITEM_STATUSES, type Item, type Inspection } from '../lib/types'
import RequireAdmin from '../components/RequireAdmin'

const emptyItem: Partial<Item> = {
  status: 'stock',
  manufacture_date_unknown: false,
}

interface SerialRow {
  id: number
  value: string
  scanning: boolean
  error: string | null
}

export default function ItemForm() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const location = useLocation()
  // Pré-remplissage venant du scan rapide (page Rechercher/scanner un item) :
  // numéro déjà lu, à confirmer/compléter ici.
  const prefillSerial = (location.state as { manufacturer_serial?: string } | null)?.manufacturer_serial

  const [form, setForm] = useState<Partial<Item>>(
    prefillSerial ? { ...emptyItem, manufacturer_serial: prefillSerial } : emptyItem,
  )
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [knownTypes, setKnownTypes] = useState<string[]>([...ITEM_TYPES])
  const [knownBrands, setKnownBrands] = useState<string[]>([])
  const [knownModels, setKnownModels] = useState<string[]>([])
  const [knownColors, setKnownColors] = useState<string[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [inspections, setInspections] = useState<Inspection[]>([])

  // Création groupée : un même Type/Marque/Modèle/Coloris peut correspondre
  // à plusieurs pièces physiques distinctes (N° fabricant différents) — un
  // "+" ajoute un N° fabricant supplémentaire, l'enregistrement crée alors
  // une fiche par numéro. Non utilisé en modification (un seul item à la fois).
  const nextRowId = useRef(1)
  const [serialRows, setSerialRows] = useState<SerialRow[]>([
    { id: 0, value: prefillSerial ?? '', scanning: false, error: null },
  ])

  useEffect(() => {
    if (!id) return
    supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        if (data) setForm(data as Item)
        setLoading(false)
      })
    supabase
      .from('inspections')
      .select('*')
      .eq('item_id', id)
      .order('inspected_on', { ascending: false })
      .then(({ data }) => setInspections((data as Inspection[]) ?? []))
  }, [id])

  // Suggestions "type" : les types prédéfinis + ceux déjà utilisés dans
  // l'inventaire (au cas où un type personnalisé aurait été créé).
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

  // Suggestions "marque" : toutes les marques déjà utilisées, tous types confondus.
  useEffect(() => {
    supabase
      .from('items')
      .select('brand')
      .not('brand', 'is', null)
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((r) => r.brand as string))].sort()
        setKnownBrands(unique)
      })
  }, [])

  // Suggestions "modèle" : les modèles déjà utilisés pour le type (et la marque
  // si renseignée) sélectionnés — plus pertinent qu'une liste globale.
  useEffect(() => {
    let query = supabase.from('items').select('model').not('model', 'is', null)
    if (form.type) query = query.eq('type', form.type)
    if (form.brand) query = query.eq('brand', form.brand)
    query.then(({ data }) => {
      const unique = [...new Set((data ?? []).map((r) => r.model as string))].sort()
      setKnownModels(unique)
    })
  }, [form.type, form.brand])

  // Suggestions "coloris" : toutes les couleurs déjà utilisées, tous types confondus.
  useEffect(() => {
    supabase
      .from('items')
      .select('color')
      .not('color', 'is', null)
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((r) => r.color as string))].sort()
        setKnownColors(unique)
      })
  }, [])

  function update<K extends keyof Item>(key: K, value: Item[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Après un enregistrement réussi, ajoute immédiatement les nouvelles
  // valeurs (type/marque/modèle/coloris) aux suggestions : sans ça, créer un
  // second item juste après ne proposait pas ce qui venait d'être saisi.
  function rememberNewValues() {
    if (form.type) setKnownTypes((prev) => [...new Set([...prev, form.type!])].sort())
    if (form.brand) setKnownBrands((prev) => [...new Set([...prev, form.brand!])].sort())
    if (form.model) setKnownModels((prev) => [...new Set([...prev, form.model!])].sort())
    if (form.color) setKnownColors((prev) => [...new Set([...prev, form.color!])].sort())
  }

  async function handleScanSerial(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de reprendre une photo du même nom ensuite
    if (!file) return

    setScanning(true)
    setScanError(null)
    try {
      const { text, source } = await readSerialFromPhoto(file)
      if (!text) {
        setScanError("Aucun numéro n'a pu être lu sur cette photo — réessayez ou saisissez-le à la main.")
      } else {
        update('manufacturer_serial', text)
        const via = source === 'tesseract' ? 'lecture locale' : 'Groq (lecture locale peu fiable)'
        setScanError(`Lu (${via}) : "${text}" — vérifiez avant d'enregistrer, la lecture sur métal gravé n'est pas garantie à 100 %.`)
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Erreur de lecture.')
    } finally {
      setScanning(false)
    }
  }

  function updateSerialRow(rowId: number, value: string) {
    setSerialRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, value } : r)))
  }

  function addSerialRow() {
    setSerialRows((rows) => [
      ...rows,
      { id: nextRowId.current++, value: '', scanning: false, error: null },
    ])
  }

  function removeSerialRow(rowId: number) {
    setSerialRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== rowId) : rows))
  }

  async function handleScanSerialRow(rowId: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setSerialRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, scanning: true, error: null } : r)))
    try {
      const { text, source } = await readSerialFromPhoto(file)
      if (!text) {
        setSerialRows((rows) =>
          rows.map((r) =>
            r.id === rowId
              ? { ...r, error: "Aucun numéro n'a pu être lu sur cette photo — réessayez ou saisissez-le à la main." }
              : r,
          ),
        )
      } else {
        const via = source === 'tesseract' ? 'lecture locale' : 'Groq (lecture locale peu fiable)'
        setSerialRows((rows) =>
          rows.map((r) =>
            r.id === rowId
              ? { ...r, value: text, error: `Lu (${via}) — vérifiez avant d'enregistrer.` }
              : r,
          ),
        )
      }
    } catch (err) {
      setSerialRows((rows) =>
        rows.map((r) =>
          r.id === rowId ? { ...r, error: err instanceof Error ? err.message : 'Erreur de lecture.' } : r,
        ),
      )
    } finally {
      setSerialRows((rows) => rows.map((r) => (r.id === rowId ? { ...r, scanning: false } : r)))
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const basePayload = {
      type: form.type,
      is_textile: form.is_textile ?? null,
      brand: form.brand || null,
      model: form.model || null,
      textile_length_m: form.textile_length_m || null,
      specifics: form.specifics || null,
      manufacture_date: form.manufacture_date_unknown ? null : form.manufacture_date || null,
      manufacture_date_unknown: form.manufacture_date_unknown ?? false,
      decommission_date: form.decommission_date || null,
      status: form.status,
      color: form.color || null,
      rope_rotation: form.rope_rotation || null,
      remarks: form.remarks || null,
    }

    if (isEditing) {
      const { error } = await supabase
        .from('items')
        .update({ ...basePayload, manufacturer_serial: form.manufacturer_serial || null })
        .eq('id', id)
      setSaving(false)
      if (error) {
        setError(error.message)
        return
      }
      navigate(`/materiel/${id}`)
      return
    }

    // Un ou plusieurs N° fabricant renseignés -> une fiche par numéro. Aucun
    // numéro renseigné -> une seule fiche sans N° fabricant, comme avant.
    const serials = serialRows.map((r) => r.value.trim()).filter(Boolean)
    const rows: (typeof basePayload & { manufacturer_serial: string | null })[] =
      serials.length > 0
        ? serials.map((manufacturer_serial) => ({ ...basePayload, manufacturer_serial }))
        : [{ ...basePayload, manufacturer_serial: null }]

    const { data, error } = await supabase.from('items').insert(rows).select('id')
    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    rememberNewValues()

    const ids = (data as { id: number }[]).map((r) => r.id)
    if (ids.length === 1) {
      navigate(`/materiel/${ids[0]}`)
    } else {
      navigate('/materiel')
    }
  }

  if (loading) return <p className="text-slate-500">Chargement…</p>

  return (
    <RequireAdmin>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">
          {isEditing ? `Modifier l'item #${id}` : 'Ajouter un item'}
        </h1>

        {isEditing && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-slate-900">Historique des contrôles SECT</p>
              <Link to={`/materiel/${id}`} className="text-sm text-slate-500 hover:underline">
                Ajouter un contrôle sur la fiche →
              </Link>
            </div>
            {inspections.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun contrôle enregistré.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {inspections.map((insp) => (
                  <li key={insp.id} className="text-slate-700">
                    <span className="font-mono">{insp.inspected_on}</span> — {insp.result}
                    {insp.notes && <span className="text-slate-400"> ({insp.notes})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          // Empêche la touche Entrée dans un champ texte de soumettre le
          // formulaire (comportement HTML par défaut) : un simple appui sur
          // Entrée après avoir rempli/scanné le N° fabricant enregistrait
          // l'item et changeait de page sans que ce soit voulu. Seul le clic
          // explicite sur "Enregistrer" doit soumettre.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
              e.preventDefault()
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <input
                required
                list="known-types"
                value={form.type ?? ''}
                onChange={(e) => update('type', e.target.value)}
                className="input"
              />
              <datalist id="known-types">
                {knownTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>

            <Field label="Statut">
              <select
                required
                value={form.status ?? 'stock'}
                onChange={(e) => update('status', e.target.value as Item['status'])}
                className="input"
              >
                {ITEM_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Marque">
              <input
                list="known-brands"
                value={form.brand ?? ''}
                onChange={(e) => update('brand', e.target.value)}
                className="input"
              />
              <datalist id="known-brands">
                {knownBrands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>

            <Field label="Modèle">
              <input
                list="known-models"
                value={form.model ?? ''}
                onChange={(e) => update('model', e.target.value)}
                className="input"
              />
              <datalist id="known-models">
                {knownModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>

            <Field label="Longueur textile (m)">
              <input
                type="number"
                step="0.1"
                value={form.textile_length_m ?? ''}
                onChange={(e) => update('textile_length_m', e.target.valueAsNumber)}
                className="input"
              />
            </Field>

            <Field label="Coloris">
              <input
                list="known-colors"
                value={form.color ?? ''}
                onChange={(e) => update('color', e.target.value)}
                className="input"
              />
              <datalist id="known-colors">
                {knownColors.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            {isEditing ? (
              <div className="col-span-2">
                <Field label="N° fabricant">
                  <div className="flex gap-2">
                    <input
                      value={form.manufacturer_serial ?? ''}
                      onChange={(e) => update('manufacturer_serial', e.target.value)}
                      className="input font-mono text-base tracking-wide"
                    />
                    <label className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer">
                      {scanning ? '…' : '📷 Scanner'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleScanSerial}
                        disabled={scanning}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {scanError && <p className="mt-1 text-xs text-amber-700">{scanError}</p>}
                </Field>
              </div>
            ) : (
              <div className="col-span-2">
                <Field
                  label={
                    serialRows.length > 1
                      ? `N° fabricant — ${serialRows.length} items seront créés`
                      : 'N° fabricant'
                  }
                >
                  <div className="space-y-2">
                    {serialRows.map((row, i) => (
                      <div key={row.id}>
                        <div className="flex gap-2">
                          <input
                            value={row.value}
                            onChange={(e) => updateSerialRow(row.id, e.target.value)}
                            placeholder={serialRows.length > 1 ? `Item ${i + 1}` : undefined}
                            className="input font-mono text-base tracking-wide"
                          />
                          <label className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 cursor-pointer">
                            {row.scanning ? '…' : '📷'}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => handleScanSerialRow(row.id, e)}
                              disabled={row.scanning}
                              className="hidden"
                            />
                          </label>
                          {serialRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSerialRow(row.id)}
                              className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
                              aria-label="Retirer ce numéro"
                            >
                              ×
                            </button>
                          )}
                          {i === serialRows.length - 1 && (
                            <button
                              type="button"
                              onClick={addSerialRow}
                              className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                              aria-label="Ajouter un autre N° fabricant"
                              title="Créer un autre item identique avec un N° fabricant différent"
                            >
                              +
                            </button>
                          )}
                        </div>
                        {row.error && <p className="mt-1 text-xs text-amber-700">{row.error}</p>}
                      </div>
                    ))}
                  </div>
                  {serialRows.length > 1 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Un item identique (même type/marque/modèle/coloris) sera créé pour chaque N°
                      fabricant renseigné ci-dessus.
                    </p>
                  )}
                </Field>
              </div>
            )}

            <Field label="Date de fabrication">
              <input
                type="date"
                disabled={form.manufacture_date_unknown ?? false}
                value={form.manufacture_date ?? ''}
                onChange={(e) => update('manufacture_date', e.target.value)}
                className="input disabled:bg-slate-100"
              />
              <label className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                <input
                  type="checkbox"
                  checked={form.manufacture_date_unknown ?? false}
                  onChange={(e) => update('manufacture_date_unknown', e.target.checked)}
                />
                Date inconnue
              </label>
            </Field>

            <Field label="Date sortie de service">
              <input
                type="date"
                value={form.decommission_date ?? ''}
                onChange={(e) => update('decommission_date', e.target.value)}
                className="input"
              />
            </Field>

            {form.type === 'Corde' && (
              <Field label="Rotation / stock tampon">
                <input
                  value={form.rope_rotation ?? ''}
                  onChange={(e) => update('rope_rotation', e.target.value)}
                  className="input"
                />
              </Field>
            )}
          </div>

          <Field label="Remarques & spécificité">
            <textarea
              value={form.specifics ?? ''}
              onChange={(e) => update('specifics', e.target.value)}
              className="input"
              rows={2}
            />
          </Field>

          <Field label="Remarques">
            <textarea
              value={form.remarks ?? ''}
              onChange={(e) => update('remarks', e.target.value)}
              className="input"
              rows={2}
            />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 text-white px-4 py-2 font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-md border border-slate-300 px-4 py-2 hover:bg-slate-100"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </RequireAdmin>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  )
}
