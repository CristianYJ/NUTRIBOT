# PostgreSQL y DBeaver

La aplicación usa **PostgreSQL 18** como almacenamiento principal. SQLite queda como origen histórico de importación, sin recibir nuevas escrituras de la app. Se separan cuentas, sesiones, conversaciones, despensa, vencimientos, recetas, restricciones, favoritos y registros de generación en tablas relacionadas.

**Esquema verificado el 2 de octubre de 2026:** `nutribot`, versión **3**, con **24 tablas y 3 vistas**. Las migraciones aplicadas son 001, 002 y 003. Esta guía describe la estructura; los datos personales de cada instalación permanecen en su PC.

## En esta PC

- Servidor: `127.0.0.1`, puerto `5432`.
- Base de la aplicación: `nutribot_project`.
- Base de pruebas: `nutribot_project_test`.
- Esquema: `nutribot`.
- Usuario de la app: `nutribot_app`, sin permisos de superusuario, creación de bases o administración de roles.
- Contraseña: valor privado `PGPASSWORD` en `.env`; no se copia a esta guía ni a GitHub.

Ya existía una base `nutribot` de otro propietario. Esta integración utiliza nombres nuevos y no modifica aquella base. Los datos anteriores de SQLite se importan en una transacción y se conserva una copia privada antes de importarlos.

## Instalar en otra PC

