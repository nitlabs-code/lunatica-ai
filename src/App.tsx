import { lazy, Suspense, useEffect, useState } from 'react'
import { LogOut, RefreshCw, WifiOff } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LogoMark } from './components/ui/Logo'
import { useAuth } from './contexts/AuthContext'
import { useProfile } from './contexts/ProfileContext'
import { useTheme } from './contexts/ThemeContext'
import { useToast } from './contexts/ToastContext'
import { isEmailVerified } from './lib/auth'

const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then((module) => ({ default: module.ChatPage })))
const GuestPage = lazy(() => import('./pages/GuestPage').then((module) => ({ default: module.GuestPage })))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then((module) => ({ default: module.OnboardingPage })))

function LoadingScreen() {
  return <div className="app-shell flex min-h-screen items-center justify-center"><div className="loading-emblem" role="status" aria-label="Carregando a Lunatica"><LogoMark className="!h-14 !w-14" /></div></div>
}

function ProfileRecovery({ message }: { message?: string | null }) {
  const { refreshProfile } = useProfile()
  const { signOut } = useAuth()
  const { showToast } = useToast()
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    setRetrying(true)
    try { await refreshProfile() }
    catch { /* O contexto mantém a tela de recuperação e a mensagem amigável. */ }
    finally { setRetrying(false) }
  }

  async function logout() {
    try { await signOut() }
    catch { showToast('Não foi possível sair agora. Recarregue a página e tente novamente.', 'error') }
  }

  return (
    <div className="app-shell flex min-h-dvh items-center justify-center p-5">
      <section className="recovery-card" role="alert">
        <span className="recovery-icon"><WifiOff className="h-5 w-5" /></span>
        <span className="micro-label">CONEXÃO INTERROMPIDA</span>
        <h1>Não conseguimos abrir seu espaço.</h1>
        <p>{message || 'Seu perfil não ficou disponível. Isso costuma ser temporário e nenhuma conversa foi perdida.'}</p>
        <div>
          <button type="button" className="btn-primary" onClick={() => void retry()} disabled={retrying}><RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} /> {retrying ? 'Tentando…' : 'Tentar novamente'}</button>
          <button type="button" className="btn-secondary" onClick={() => void logout()}><LogOut className="h-4 w-4" /> Sair</button>
        </div>
      </section>
    </div>
  )
}

function PrivateArea({ conversation = false }: { conversation?: boolean }) {
  const { session } = useAuth()
  const { profile, loading, error } = useProfile()
  const { setTheme } = useTheme()

  useEffect(() => {
    if (profile?.theme) setTheme(profile.theme)
  }, [profile?.theme, setTheme])

  if (!session) return conversation ? <Navigate to="/" replace /> : <GuestPage />
  if (loading) return <LoadingScreen />
  if (!profile) return <ProfileRecovery message={error} />
  if (!profile.onboarding_completed) return <Navigate to="/onboarding" replace />
  return <ChatPage />
}

function OnboardingRoute() {
  const { session } = useAuth()
  const { profile, loading, error } = useProfile()
  if (!session) return <Navigate to="/login?mode=signup" replace />
  if (loading) return <LoadingScreen />
  if (!profile) return <ProfileRecovery message={error} />
  if (profile.onboarding_completed) return <Navigate to="/" replace />
  return <OnboardingPage />
}

function PublicAuth() {
  const { session, recovering } = useAuth()
  return session && !recovering ? <Navigate to="/" replace /> : <AuthPage />
}

export default function App() {
  const { loading, recovering, session, user } = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    if (loading) return
    const query = new URLSearchParams(window.location.search)
    const authMarker = query.get('auth')
    const authError = query.get('auth_error')
    if ((authMarker === 'verified' || authError) && isEmailVerified(user)) {
      showToast(authError ? 'Seu email já estava confirmado. Você pode continuar.' : 'Email confirmado com sucesso.', 'success')
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash || '#/'}`)
      return
    }
    if (authMarker === 'verified' && !session) window.location.hash = '/login'
  }, [loading, session, showToast, user])

  if (loading) return <LoadingScreen />

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<PublicAuth />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route path="/" element={recovering ? <Navigate to="/login" replace /> : <PrivateArea />} />
        <Route path="/chat/:conversationId" element={recovering ? <Navigate to="/login" replace /> : <PrivateArea conversation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
