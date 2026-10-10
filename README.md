# Nutribot

Nutribot genera recetas con **Gemini de Google** usando los ingredientes de tu despensa y los filtros alimentarios de tu perfil. **PostgreSQL 18** guarda perfil, despensa, recetas, favoritos y opiniones.

El recorrido es sencillo: **Landing → Correo electrónico → Registro o inicio de sesión → Despensa → Perfil → Nutribot IA → Mis recetas**. Cada cuenta tiene datos independientes. La sección abierta se conserva al recargar; también funcionan Atrás y Adelante. Cada acceso o recarga abre un chat nuevo. Las conversaciones y sus borradores permanecen en PostgreSQL y se abren desde Historial de chats.

Es una aplicación web adaptable a móvil y PC, con modo local y [despliegue en Oracle con HTTPS](docs/ORACLE.md). En HTTPS puede [instalarse como PWA desde el QR](docs/PWA.md), con icono y ventana independiente. Necesita conexión con el servidor; el APK es una etapa posterior.

Los [planes de usuario](docs/PLANS.md) preparan las asignaciones Básico, NutriPro y NutriPro+, con historial administrativo. Esta etapa no incluye cobros ni restricciones de funciones por plan. La migración 004 requiere un despliegue manual revisado en Oracle.

## Instalar desde cero en otra PC

### 1. Requisitos

