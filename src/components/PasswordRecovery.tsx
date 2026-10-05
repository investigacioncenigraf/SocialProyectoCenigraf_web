import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isSenaEmail, senaEmailMessage } from '../lib/email'

type Props = { initialEmail: string; reset: boolean; onBack: (email: string) => void }
export default function PasswordRecovery({ initialEmail, reset, onBack }: Props) {
  const [stage, setStage] = useState<'email' | 'code' | 'password'>(reset ? 'password' : 'email')
  const [code, setCode] = useState('')
  const [codeLength, setCodeLength] = useState(6)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [recipient, setRecipient] = useState<{ name: string; email: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token_hash') || '')
  const lock = useRef(false)
  const recovery = useRef<ReturnType<typeof createClient> | null>(null)
  const verified = useRef(false)
  useEffect(() => {
    if (reset) window.history.replaceState({}, '', '/restablecer-contrasena')
    return () => { void recovery.current?.auth.signOut({ scope: 'local' }) }
  }, [reset])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (lock.current || done) return
    if (stage === 'email' && !isSenaEmail(email)) { setMessage(senaEmailMessage); return }
    if (stage === 'password' && (!password || password !== confirmation)) { setMessage(!password ? 'Ingresa tu nueva contraseña.' : 'Las contraseñas no coinciden.'); return }
    if (stage === 'code' && !new RegExp(`^[0-9]{${codeLength}}$`).test(code)) { setMessage(`Ingresa el código de ${codeLength} dígitos.`); return }
    lock.current = true; setBusy(true); setMessage('')
    try {
      if (!supabase) throw new Error('Falta configurar Supabase.')
      if (stage === 'email') {
        const { data, error } = await supabase.functions.invoke('email-verification', { body: { action: 'recover', email: email.trim().toLowerCase() } })
        if (error) {
          const response = error.context instanceof Response ? await error.context.json().catch(() => null) : null
          throw new Error(response?.message || 'No se pudo enviar la solicitud. Inténtalo nuevamente.')
        }
        if (!data?.sent) throw new Error('No se pudo completar la solicitud.')
        setRecipient({ name: typeof data.name === 'string' ? data.name : '', email: typeof data.email === 'string' ? data.email : email.trim().toLowerCase() }); setCodeLength(Number.isInteger(data.codeLength) && data.codeLength >= 6 && data.codeLength <= 10 ? data.codeLength : 6); setStage('code'); setMessage('')
      } else if (stage === 'code') {
        recovery.current ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
        const { error } = await recovery.current.auth.verifyOtp({ email: recipient?.email || email.trim().toLowerCase(), token: code, type: 'recovery' })
        if (error) throw new Error('El código no es correcto, venció o ya fue utilizado. Compruébalo o solicita uno nuevo.')
        verified.current = true; setCode(''); setStage('password'); setMessage('Correo validado. Ahora puedes elegir tu nueva contraseña.')
        window.history.pushState({}, '', '/restablecer-contrasena')
      } else {
        if (!verified.current && !token) throw new Error('El enlace no es válido. Solicita un nuevo correo de recuperación.')
        recovery.current ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
        if (!verified.current) {
          const { error } = await recovery.current.auth.verifyOtp({ token_hash: token, type: 'recovery' })
          if (error) throw new Error('El enlace venció o ya fue utilizado. Solicita uno nuevo.')
          verified.current = true
        }
        const { error } = await recovery.current.auth.updateUser({ password })
        if (error) throw new Error(error.code === 'same_password' ? 'Elige una contraseña diferente a la anterior.' : 'No se pudo cambiar la contraseña. Comprueba que cumpla la política de seguridad de tu cuenta.')
        await recovery.current.auth.signOut({ scope: 'local' })
        setPassword(''); setConfirmation(''); setDone(true); setMessage('Tu contraseña se restableció correctamente. Ya puedes iniciar sesión con la nueva contraseña.')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la solicitud.') }
    finally { lock.current = false; setBusy(false) }
  }
  const checks = [password.length >= 8, /[a-z]/i.test(password), /\d/.test(password), /[^a-z0-9\s]/i.test(password)]
  const score = checks.filter(Boolean).length
  return <form className="login-form verify-form recovery-form" onSubmit={submit} noValidate>
    <h2>{recipient?.name && <><span className="personalized-name">{recipient.name}</span>, </>}{done ? 'tu contraseña está lista' : stage === 'password' ? 'crea tu nueva contraseña' : stage === 'code' ? 'valida tu correo' : 'Recupera tu acceso'}</h2>
    {!done && <p className="verification-description">{stage === 'password' ? 'Estás a un paso de volver a NIWI MU.' : stage === 'code' ? <>Enviamos un código para restablecer tu contraseña a <strong className="recovery-recipient-email">{recipient?.email}</strong>. Revisa también el correo no deseado.</> : 'Escribe tu correo institucional y te enviaremos un código para restablecer tu contraseña.'}</p>}
    {!done && (stage === 'password' ? <>
      {['Nueva contraseña', 'Confirmar contraseña'].map((label, index) => <div className="field" key={label}><label htmlFor={`text_box_reset_${index}`}>{label}</label><input id={`text_box_reset_${index}`} type={visible ? 'text' : 'password'} autoComplete="new-password" readOnly={busy} value={index ? confirmation : password} onChange={e => { (index ? setConfirmation : setPassword)(e.target.value); setMessage('') }} aria-describedby="text_validation_recovery" /></div>)}
      <button type="button" className="verification-resend" onClick={() => setVisible(!visible)} aria-pressed={visible}>{visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}</button>
      <div className="password-strength" data-strength={!password ? 'neutral' : score <= 2 ? 'weak' : score === 3 ? 'medium' : 'strong'}><div className="strength-bars" aria-hidden="true">{checks.map((_, i) => <span key={i} className={password && i < Math.max(1, score) ? 'active' : ''} />)}</div><p>Sugerido: 8 caracteres, una letra, un número y un símbolo.</p></div>
    </> : stage === 'code' ? <div className="field"><label htmlFor="text_box_recovery_code">Código de validación</label><input id="text_box_recovery_code" inputMode="numeric" autoComplete="one-time-code" placeholder={`${codeLength} dígitos`} maxLength={codeLength} readOnly={busy} value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, codeLength)); setMessage('') }} aria-describedby="text_validation_recovery" /></div> : <div className="field"><label htmlFor="text_box_recovery_email">Correo electrónico</label><input id="text_box_recovery_email" type="email" autoComplete="email" value={email} readOnly={busy} onChange={e => { setEmail(e.target.value); setMessage('') }} aria-describedby="text_validation_recovery" /></div>)}
    <p id="text_validation_recovery" className="validation" role="status" aria-live="polite">{message}</p>
    {!done && <button className="login-button" id="btn_password_recovery" type="submit" disabled={busy}>{busy ? 'Procesando…' : stage === 'password' ? 'Guardar contraseña' : stage === 'code' ? 'Validar código' : 'Enviar código'}</button>}
    {!done && stage === 'code' && <button type="button" className="verification-resend" disabled={busy} onClick={() => { setStage('email'); setCode(''); setMessage('') }}>Cambiar correo o solicitar otro código</button>}
    <nav className="account-links"><a href="#login" onClick={e => { e.preventDefault(); if (!busy) onBack(email) }}>Volver a iniciar sesión</a></nav>
  </form>
}
