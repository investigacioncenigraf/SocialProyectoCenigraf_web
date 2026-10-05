import { supabase } from './supabase'
export type EmailChallenge = { email: string; challengeId: string; expiresAt: string }

async function request(body: Record<string, string>) {
  if (!supabase) throw new Error('Falta configurar Supabase.')
  const { data, error } = await supabase.functions.invoke('email-verification', { body })
  if (error) {
    const context = (error as { context?: Response }).context
    if (context instanceof Response) {
      const result = await context.json().catch(() => null)
      if (typeof result?.message === 'string') throw new Error(result.message)
    }
    throw new Error('No se pudo contactar el servicio de validación. Inténtalo nuevamente.')
  }
  return data
}
export async function sendVerification(email: string): Promise<EmailChallenge> {
  const data = await request({ action: 'send', email })
  if (typeof data?.challengeId !== 'string' || typeof data?.email !== 'string' || typeof data?.expiresAt !== 'string') throw new Error('El servidor no confirmó el envío del código.')
  return data
}
export async function verifyEmailCode(challenge: EmailChallenge, code: string): Promise<void> {
  const data = await request({ action: 'verify', email: challenge.email, challengeId: challenge.challengeId, code })
  if (data?.verified !== true) throw new Error('No se pudo validar el código.')
}

export type RegistrationDraft = { nombres: string; apellidos: string; correo: string; recovery_email: string; password: string }
export async function completeRegistration(challenge: EmailChallenge, draft: RegistrationDraft): Promise<void> {
  const data = await request({ action: 'complete', email: challenge.email, challengeId: challenge.challengeId, nombres: draft.nombres, apellidos: draft.apellidos, recoveryEmail: draft.recovery_email, password: draft.password })
  if (data?.completed !== true) throw new Error('No se pudo crear el perfil.')
}
