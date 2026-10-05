import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { syncAuth0Profile } from './lib/auth0Profile'
import { auth0Configured } from './lib/auth0'
import type { Session } from '@supabase/supabase-js'
import { supabase, authErrorMessage } from './lib/supabase'
import googleIcon from './assets/google-icon-logo-svgrepo-com.svg'
import { isSenaEmail, senaEmailMessage } from './lib/email'
import VerifyEmailForm from './components/VerifyEmailForm'
import { completeRegistration, type EmailChallenge, type RegistrationDraft } from './lib/emailVerification'
import SetRoleAccess from './components/SetRoleAccess'
import Home from './components/Home'
import PasswordRecovery from './components/PasswordRecovery'
import RegisterForm from './components/RegisterForm'
import './App.css'

function App() {
  const [view, setView] = useState<'login' | 'register' | 'verify' | 'home' | 'recover' | 'reset' | 'role'>(() => window.location.pathname === '/setRoleAccess' ? 'role' : window.location.pathname === '/restablecer-contrasena' ? 'reset' : 'login')
  const [challenge, setChallenge] = useState<EmailChallenge | null>(null)
  const draft = useRef<RegistrationDraft | null>(null)
  const [welcomeName, setWelcomeName] = useState('')
  const [registrationName, setRegistrationName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const { isAuthenticated, isLoading: auth0Loading, user: googleUser, loginWithRedirect, logout, getIdTokenClaims, error: googleError } = useAuth0()
  const googleInitializing = auth0Configured && auth0Loading
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(Boolean(supabase))
  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setInitializing(false)
    })
    return () => subscription.unsubscribe()
  }, [])
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [invalidField, setInvalidField] = useState<'user' | 'password' | null>(null)
  const userInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function restoreHome() {
      if (view !== 'login') return
      try {
        let name = ''
        if (session && supabase) {
          const { data, error } = await supabase.auth.getUser()
          if (error || !data.user) throw new Error('Inicia sesión nuevamente para ingresar.')
          name = [data.user.user_metadata.nombres, data.user.user_metadata.apellidos].filter(Boolean).join(' ') || data.user.email || ''
        } else if (auth0Configured && isAuthenticated) {
          const claims = await getIdTokenClaims()
          if (!claims?.__raw) throw new Error('No se pudo obtener tu identidad de Auth0.')
          name = await syncAuth0Profile(claims.__raw)
        } else return
        if (!cancelled) { setWelcomeName(name); setView('home'); window.history.replaceState({}, '', '/Home') }
      } catch (error) { if (!cancelled) { setMessage(error instanceof Error ? error.message : 'No se pudo validar la sesión. Inicia sesión nuevamente.'); window.history.replaceState({}, '', '/') } }
    }
    void restoreHome()
    return () => { cancelled = true }
  }, [session, isAuthenticated, getIdTokenClaims, view])

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || initializing || googleInitializing) return
    if (!user.trim()) {
      setMessage('Ingresa tu correo electrónico.')
      setInvalidField('user')
      userInput.current?.focus()
      return
    }
    if (!isSenaEmail(user)) {
      setMessage(senaEmailMessage)
      setInvalidField('user')
      userInput.current?.focus()
      return
    }
    if (!password) {
      setMessage('Ingresa tu contraseña.')
      setInvalidField('password')
      passwordInput.current?.focus()
      return
    }
    setInvalidField(null)
    if (!supabase) { setMessage('Falta configurar la conexión con Supabase.'); return }
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: user.trim(), password })
      if (error) setMessage(authErrorMessage(error))
      else setPassword('')
    } catch { setMessage('No se pudo establecer conexión con el servidor.') }
    finally { setLoading(false) }
  }

  async function signInGoogle() {
    if (loading || googleInitializing) return
    if (!auth0Configured) { setMessage('Falta configurar Auth0 para iniciar sesión con Google.'); return }
    setLoading(true)
    setMessage('')
    try {
      await loginWithRedirect({ authorizationParams: { connection: 'google-oauth2' } })
    } catch { setMessage('No se pudo iniciar el acceso con Google. Inténtalo nuevamente.'); setLoading(false) }
  }

  async function signOut() {
    if (loading) return
    setLoading(true)
    try {
      if (session && supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) setMessage(authErrorMessage(error))
      else { setMessage(''); setView('login'); setWelcomeName(''); draft.current = null; window.history.replaceState({}, '', '/') }
      if (error) return
      }
      if (isAuthenticated) await logout({ logoutParams: { returnTo: window.location.origin } })
    } catch { setMessage('No se pudo cerrar la sesión. Inténtalo nuevamente.') }
    finally { setLoading(false) }
  }

  async function createVerifiedProfile(next: EmailChallenge) {
    const profile = draft.current
    if (!profile) throw new Error('Vuelve al registro y completa los datos para crear tu perfil.')
    await completeRegistration(next, profile)
  }

  async function finishRegistration(next: EmailChallenge) {
    const profile = draft.current
    if (!profile || !supabase) throw new Error('Vuelve al registro y completa los datos para crear tu perfil.')
    const { error } = await supabase.auth.signInWithPassword({ email: next.email, password: profile.password })
    if (error) throw new Error('Tu perfil fue creado. Vuelve al inicio e ingresa con tu correo y contraseña.')
    const { data, error: validationError } = await supabase.auth.getUser()
    if (validationError || !data.user) throw new Error('Tu perfil fue creado, pero no se pudo validar la sesión. Inicia sesión nuevamente.')
    const welcome = [data.user.user_metadata.nombres, data.user.user_metadata.apellidos].filter(Boolean).join(' ') || next.email
    draft.current = null
    setWelcomeName(welcome)
    setChallenge(null); setView('home')
    window.history.replaceState({}, '', '/Home')
  }

  const roleIdentity = useCallback(async () => {
    if (session && supabase) {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) throw new Error('Inicia sesión para cambiar tu rol.')
      return { accessToken: data.session.access_token }
    }
    if (auth0Configured && isAuthenticated) {
      const claims = await getIdTokenClaims()
      if (!claims?.__raw) throw new Error('Inicia sesión con Google nuevamente.')
      await syncAuth0Profile(claims.__raw)
      return { idToken: claims.__raw }
    }
    throw new Error('Inicia sesión y después abre /setRoleAccess.')
  }, [session, isAuthenticated, getIdTokenClaims])

  function clearValidation() {
    setInvalidField(null)
    setMessage('')
  }

  if (view === 'home') return <Home getIdentity={roleIdentity} name={welcomeName} email={session?.user.email ?? googleUser?.email ?? ''} picture={!session && isAuthenticated ? googleUser?.picture : undefined} busy={loading} message={message} onSignOut={signOut} onChangeRole={() => { setView('role'); setMessage(''); window.history.pushState({}, '', '/setRoleAccess') }} />

  return (
    <main id="seccion_ui_login" className={`login-page${view === 'register' ? ' register-page' : ['verify', 'recover', 'reset', 'role'].includes(view) ? ' verification-page' : ''}`}>
      <section id="seccion_corporative_image" className="corporate-panel" aria-label="Identidad visual de NIWI MU">
        {/* Sustituir este recurso por logo_de_NIWI_MU_01.png cuando esté disponible. */}
        <svg className="corporate-image" viewBox="0 0 180 180" fill="none" aria-label="Espacio para la imagen corporativa" role="img">
          <path d="M9 9H171V171H9Z" stroke="currentColor" strokeWidth="16" />
          <circle cx="119" cy="60" r="23" stroke="currentColor" strokeWidth="16" />
          <path d="M9 113L45 77L104 136L141 99L171 129" stroke="currentColor" strokeWidth="16" />
        </svg>
      </section>
      <section id={view === 'register' ? 'seccion_register' : view === 'verify' ? 'seccion_verify_email' : 'seccion_login'} className="login-panel" aria-label={view === 'register' ? 'Crear perfil en NIWI MU' : view === 'verify' ? 'Validar correo en NIWI MU' : 'Iniciar sesión en NIWI MU'}>
        <h1 id="image_logo_prompt" className="wordmark">NIWI MU</h1>
        {view === 'role' ? <SetRoleAccess ready={!initializing && !googleInitializing} getIdentity={roleIdentity} onSaved={name => { setWelcomeName(name); setView('home'); window.history.replaceState({}, '', '/Home') }} /> : view === 'recover' || view === 'reset' ? <PasswordRecovery initialEmail={registerEmail} reset={view === 'reset'} onBack={email => { setUser(email); setView('login'); window.history.replaceState({}, '', '/'); clearValidation() }} /> : view === 'verify' && challenge ? <VerifyEmailForm initialChallenge={challenge} name={registrationName} onVerified={createVerifiedProfile} onContinue={finishRegistration} onBack={email => { draft.current = null; setRegisterEmail(email); setChallenge(null); setView('register') }} /> : view === 'register' ? <RegisterForm onVerificationSent={(next, profile) => { draft.current = profile; setRegistrationName(profile.nombres); setChallenge(next); setView('verify') }} initialEmail={registerEmail} onBack={email => { setUser(email); setView('login'); clearValidation() }} /> : <form className="login-form" onSubmit={submitLogin} noValidate>
          <div className="field">
            <label id="text_tittle_user" htmlFor="text_box_user">Correo electrónico</label>
            <input ref={userInput} id="text_box_user" name="usuario" type="email" autoComplete="username" placeholder="Correo electrónico" disabled={loading || initializing || googleInitializing} value={user} onChange={event => { setUser(event.target.value); clearValidation() }} aria-invalid={invalidField === 'user'} aria-describedby="text_validation" />
          </div>
          <div className="field password-field">
            <label id="text_tittle_password" htmlFor="text_box_password">Contraseña</label>
            <div className="password-control">
              <input ref={passwordInput} id="text_box_password" name="password" disabled={loading || initializing || googleInitializing} type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Contraseña" value={password} onChange={event => { setPassword(event.target.value); clearValidation() }} aria-invalid={invalidField === 'password'} aria-describedby="text_validation" />
              <button id="btn_psw" className="password-toggle" type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg>
              </button>
            </div>
          </div>
          <button id="btn_login" className="login-button" type="submit" disabled={loading || initializing || googleInitializing}>{initializing ? 'Conectando…' : loading ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
          <span id="text_conector" className="connector">ó</span>
          <button id="btn_login_auth0" className="google-button" type="button" disabled={loading || googleInitializing} onClick={signInGoogle}>
            <span>Iniciar sesión con<br />Google</span><img src={googleIcon} alt="" aria-hidden="true" />
          </button>
          <p id="text_validation" className="validation" role="status" aria-live="polite" aria-atomic="true">{message || (googleError ? 'No se pudo completar el acceso con Auth0. Revisa la configuración e inténtalo nuevamente.' : '')}</p>
          <nav className="account-links" aria-label="Opciones de cuenta">
            <a id="Link_forgot" href="#recuperar-contrasena" onClick={event => { event.preventDefault(); setRegisterEmail(user.trim()); setPassword(''); clearValidation(); setView('recover') }}>Olvidé mi contraseña</a>
            <a id="Link_register" href="#registrarse" onClick={event => { event.preventDefault(); setRegisterEmail(isSenaEmail(user) ? user.trim() : ''); setPassword(''); clearValidation(); setView('register') }}>Registrarse</a>
          </nav>
        </form>}
      </section>
    </main>
  )
}

export default App
