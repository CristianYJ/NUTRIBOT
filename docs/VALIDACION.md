# Cómo probar Nutribot

Ejecuta los comandos desde la carpeta del proyecto, con PostgreSQL activo y los archivos privados configurados según el README. Las pruebas detectan fallos concretos; no garantizan ausencia absoluta de errores ni seguridad clínica.

## 1. Pruebas automáticas

```sh
npm run check:full
```

Debe terminar sin errores: pruebas generales, compilación de React, integración con PostgreSQL y validación de la base actual. La última salida debe incluir `"valid": true`, `"limitedRole": true` y cero incidencias. No consume cuota de Google.

La integración usa esquemas temporales únicamente en `PGTESTDATABASE`, una base distinta que termina en `_test`. No ejecuta borrados de prueba en la base de la aplicación.

## 2. Recorrido manual

Inicia con `npm run dev` y abre http://127.0.0.1:5173/?mobile=1.

| Prueba | Resultado esperado |
| --- | --- |
| Abrir Despensa y recargar | Continúa en Despensa |
| Abrir Nutribot IA, cambiar a vista amplia y recargar | Conserva sección y vista amplia |
| Ir a Perfil y usar Atrás/Adelante del navegador | Recorre las secciones visitadas |
| Escribir un borrador en Nutribot IA y recargar | El borrador permanece en esa pestaña |
| Añadir un ingrediente y esperar confirmación de guardado | Permanece al recargar |
| Guardar preferencias en Perfil | Se recuperan al volver a abrir la página |
| Generar con Gemini | Aparece una receta nueva identificada como Gemini; consume cuota |
| Guardar con el corazón y recargar | Aparece en Mis recetas → Guardadas |
| Recargar después de recibir una respuesta | La conversación y las tarjetas siguen disponibles en esa sesión |
| Limpiar chat | Se vacía la conversación; las recetas permanecen en Mis recetas |
| Recargar mientras se genera | Aparece un aviso local; revisar Mis recetas antes de repetir el pedido |

Usa datos ficticios para la presentación. Cada pedido a Gemini es independiente: el historial visible no se envía como contexto al proveedor. El almacenamiento de sesión requiere que el navegador lo permita; las recetas se guardan por separado en PostgreSQL.

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

La segunda orden debe mostrar `restored: true` y `verifiedTables: 21`. Restaura en la base de pruebas y compara recuentos; conserva el origen. Si el esquema destino ya existe, se detiene sin sobrescribirlo. Las copias contienen información privada y no se suben a GitHub.

## Si algo falla

- **No abre la app:** revisa la terminal de `npm run dev`, PostgreSQL activo y las variables PG de `.env`.
- **No conecta DBeaver:** usa una conexión PostgreSQL a `nutribot_project`, no MySQL ni SQLite. [Datos de conexión](POSTGRESQL.md).
- **IA sin clave o sin cuota:** revisa AI Studio y reinicia tras cambiar `.env`.
- **Guardado en conflicto:** otra pestaña modificó el perfil; revisa el aviso y recarga los datos guardados.
- **Indicaciones médicas o exclusiones escritas:** la generación se pausa para revisión; no interpreta tratamientos.
- **No encuentra pg_dump:** instala las utilidades PostgreSQL 18 o configura `PGBIN` según [POSTGRESQL.md](POSTGRESQL.md).

GitHub Actions ejecuta pruebas y compilación en Windows y Ubuntu, y las pruebas de PostgreSQL 18 en una base desechable. No recibe tus claves ni tus datos.
