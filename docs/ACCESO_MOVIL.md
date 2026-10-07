# Cuentas y acceso desde el teléfono

## Abrir la aplicación

Desde la carpeta del proyecto ejecuta `npm run dev`. Abre `http://127.0.0.1:5173` en la PC. La terminal muestra una dirección de la red local y su QR. También puedes abrir **menú de perfil → Conectar teléfono** para verlo en pantalla.

Conecta el teléfono y la PC a la misma red Wi-Fi, escanea el QR e inicia sesión. La PC puede estar conectada por Ethernet al mismo router. Mantén encendidos la PC, PostgreSQL y Nutribot. Para usar la versión compilada, ejecuta `npm run build` y `npm start`; su puerto es 8787. No ejecutes desarrollo y producción a la vez.

El QR contiene únicamente la dirección de la aplicación; no contiene una contraseña ni da acceso a una cuenta. Si cambia la IP de la PC, reinicia Nutribot y escanea el nuevo QR. Una red de invitados o el aislamiento entre dispositivos puede impedir la conexión. Si Windows solicita acceso para Node.js, habilita únicamente la red privada de confianza. No necesitas abrir el puerto de PostgreSQL al teléfono ni configurar reenvío de puertos en el router.

## Crear cuentas independientes

1. Desde la landing pulsa **Comenzar gratis** o **Iniciar sesión**. Escribe tu correo y pulsa **Continuar con correo**. El sistema consulta PostgreSQL: si el correo existe, muestra la contraseña para iniciar sesión; si no existe, abre automáticamente el registro. **Cambiar** permite corregir el correo.
2. Completa tu nombre y una contraseña de entre 15 y 128 caracteres. La fecha de nacimiento es opcional. El correo identifica la cuenta local: no se envía un correo de verificación.
3. Si ya tenías datos antes de esta actualización, haz el primer registro desde `127.0.0.1` o `localhost` en la PC y deja marcada **Vincular a esta cuenta el perfil, la despensa y las recetas que ya están en esta PC**. Conserva el nombre y los datos anteriores; después puedes editar el nombre en Mi perfil. Esta opción solo está disponible una vez y desde la PC anfitriona.
4. Las cuentas nuevas tienen una despensa vacía y comparten únicamente el catálogo inicial de ejemplo. Cada cuenta mantiene sus propios ingredientes añadidos, restricciones, recetas generadas, favoritos, opiniones y chat.

En otro dispositivo inicia sesión con el mismo correo y contraseña para abrir los datos de esa cuenta. Los cambios se guardan en PostgreSQL en la PC. Espera a que desaparezca el indicador de guardado antes de cerrar; los errores se mantienen visibles para reintentar. Usa **Guardar mi perfil** después de editar el formulario. Si tienes dos dispositivos abiertos, recarga para ver cambios del otro; una edición simultánea avisa del conflicto en vez de sobrescribirla.

Cada inicio de sesión y recarga comienza un chat nuevo. En Nutribot IA, el cuadro de ingredientes incluye **Historial de chats** para recuperar las conversaciones y borradores anteriores. **Nuevo chat** guarda el actual antes de abrir otro. Cada conversación admite hasta 200 mensajes y al alcanzar el límite se pide abrir otra, sin recortar los primeros mensajes. Las fotos se analizan de forma temporal y no se guardan en el historial de la base de datos. El historial no se envía como memoria a Gemini. El chat antiguo que solo existía en una pestaña del navegador no se importa a las cuentas nuevas.

## Perfil y sesión

El menú del avatar se abre al pasar el mouse, hacer clic o usar el teclado. Incluye **Mi perfil**, **Conectar teléfono** y **Cerrar sesión**. Mi perfil también tiene **Cerrar sesión** al final. Se guardan los cambios pendientes antes de salir y se invalida la sesión de ese dispositivo en el servidor.

La fecha de nacimiento se edita en Mi perfil y la edad se calcula automáticamente. **Cambiar contraseña · Próximamente** está visible y deshabilitado, según el alcance de esta versión. No hay recuperación automática de contraseña todavía.

## Contraseñas y conexión

`profiles.password_hash` guarda un hash scrypt con sal aleatoria por contraseña (N=131072, r=8, p=1), siguiendo la [guía de almacenamiento de contraseñas de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). No se almacena una contraseña recuperable. La API no devuelve el hash. Las cookies de sesión son HttpOnly y SameSite=Strict, con protección CSRF y límites de intentos; PostgreSQL guarda solo el hash del token de sesión. Recordar sesión dura hasta 30 días; sin marcarlo, la sesión caduca como máximo a las 8 horas.

Por defecto la aplicación utiliza **HTTP en la red local**, que no cifra el tráfico entre teléfono y PC. Usa una red de confianza. Para cifrar también el transporte, configura en `.env` un certificado HTTPS válido y confiable para ambos dispositivos:

```dotenv
NUTRIBOT_TLS_CERT=C:/certificados/nutribot.crt
NUTRIBOT_TLS_KEY=C:/certificados/nutribot.key
```

El certificado debe incluir los nombres/IP que se usarán al abrir Nutribot; para certificados de una autoridad local, instala esa autoridad de confianza en ambos dispositivos. Reinicia la app después de configurar ambos archivos. El QR usará `https://` y las cookies tendrán el atributo Secure. Guarda la clave privada fuera del repositorio. Esta versión no genera certificados ni publica la app en Internet.

## Base de datos y archivos principales

La migración `server/postgres/002_accounts.sql` amplía `profiles` con `email`, `password_hash` y `birth_date`, añade `auth_sessions` y `conversations`, y asigna los ingredientes personalizados anteriores al perfil existente. La vista `nutribot.profile_summary` muestra `age` calculada desde `birth_date`: no se guarda una edad que quede desactualizada en cada cumpleaños.

```sql
SELECT id, name, email, birth_date, age
FROM nutribot.profile_summary;
```

Interfaz: `src/AuthPage.jsx`, `src/AccountMenu.jsx`, `src/PhoneConnection.jsx`, `src/App.jsx` y `src/account.css`. Autenticación: `server/auth.js`, `server/auth-store.js` y `server/passwords.js`. Aislamiento y persistencia: `server/database.js`, `server/chat.js` y `src/useChatPersistence.js`. Inicio y QR: `server/start.js` y `server/network.js`. Logo transparente: `public/nutribot-logo.png`.

Antes de actualizar una instalación, detén la app y ejecuta `npm run db:backup`. Después instala dependencias con `npm ci` y aplica `npm run db:init`. La migración conserva los datos anteriores. No compartas copias de la base: contienen información privada y hashes de autenticación.
