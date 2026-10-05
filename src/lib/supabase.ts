import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Solo claves públicas: las claves secretas nunca deben incluirse en VITE_*.
export const supabase = url && key ? createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null

export function authErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case 'invalid_credentials': return 'Correo o contraseña incorrectos.'
    case 'email_not_confirmed': return 'Confirma tu correo electrónico antes de iniciar sesión.'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit': return 'Demasiados intentos. Espera un momento e inténtalo nuevamente.'
    case 'provider_disabled': return 'El inicio con Google aún no está habilitado en Supabase.'
    default: return 'No se pudo completar la solicitud. Inténtalo nuevamente.'
  }
}
