# Planes de usuario

La implementación ofrece tres niveles. No incluye cobros, renovación de suscripciones ni modalidad anual. Los planes premium se asignan administrativamente para pruebas.

| Función | Básico | NutriPro | NutriMax |
| --- | --- | --- | --- |
| Generaciones de recetas por semana | 4 | 14 | 22 |
| Análisis de fotos con Nutri-Vision por mes | 1 | 3 | 6 |
| Agregar alimentos manualmente, sin IA | Incluido | Incluido | Incluido |
| Perfil, alergias, restricciones, catálogo, favoritos e historial | Incluido | Incluido | Incluido |

Las cuotas están definidas en `src/plan-catalog.js` y se comprueban en el servidor. Se conservan los límites técnicos generales de almacenamiento y de solicitudes por minuto. La nutrición USDA disponible y los filtros alimentarios siguen incluidos en todos los planes; no se anuncian funciones premium sin implementar.

Las cuentas con rol Admin tienen el plan efectivo **Staff**, con los mismos cupos que NutriMax. Staff no es una membresía gratis ni de pago; el plan asignado en la base de datos permanece intacto.

## Cómo se cuenta

- Una generación es una solicitud que termina con recetas válidas y guardadas. Si devuelve dos alternativas, cuenta como una generación. Pedir más alternativas cuenta como otra solicitud.
- Errores, preguntas de aclaración, respuestas sin recetas y preparaciones pendientes de completar su nutrición no consumen cuota semanal.
- Una foto consume un uso cuando devuelve al menos un alimento identificado, aunque luego el usuario cierre el formulario sin guardar. Los errores y resultados vacíos no consumen cuota mensual.
- La semana empieza el lunes a las 00:00; el mes, el día 1 a las 00:00, en `America/El_Salvador` (UTC−6). Los cupos no se acumulan.
- El consumo pertenece a la cuenta. Se conserva al cerrar sesión, reiniciar el servidor, restaurar el perfil o cambiar de plan. Un cambio de plan modifica el límite del período actual, sin borrar usos previos.
- Las operaciones reservan un uso durante un máximo de cinco minutos. Un bloqueo de fila de perfil impide superar el cupo mediante solicitudes simultáneas. Las reservas fallidas se liberan y las abandonadas caducan. Guardar recetas y confirmar su consumo se realiza en una sola transacción.
- Los consumos anteriores a instalar la migración 006 no se descuentan retroactivamente. Los contadores nuevos empiezan en cero.

## Datos y acceso

- `plans`: catálogo con los códigos estables `basico`, `nutripro`, `nutripro_plus`. El último se muestra como **NutriMax**, conservando las claves foráneas e historial existentes.
- `profiles.plan_code`: clave foránea, un plan actual por cuenta. Las cuentas nuevas empiezan en Básico.
- `profile_plan_history`: asignaciones y cambios administrativos auditados mediante trigger.
- `plan_usage`: reservas y usos confirmados por perfil, función y período.
- `GET /api/plan`: devuelve el plan, usados, reservas pendientes, disponibles y próxima renovación de la cuenta autenticada. Se muestra en Perfil, chat y Nutri-Vision.
- El registro y la edición de perfil no permiten elevar el plan. No existe un endpoint público para concederse premium. El servidor utiliza el perfil autenticado, nunca un plan enviado por el navegador.
- `POST /api/pantry/analyze` solo admite imágenes; rechaza el antiguo análisis por texto. La entrada manual usa `/api/pantry/add` y permanece disponible al agotar el cupo.

## Pruebas locales y migración

La migración `server/postgres/006_plan_usage.sql` añade el registro de consumo y cambia el nombre visible de NutriPro+ a NutriMax. Conserva las cuentas, recetas, conversaciones y asociaciones de planes.

Con PostgreSQL local configurado, detener el servidor de desarrollo anterior y ejecutar:

```sh
npm run check
npm run test:postgres
npm run db:backup
npm run db:init
npm run db:validate
npm run dev
```

La base de pruebas debe ser distinta de la aplicación y terminar en `_test`. Las pruebas crean esquemas temporales y cubren concurrencia, aislamiento, errores, reinicios, restauración del perfil, cambio de plan y renovación de períodos, sin llamadas reales a Gemini o USDA.

Recorrido manual: abrir Perfil y consultar el cupo; agregar un alimento manualmente; revisar el contador de Nutri-Vision; generar recetas y comprobar el consumo. Los análisis reales de fotos y las recetas reales sí llaman a los proveedores configurados.

## Asignación administrativa para pruebas

Desde la carpeta del proyecto, con las credenciales locales de PostgreSQL configuradas:

```sh
npm run plans:assign -- --email usuario@ejemplo.com --plan nutripro --reason "Prueba local autorizada"
```

Este comando solo muestra una vista previa. Agregar `--apply` guarda el cambio. Se aceptan `basico`, `nutripro` y `nutrimax`; `nutrimax` se resuelve al código histórico `nutripro_plus`. El cambio conserva consumo e historial, aumenta la revisión del perfil y se ve al recargar la aplicación.

## Servidor compartido

Estos cambios se preparan localmente y no despliegan nada en Oracle. La migración 006 requiere un despliegue revisado con respaldo: el actualizador protege cambios de DB y migraciones. No omitir esa protección. El código anterior acepta como máximo la versión 5 del esquema, por lo que no se debe revertir solo el código después de migrar a la 6. Preparar una recuperación compatible antes del despliegue.