1. Instalar Git, Node.js 22.19 o posterior de la serie 22 (o Node.js 24) y [PostgreSQL 18](https://www.postgresql.org/download/). Recordar la contraseña del administrador elegida durante la instalación.
2. Clonar el repositorio y ejecutar `npm ci` y `npm run setup`.
3. Abrir `.env.postgres-admin`, creado por `npm run setup`, en la raíz del proyecto con estos campos y completar la contraseña local del administrador. El archivo está ignorado por Git:

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=
```

Si la contraseña contiene espacios, `#` u otros caracteres especiales, rodearla de comillas en el archivo. No pegar credenciales en chats o incidencias.

4. Ejecutar:

```sh
npm run db:provision
npm run db:init
```

`db:provision` crea únicamente las dos bases indicadas y el usuario de la app. Genera su contraseña y la guarda en `.env`, conservando la clave Gemini. Si encuentra un nombre ocupado por otro propietario, se detiene sin sobrescribirlo. Si el rol ya existe, requiere sus credenciales previas en `.env` y no cambia su contraseña. La cuenta de administración no se usa para ejecutar Nutribot; puedes retirar su contraseña de `.env.postgres-admin` una vez completada la preparación.

`db:init` aplica, en orden, todas las migraciones pendientes y carga el catálogo inicial una sola vez. En una instalación nueva crea también `auth_sessions`, `conversations` y `pantry_dates`, añade los campos de cuenta a `profiles` y genera la vista `profile_summary`. Su salida debe incluir `"schemaVersion": 3`. No necesitas crear tablas ni pegar los archivos SQL manualmente en DBeaver.

Si tu equipo ya tiene una base dedicada y un usuario con permisos sobre ella, configura directamente `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` y `PGTESTDATABASE` en `.env`, y omite `db:provision`. La base de pruebas debe ser distinta y terminar en `_test`. Esta versión se ha validado con conexiones locales; no desactives verificación TLS para adaptar una conexión remota.

5. Completar `GEMINI_API_KEY` en `.env` para generar recetas, y ejecutar:

```sh
npm run dev
```

Abrir `http://127.0.0.1:5173/?mobile=1`. Sin clave se pueden usar catálogo, perfil y favoritos; las generaciones nuevas requieren Gemini. Reiniciar el servidor después de cambiar `.env` o archivos del servidor.

## Actualizar una instalación existente

Si ya usas PostgreSQL, conserva tu `.env` y la base actual. No vuelvas a importar SQLite ni a crear la base. Con los cambios locales de código guardados en Git, sigue estos pasos desde la carpeta del proyecto:

1. Detén Nutribot con **Ctrl+C** y crea una copia:

```sh
npm run db:backup
```

2. Descarga el código actualizado, instala sus dependencias y aplica las migraciones:

```sh
git pull --ff-only
npm ci
npm run db:init
npm run db:validate
```

`db:init` no repite migraciones ya registradas. Debe mostrar `"schemaVersion": 3`; `db:validate` debe mostrar `"valid": true`. Si Git informa cambios pendientes o divergencia, resuélvelos antes de continuar; no reemplaces tu carpeta ni tu base para actualizar.

3. Inicia la aplicación y recarga el navegador con **Ctrl+F5**:

```sh
npm run dev
```

Para la versión compilada, usa `npm run build` y después `npm start`. Ejecuta solo una de las dos modalidades. En DBeaver, actualiza el esquema `nutribot` con **Refresh / Actualizar** para ver las tablas y vistas nuevas.

| Versión | Archivo | Resultado |
| --- | --- | --- |
| 1 | [001_schema.sql](../server/postgres/001_schema.sql) | Modelo inicial de perfiles, despensa, recetas y relaciones; tablas de control gestionadas por `server/database.js` |
| 2 | [002_accounts.sql](../server/postgres/002_accounts.sql) | Cuentas y fecha de nacimiento, sesiones, chat por cuenta, propiedad de ingredientes personalizados y vista de edad |
| 3 | [003_chat_history_pantry_dates.sql](../server/postgres/003_chat_history_pantry_dates.sql) | Varias conversaciones por cuenta y fechas de despensa; mantiene el chat previo como una entrada del historial |

La actualización conserva perfiles, ingredientes, recetas, favoritos y conversaciones existentes. Los alimentos anteriores quedan sin fecha hasta que el usuario complete su compra/conservación o la fecha del envase.

## Abrir en DBeaver

Crear una **nueva conexión PostgreSQL** con host, puerto y base de arriba. Para usuario y contraseña usa `PGUSER` y `PGPASSWORD` de tu `.env` (no la clave Gemini). Probar y finalizar. Desplegar:

```text
nutribot_project → Schemas / Esquemas → nutribot → Tables / Tablas
```

En `Views / Vistas` hay `recipe_summary`, `weekly_plan_details` y `profile_summary`. Esta última contiene datos de cuenta y edad calculada, pero no hashes de contraseña. La conexión SQLite anterior muestra una copia histórica, ya no los cambios nuevos de la app. DBeaver puede generar el diagrama de relaciones a partir de las claves foráneas.

## Modelo de datos: 24 tablas y 3 vistas

| Grupo | Tablas | Función |
| --- | --- | --- |
| Esquema y migración | `schema_migrations`, `data_imports` | Versiones aplicadas e importación identificada |
| Catálogos alimentarios | `diets`, `goals`, `allergens`, `ingredient_categories`, `units` | Valores permitidos y referenciados por claves foráneas |
| Perfil | `profiles`, `profile_allergies` | Cuenta, correo, hash de contraseña, fecha de nacimiento, medidas opcionales, notas y filtros |
| Acceso y chat | `auth_sessions`, `conversations` | Sesiones revocables y múltiples conversaciones por cuenta |
| Ingredientes | `ingredients`, `ingredient_allergens`, `pantry_items`, `pantry_dates` | Catálogo, alérgenos, presencia en despensa y fechas editables |
| Recetas | `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_allergens` | Origen, modelo, cantidades para una porción y pasos ordenados |
| Nutrición ilustrativa | `recipe_nutrition_examples` | Valores históricos del catálogo, marcados `demo_unverified`; no se añaden a recetas IA |
| Interacción | `favorites`, `recipe_feedback` | Favoritos y opinión del perfil |
| Histórico, sin interfaz | `meal_plans` | Fecha, comida, receta y 1–4 porciones; un registro por día/comida/perfil |
| Trazabilidad | `generation_events` | Resultado validado de la llamada, modelo, fecha y número de recetas; sin prompt ni notas médicas |

`recipe_summary` muestra cantidades de ingredientes, pasos y favoritos. `weekly_plan_details` une planificación con los títulos de las recetas.

`profile_summary` incluye `birth_date` y la columna calculada `age`; no muestra el hash de contraseña. La migración [002_accounts.sql](../server/postgres/002_accounts.sql) añade autenticación y propiedad de ingredientes personalizados sin borrar el perfil anterior. La edad se deriva de la fecha de nacimiento para que cambie automáticamente al cumplir años. Consulta [acceso móvil y cuentas](ACCESO_MOVIL.md).

La migración [003_chat_history_pantry_dates.sql](../server/postgres/003_chat_history_pantry_dates.sql) convierte el chat previo en una conversación identificada por UUID y crea las fechas de despensa sin inventar fechas para los ingredientes existentes. Se aplica una sola vez con `npm run db:init`; crea una copia con `npm run db:backup` antes de actualizar.

Las relaciones y restricciones se completan con las tres migraciones de `server/postgres/`. Hay claves primarias, foráneas, límites numéricos, campos obligatorios, índices y restricciones de unicidad. Las recetas ya no se guardan como un único documento JSON: sus ingredientes y pasos son registros consultables.

### Cuentas y sesiones

| Tabla / campo | Tipo | Función y relación |
| --- | --- | --- |
| `profiles.email` | `varchar(254)` | Correo único normalizado; identifica la cuenta |
| `profiles.password_hash` | `text` | Hash scrypt con sal, no una contraseña recuperable; no se devuelve en la API |
| `profiles.birth_date` | `date` | Fecha de nacimiento opcional; la edad se calcula en la vista `profile_summary.age` |
| `ingredients.profile_id` | `bigint` | FK a `profiles.id`; `NULL` identifica el catálogo compartido, y un perfil identifica su ingrediente personalizado |
| `auth_sessions.token_hash` | `char(64)` | Clave primaria; guarda el hash del token de sesión |
| `auth_sessions.profile_id` | `bigint` | FK a `profiles.id`; un perfil puede tener varias sesiones |
| `auth_sessions.created_at` / `expires_at` | `timestamptz` | Creación y vencimiento de la sesión; el vencimiento debe ser posterior a la creación |

`email` y `password_hash` pueden permanecer en `NULL` en el perfil heredado que todavía no se ha vinculado a una cuenta. No hay una columna de contraseña en texto plano ni una edad almacenada que quede desactualizada. `auth_sessions` elimina sus filas en cascada al eliminar el perfil; cerrar sesión invalida la sesión correspondiente.

### Historial de conversaciones

| Campo de `conversations` | Tipo | Función |
| --- | --- | --- |
| `id` | `uuid` | Clave primaria desde la versión 3; identifica una conversación |
| `profile_id` | `bigint` | FK a `profiles.id`, con eliminación en cascada; ya no es la clave primaria |
| `revision` | `integer` | Detecta escrituras simultáneas para evitar sobrescribir otra versión |
| `messages` | `jsonb` | Mensajes y referencias a recetas; las imágenes no se guardan aquí |
| `draft` | `varchar(500)` | Borrador de esa conversación |
| `max_time` | `integer` | Tiempo máximo elegido: 15, 30 o 60 minutos |
| `busy` | `boolean` | Registra si había una solicitud pendiente para avisar al recuperar el chat |
| `created_at` / `updated_at` | `timestamptz` | Creación y última actualización; el historial se ordena por actividad |

Un perfil tiene muchas conversaciones. La migración 003 asigna un UUID a cada chat anterior y conserva sus mensajes, borrador y revisión. Cada acceso o recarga abre un chat nuevo; el anterior se consulta desde **Historial de chats**. La aplicación admite hasta 200 mensajes por conversación, sin recortar los primeros al llegar al límite. Hay un índice por perfil y fecha para consultar el historial.

### Fechas de la despensa

| Campo de `pantry_dates` | Tipo | Función |
| --- | --- | --- |
| `profile_id` | `bigint` | Cuenta propietaria del ingrediente en despensa |
| `ingredient_id` | `varchar(60)` | Ingrediente cuya fecha se registra |
| `start_date` | `date` | Fecha de compra o preparación, opcional cuando se usa la fecha del envase |
| `estimate_rule` | `varchar(30)` | Regla de conservación elegida; vacía si solo se usa la fecha del envase |
| `custom_days` | `integer` | Duración personalizada opcional, entre 1 y 3650 días |
| `label_date` | `date` | Fecha indicada en el envase; tiene prioridad sobre la estimación |

La clave primaria es **`(profile_id, ingredient_id)`** y a la vez referencia esa pareja en `pantry_items` mediante una FK compuesta. Un ingrediente en despensa puede tener cero o una fila de fechas por cuenta. Al retirarlo se borra su fecha en cascada; añadir otros ingredientes o reordenarlos conserva las fechas restantes. Ambas fechas admiten valores entre 1900-01-01 y 2200-12-31.

La fecha estimada se calcula en `src/pantry-expiry.js`; no hay una columna `expires_at` en `pantry_dates`. La regla elegida y la fecha inicial permiten recalcularla. Consulta [chat y despensa](CHAT_DESPENSA.md) para el uso de la interfaz.

### Comprobar la estructura en tu base

Estas consultas solo leen metadatos y versiones, sin mostrar contraseñas, tokens, mensajes ni datos del perfil:

```sql
SELECT version, applied_at
FROM nutribot.schema_migrations
ORDER BY version;

SELECT table_type, count(*) AS cantidad
FROM information_schema.tables
WHERE table_schema = 'nutribot'
GROUP BY table_type;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'nutribot'
  AND table_name IN ('profiles', 'ingredients', 'auth_sessions',
                     'conversations', 'pantry_dates', 'profile_summary')
ORDER BY table_name, ordinal_position;
```

El resultado esperado es versiones **1, 2 y 3**, **24 `BASE TABLE`** y **3 `VIEW`**. El archivo [sql/validacion.sql](sql/validacion.sql) incluye también consultas de claves primarias y foráneas para las tablas nuevas.

## Alcance actual

Perfil, despensa, recetas, favoritos y opiniones se guardan en PostgreSQL. Semana se retiró de la interfaz y de la API para concentrar el proyecto en recetas. La tabla histórica meal_plans y su vista permanecen por compatibilidad; no se borran datos ni se modifica la migración ya aplicada.

## Integridad y fallos

Cada transacción usa una conexión del pool. Las actualizaciones bloquean la revisión del perfil: dos pestañas no sobrescriben cambios sin aviso. Una respuesta tardía de IA no puede guardar recetas después de un reinicio de datos o cambio de filtros. Las consultas parametrizadas separan SQL de valores del usuario.

La comprobación `/api/health` consulta PostgreSQL. Ante fallos se muestra un error y se conservan los cambios pendientes en pantalla para reintentar. No se cambia silenciosamente a SQLite ni se finge una receta de IA. No se exponen contraseñas ni errores internos del servidor de base de datos en respuestas HTTP.

La aplicación admite varias cuentas y acceso desde dispositivos de la misma red local. Cada consulta de datos se limita al perfil de la sesión autenticada. PostgreSQL permanece en la PC anfitriona; el teléfono utiliza la API, no se conecta al puerto 5432. La base contiene datos privados y hashes de autenticación; utiliza datos ficticios para demostrar el proyecto y conserva las copias fuera de GitHub.

## Importar la versión SQLite

Detener la app antes de importar, para evitar cambios mientras se toma la copia:

```sh
npm run db:import:sqlite
```

Lee una copia de `data/nutribot.sqlite`, valida las recetas y conserva perfil, despensa, favoritos, opiniones e historial de IA. Solo permite un destino recién inicializado; si ya tiene cambios, se detiene. La marca `data_imports` evita duplicar datos al repetir el comando. Si hay un dato inválido, toda la transacción se revierte y SQLite permanece intacto. No importes de nuevo después de usar la versión PostgreSQL; sigue siendo una migración de una sola vez.

## Copias y validación

```sh
npm run db:backup
npm run db:verify-backup
npm run check:full
```

`db:backup` usa `pg_dump` con formato personalizado y comprueba el archivo con `pg_restore --list`. `db:verify-backup` crea otra copia usando una instantánea consistente, la restaura en la base de pruebas, compara el número de registros de todas las tablas y limpia solo ese esquema temporal. Si ya existe `nutribot` en la base de pruebas, se detiene sin sobrescribirlo. Las copias se conservan en `data/backups/`, ignorado por Git.

En Windows se busca el directorio habitual `C:/Program Files/PostgreSQL/18/bin`. Si tu instalación está en otra ruta, define `PGBIN` en `.env`; en macOS/Linux puedes tener las utilidades en PATH. Usar utilidades compatibles con PostgreSQL 18. La restauración de la base real no se automatiza con un borrado; prueba primero una copia y conserva la base anterior.

Ver [VALIDACION.md](VALIDACION.md) para los casos de prueba, resultados esperados y guion de presentación.

Referencias técnicas: [transacciones node-postgres](https://node-postgres.com/features/transactions), [consultas parametrizadas](https://node-postgres.com/features/queries), [restricciones PostgreSQL](https://www.postgresql.org/docs/18/ddl-constraints.html), [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).
