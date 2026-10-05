// Identidad firmada por Auth0; no se confía en nombres o correos enviados por el navegador.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6'
const domain = Deno.env.get('AUTH0_DOMAIN')?.trim()
const clientId = Deno.env.get('AUTH0_CLIENT_ID')?.trim()
const issuer = domain ? `https://${domain}/` : ''
const jwks = domain ? createRemoteJWKSet(new URL('.well-known/jwks.json', issuer)) : null
const origins = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5175,http://127.0.0.1:5175').split(',').map(s => s.trim())
Deno.serve(async request => {
 const origin = request.headers.get('origin') || ''
 const headers = { 'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.includes(origin) ? origin : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS' }
 const reply = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers})
 if (!origins.includes(origin)) return reply({message:'Origen no permitido.'},403)
 if (request.method==='OPTIONS') return new Response(null,{status:204,headers})
 if (request.method!=='POST') return reply({message:'Método no permitido.'},405)
 if (!jwks || !clientId) return reply({message:'Falta configurar la sincronización con Auth0.'},503)
 let payload
 try {
  const body = await request.text()
  if (body.length>16000) return reply({message:'Solicitud inválida.'},400)
  const { idToken } = JSON.parse(body)
  if (typeof idToken!=='string') return reply({message:'Inicia sesión con Google nuevamente.'},401)
  const result = await jwtVerify(idToken,jwks,{issuer,audience:clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub']})
  payload=result.payload
 } catch { return reply({message:'No se pudo validar tu identidad de Auth0. Inicia sesión nuevamente.'},401) }
 if (typeof payload.sub!=='string' || !payload.sub.startsWith('google-oauth2|') || typeof payload.email!=='string' || payload.email_verified!==true) return reply({message:'Se necesita una cuenta Google con correo confirmado.'},403)
 const email=payload.email.trim().toLowerCase()
 if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({message:'La cuenta no tiene un correo válido.'},400)
 const institutional=/^[^\s@]+@(soy\.)?sena\.edu\.co$/.test(email)
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 if (!url || !key) return reply({message:'Falta configurar Supabase.'},503)
 const text=(value:unknown) => typeof value==='string' ? value.trim().slice(0,200) : ''
 try {
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const {data,error}=await db.from('auth0_profiles').upsert({issuer,auth0_subject:payload.sub,email:institutional ? email : null,email_verified:institutional,recovery_email:institutional ? null : email,recovery_email_verified:!institutional,nombres:text(payload.given_name),apellidos:text(payload.family_name),nombre_completo:text(payload.name)||text(payload.given_name)||email,picture_url:typeof payload.picture==='string' ? payload.picture.slice(0,2048) : null,last_login_at:new Date().toISOString()},{onConflict:'issuer,auth0_subject'}).select('id,email,recovery_email,nombres,apellidos,nombre_completo').single()
  if (error || !data) return reply({message:'No se pudo guardar tu perfil en Supabase. Inténtalo nuevamente.'},503)
  return reply({profile:data})
 } catch { return reply({message:'No se pudo sincronizar tu perfil.'},503) }
})
