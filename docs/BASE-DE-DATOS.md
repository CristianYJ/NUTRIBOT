# Base de datos local y Gemini

Nutribot combina SQLite con la API de Gemini. SQLite conserva la información; Gemini propone recetas usando la despensa y los filtros guardados. DBeaver es un administrador con el que puedes consultar las tablas, no el motor de base de datos.

## Preparación reproducible

Requiere Node.js 22.19 o posterior dentro de la serie 22. No hace falta instalar MySQL, PostgreSQL ni un servicio de SQLite.

```sh
npm ci
npm run setup
npm run dev
```

`setup` crea `.env` si falta y aplica la primera migración a `data/nutribot.sqlite`. Las siguientes ejecuciones conservan los datos: no vacían tablas ni vuelven a insertar el catálogo. El inicio de la app también prepara la base si falta. No se leen bases de otros proyectos de la PC.

El motor usa `node:sqlite`, incluido en Node. En Node 22.19 esa API puede mostrar `ExperimentalWarning`; es un aviso del módulo y no significa que la creación haya fallado. Véase la [documentación de Node](https://nodejs.org/download/release/v22.19.0/docs/api/sqlite.html).

## Abrir con DBeaver

1. Ejecuta `npm run db:init` para crear la base y mostrar su ubicación absoluta.
2. En DBeaver selecciona **Nueva conexión → SQLite**.
3. En **Path / Ruta**, elige el archivo `data/nutribot.sqlite` dentro de tu carpeta de Nutribot.
4. Prueba la conexión; si DBeaver lo solicita, descarga su controlador desde el asistente. Finaliza y despliega **Tables / Tablas**.

No hay usuario ni contraseña para esta conexión a un archivo local. La guía sigue la [documentación de SQLite en DBeaver](https://dbeaver.com/docs/dbeaver/Database-driver-SQLite/).

Consultas para demostrar la integración, sin imprimir información médica:

```sql
SELECT id, name, category, unit FROM ingredients;

SELECT i.name, i.unit
FROM pantry_items p JOIN ingredients i ON i.id = p.ingredient_id
WHERE p.profile_id = 1 ORDER BY p.position;

SELECT source, COUNT(*) AS total FROM recipes GROUP BY source;

SELECT r.title, r.source, r.model
FROM favorites f JOIN recipes r ON r.id = f.recipe_id
WHERE f.profile_id = 1;

SELECT r.title, i.name, ri.amount
FROM recipe_ingredients ri
JOIN recipes r ON r.id = ri.recipe_id
JOIN ingredients i ON i.id = ri.ingredient_id
ORDER BY r.title, ri.position;
```

Usa la app para editar los datos. Las modificaciones directas desde DBeaver evitan la validación y el control de versiones de la API y podrían dejar datos incompatibles. El catálogo está versionado con el proyecto; editarlo o ampliarlo requiere también actualizar las reglas alimentarias del servidor.

## Tablas

| Tabla | Qué conserva |
| --- | --- |
| `schema_migrations` | Versión del esquema aplicado |
| `profiles` | Un perfil local, medidas opcionales, preferencias, notas y revisión |
| `profile_allergies` | Alergias declaradas del perfil |
| `ingredients` | Los 14 ingredientes iniciales con nombre, unidad y categoría |
| `pantry_items` | Relación entre el perfil y sus ingredientes disponibles |
| `recipes` | Ejemplos y recetas de IA; origen, modelo, fecha y contenido estructurado |
| `recipe_ingredients` | Ingredientes, cantidades y orden de cada receta |
| `favorites` | Relación del perfil con recetas guardadas |
| `recipe_feedback` | Opiniones sobre recetas |

La despensa registra presencia de ingredientes, todavía no existencias en gramos. Las cantidades de receta son texto para una porción. El catálogo de 6 ejemplos conserva sus números ilustrativos; la base no se convierte por ello en una fuente nutricional certificada.

## Flujo de la aplicación

1. `GET /api/state` carga perfil, despensa, catálogo, historial de recetas, favoritos y opiniones.
2. Los cambios de la interfaz se envían con `PUT /api/state`. La API valida los campos y guarda en una transacción. La pantalla muestra guardando, guardado o error.
3. Antes de generar, el navegador termina de guardar los cambios pendientes. `POST /api/recipes/suggest` comprueba la revisión y lee despensa y filtros desde SQLite. El cliente no puede sustituirlos por otros para evitar una restricción.
4. Gemini recibe solo el contexto culinario permitido. La respuesta se valida, se inserta en `recipes` y `recipe_ingredients` y después se entrega a la interfaz. Las recetas generadas no pueden subirse desde el navegador fingiendo origen Gemini.
5. El recetario recupera las recetas al recargar o reiniciar. El chat sigue en memoria; no se guarda ni se manda historial de conversación a Google.
6. Si otra pestaña cambió los datos, la revisión evita que se sobrescriban. La interfaz pide recargar la versión guardada. No hay sincronización instantánea entre pestañas.
7. «Borrar datos locales y restaurar» pide confirmación dentro de la app y usa `DELETE /api/state`: elimina el historial de IA y favoritos, reinicia el perfil y despensa, y conserva el catálogo. Una respuesta de IA pendiente no puede recrear lo borrado después de ese cambio de revisión.

La API admite hasta 1000 recetas generadas; al alcanzar ese límite solicita hacer una copia y limpiar datos. No elimina recetas automáticamente. Los fallos de guardado no se ocultan con un almacenamiento temporal alternativo.

## Copias de seguridad y privacidad

```sh
npm run db:backup
```

Crea una copia consistente en `data/backups/`, incluso si la app está abierta. No copies solo el archivo principal mientras SQLite tiene escrituras pendientes: utiliza este comando. Para una restauración manual, detén la app y cierra DBeaver, conserva primero la carpeta `data` completa en otra ubicación privada y coloca la copia elegida como `data/nutribot.sqlite` en una carpeta `data` nueva, sin archivos WAL/SHM antiguos.

La base contiene los datos que escribas en el perfil, incluidas notas. No está cifrada por esta aplicación ni protegida por un inicio de sesión: quien tenga acceso al archivo o a la app local puede verlos. Usa datos ficticios para las demostraciones. La API escucha únicamente en esta PC. No expongas esta versión como servicio público sin añadir autenticación y aislamiento por usuario.

`data/`, bases y copias están ignoradas por Git. Vite bloquea su descarga por HTTP y el servidor de producción solo sirve `dist/`. La clave de Gemini permanece separada en `.env`; no se guarda en SQLite. Borrar datos desde la app no elimina las copias de seguridad ni datos ya procesados por Google; tampoco garantiza un borrado forense del disco.

La sesión de la versión anterior en `sessionStorage` no se importa ni se borra automáticamente. Esta versión inicia su base con el catálogo y el perfil de demostración. No se presume que aquellas recetas almacenadas en el navegador tengan procedencia validada.

## Equipo y evolución

Cada PC crea su propia base; GitHub comparte código, migraciones y catálogo, no los datos personales. Dos personas usando la misma instalación local comparten el perfil, porque todavía no hay cuentas.

El acceso a datos está concentrado en `server/database.js`, separado de la API y Gemini. Para trabajar con cuentas desde varios dispositivos, el siguiente paso es implementar autenticación y repositorios por usuario, y migrar el esquema y datos a un servidor como PostgreSQL. Esa migración requiere trabajo explícito; no basta cambiar una variable.
