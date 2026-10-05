import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6'
const roles = ['Instructor','Aprendiz','Visitante','Admin','Desarrollador']
const domain=Deno.env.get('AUTH0_DOMAIN')?.trim(), clientId=Deno.env.get('AUTH0_CLIENT_ID')?.trim()
const issuer=domain ? `https://${domain}/` : ''
const jwks=domain ? createRemoteJWKSet(new URL('.well-known/jwks.json',issuer)) : null
const origins=(Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5175,http://127.0.0.1:5175').split(',').map(s=>s.trim())
Deno.serve(async request=>{
 const origin=request.headers.get('origin') || ''
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.includes(origin)?origin:'','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers})
 if (!origins.includes(origin)) return reply({message:'Origen no permitido.'},403)
 if (request.method==='OPTIONS') return new Response(null,{status:204,headers})
 if (request.method!=='POST') return reply({message:'Método no permitido.'},405)
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 if (!url || !key) return reply({message:'Falta configurar Supabase.'},503)
 try {
  const raw=await request.text()
  if(raw.length>16000) return reply({message:'Solicitud inválida.'},400)
  const body=JSON.parse(raw)
  if(!['read','update'].includes(body.action)) return reply({message:'Solicitud inválida.'},400)
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  let subject='',localUser=null
  if(typeof body.idToken==='string') {
   if(!jwks || !clientId) return reply({message:'Falta configurar Auth0.'},503)
   try {
    const {payload}=await jwtVerify(body.idToken,jwks,{issuer,audience:clientId,algorithms:['RS256'],requiredClaims:['exp','iat','sub']})
    if(typeof payload.sub!=='string' || !payload.sub.startsWith('google-oauth2|') || payload.email_verified!==true) return reply({message:'Identidad de Google no válida.'},401)
    subject=payload.sub
   } catch { return reply({message:'Inicia sesión con Google nuevamente.'},401) }
  } else if(typeof body.accessToken==='string') {
   const {data,error}=await db.auth.getUser(body.accessToken)
   if(error || !data.user) return reply({message:'Inicia sesión nuevamente.'},401)
   localUser=data.user
  } else return reply({message:'Inicia sesión para cambiar tu rol.'},401)
  let profile
  if(subject) {
   const {data,error}=await db.from('auth0_profiles').select('id,nombre_completo,rol').eq('issuer',issuer).eq('auth0_subject',subject).maybeSingle()
   if(error) return reply({message:error.code==='42703' || error.code==='PGRST204' ? 'Falta la columna rol en auth0_profiles. Ejecuta el script 202610040008_default_user_roles.sql.' : 'No se pudo consultar auth0_profiles. Revisa las migraciones y permisos de la tabla.'},503)
   if(!data) return reply({message:'Tu identidad de Google es válida, pero falta sincronizar el perfil en Supabase. Vuelve al Home y abre Cambiar rol nuevamente.'},404)
   profile={id:data.id,name:data.nombre_completo,rol:data.rol}
  } else {
   profile={id:localUser!.id,name:[localUser!.user_metadata.nombres,localUser!.user_metadata.apellidos].filter(Boolean).join(' ') || localUser!.email,rol:localUser!.app_metadata.rol}
  }
  if(body.action==='read') return reply({profile})
  if(body.key!=='1234') return reply({message:'La clave no es correcta.'},403)
  if(!roles.includes(body.rol)) return reply({message:'Selecciona un rol válido.'},400)
  if(subject) {
   const {error}=await db.from('auth0_profiles').update({rol:body.rol}).eq('id',profile.id).eq('issuer',issuer).eq('auth0_subject',subject)
   if(error) return reply({message:'No se pudo guardar el rol.'},503)
  } else {
   const {error}=await db.auth.admin.updateUserById(profile.id,{app_metadata:{...localUser!.app_metadata,rol:body.rol}})
   if(error) return reply({message:'No se pudo guardar el rol.'},503)
  }
  return reply({profile:{...profile,rol:body.rol}})
 } catch { return reply({message:'No se pudo completar la solicitud.'},503) }
})
