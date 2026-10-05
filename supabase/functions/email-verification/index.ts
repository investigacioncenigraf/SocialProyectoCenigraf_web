// Ejecutado exclusivamente en Supabase Edge Functions (Deno).
import nodemailer from 'npm:nodemailer@9'
import { createClient } from 'npm:@supabase/supabase-js@2'
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const origins = (Deno.env.get('ALLOWED_ORIGINS') || 'http://127.0.0.1:5175,http://localhost:5175').split(',').map(s => s.trim())
const messages: Record<string, string> = {
 registered: 'Ya existe un usuario registrado con este correo.', cooldown: 'Espera 60 segundos antes de solicitar otro código.',
 rate_limit: 'Has solicitado demasiados códigos. Inténtalo dentro de una hora.', invalid: 'El código no es correcto.',
 expired: 'El código ha vencido. Solicita uno nuevo.', locked: 'Se agotaron los intentos. Solicita un nuevo código.',
 used: 'Este código ya fue utilizado.', invalid_email: 'Usa un correo @sena.edu.co o @soy.sena.edu.co.',
}
async function hash(id: string, code: string) {
 const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${id}:${code}`))
 return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('')
}
function template(code: string) {
 const site = Deno.env.get('APP_URL') || origins[0]
 const copyUrl = `${site}/copiar-codigo.html#${code}`
 return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#222"><main style="max-width:480px;margin:32px auto;background:#fff;padding:32px;border-radius:16px"><h1 style="font-weight:300;letter-spacing:4px">NIWI MU</h1><h2>Valida tu correo electrónico</h2><p>Recibimos una solicitud para crear tu perfil en NIWI MU. Introduce este código en la pantalla de validación:</p><p style="padding:18px;background:#eee;text-align:center;font-size:28px;font-weight:bold;letter-spacing:5px;user-select:all">${code}</p><p><a href="${copyUrl}" style="display:inline-block;padding:12px 24px;background:#eee;border:1px solid #999;border-radius:24px;color:#222;text-decoration:none">Copiar código</a></p><p>El botón abre una página segura para copiar el código.</p><p>Selecciona el código para copiarlo y pegarlo en NIWI MU.</p><p>Vence en 10 minutos y solo puede utilizarse una vez. No lo compartas.</p><p style="font-size:13px;color:#666">Si no solicitaste este registro, ignora este mensaje.</p></main></body></html>`
}
Deno.serve(async request => {
 const origin = request.headers.get('origin') || ''
 const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin', 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' }
 const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers})
 if (!origins.includes(origin)) return reply({message:'Origen no permitido.'},403)
 if (request.method==='OPTIONS') return new Response(null,{status:204,headers})
 if (request.method!=='POST') return reply({message:'Método no permitido.'},405)
 try {
  if (Number(request.headers.get('content-length'))>2048) return reply({message:'Solicitud inválida.'},400)
  const {action,email,challengeId,code,nombres,apellidos,recoveryEmail,password} = await request.json()
  if (typeof email!=='string' || email.length>254 || !/^[^\s@]+@(soy\.)?sena\.edu\.co$/i.test(email.trim())) return reply({message:messages.invalid_email},400)
  const normalized=email.trim().toLowerCase()
  const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return reply({message:'El servicio de validación no está configurado.'},503)
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  if (action==='recover') {
   const smtpUser=Deno.env.get('SMTP_USERNAME'), smtpPassword=Deno.env.get('SMTP_PASSWORD')?.replace(/\s/g,'')
   if (!smtpUser || !smtpPassword) return reply({message:'El envío de correos aún no está configurado.'},503)
   const prepared=await db.rpc('prepare_password_recovery',{p_email:normalized})
   if (prepared.error) return reply({message:'No se pudo preparar la recuperación. Revisa la configuración del servicio.'},503)
   if (prepared.data==='not_registered') return reply({message:'No existe una cuenta registrada y confirmada con este correo.'},404)
   if (prepared.data!=='ready') return reply({message:prepared.data==='cooldown' ? 'Espera un minuto antes de solicitar otro enlace.' : prepared.data==='rate_limit' ? 'Has solicitado demasiados enlaces. Inténtalo dentro de una hora.' : messages.invalid_email},429)
   const generated=await db.auth.admin.generateLink({type:'recovery',email:normalized})
   if (generated.error || !generated.data.properties?.hashed_token) return reply({message:'No se pudo generar el enlace de recuperación.'},503)
   const profile=await db.rpc('password_recovery_profile',{p_email:normalized})
   if (profile.error || !profile.data) return reply({message:'No se pudo consultar el perfil de la cuenta.'},503)
   const token=generated.data.properties.email_otp
   if (!token || !/^[0-9]+$/.test(token)) return reply({message:'No se pudo generar el código de recuperación.'},503)
   const html=`<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;color:#222"><main style="max-width:480px;margin:32px auto;padding:32px;background:#fff;border-radius:16px"><h1 style="font-weight:300;letter-spacing:4px">NIWI MU</h1><h2>Recupera tu acceso</h2><p>Introduce este código en NIWI MU para validar tu correo y crear una nueva contraseña:</p><p style="padding:18px;background:#eee;text-align:center;font-size:28px;font-weight:bold;letter-spacing:5px">${token}</p><p>El código es temporal y de un solo uso. No lo compartas.</p><p style="font-size:13px;color:#666">Si no solicitaste este cambio, ignora este mensaje. Tu contraseña seguirá siendo la misma.</p></main></body></html>`
   const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:smtpUser,pass:smtpPassword},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000})
   try {
    const sent=await transport.sendMail({from:{name:'NIWI MU',address:smtpUser},to:normalized,subject:'Código para restablecer tu contraseña de NIWI MU',html,text:`Tu código de recuperación de NIWI MU es ${token}. Es temporal y de un solo uso. Si no solicitaste el cambio, ignora este mensaje.`})
    if (!sent.accepted?.length) return reply({message:'No se pudo enviar el correo. Inténtalo en un minuto.'},502)
   } catch { return reply({message:'No se pudo enviar el correo. Inténtalo en un minuto.'},502) }
   finally { transport.close() }
   return reply({sent:true,email:normalized,name:profile.data.name,codeLength:token.length})
  }
  if (action==='send') {
   const smtpUser=Deno.env.get('SMTP_USERNAME'), smtpPassword=Deno.env.get('SMTP_PASSWORD')?.replace(/\s/g, '')
   if (!smtpUser || !smtpPassword) return reply({message:'El envío de correos aún no está configurado.'},503)
   const id=crypto.randomUUID()
   const token=Array.from(crypto.getRandomValues(new Uint8Array(8)),b=>alphabet[b%32]).join('')
   const {data,error}=await db.rpc('prepare_email_verification',{p_email:normalized,p_id:id,p_hash:await hash(id,token)})
   if (error) return reply({message:'No se pudo preparar la validación.'},503)
   if (data!=='ready') return reply({message:messages[data] || 'No se pudo solicitar el código.'},409)
   const transport=nodemailer.createTransport({
    host:'smtp.gmail.com',port:465,secure:true,
    auth:{user:smtpUser,pass:smtpPassword},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
   })
   try {
    const sent=await transport.sendMail({from:{name:'NIWI MU',address:smtpUser},to:normalized,subject:'Valida tu correo para NIWI MU',html:template(token),text:`Valida tu correo para NIWI MU. Tu código es ${token}. Vence en 10 minutos. Si no solicitaste este registro, ignora el mensaje.`})
    if (!sent.accepted?.length) return reply({message:'No se pudo enviar el correo. Inténtalo nuevamente en un minuto.'},502)
   } catch { return reply({message:'No se pudo enviar el correo. Revisa la configuración del remitente e inténtalo en un minuto.'},502) }
   finally { transport.close() }
   const activated=await db.rpc('activate_email_verification',{p_id:id})
   if (activated.error || activated.data!==true) return reply({message:'No se pudo activar el código. Solicita otro en un minuto.'},503)
   return reply({challengeId:id,email:normalized,expiresAt:new Date(Date.now()+600000).toISOString()})
  }
  if (action==='complete') {
   if (typeof challengeId!=='string' || !/^[0-9a-f-]{36}$/i.test(challengeId) || typeof nombres!=='string' || !nombres.trim() || nombres.length>100 || typeof apellidos!=='string' || !apellidos.trim() || apellidos.length>100 || typeof password!=='string' || !password || password.length>256 || typeof recoveryEmail!=='string' || recoveryEmail.length>254 || (recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail))) return reply({message:'Revisa los datos del formulario de registro.'},400)
   const claim=await db.rpc('claim_verified_registration',{p_email:normalized,p_id:challengeId})
   if (claim.error) return reply({message:'No se pudo comprobar el registro. Revisa la configuración del servicio.'},503)
   if (claim.data==='completed') return reply({completed:true})
   if (claim.data!=='ready') return reply({message:messages[claim.data] || (claim.data==='pending' ? 'El registro está en proceso. Inténtalo nuevamente.' : 'Valida tu correo antes de crear el perfil.')},409)
   const {data,error}=await db.auth.admin.createUser({email:normalized,password,email_confirm:true,user_metadata:{nombres:nombres.trim(),apellidos:apellidos.trim(),recovery_email:recoveryEmail || null,recovery_email_verified:false}})
   if (error || !data.user) {
    await db.rpc('finish_verified_registration',{p_email:normalized,p_id:challengeId,p_user_id:null})
    return reply({message:error?.code==='email_exists' ? messages.registered : error?.code==='weak_password' ? 'La contraseña no cumple la política de seguridad de Supabase. Vuelve al registro para cambiarla.' : 'No se pudo crear la cuenta. Revisa la política de contraseñas e inténtalo nuevamente.'},400)
   }
   const finished=await db.rpc('finish_verified_registration',{p_email:normalized,p_id:challengeId,p_user_id:data.user.id})
   if (finished.error || finished.data!==true) return reply({message:'La cuenta fue creada. Vuelve al inicio e ingresa con tu correo y contraseña.'},503)
   return reply({completed:true})
  }
  if (action==='verify') {
   if (typeof challengeId!=='string' || !/^[0-9a-f-]{36}$/i.test(challengeId) || typeof code!=='string' || !/^[A-Z0-9]{8}$/i.test(code)) return reply({message:'Ingresa el código alfanumérico de 8 caracteres.'},400)
   const {data,error}=await db.rpc('verify_email_code',{p_email:normalized,p_id:challengeId,p_hash:await hash(challengeId,code.toUpperCase())})
   if (error) return reply({message:'No se pudo comprobar el código.'},503)
   return data==='verified' ? reply({verified:true}) : reply({message:messages[data] || 'No se pudo validar el código.'},400)
  }
  return reply({message:'Solicitud inválida.'},400)
 } catch { return reply({message:'No se pudo completar la solicitud. Inténtalo nuevamente.'},503) }
})
