import { supabase } from './supabase'
export async function syncAuth0Profile(idToken: string): Promise<string> {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const { data, error } = await supabase.functions.invoke('auth0-profile', { body: { idToken } })
  if (error) {
    const detail = error.context instanceof Response ? await error.context.json().catch(() => null) : null
    throw new Error(detail?.message || 'No se pudo guardar tu perfil de Google. Inténtalo nuevamente.')
  }
  if (typeof data?.profile?.nombre_completo !== 'string') throw new Error('No se pudo confirmar tu perfil de Google.')
  return data.profile.nombre_completo
}
