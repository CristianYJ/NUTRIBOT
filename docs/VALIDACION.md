# Cómo probar Nutribot

Ejecuta los comandos desde la carpeta del proyecto, con PostgreSQL activo y los archivos privados configurados según el README. Las pruebas detectan fallos concretos; no garantizan ausencia absoluta de errores ni seguridad clínica.

## 1. Pruebas automáticas

```sh
npm run check:full
```

Debe terminar sin errores: pruebas generales, compilación de React, integración con PostgreSQL y validación de la base actual. La última salida debe incluir `"valid": true`, `"limitedRole": true` y cero incidencias. No consume cuota de Google.

La integración usa esquemas temporales únicamente en `PGTESTDATABASE`, una base distinta que termina en `_test`. No ejecuta borrados de prueba en la base de la aplicación.

## 2. Recorrido manual

Inicia con `npm run dev`, abre http://127.0.0.1:5173 y registra una cuenta de prueba.

| Prueba | Resultado esperado |
| --- | --- |
| Abrir la raíz sin sesión | Muestra la landing; sus botones llevan al formulario de correo |
| Continuar con un correo nuevo y con otro existente | Abre registro o inicio de sesión, respectivamente; Cambiar permite corregirlo |
| Abrir Despensa en escritorio y en teléfono de 320/390 px | Título y banner se apilan, sin desborde horizontal |
| Abrir Nutribot IA en ambas vistas móviles | Herramientas e historial aparecen antes del chat; ingredientes inicialmente plegados |
| Crear dos cuentas | Despensas, recetas generadas y chats independientes |
| Registrar desde localhost y vincular los datos anteriores | Conserva el perfil previo; la opción solo se puede usar una vez |
| Abrir el QR desde otro dispositivo en la misma red | Pide iniciar sesión y recupera los datos de esa cuenta |
| Pasar el mouse o pulsar el avatar | Muestra Mi perfil, Conectar teléfono y Cerrar sesión |
| Cambiar fecha de nacimiento y guardar | Persiste al recargar; la edad se calcula según el cumpleaños |
| Pulsar Cerrar sesión desde el menú o Mi perfil | Vuelve al acceso e invalida la sesión del dispositivo |
| Revisar Cambiar contraseña | Visible y deshabilitado |
| Abrir Despensa y recargar | Continúa en Despensa |
| Abrir Nutribot IA, cambiar a vista amplia y recargar | Conserva sección y vista amplia |
| Ir a Perfil y usar Atrás/Adelante del navegador | Recorre las secciones visitadas |
| Escribir un borrador, esperar guardado y recargar | Abre un chat nuevo; el borrador anterior está en Historial de chats |
| Añadir un ingrediente y esperar confirmación de guardado | Permanece al recargar |
| Guardar preferencias en Perfil | Se recuperan al volver a abrir la página |
| Generar con Gemini | Aparece una receta nueva identificada como Gemini; consume cuota |
| Guardar con el corazón y recargar | Aparece en Mis recetas → Guardadas |
| Recargar después de recibir una respuesta | Abre un chat nuevo; conversación y tarjetas anteriores accesibles desde Historial de chats |
| Pulsar Nuevo chat y abrir Historial de chats | Conserva y permite recuperar la conversación anterior |
| Seleccionar varios ingredientes y quitarlos | Solo desaparecen los seleccionados; persiste al recargar |
| Guardar una fecha del envase o una estimación | Muestra la fecha y el plazo; permanece al añadir otros ingredientes |
| Abrir otra cuenta | No puede acceder a conversaciones ni fechas de la primera |
| Recargar mientras se genera | Abre un chat nuevo; al abrir el anterior aparece un aviso local. Revisar Mis recetas antes de repetir el pedido |

Usa datos ficticios para la presentación. Cada pedido a Gemini es independiente: el historial visible no se envía como contexto al proveedor. El chat y las recetas se guardan por separado en PostgreSQL. El navegador debe permitir la cookie de sesión de Nutribot.

## 3. Ver los datos en DBeaver

Conéctate a `nutribot_project` y abre el esquema `nutribot`. Ejecuta:

```sql
SELECT * FROM nutribot.pantry_items;
SELECT * FROM nutribot.recipe_summary ORDER BY created_at DESC;
SELECT * FROM nutribot.favorites;
```

Hay más consultas de solo lectura en [sql/validacion.sql](sql/validacion.sql). No cambies directamente el catálogo: tiene reglas relacionadas en el servidor.

## Pruebas opcionales

**IA real y persistencia con datos ficticios:**

```sh
npm run test:gemini:postgres
```

Consume cuota. Debe mostrar `persisted: true`. Usa un esquema aislado en la base de pruebas; no utiliza el perfil personal. Un error de red, cuota, modelo o respuesta inválida se informa como fallo.

**Copia de seguridad y restauración de prueba:**

```sh
npm run db:backup
npm run db:verify-backup
```

La segunda orden debe mostrar `restored: true` y `verifiedTables: 24`. Restaura en la base de pruebas y compara recuentos; conserva el origen. Si el esquema destino ya existe, se detiene sin sobrescribirlo. Las copias contienen información privada y no se suben a GitHub.

## Si algo falla

- **No abre la app:** revisa la terminal de `npm run dev`, PostgreSQL activo y las variables PG de `.env`.
- **No conecta DBeaver:** usa una conexión PostgreSQL a `nutribot_project`, no MySQL ni SQLite. [Datos de conexión](POSTGRESQL.md).
- **IA sin clave o sin cuota:** revisa AI Studio y reinicia tras cambiar `.env`.
- **Guardado en conflicto:** otra pestaña modificó el perfil; revisa el aviso y recarga los datos guardados.
- **Indicaciones médicas o exclusiones escritas:** la generación se pausa para revisión; no interpreta tratamientos.
- **No encuentra pg_dump:** instala las utilidades PostgreSQL 18 o configura `PGBIN` según [POSTGRESQL.md](POSTGRESQL.md).

GitHub Actions ejecuta pruebas y compilación en Windows y Ubuntu, y las pruebas de PostgreSQL 18 en una base desechable. No recibe tus claves ni tus datos.
