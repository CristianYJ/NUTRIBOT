# Arquitectura actual

React muestra cinco secciones: Inicio, Despensa, Nutribot IA, Mis recetas y Perfil. Vite sirve la interfaz en desarrollo. Un servidor Node.js atiende la API y consulta PostgreSQL mediante node-postgres.

## Generar una receta

1. La interfaz guarda despensa y perfil en PostgreSQL y obtiene su revisión.
2. Envía el pedido y el tiempo máximo a `POST /api/recipes/suggest`.
3. El servidor lee ingredientes y filtros guardados, comprueba la revisión y valida la petición.
4. Gemini recibe el contexto culinario permitido. La clave permanece en el servidor.
5. Se valida la respuesta. Receta, ingredientes, pasos y registro de generación se guardan en una transacción antes de responder.

Los errores de cuota, red o validación se muestran al usuario; no se sustituyen por respuestas de ejemplo.

## Datos y navegación

- PostgreSQL conserva perfil, despensa, favoritos, opiniones y recetas. Las escrituras usan consultas parametrizadas y revisiones para detectar conflictos entre pestañas.
- La dirección guarda la sección (por ejemplo `#assistant`) y la vista móvil (`?mobile=1`). Recargar y usar Atrás/Adelante restaura la navegación.
- SessionStorage conserva hasta 40 mensajes recientes y el borrador de esa pestaña. Guarda identificadores de recetas; al recargar sus detalles se obtienen de PostgreSQL. No es historial compartido ni memoria remota de Gemini.
- El esquema inicial conserva la tabla histórica `meal_plans` y su vista para no eliminar datos de instalaciones anteriores. La función Semana, su interfaz y sus rutas API se retiraron del alcance actual. No se cambian migraciones ya aplicadas.

## Organización

| Carpeta | Contenido |
| --- | --- |
| src | Interfaz, navegación y cliente HTTP |
| server | API, Gemini, validación y PostgreSQL |
| server/postgres | Migraciones SQL |
| scripts | Preparación, copias y validación |
| tests | Reglas, API, navegación e integración con PostgreSQL |
| docs | Instalación y validación |

La aplicación escucha en esta PC y utiliza un perfil local. No implementa autenticación, una API pública ni una base nutricional validada. El adaptador SQLite solo permite importar una instalación anterior; la app actual escribe en PostgreSQL.
