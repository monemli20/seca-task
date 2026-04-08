
import { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import UserManagement from './pages/UserManagement'
import TaskDetail from './pages/TaskDetail'
import TeamStats from './pages/TeamStats'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './supabase'

// Giriş yapılmamışsa Login sayfasına yönlendir
function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" />
}

// Rol bazlı yönlendirme
function RoleBasedRoute() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (user) {
      // Kullanıcı profilini çek
      console.log('🔍 Fetching profile for user:', user.id)

      supabase
        .from('profiles')
        .select('role, full_name, username')
        .eq('id', user.id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('❌ Profile fetch error:', error)
            setError(error.message)
            setLoading(false)
            return
          }

          console.log('✅ Profile loaded:', data)
          console.log('👤 User role:', data?.role)

          setProfile(data)
          setLoading(false)
        })
        .catch((err) => {
          console.error('❌ Unexpected error:', err)
          setError(err.message)
          setLoading(false)
        })
    }
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Profil Yüklenemedi</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg"
          >
            Yeniden Dene
          </button>
        </div>
      </div>
    )
  }

  console.log('🔀 Routing decision - Role:', profile?.role)

  // registration_admin rolü UserManagement'a yönlendirilir
  if (profile?.role === 'registration_admin') {
    console.log('➡️ Redirecting to UserManagement')
    return <UserManagement />
  }

  // Diğer tüm roller Dashboard'a gider
  console.log('➡️ Redirecting to Dashboard')
  return <Dashboard />
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <PrivateRoute>
              <RoleBasedRoute />
            </PrivateRoute>
          } />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <RoleBasedRoute />
            </PrivateRoute>
          } />
          <Route path="/tasks/:taskId" element={
            <PrivateRoute>
              <TaskDetail />
            </PrivateRoute>
          } />
          <Route path="/team-stats" element={
            <PrivateRoute>
              <TeamStats />
            </PrivateRoute>
          } />
          <Route path="/projects" element={
            <PrivateRoute>
              <Projects />
            </PrivateRoute>
          } />
          <Route path="/projects/:projectId" element={
            <PrivateRoute>
              <ProjectDetail />
            </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  )
}

export default App
