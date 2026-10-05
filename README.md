# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

## Conexión con Supabase

Copia `.env.example` a `.env.local` y configura la URL del proyecto y su clave
publishable. `.env.local` no se versiona. Nunca uses claves secretas o service_role
como variables `VITE_*`, ya que estas variables se incluyen en el cliente web.

El login usa Supabase Auth con correo/contraseña, Google OAuth (PKCE), persistencia
de sesión y cierre de sesión local. Los IDs del wireframe se conservan. Registro,
recuperación y la pantalla del videojuego siguen pendientes; aún no se han creado
tablas de perfiles ni permisos de roles.

En Supabase, configura Authentication > URL Configuration con la URL del sitio
local y permite como Redirect URLs las direcciones de desarrollo que uses
(por ejemplo http://127.0.0.1:5174 y http://localhost:5173). En producción configura
el dominio definitivo. Para Google, habilita el proveedor con el Client ID y
Client Secret de Google y registra en Google su callback de Supabase.

Para probar correo/contraseña, crea una cuenta de prueba en Authentication > Users.
Las autorizaciones de datos deben implementarse con políticas RLS en Supabase;
la sesión del cliente no asigna permisos ni roles.

## Google mediante Auth0

El botón `btn_login_auth0` usa Auth0, conservando Supabase Auth para correo y
contraseña. Añade `VITE_AUTH0_DOMAIN` (sin https://) y `VITE_AUTH0_CLIENT_ID` a
`.env.local`, siguiendo `.env.example`, y reinicia Vite. No añadas Client Secret.

1. En Auth0, crea una aplicación Single Page Application.
2. En Settings, añade el origen exacto usado en desarrollo (por ejemplo
   `http://127.0.0.1:5175`) a Allowed Callback URLs, Allowed Logout URLs y
   Allowed Web Origins. Añade también el dominio definitivo al publicar.
3. En Authentication > Social, habilita `google-oauth2` y activa la conexión
   para esta aplicación. Para producción configura las credenciales OAuth de
   Google, con `https://TU_DOMAIN_AUTH0/login/callback` como callback de Google.
4. El SDK maneja el intercambio OAuth con PKCE y mantiene tokens en memoria.
   El botón redirige directamente a la conexión Google; la pantalla reconoce
   la sesión de Auth0 y permite cerrarla.

El inicio con Auth0 aún no otorga acceso a las tablas de Supabase. Para ese paso,
configura Authentication > Third-Party Auth en Supabase para el tenant Auth0,
usa firma RS256 y una Action Post Login que añada al ID token:

```js
exports.onExecutePostLogin = async (event, api) => {
  api.idToken.setCustomClaim('role', 'authenticated')
}
```

El cliente de datos deberá usar ese ID token mediante `accessToken`, siguiendo
https://supabase.com/docs/guides/auth/third-party/auth0. No representa un rol
administrador del proyecto: los permisos de negocio se definirán con RLS.
Auth0 y Supabase Auth tienen identidades independientes, incluso si coincide
el correo. No se vinculan cuentas automáticamente por correo.

## Comprobación de correo antes del registro

Ejecuta `supabase/migrations/202610040001_check_registered_email.sql` en el SQL
Editor del proyecto Supabase. El formulario llama la función RPC con solo el
correo normalizado, nunca con contraseñas. Ante un error no considera disponible
el correo. Esta consulta no crea usuarios ni modifica registros.

La función consulta `auth.users` de Supabase Auth; no consulta Auth0, cuyas
identidades todavía no se sincronizan. Devuelve solo un booleano, pero permite
conocer si un correo institucional tiene cuenta. Antes de producción, aplicar
protección contra consultas automatizadas. La futura creación de cuenta debe
volver a comprobar la unicidad en el servidor, pues el resultado previo puede
cambiar entre la comprobación y el registro.

## Validación por código alfanumérico

El registro comprueba el correo, solicita el envío a la Edge Function y abre la
pantalla de validación solo cuando el proveedor acepta el correo. No crea cuentas
ni perfiles todavía. La contraseña no se envía a este servicio ni se almacena:
al avanzar se descarta junto con el formulario. La validación de correo no inicia
sesión ni confirma automáticamente una cuenta de Supabase Auth.

Configuración pendiente en el proyecto remoto:

1. Ejecutar ambas migraciones SQL, en orden, desde SQL Editor.
2. Verificar un dominio propio en Resend (necesita acceso a sus registros DNS).
   El remitente de prueba de Resend solo permite enviar a tu cuenta y no sirve
   para los destinatarios institucionales del formulario.
3. Guardar en Edge Functions > Secrets (nunca en VITE_*):
   `RESEND_API_KEY`, `VERIFICATION_FROM` (ej. NIWI MU <no-reply@tu-dominio>),
   `APP_URL` (http://localhost:5175 en desarrollo), `ALLOWED_ORIGINS`
   (http://localhost:5175,http://127.0.0.1:5175).
4. Desplegar `supabase/functions/email-verification/index.ts` como función
   `email-verification`. Desactivar Verify JWT para permitir solicitudes de
   registro sin sesión, como especifica `supabase/config.toml`.

El servidor genera 8 caracteres con aleatoriedad criptográfica, guarda solo
SHA-256 del código ligado a un identificador aleatorio, permite 5 intentos,
vence a los 10 minutos y consume el código al validarlo. Los reenvíos invalidan
el anterior, esperan 60 segundos y tienen límite de 5 por correo/hora.
La tabla está en un esquema privado con RLS y las funciones internas son
exclusivas de service_role. Antes de producción añadir protección global por IP
/CAPTCHA además del límite por destinatario. Se requiere limpieza periódica de
los registros vencidos. CORS limita navegadores; no sustituye protección antiabuso.

El botón del email abre `copiar-codigo.html`, donde el usuario copia el código.
Se usa un fragmento URL, que se elimina al abrir; el código nunca se valida por
visitar un enlace (evita que escáneres de correo consuman códigos).

Las cuentas de Auth0 aún no se consultan en la comprobación de duplicados.
El paso posterior de creación necesitará usar la validación del servidor de
forma atómica, volver a comprobar unicidad y solicitar la contraseña nuevamente;
no debe confiar en un booleano del navegador.

### Remitente actual: Gmail SMTP

El envío fue adaptado a Gmail con Nodemailer y TLS por puerto 465. Resend ya no
se utiliza en `email-verification`. En Edge Functions > Secrets configura:

- `SMTP_USERNAME`: correo de Gmail remitente.
- `SMTP_PASSWORD`: contraseña de aplicación nueva, exclusiva de NIWI MU.
- `APP_URL`: http://localhost:5175 durante las pruebas en ese computador.
- `ALLOWED_ORIGINS`: http://localhost:5175,http://127.0.0.1:5175.

No uses la contraseña normal de Gmail ni pongas SMTP_PASSWORD en archivos del
frontend. Si se compartió una contraseña en una captura, revócala y reemplázala.
Las instrucciones previas de RESEND_API_KEY/VERIFICATION_FROM ya no aplican.
Las migraciones y el despliegue de email-verification siguen siendo necesarios.
El enlace localhost del correo solo funciona desde el computador que ejecuta
la app; para otros dispositivos será necesario publicar y cambiar APP_URL.

### Continuar después de validar el correo

Ejecutar `supabase/migrations/202610040003_complete_registration.sql` y volver a desplegar el contenido actualizado de `supabase/functions/email-verification/index.ts` en la función `email-verification`. Se mantienen los secretos SMTP existentes.

«Continuar» reclama una validación de correo confirmada en el servidor (disponible durante 15 minutos después de verificar), comprueba nuevamente que el correo esté disponible y crea el usuario mediante Supabase Auth. Supabase administra el hash de la contraseña; la aplicación no guarda contraseñas en tablas ni almacenamiento del navegador. Nombres y apellidos se almacenan en los metadatos del usuario. El correo alternativo se conserva como dato **no verificado**; todavía no habilita recuperación de cuentas.

El formulario se conserva únicamente en memoria mientras se valida el correo. Recargar la página requiere repetir el registro. Tras crear la cuenta se inicia sesión con contraseña y se valida el usuario con `getUser()` antes de mostrar la bienvenida. Las sesiones existentes tienen su propio botón Continuar; las de Google se validan con Auth0 y las de correo con Supabase. Google sigue siendo una identidad de Auth0 y no se crea una copia automática en Supabase.

La bienvenida es la pantalla inicial provisional; aún no existe un módulo interno adicional. Toda futura consulta de datos deberá protegerse con políticas RLS, independientemente de la pantalla mostrada.

Actualización del flujo: al confirmar el código se crea automáticamente la cuenta. Continuar aparece después de la creación y solo inicia sesión, valida el usuario y navega a `/home:nombre` (nombre codificado en la URL). Si falla la creación, puede reintentarse sin volver a introducir el código validado.

### Recuperación de contraseña

Ejecutar `supabase/migrations/202610040004_password_recovery.sql` y desplegar nuevamente `supabase/functions/email-verification/index.ts`. Se utilizan los mismos secretos Gmail SMTP, APP_URL y ALLOWED_ORIGINS. APP_URL debe apuntar a la aplicación que abrirá el destinatario; localhost solo sirve en el equipo de desarrollo.

Olvidé mi contraseña conserva el correo escrito y permite editarlo. El servicio limita las solicitudes a una por minuto y cinco por hora por correo. Supabase Auth genera un enlace recovery de un solo uso y Gmail lo envía; su vencimiento depende de la configuración de OTP en Supabase Auth. El token viaja en el fragmento del enlace a `/restablecer-contrasena`, se retira de la barra de direcciones y se valida al guardar la nueva contraseña. La sesión de recuperación se mantiene solo en memoria, separada de la sesión principal, y se cierra al terminar. Recargar después de retirar el token requiere volver a abrir el enlace del correo.

La recuperación comprueba que exista una cuenta confirmada antes de generar y enviar el enlace. Por petición del proyecto, informa cuando el correo no está registrado y personaliza el éxito con el nombre de la cuenta y el correo resaltado. Solo aplica a cuentas de correo de Supabase; Google sigue autenticándose con Auth0. Al publicar, el hosting debe servir la aplicación también en `/restablecer-contrasena` y `/home:...` mediante fallback de SPA.

Actualización: la recuperación ahora envía el código numérico nativo de Supabase en lugar del enlace. Ejecutar además `supabase/migrations/202610040005_recovery_profile.sql` y redeplegar `email-verification`. La cuenta confirmada se comprueba antes del envío y el nombre se obtiene directamente de `auth.users` mediante una función accesible solo al servidor. No se inventa un nombre para cuentas sin ese metadato. Tras enviar, desaparece la instrucción de escribir el correo y aparecen el nombre destacado, el destinatario y el campo del código. Validarlo con `verifyOtp(type: recovery)` habilita la nueva contraseña en una sesión de recuperación aislada en memoria. La longitud del código se adapta a la configuración de Supabase. Los límites de envío previos siguen aplicando.

### Perfiles de Google mediante Auth0

Ejecutar `supabase/migrations/202610040006_auth0_profiles.sql`. Crear la Edge Function `auth0-profile` con el contenido de `supabase/functions/auth0-profile/index.ts` y desactivar Verify JWT with legacy secret: esta función valida por sí misma la firma RS256, issuer, audience y expiración del ID token mediante las claves JWKS del tenant Auth0.

Añadir secretos `AUTH0_DOMAIN=dev-z3l5dckl8adx00ym.us.auth0.com` y `AUTH0_CLIENT_ID=UjT0NYGRN1VxCVjWRhX79fwV97xkDgoL`. Reutiliza ALLOWED_ORIGINS y los secretos internos de Supabase. El navegador solo envía el ID token obtenido del SDK; nombres y correo se toman de los claims firmados, con email_verified obligatorio y proveedor Google. Los perfiles quedan en `public.auth0_profiles`, accesibles solo al servidor, y se actualizan por issuer + subject. No se fusionan automáticamente por email con cuentas Supabase ni se crean contraseñas. Supabase Authentication > Users continúa mostrando cuentas de Supabase Auth; Table Editor > public.auth0_profiles muestra las de Auth0.

### Correo institucional y recuperación en Auth0

Ejecutar `202610040007_auth0_recovery_email.sql` y redeplegar `auth0-profile`. Los correos Google @sena.edu.co y @soy.sena.edu.co se guardan en email; otros dominios se guardan en recovery_email (confirmado por Google), dejando email vacío. La identidad estable sigue siendo issuer + auth0_subject, por lo que ambos tipos conservan el acceso y no se duplican por la clasificación de correo. La migración clasifica los perfiles existentes. Este dato no habilita todavía recuperación de una contraseña local para cuentas Auth0; Google administra su autenticación.

### Roles iniciales

Ejecutar `supabase/migrations/202610040008_default_user_roles.sql` después de las migraciones anteriores. Los triggers asignan Instructor para el dominio exacto sena.edu.co, Aprendiz para soy.sena.edu.co y Visitante para el resto. También completan los perfiles existentes sin rol. En cuentas locales se guarda en auth.users.raw_app_meta_data.rol (app_metadata); en perfiles Google se guarda en public.auth0_profiles.rol. No se modifica el rol técnico de Supabase. Los roles pueden cambiarse mediante administración del servidor/SQL Editor; no hay todavía pantalla de administración. La sincronización de Auth0 no envía ni actualiza rol, por lo que respeta los cambios manuales. El rol es un dato inicial; los permisos de cada rol se definirán después con las políticas correspondientes.

### Ruta provisional /setRoleAccess

Con una sesión iniciada, abrir `/setRoleAccess`. Muestra el rol consultado en el servidor y permite elegir Instructor, Aprendiz, Visitante, Admin o Desarrollador. El botón solo se habilita si el rol cambia. La clave provisional fija `1234` se compara en el servidor antes de guardar. La página conserva la estructura visual del login y vuelve a `/Home` al confirmar la escritura.

Crear y desplegar la función `set-role-access` desde `supabase/functions/set-role-access/index.ts`, con Verify JWT with legacy secret desactivado. Usa los secretos existentes AUTH0_DOMAIN, AUTH0_CLIENT_ID, ALLOWED_ORIGINS y Supabase. Debe haberse ejecutado la migración 008 de roles. No requiere otra migración. La función valida el ID token de Auth0 o el access token de Supabase, y deriva la identidad del token, sin aceptar el ID de otro usuario. Escribe auth0_profiles.rol o app_metadata.rol según el proveedor y conserva el resto de metadatos. La clave 1234 es la autorización provisional solicitada; aún no se han definido permisos funcionales de los roles.
