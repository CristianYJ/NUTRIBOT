# Afiliaciones de prueba con Wompi El Salvador

La integración local prepara un enlace recurrente individual para cada cuenta y plan. NutriBot fija el importe simulado en el servidor: NutriPro, $2.99 mensuales; NutriMax, $9.99 mensuales. Esta versión solo admite el negocio de Wompi en modo de pruebas: comprueba el estado del negocio antes de crear el enlace y rechaza cualquier enlace o transacción productiva. El plan de prueba solo se activa cuando recibe un webhook con firma válida y confirma la transacción simulada en la API de Wompi. Los retornos del navegador no cambian el plan.

## Configuración

En el archivo privado `.env` del servidor:

```text
WOMPI_APP_ID=
WOMPI_API_SECRET=
WOMPI_RECURRING_ENABLED=0
WOMPI_WEBHOOK_URL=https://nutribot.online/api/billing/wompi/webhook
```

El App ID y API Secret se obtienen del negocio **en modo desarrollo** en el panel de Wompi. No se incluyen en Git. Registrar `https://nutribot.online/api/billing/wompi/webhook` como webhook del negocio en Wompi al desplegar el prototipo; Wompi no puede acceder a `localhost`. La ruta admite únicamente solicitudes firmadas. Con `WOMPI_RECURRING_ENABLED=0` no se generan enlaces nuevos. Tras configurar las credenciales y el webhook, cambiarlo a `1` permite iniciar afiliaciones de prueba. La [documentación de pruebas](https://docs.wompi.sv/metodos-api/transaccion_prueba) indica que `EsProductiva=false` significa que no se realizó un cargo real.

### Pruebas desde la PC local

Las claves en `.env` permiten generar enlaces desde la PC, pero Wompi necesita una URL HTTPS pública para avisar a **esa misma instancia local** cuando se complete una transacción. Apuntar el webhook a `nutribot.online` enviaría la confirmación al servidor en Oracle y dejaría pendiente el plan en la base local. Para probar el ciclo completo:

1. Iniciar NutriBot local con `npm run start` y crear un túnel HTTPS público que reenvíe solicitudes a `http://localhost:8787`.
2. Registrar en el negocio Wompi de desarrollo la URL `https://DOMINIO_DEL_TUNEL/api/billing/wompi/webhook` en **Notifica vía Webhook**.
3. Configurar en el `.env` local `WOMPI_APP_ID`, `WOMPI_API_SECRET`, `WOMPI_RECURRING_ENABLED=1` y `WOMPI_WEBHOOK_URL=https://DOMINIO_DEL_TUNEL/api/billing/wompi/webhook`. Reiniciar `npm run start` después de cambiar el archivo.
4. Abrir NutriBot en `http://localhost:8787` y probar la afiliación. El navegador sigue usando localhost; solo el webhook firmado entra por el túnel.

La URL del túnel debe coincidir exactamente entre Wompi y `.env`; si cambia, actualizar ambas. Mantener las claves fuera del chat y del repositorio. El servidor local solo acepta el host del túnel configurado para la ruta firmada del webhook; las demás rutas conservan la verificación habitual de origen. La integración actual requiere que el negocio Wompi siga en modo desarrollo.

## Cambio NutriPro a NutriMax

En una cuenta con NutriPro activo, Mi Perfil muestra el ajuste proporcional de la diferencia de $7.00 por los días restantes. El enlace de pago único dura 30 minutos como máximo, admite un solo pago exitoso y fija el importe en el servidor. La cuenta conserva NutriPro mientras espera el pago. NutriBot valida firma, negocio, importe, enlace y transacción en la API de Wompi. Después desactiva el enlace recurrente individual de NutriPro y aplica NutriMax hasta el vencimiento que ya tenía el período. Un aviso en Mi Perfil aparece tres días antes de ese vencimiento para que la persona acepte un nuevo enlace recurrente NutriMax. Esta segunda afiliación requiere aceptación expresa en Wompi; no se crea silenciosamente.

El cambio solo se habilita con `WOMPI_RECURRING_ENABLED=1`, `WOMPI_WEBHOOK_URL` público y HTTPS, y un negocio Wompi no productivo. La migración `022_wompi_upgrades.sql` crea el registro de ajustes. Probar con dos cuentas y enlaces distintos antes de usarlo con personas: pago rechazado, pago confirmado, webhook duplicado, cancelación del enlace anterior, vencimiento y afiliación nueva.

## Pendiente de confirmar con Wompi

La [documentación de enlace recurrente](https://docs.wompi.sv/metodos-api/crear-enlace-pago-recurrentes) describe la afiliación y el cargo mensual, pero no especifica el cuerpo del webhook de renovación ni un endpoint para cancelar una suscripción individual. El [webhook publicado](https://docs.wompi.sv/webhook/definicion-webhook) muestra transacciones de enlaces normales. Por eso el procesador de NutriBot solo acepta una notificación recurrente cuando incluye un identificador de enlace que coincida con el enlace individual guardado, además de una firma, una transacción simulada aprobada, un negocio y un monto válidos. Cualquier otro formato queda sin activar hasta que podamos adaptarlo a una muestra de prueba.

Solicitar a Wompi:

1. Un webhook real de afiliación y otro de renovación recurrente, con datos personales y secretos ocultos.
2. El procedimiento/API para cancelar la suscripción de una persona sin afectar las demás.
3. La forma recomendada de conocer pagos fallidos, devoluciones y disputas de un cargo recurrente.

La cancelación solicitada por la persona sigue gestionándose por `soporte@nutribot.online`. El cambio Pro a Max usa el enlace recurrente individual que NutriBot creó para esa cuenta y lo desactiva tras confirmar el pago único. No basta cambiar el plan en la base de datos para detener un cobro.

## Despliegue posterior

Las migraciones `021_wompi_billing.sql` y `022_wompi_upgrades.sql` se aplican al iniciar la versión nueva. Seguir el procedimiento habitual de respaldo y despliegue con autorización de migración. No configurar las claves en Oracle hasta que el prototipo se despliegue para pruebas. Esta versión nunca acepta un negocio productivo; habilitar pagos reales en el futuro requerirá una implementación y revisión separadas.
