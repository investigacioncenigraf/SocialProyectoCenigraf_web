import { isSenaEmail, senaEmailMessage } from '../lib/email'
import { sendVerification, type RegistrationDraft, type EmailChallenge } from '../lib/emailVerification'
import { supabase } from '../lib/supabase'
import { useRef, useState, type FormEvent } from 'react'

type Props = { initialEmail: string; onBack: (email: string) => void; onVerificationSent: (challenge: EmailChallenge, draft: RegistrationDraft) => void }
const fields = [
  { name: 'nombres', label: 'Nombres', type: 'text', autocomplete: 'given-name' },
  { name: 'apellidos', label: 'Apellidos', type: 'text', autocomplete: 'family-name' },
  { name: 'correo', label: 'Correo electrónico', type: 'email', autocomplete: 'email' },
  { name: 'recovery_email', label: 'Correo de recuperación (opcional)', type: 'email', autocomplete: 'email' },
  { name: 'password', label: 'Contraseña', type: 'password', autocomplete: 'new-password' },
  { name: 'confirm_password', label: 'Confirmar contraseña', type: 'password', autocomplete: 'new-password' },
] as const

export default function RegisterForm({ initialEmail, onBack, onVerificationSent }: Props) {
  const [values, setValues] = useState({ nombres: '', apellidos: '', correo: initialEmail, recovery_email: '', password: '', confirm_password: '' })
  const [message, setMessage] = useState('')
  const [invalid, setInvalid] = useState('')
  const [checking, setChecking] = useState(false)
  const checkingRef = useRef(false)
  const [visible, setVisible] = useState(false)
  const checks = [values.password.length >= 8, /[a-z]/i.test(values.password), /[0-9]/.test(values.password), /[^a-z0-9\s]/i.test(values.password)]
  const score = checks.filter(Boolean).length
  const strength = !values.password ? 'neutral' : score <= 2 ? 'weak' : score === 3 ? 'medium' : 'strong'
  const strengthLabel = !values.password ? 'Seguridad de la contraseña' : score <= 2 ? 'Seguridad baja' : score === 3 ? 'Seguridad media' : 'Seguridad alta'
  const confirmation = !values.confirm_password ? 'neutral' : values.confirm_password === values.password ? 'strong' : 'weak'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checkingRef.current) return
    const form = event.currentTarget
    let field = fields.find(field => field.name !== 'recovery_email' && !values[field.name].trim())
    let error = field ? `Completa el campo ${field.label.toLowerCase()}.` : ''
    if (!field && !isSenaEmail(values.correo)) {
      field = fields[2]; error = senaEmailMessage
    }
    if (!field && values.recovery_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.recovery_email.trim())) {
      field = fields[3]; error = 'Ingresa un correo de recuperación válido o deja el campo vacío.'
    }
    if (!field && values.password !== values.confirm_password) {
      field = fields[5]; error = 'Las contraseñas no coinciden.'
    }
    setInvalid(field?.name ?? '')
    setMessage(error)
    if (field) {
      form.querySelector<HTMLInputElement>(`#text_box_register_${field.name}`)?.focus()
      return
    }
    if (!supabase) { setMessage('No se pudo comprobar el correo. Falta configurar Supabase.'); return }
    checkingRef.current = true
    setChecking(true)
    setMessage('Comprobando correo…')
    try {
      const { data, error: lookupError } = await supabase.rpc('is_email_registered', { candidate_email: values.correo.trim().toLowerCase() })
      if (lookupError || typeof data !== 'boolean') {
        setMessage('No se pudo comprobar el correo. Inténtalo nuevamente.')
        return
      }
      if (data) {
        setInvalid('correo')
        setMessage('Ya existe un usuario registrado con este correo. Inicia sesión.')
        form.querySelector<HTMLInputElement>('#text_box_register_correo')?.focus()
      } else {
        setMessage('Enviando código de validación…')
        const challenge = await sendVerification(values.correo.trim().toLowerCase())
        onVerificationSent(challenge, { nombres: values.nombres.trim(), apellidos: values.apellidos.trim(), correo: challenge.email, recovery_email: values.recovery_email.trim(), password: values.password })
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la solicitud.') }
    finally { checkingRef.current = false; setChecking(false) }
  }

  return (
    <form id="form_register" className="login-form register-form" onSubmit={submit} noValidate>
      <h2 id="text_title_register">Crear perfil</h2>
      {fields.map(field => (
        <div className="field" key={field.name}>
          <label id={`text_title_register_${field.name}`} htmlFor={`text_box_register_${field.name}`}>{field.label}</label>
          <div className={`register-input-control ${field.type === 'password' ? 'password-indicator' : ''}`} data-strength={field.name === 'password' ? strength : field.name === 'confirm_password' ? confirmation : undefined}>
          <input id={`text_box_register_${field.name}`}  name={field.name} readOnly={checking} type={field.type === 'password' && visible ? 'text' : field.type} autoComplete={field.autocomplete} placeholder={field.name === 'password' ? 'Contraseña' : field.label} required={field.name !== 'recovery_email'} value={values[field.name]} aria-invalid={invalid === field.name} aria-describedby={field.name === 'password' ? 'password_strength password_guidance text_validation_register' : 'text_validation_register'} onChange={event => {
            setValues({ ...values, [field.name]: event.target.value }); setMessage(''); setInvalid('')
          }} />
          {field.type === 'password' && <button className="register-password-toggle" type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${field.label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}</svg>
          </button>}
          </div>
        </div>
      ))}
      <div className="password-strength" data-strength={strength}>
        <div className="strength-bars" aria-hidden="true">{checks.map((_check, index) => <span key={index} className={values.password && index < Math.max(1, score) ? 'active' : ''} />)}</div>
        <span id="password_strength" role="status" aria-live="polite">{strengthLabel}</span>
        <p id="password_guidance">Sugerido: 8 caracteres, una letra, un número y un símbolo.</p>
      </div>
      <p id="text_validation_register" className="validation" role="status" aria-live="polite" aria-atomic="true">{message}</p>
      <button id="btn_create_profile" className="login-button" type="submit" disabled={checking}>{checking ? 'Comprobando…' : 'Crear perfil'}</button>
      <nav className="account-links" aria-label="Volver al acceso">
        <a id="Link_login" href="#login" onClick={event => { event.preventDefault(); onBack(values.correo) }}>Volver a iniciar sesión</a>
      </nav>
    </form>
  )
}
