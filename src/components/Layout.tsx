import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const set = () => setOnline(navigator.onLine)
    window.addEventListener('online', set)
    window.addEventListener('offline', set)
    return () => {
      window.removeEventListener('online', set)
      window.removeEventListener('offline', set)
    }
  }, [])
  return online
}

const navItem =
  'px-3 py-2 rounded-md text-sm font-medium transition-colors'
const navItemActive = 'bg-slate-900 text-white'
const navItemInactive = 'text-slate-600 hover:bg-slate-100'

export default function Layout() {
  const { session, profile, isAdmin, signOut } = useAuth()
  const online = useOnlineStatus()

  return (
    <div className="min-h-screen bg-slate-50">
      {!online && (
        <div className="bg-amber-500 text-white text-center text-sm py-1 px-3">
          Hors-ligne — seules les fiches déjà consultées restent accessibles
        </div>
      )}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold">
              R
            </span>
            <span className="font-semibold text-slate-900">Inventaire RISC</span>
          </div>

          <nav className="flex items-center gap-1 flex-wrap">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${navItem} ${isActive ? navItemActive : navItemInactive}`
              }
            >
              Tableau de bord
            </NavLink>
            <NavLink
              to="/materiel"
              className={({ isActive }) =>
                `${navItem} ${isActive ? navItemActive : navItemInactive}`
              }
            >
              Matériel
            </NavLink>
            {isAdmin && (
              <NavLink
                to="/materiel/nouveau"
                className={({ isActive }) =>
                  `${navItem} ${isActive ? navItemActive : navItemInactive}`
                }
              >
                + Ajouter
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-3 text-sm">
            {session ? (
              <>
                <span className="text-slate-500 hidden sm:inline">
                  {profile?.email} · {isAdmin ? 'Admin' : 'Lecture'}
                </span>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <NavLink
                to="/connexion"
                className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100"
              >
                Connexion admin
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
