import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
const roles = ['Instructor', 'Aprendiz', 'Visitante', 'Admin', 'Desarrollador']
type Identity = { idToken: string } | { accessToken: string }
type Profile = { name: string; rol: string }
async function roleServiceError(error: { context?: unknown }, fallback: string) {
  if (error.context instanceof Response) {
    const detail = await error.context.json().catch(() => null)
    if (detail?.code === 'NOT_FOUND') return 'Falta desplegar la función set-role-access en Supabase.'
    if (error.context.status === 401 && !detail?.message) return 'Revisa que Verify JWT with legacy secret esté desactivado en set-role-access.'
    if (typeof detail?.message === 'string') return detail.message
  }
  return fallback
}
type Props = { ready: boolean; getIdentity: () => Promise<Identity>; onSaved: (name: string) => void }
export default function SetRoleAccess({ ready, getIdentity, onSaved }: Props) {
  const [retry, setRetry] = useState(0)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [selected, setSelected] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  async function request(action: 'read' | 'update') {
    if (!supabase) throw new Error('Falta configurar Supabase.')
    const identity = await getIdentity()
    const { data, error } = await supabase.functions.invoke('set-role-access', { body: { action, ...identity, ...(action === 'update' ? { rol: selected, key } : {}) } })
    if (error) {
      throw new Error(await roleServiceError(error, 'No se pudo contactar set-role-access. Comprueba que esté desplegada y permita este origen.'))
    }
    if (typeof data?.profile?.name !== 'string' || !roles.includes(data.profile.rol)) throw new Error('Tu perfil todavía no tiene un rol válido. Revisa la configuración de roles.')
    return data.profile as Profile
  }
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    async function load() {
      try {
        if (!supabase) throw new Error('Falta configurar Supabase.')
        const identity = await getIdentity()
        const { data, error } = await supabase.functions.invoke('set-role-access', { body: { action: 'read', ...identity } })
        if (error) {
          throw new Error(await roleServiceError(error, 'No se pudo contactar set-role-access. Comprueba que esté desplegada y permita este origen.'))
        }
        if (!data?.profile || !roles.includes(data.profile.rol)) throw new Error('Tu perfil todavía no tiene un rol válido.')
        if (!cancelled) { setProfile(data.profile); setSelected(data.profile.rol) }
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : 'No se pudo consultar tu rol.') }
    }
    void load()
    return () => { cancelled = true }
  }, [ready, getIdentity, retry])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || !profile || selected === profile.rol) return
    if (!key) { setMessage('Ingresa la clave para guardar los cambios.'); return }
    lock.current = true; setBusy(true); setMessage('')
    try { const updated = await request('update'); setKey(''); onSaved(updated.name) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el rol.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <form id="form_set_role_access" className="login-form verify-form role-form" onSubmit={submit} noValidate>
    <h2>Cambia tu rol de acceso</h2>
    <p className="verification-description" aria-live="polite">{profile ? <><span className="personalized-name">{profile.name}</span>, {selected === profile.rol ? <>actualmente tienes el rol de <strong>{profile.rol}</strong>.</> : <>si guardas cambios se te concederán los permisos de acceso para el rol <strong>{selected}</strong>.</>}</> : message ? 'No se pudo cargar tu rol.' : ready ? 'Consultando tu rol…' : 'Preparando tu sesión…'}</p>
    <div className="field"><label htmlFor="select_role_access">Rol</label><select id="select_role_access" value={selected} disabled={!profile || busy} onChange={e => { setSelected(e.target.value); setMessage('') }}>{!profile && <option value="">Selecciona un rol</option>}{roles.map(rol => <option key={rol} value={rol}>{rol}</option>)}</select></div>
    <div className="field"><label htmlFor="text_box_role_key">Clave de autorización</label><input id="text_box_role_key" type="password" autoComplete="off" value={key} disabled={!profile || busy} onChange={e => { setKey(e.target.value); setMessage('') }} aria-describedby="text_validation_role" /></div>
    <p id="text_validation_role" className="validation" role="status" aria-live="polite">{message}</p>
    {!profile && message && <button className="verification-resend" type="button" onClick={() => { setMessage(''); setRetry(value => value + 1) }}>Reintentar</button>}
    <button id="btn_save_role" className="login-button" type="submit" disabled={!profile || busy || selected === profile.rol}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
  </form>
}
