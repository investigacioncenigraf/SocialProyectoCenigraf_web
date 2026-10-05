import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const roleClasses: Record<string, string> = { Desarrollador: 'developer', Admin: 'admin', Instructor: 'instructor', Aprendiz: 'apprentice', Visitante: 'visitor' }

type Props = { getIdentity: () => Promise<{ idToken: string } | { accessToken: string }>; name: string; email: string; picture?: string; busy: boolean; message: string; onSignOut: () => void; onChangeRole: () => void }
export default function Home({ getIdentity, name, email, picture, busy, message, onSignOut, onChangeRole }: Props) {
  const [role, setRole] = useState('')
  useEffect(() => {
    let cancelled = false
    async function loadRole() {
      try {
        if (!supabase) return
        const identity = await getIdentity()
        const { data, error } = await supabase.functions.invoke('set-role-access', { body: { action: 'read', ...identity } })
        if (!cancelled && !error && roleClasses[data?.profile?.rol]) setRole(data.profile.rol)
      } catch { /* Mantiene el nombre visible si no se pudo consultar el rol. */ }
    }
    void loadRole()
    return () => { cancelled = true }
  }, [getIdentity])
  const [failedPicture, setFailedPicture] = useState('')
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U'
  return <div className="home-page">
    <header className="home-header">
      <nav id="navbar_home" className="home-navbar" aria-label="Navegación principal">
        <div className="navbar-user">
          {picture && failedPicture !== picture ? <img className="navbar-avatar" src={picture} alt={`Foto de ${name}`} referrerPolicy="no-referrer" onError={() => setFailedPicture(picture)} /> : <span className="navbar-avatar navbar-initials" role="img" aria-label={`Avatar de ${name}`}>{initials}</span>}
          <div className="navbar-user-details"><span className="navbar-name" title={role ? `${name} - ${role}` : name}>{name}{role && <> - <span className={`navbar-role navbar-role-${roleClasses[role]}`}>{role}</span></>}</span><span className="navbar-email" title={email}>{email}</span></div>
        </div>
        <details ref={menu} className="navbar-menu" onKeyDown={event => { if (event.key === 'Escape' && menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus() } }}>
          <summary aria-label="Abrir menú de cuenta"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></summary>
          <div className="navbar-dropdown">
            <button id="btn_menu_change_role" type="button" disabled={busy} onClick={onChangeRole}>Cambiar rol</button>
            <button id="btn_menu_sign_out" className="menu-sign-out" type="button" disabled={busy} onClick={onSignOut}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
          </div>
        </details>
      </nav>
    </header>
    <main id="seccion_home" className="home-content">
      <h1 className="wordmark">NIWI MU</h1>
      <p>Bienvenido a NIWI MU</p>
      <p>{name}</p>
      <p className="validation" role="status">{message}</p>
    </main>
  </div>
}
