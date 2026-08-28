import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, isAdmin } = useAuth()

  if (loading) return <p className="text-slate-500">Chargement…</p>

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        Cette action est réservée aux comptes admin. Connectez-vous avec un
        compte admin pour continuer.
      </div>
    )
  }

  return <>{children}</>
}
