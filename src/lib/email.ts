/** Dominios institucionales permitidos; no acepta otros subdominios ni sufijos. */
export function isSenaEmail(value: string): boolean {
  const email = value.trim()
  if (email.length > 254) return false
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  return local.length <= 64
    && /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)
    && ['sena.edu.co', 'soy.sena.edu.co'].includes(domain.toLowerCase())
}

export const senaEmailMessage = 'Usa un correo institucional @sena.edu.co o @soy.sena.edu.co.'