- [Git](https://git-scm.com/downloads).
- [Node.js](https://nodejs.org/en/download) 22.19 o posterior de la serie 22, o Node.js 24, con npm.
- [PostgreSQL 18](https://www.postgresql.org/download/), instalado y en ejecución. Guarda la contraseña del usuario administrador `postgres` que elegiste al instalar.
- Una clave propia de [Google AI Studio](https://aistudio.google.com/api-keys) para generar recetas.
- DBeaver es opcional: sirve para consultar PostgreSQL, **no lo sustituye ni lo instala**.

### 2. Descargar el proyecto

```sh
git clone https://github.com/CristianYJ/NUTRIBOT.git
cd NUTRIBOT
npm ci
npm run setup
```

Abre la carpeta clonada en tu editor. Todos los comandos siguientes se ejecutan desde esa carpeta. En PowerShell, si se bloquea `npm.ps1`, usa `npm.cmd` en lugar de `npm`.

### 3. Preparar tu base de datos

El paso anterior crea dos archivos privados sin sobrescribirlos si ya existen:

| Archivo | Qué completar |
| --- | --- |
| `.env.postgres-admin` | En `PGPASSWORD=`, la contraseña de tu usuario local `postgres` |
| `.env` | En `GEMINI_API_KEY=`, tu clave de Google |

Si una contraseña contiene `#` o espacios, escríbela entre comillas. No compartas estos archivos ni pegues las credenciales en el código.

Luego ejecuta:

```sh
npm run db:provision
npm run db:init
```

El primer comando crea el usuario limitado `nutribot_app`, la base `nutribot_project` y otra separada para pruebas, `nutribot_project_test`. Guarda automáticamente la conexión en `.env`. El segundo crea las tablas y carga el catálogo inicial sin duplicarlo. Si encuentra nombres ocupados por otro propietario, se detiene sin modificarlos.

El esquema actual es la **versión 3: 24 tablas y 3 vistas**, incluidas `auth_sessions` (sesiones), `conversations` (historial de chats) y `pantry_dates` (fechas de despensa). También incluye correo, hash de contraseña y fecha de nacimiento en `profiles`, y la edad calculada en `profile_summary`. `db:init` aplica todas las migraciones pendientes automáticamente. Si ya tienes una instalación, sigue [actualizar una instalación existente](docs/POSTGRESQL.md#actualizar-una-instalación-existente) para conservar los datos.

La app usa su propio usuario, no el administrador. Puedes retirar la contraseña de `.env.postgres-admin` después de preparar las bases. Para una instalación personalizada o un error de conexión, consulta [PostgreSQL y DBeaver](docs/POSTGRESQL.md).

### 4. Iniciar Nutribot

```sh
npm run dev
```

Abre [Nutribot](http://127.0.0.1:5173) y crea tu cuenta. Si ya tenías datos, registra la primera cuenta desde esa dirección y marca la opción para vincular el perfil existente. Mantén abierta la terminal; **Ctrl+C** detiene la app. Reinicia si cambias `.env` o archivos del servidor.

La terminal muestra el **QR de la red local**. También está en **menú de perfil → Conectar teléfono**. Conecta la PC y el teléfono a la misma red, escanea el QR e inicia sesión con tu cuenta. El QR solo contiene la dirección HTTP de Nutribot. Consulta [cuentas y acceso móvil](docs/ACCESO_MOVIL.md).

En Despensa selecciona ingredientes, revisa Perfil y pide una receta en Nutribot IA. La indicación **Generado con Gemini** identifica una respuesta real. Sin clave o cuota disponible puedes usar el catálogo y guardar datos, pero no generar recetas nuevas.

## Comprobar que funciona

```sh
npm run check:full
```

Ejecuta pruebas, compilación y validación de PostgreSQL sin llamar a Google. La última comprobación debe mostrar `"valid": true`. La [guía de pruebas](docs/VALIDACION.md) incluye el recorrido manual, navegación, persistencia y consultas SQL.

## Comandos habituales

| Comando | Para qué sirve |
| --- | --- |
| `npm run dev` | Iniciar la app local |
| `npm run check:full` | Validar código y base de datos |
| `npm run db:backup` | Crear una copia privada en data/backups |
| `npm run db:verify-backup` | Probar una restauración en la base de pruebas |
| `npm run build` y después `npm start` | Abrir la versión compilada en http://127.0.0.1:8787 |

Detén desarrollo antes de usar `npm start`: ambos usan el puerto 8787. La [prueba real de IA](docs/VALIDACION.md) es opcional y consume cuota de Google.

## GitHub y trabajo en equipo

GitHub comparte **código e instrucciones**, no las contraseñas ni los datos de tu PC. Cada integrante sigue la instalación y tiene su propia base local. Los archivos `.env*` privados, copias, `node_modules` y `dist` están ignorados. `.env.example` solo contiene una plantilla sin claves.

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para trabajar en ramas y enviar cambios. GitHub Actions prueba automáticamente Windows, Ubuntu y PostgreSQL. Subir el repositorio no publica la aplicación en Internet.

## Alcance actual

- Varias cuentas independientes con correo y contraseña, accesibles desde PC y teléfono en la red local. Los datos permanecen en la PC que ejecuta el servidor. Recarga para ver cambios hechos desde otro dispositivo.
- Contraseñas guardadas mediante hash scrypt con sal, sesiones revocables y fecha de nacimiento editable. La edad se calcula automáticamente. El cambio de contraseña está visible pero aún deshabilitado.
- La IA recibe el mensaje culinario, ingredientes y filtros. Correo, contraseña, nombre, fecha de nacimiento, peso, estatura y notas médicas del perfil no se envían a Google. Evita escribir datos personales en el chat.
- Las indicaciones médicas o exclusiones escritas pausan la generación para revisión. La app no interpreta tratamientos ni garantiza seguridad clínica o ausencia de alérgenos.
- Los valores nutricionales del catálogo son ejemplos; las recetas de IA no muestran macros inventados.
- Las conversaciones permanecen en PostgreSQL, asociadas a la cuenta, con hasta 200 mensajes por conversación. Al llegar al límite se pide abrir un chat nuevo sin borrar los anteriores. El historial no se envía a Google. Espera a que termine el indicador de guardado antes de cerrar.
- Despensa permite quitar varios ingredientes a la vez y guardar fechas del envase o estimaciones editables según compra y conservación. Consulta [chat y despensa](docs/CHAT_DESPENSA.md).

Documentación: [base de datos](docs/POSTGRESQL.md), [pruebas](docs/VALIDACION.md), [arquitectura](docs/ARQUITECTURA.md), [Gemini](docs/GEMINI.md) y [recursos visuales](docs/ASSETS.md).
