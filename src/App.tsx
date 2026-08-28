import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ItemsList from './pages/ItemsList'
import ItemDetail from './pages/ItemDetail'
import ItemForm from './pages/ItemForm'
import Login from './pages/Login'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="materiel" element={<ItemsList />} />
            <Route path="materiel/nouveau" element={<ItemForm />} />
            <Route path="materiel/:id" element={<ItemDetail />} />
            <Route path="materiel/:id/modifier" element={<ItemForm />} />
            <Route path="connexion" element={<Login />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
