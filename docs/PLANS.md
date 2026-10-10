# Planes de usuario

Esta etapa prepara la asignación e insignia de los planes **Básico**, **NutriPro** y **NutriPro+**. Todavía no implementa pagos, suscripciones con vencimiento ni límites de funciones por plan. Esas reglas deben definirse antes de añadir cobros o permisos diferenciados.

## Datos y seguridad

- `plans`: catálogo de tres códigos estables: `basico`, `nutripro`, `nutripro_plus`.
- `profiles.plan_code`: clave foránea obligatoria, un plan actual por cuenta. Las cuentas existentes y nuevas empiezan en `basico`.
- `profile_plan_history`: asignación inicial y cambios, con origen, destino, fecha, rol PostgreSQL y motivo. Un trigger registra inserciones y cambios reales; guardar el mismo plan no duplica el historial.
- `GET /api/state` devuelve `profile.plan = { code, name }` de la cuenta autenticada. La insignia no concede permisos.
- El registro y la edición de perfil no aceptan cambios de plan. No hay un endpoint público ni selector para autoconcederse NutriPro.
- La edición administrativa requiere acceso a la base de datos; `changed_by` registra el rol de DB, no identifica a una persona si varias usan el mismo rol. Un panel administrativo futuro debe incorporar roles de administrador y auditoría de la persona responsable.

## Migración y despliegue

`server/postgres/004_user_plans.sql` se aplica una sola vez por el migrador habitual al iniciar la versión nueva o ejecutar `npm run db:init`. Se conserva el contenido de las cuentas; no hay reinicio ni borrado de despensas/conversaciones. Las pruebas usan una base separada terminada en `_test` y esquemas temporales.

**Oracle necesita un despliegue manual revisado para esta versión.** El actualizador instalado detectará el cambio en `server/database.js` y las migraciones, lo bloqueará y conservará la versión actual. No desactivar ni saltarse esa protección.

Antes de desplegar: verificar las pruebas de PostgreSQL en CI, respaldar la base y comprobar el respaldo, detener el timer del actualizador y coordinar una ventana de mantenimiento. Aplicar la nueva versión y la migración con el rol dueño de la aplicación; verificar cuentas, planes y salud HTTPS antes de establecer la nueva versión como base del actualizador y reactivar el timer. El código anterior rechaza la versión 4 del esquema: no hacer un rollback automático a ese código tras migrar. Preparar previamente la recuperación compatible; restaurar una copia de DB puede perder escrituras posteriores al respaldo.

La preparación de estos archivos no ejecuta la migración en Oracle ni asigna planes premium a cuentas reales.

## Asignación administrativa desde terminal

Después de migrar, desde la carpeta del proyecto con las credenciales de DB configuradas. Primero revisar la vista previa:

```sh
npm run plans:assign -- --email usuario@ejemplo.com --plan nutripro --reason "Asignación autorizada para la demostración"
```

Solo con `--apply` se guarda el cambio:

```sh
npm run plans:assign -- --email usuario@ejemplo.com --plan nutripro --reason "Asignación autorizada para la demostración" --apply
```

En el paquete de Oracle también está disponible `server/manage-plans.js`; se ejecuta con las variables de DB del servidor. No copiar contraseñas al comando ni al repositorio. El comando no crea cuentas, no migra el esquema y no modifica datos sin `--apply`. Aumenta la revisión del perfil para que un formulario anterior no sobrescriba cambios. El usuario ve su plan actualizado al recargar.

## Comprobación

```sh
npm run check
npm run test:postgres
```

Se verifica asignación por defecto, historial, vista previa, persistencia, aislamiento entre cuentas, rechazo de planes inválidos y que ni el registro ni una actualización HTTP del perfil puedan elevar el plan.
