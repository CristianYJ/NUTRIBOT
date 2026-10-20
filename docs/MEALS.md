# Comidas consumidas y valoración

La migración `007_meal_log.sql` añade el registro por cuenta de comidas consumidas y su valoración opcional de 1 a 5 estrellas. Ejecutar `npm run db:backup` antes de actualizar una base existente; `npm run db:init` aplica las migraciones pendientes. Reiniciar el servidor después de actualizar el código.

En una receta, «Sí, ya la comí» registra una porción personal para hoy. El selector de personas de la receta no multiplica lo que consume el usuario. «Registrar otra porción» requiere una nueva confirmación; cambiar las estrellas no registra otra comida. El usuario puede deshacer un registro.

El servidor calcula y conserva una instantánea de la nutrición USDA por persona al registrar la comida. No acepta cantidades, fecha ni nutrientes proporcionados por el cliente. Los datos desconocidos permanecen sin verificar; el inicio muestra subtotales parciales identificados cuando faltan datos. Los cambios posteriores en referencias USDA no reescriben comidas anteriores.

El día se calcula en `America/El_Salvador`. El panel de inicio suma solo las comidas confirmadas ese día. Los antiguos «Me gusta» no se convierten en comidas consumidas ni en estrellas.

## API autenticada

- `GET /api/meals/today`: comidas de hoy, totales disponibles y cobertura por nutriente.
- `PUT /api/meals/:uuid`: confirmar una comida con `{ "recipeId": "..." }`. Repetir el mismo UUID es idempotente.
- `PATCH /api/meals/:uuid`: guardar `{ "rating": 1 }`, con entero de 1 a 5.
- `DELETE /api/meals/:uuid`: deshacer un registro de la propia cuenta.

Las rutas utilizan las protecciones existentes de sesión, origen y CSRF. Las pruebas de PostgreSQL cubren aislamiento entre cuentas, duplicados, porción personal, persistencia de estrellas, datos incompletos, cambio de día y restauración de datos de cuenta.
