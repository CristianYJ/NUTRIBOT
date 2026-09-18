# PostgreSQL y DBeaver

La aplicación usa **PostgreSQL 18** como almacenamiento principal. SQLite queda como origen histórico de importación, sin recibir nuevas escrituras de la app. Se separan recetas, ingredientes, pasos, restricciones, favoritos y registros de generación en tablas relacionadas.

## En esta PC

- Servidor: `127.0.0.1`, puerto `5432`.
- Base de la aplicación: `nutribot_project`.
- Base de pruebas: `nutribot_project_test`.
- Esquema: `nutribot`.
- Usuario de la app: `nutribot_app`, sin permisos de superusuario, creación de bases o administración de roles.
- Contraseña: valor privado `PGPASSWORD` en `.env`; no se copia a esta guía ni a GitHub.

Ya existía una base `nutribot` de otro propietario. Esta integración utiliza nombres nuevos y no modifica aquella base. Los datos anteriores de SQLite se importan en una transacción y se conserva una copia privada antes de importarlos.

## Instalar en otra PC

1. Instalar Git, Node.js 22.19 o posterior de la serie 22 y [PostgreSQL 18](https://www.postgresql.org/download/). Recordar la contraseña del administrador elegida durante la instalación.
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

Si tu equipo ya tiene una base dedicada y un usuario con permisos sobre ella, configura directamente `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` y `PGTESTDATABASE` en `.env`, y omite `db:provision`. La base de pruebas debe ser distinta y terminar en `_test`. Esta versión se ha validado con conexiones locales; no desactives verificación TLS para adaptar una conexión remota.

5. Completar `GEMINI_API_KEY` en `.env` para generar recetas, y ejecutar:

```sh
npm run dev
```

Abrir `http://127.0.0.1:5173/?mobile=1`. Sin clave se pueden usar catálogo, perfil y favoritos; las generaciones nuevas requieren Gemini. Reiniciar el servidor después de cambiar `.env` o archivos del servidor.

## Abrir en DBeaver

Crear una **nueva conexión PostgreSQL** con host, puerto y base de arriba. Para usuario y contraseña usa `PGUSER` y `PGPASSWORD` de tu `.env` (no la clave Gemini). Probar y finalizar. Desplegar:

```text
nutribot_project → Schemas / Esquemas → nutribot → Tables / Tablas
```

En `Views / Vistas` hay `recipe_summary` y `weekly_plan_details`, útiles para mostrar el proyecto sin leer notas personales. La conexión SQLite anterior muestra una copia histórica, ya no los cambios nuevos de la app. DBeaver puede generar el diagrama de relaciones a partir de las claves foráneas.

## Modelo de datos: 21 tablas y 2 vistas

| Grupo | Tablas | Función |
| --- | --- | --- |
| Esquema y migración | `schema_migrations`, `data_imports` | Versiones aplicadas e importación identificada |
| Catálogos alimentarios | `diets`, `goals`, `allergens`, `ingredient_categories`, `units` | Valores permitidos y referenciados por claves foráneas |
| Perfil | `profiles`, `profile_allergies` | Perfil local, medidas opcionales, notas y filtros |
| Ingredientes | `ingredients`, `ingredient_allergens`, `pantry_items` | Catálogo, alérgenos conocidos y presencia en despensa |
| Recetas | `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_allergens` | Origen, modelo, cantidades para una porción y pasos ordenados |
| Nutrición ilustrativa | `recipe_nutrition_examples` | Valores históricos del catálogo, marcados `demo_unverified`; no se añaden a recetas IA |
| Interacción | `favorites`, `recipe_feedback` | Favoritos y opinión del perfil |
| Histórico, sin interfaz | `meal_plans` | Fecha, comida, receta y 1–4 porciones; un registro por día/comida/perfil |
| Trazabilidad | `generation_events` | Resultado validado de la llamada, modelo, fecha y número de recetas; sin prompt ni notas médicas |

`recipe_summary` muestra cantidades de ingredientes, pasos y favoritos. `weekly_plan_details` une planificación con los títulos de las recetas.

Las relaciones y restricciones están en [001_schema.sql](../server/postgres/001_schema.sql). Hay claves primarias, foráneas, límites numéricos, campos obligatorios, índices y restricciones de unicidad. Las recetas ya no se guardan como un único documento JSON: sus ingredientes y pasos son registros consultables.

## Alcance actual

Perfil, despensa, recetas, favoritos y opiniones se guardan en PostgreSQL. Semana se retiró de la interfaz y de la API para concentrar el proyecto en recetas. La tabla histórica meal_plans y su vista permanecen por compatibilidad; no se borran datos ni se modifica la migración ya aplicada.

## Integridad y fallos

Cada transacción usa una conexión del pool. Las actualizaciones bloquean la revisión del perfil: dos pestañas no sobrescriben cambios sin aviso. Una respuesta tardía de IA no puede guardar recetas después de un reinicio de datos o cambio de filtros. Las consultas parametrizadas separan SQL de valores del usuario.

La comprobación `/api/health` consulta PostgreSQL. Ante fallos se muestra un error y se conservan los cambios pendientes en pantalla para reintentar. No se cambia silenciosamente a SQLite ni se finge una receta de IA. No se exponen contraseñas ni errores internos del servidor de base de datos en respuestas HTTP.

La aplicación sigue atendiendo un perfil por instalación y escucha solo en esta PC. PostgreSQL no añade por sí solo cuentas, autenticación, sincronización entre PCs o validación médica. Estas funciones necesitan una siguiente etapa. La base contiene información del perfil; utiliza datos ficticios para demostrar el proyecto.

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

`db:backup` usa `pg_dump` con formato personalizado y comprueba el archivo con `pg_restore --list`. `db:verify-backup` crea otra copia usando una instantánea consistente, la restaura en la base de pruebas, compara el número de registros de las 21 tablas y limpia solo ese esquema temporal. Si ya existe `nutribot` en la base de pruebas, se detiene sin sobrescribirlo. Las copias se conservan en `data/backups/`, ignorado por Git.

En Windows se busca el directorio habitual `C:/Program Files/PostgreSQL/18/bin`. Si tu instalación está en otra ruta, define `PGBIN` en `.env`; en macOS/Linux puedes tener las utilidades en PATH. Usar utilidades compatibles con PostgreSQL 18. La restauración de la base real no se automatiza con un borrado; prueba primero una copia y conserva la base anterior.

Ver [VALIDACION.md](VALIDACION.md) para los casos de prueba, resultados esperados y guion de presentación.

Referencias técnicas: [transacciones node-postgres](https://node-postgres.com/features/transactions), [consultas parametrizadas](https://node-postgres.com/features/queries), [restricciones PostgreSQL](https://www.postgresql.org/docs/18/ddl-constraints.html), [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).
