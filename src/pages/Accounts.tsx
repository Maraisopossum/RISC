import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import RequireAdmin from '../components/RequireAdmin'
import type { Profile } from '../lib/types'

const ROLES: { value: Profile['role']; label: string; description: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Accès complet : création/modification/suppression, contrôles, comptes.' },
  { value: 'controleur', label: 'Contrôleur', description: "Peut ajouter des contrôles SECT et scanner, mais pas créer/modifier un item." },
  { value: 'lecture', label: 'Lecture', description: 'Consultation uniquement (comme le public, mais avec un compte nominatif).' },
]

interface CreatedAccount {
  email: string
  password: string
  role: string
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [identifier, setIdentifier] = useState('')
  const [role, setRole] = useState<Profile['role']>('lecture')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedAccount | null>(null)

  const [roleSaving, setRoleSaving] = useState<string | null>(null)

  async function loadAccounts() {
    const { data, error } = await supabase.from('profiles').select('*').order('email')
    if (error) setError(error.message)
    setAccounts((data as Profile[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = identifier.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)
    setCreated(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée, reconnectez-vous.')

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier: trimmed, role }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Erreur (${res.status})`)

      setCreated(body as CreatedAccount)
      setIdentifier('')
      setRole('lecture')
      loadAccounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.')
    } finally {
      setCreating(false)
    }
  }

  async function handleRoleChange(id: string, newRole: Profile['role']) {
    setRoleSaving(id)
    setError(null)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    setRoleSaving(null)
    if (error) {
      setError(error.message)
      return
    }
    loadAccounts()
  }

  return (
    <RequireAdmin>
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Comptes</h1>
          <p className="text-slate-500">
            Créer des comptes et gérer les rôles. La consultation de l'inventaire ne nécessite
            aucun compte — un compte ne sert qu'à ajouter/modifier des données.
          </p>
        </div>

        <form onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <p className="font-medium text-slate-900">Créer un compte</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Identifiant (email ou simple nom)
              </label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="ex: jdupont ou j.dupont@fire.brussels"
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rôle</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Profile['role'])}
                className="input"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {ROLES.find((r) => r.value === role)?.description}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? 'Création…' : 'Créer le compte'}
          </button>

          {created && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 space-y-1">
              <p className="font-medium">Compte créé — notez ces identifiants maintenant :</p>
              <p>
                Identifiant : <span className="font-mono">{created.email}</span>
              </p>
              <p>
                Mot de passe : <span className="font-mono">{created.password}</span>
              </p>
              <p className="text-xs text-emerald-700">
                Le mot de passe ne sera plus jamais affiché — transmettez-le à la personne
                concernée dès maintenant.
              </p>
            </div>
          )}
        </form>

        <div>
          <p className="font-medium text-slate-900 mb-3">Comptes existants</p>
          {loading ? (
            <p className="text-slate-500">Chargement…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Identifiant</th>
                    <th className="px-4 py-2">Rôle</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">{a.email}</td>
                      <td className="px-4 py-2">
                        <select
                          value={a.role}
                          disabled={roleSaving === a.id}
                          onChange={(e) => handleRoleChange(a.id, e.target.value as Profile['role'])}
                          className="rounded-md border border-slate-300 px-2 py-1"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RequireAdmin>
  )
}
