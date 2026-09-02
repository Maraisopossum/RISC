import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

// Admin ou contrôleur : peut ajouter un contrôle SECT et utiliser le
// scanner pour retrouver une fiche existante (mais pas créer/modifier un item).
export default function RequireInspector({ children }: { children: ReactNode }) {
  const { loading, canInspect } = useAuth()

  if (loading) return <p className="text-slate-500">Chargement…</p>

  if (!canInspect) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        Cette action est réservée aux comptes admin ou contrôleur. Connectez-vous
        avec un tel compte pour continuer.
      </div>
    )
  }

  return <>{children}</>
}
