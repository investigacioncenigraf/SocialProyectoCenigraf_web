import { useEffect, useRef, useState, type FormEvent } from 'react'
import { sendVerification, verifyEmailCode, type EmailChallenge } from '../lib/emailVerification'

type Props = { name: string; initialChallenge: EmailChallenge; onBack: (email: string) => void; onVerified: (challenge: EmailChallenge) => Promise<void>; onContinue: (challenge: EmailChallenge) => Promise<void> }
export default function VerifyEmailForm({ name, initialChallenge, onBack, onVerified, onContinue }: Props) {
  const [challenge, setChallenge] = useState(initialChallenge)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState(false)
  const [created, setCreated] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [resendAt, setResendAt] = useState(() => Date.now() + 60000)
  const lock = useRef(false)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const greeting = name.trim() ? `${name.trim()}, ` : ''
  const title = created ? 'tu usuario se ha creado satisfactoriamente' : verified ? 'estamos creando tu perfil' : '¡valida tu correo!'
  const expired = now >= Date.parse(challenge.expiresAt)
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000))
  async function validate(event: FormEvent) {
    event.preventDefault()
    if (lock.current || created) return
    if (!verified && !/^[A-Z0-9]{8}$/.test(code)) { setMessage('Ingresa el código alfanumérico de 8 caracteres.'); return }
    lock.current = true; setBusy(true); setMessage(`${greeting}estamos validando tu código…`)
    try {
      if (!verified) { await verifyEmailCode(challenge, code); setVerified(true); setCode('') }
      setMessage(`${greeting}tu correo está validado. Estamos preparando tu perfil…`)
      await onVerified(challenge)
      setCreated(true)
      setMessage('¡Bienvenido a NIWI MU! Ya puedes continuar y empezar a explorar.')
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo validar el código.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function resend() {
    if (lock.current || cooldown || verified) return
    lock.current = true; setBusy(true); setMessage(`${greeting}te estamos enviando un nuevo código…`)
    try { const next = await sendVerification(challenge.email); setChallenge(next); setCode(''); setResendAt(Date.now() + 60000); setMessage(`${greeting}ya tienes un nuevo código en tu correo. Usa este en lugar del anterior.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo reenviar el código.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function continueRegistration() {
    if (lock.current || !created) return
    lock.current = true; setBusy(true); setMessage(`${greeting}estamos preparando tu bienvenida…`)
    try { await onContinue(challenge) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo continuar.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <form id="form_verify_email" className="login-form verify-form" onSubmit={validate} noValidate>
    <h2>{name.trim() && <><span className="personalized-name">{name.trim()}</span>, </>}{title}</h2>
    <p className="verification-description">{created ? <>Tu perfil está asociado a <strong>{challenge.email}</strong>. Nos alegra tenerte aquí.</> : verified ? <>Tu correo <strong>{challenge.email}</strong> ya está confirmado. Estamos a un paso de darte la bienvenida.</> : <>Enviamos tu código a <strong>{challenge.email}</strong>. Revisa tu bandeja de entrada y la carpeta de correo no deseado para dar el siguiente paso.</>}</p>
    {!verified && <>
      <div className="field"><label htmlFor="text_box_verification_code">Código de validación</label><input id="text_box_verification_code" autoComplete="one-time-code" placeholder="8 caracteres" maxLength={8} value={code} readOnly={busy} aria-describedby="text_validation_code code_expiration" onChange={e => { setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8)); setMessage('') }} /></div>
      <p id="code_expiration" className="verification-description">{expired ? 'El código venció. Solicita uno nuevo.' : 'El código vence en 10 minutos desde su envío.'}</p>
      <button id="btn_verify_email" className="login-button" disabled={busy || expired} type="submit">{busy ? 'Procesando…' : 'Validar correo'}</button>
      <button id="btn_resend_code" className="verification-resend" disabled={busy || cooldown > 0} type="button" onClick={resend}>{cooldown ? `Reenviar en ${cooldown} s` : 'Reenviar código'}</button>
    </>}
    <p id="text_validation_code" className="validation" role="status" aria-live="polite">{message}</p>
    {verified && !created && <button id="btn_retry_profile" className="login-button" type="submit" disabled={busy}>{busy ? 'Creando perfil…' : 'Reintentar crear perfil'}</button>}
    {created && <button id="btn_continue" className="login-button" type="button" disabled={busy} onClick={continueRegistration}>{busy ? 'Ingresando…' : 'Continuar'}</button>}
    <nav className="account-links"><a href="#registrarse" onClick={e => { e.preventDefault(); if (!busy) onBack(challenge.email) }}>Volver al registro</a></nav>
  </form>
}
