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
- PostgreSQL conserva múltiples conversaciones por cuenta, con UUID y revisión propios. `GET /api/chats` pagina el historial; `GET/PUT /api/chats/:id` lee o guarda una conversación del perfil autenticado. Cada acceso o recarga crea un chat vacío en memoria; se inserta en la base cuando se escribe. El cambio de chat espera a guardar los cambios pendientes. Cada conversación admite 200 mensajes; el límite impide enviar más sin eliminar mensajes anteriores. Guarda identificadores de recetas y resuelve sus detalles al abrir el historial. Las fotos no se persisten y el historial no se envía como memoria a Gemini.
- La migración 003 conserva la conversación previa como una entrada del historial. `pantry_dates` guarda fechas y reglas de estimación por ingrediente y cuenta, con clave foránea a `pantry_items`. Las altas y reordenaciones conservan sus fechas; la eliminación múltiple retira ingredientes y fechas en una transacción con revisión del perfil.
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

La aplicación atiende cuentas independientes desde esta PC y su red local. Una cookie HttpOnly identifica la sesión persistida en PostgreSQL; el servidor obtiene el perfil desde esa sesión y limita cada operación a sus datos. Las contraseñas usan scrypt con sal aleatoria. Las escrituras requieren un token CSRF. En desarrollo, Vite entrega al backend la IP real mediante una cabecera interna autenticada; no se confía en cabeceras enviadas directamente por clientes remotos.

La migración 002 conserva el perfil previo para vincularlo una sola vez desde localhost. Los ingredientes de catálogo son compartidos y los ingredientes añadidos pertenecen a su cuenta. El servidor genera el QR de sus direcciones privadas y admite HTTPS configurado con certificado propio. Consulta [cuentas y acceso móvil](ACCESO_MOVIL.md).

No es un servicio público en Internet ni una base nutricional validada. El adaptador SQLite solo permite importar una instalación anterior; la app actual escribe en PostgreSQL.
