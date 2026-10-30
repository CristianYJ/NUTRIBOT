# Cambio de contraseña

## Funciones

- «Olvidé mi contraseña» envía un enlace al correo registrado. La respuesta pública es la misma aunque no exista una cuenta.
- En el portal administrativo, «Enviar enlace para cambiar contraseña» envía el mismo tipo de enlace al usuario seleccionado. El administrador no ve el token ni define la contraseña.
- En «Mi perfil», el usuario autenticado puede cambiar la contraseña proporcionando la actual.
- El enlace abre un formulario para elegir una contraseña nueva; no inicia sesión. Vence a los 20 minutos, se usa una vez y el cambio cierra todas las sesiones anteriores. Después hay que iniciar sesión con la nueva contraseña.
- El cambio desde «Mi perfil» confirma el resultado y conserva la sesión actual. Cierra las otras sesiones de la cuenta.

## Correo de Hostinger

Crear y mantener el buzón `soporte@nutribot.online`. Configurar **solo en el servidor**, nunca en el repositorio:

```text
NUTRIBOT_SMTP_PASSWORD=<contraseña del buzón>
NUTRIBOT_SMTP_HOST=smtp.hostinger.com
NUTRIBOT_SMTP_PORT=465
```

El usuario SMTP y remitente están fijados a `soporte@nutribot.online`. Hostinger documenta `smtp.hostinger.com` con SSL en 465 o STARTTLS en 587; si la cuenta usa otro producto de correo, consultar la configuración de ese buzón y ajustar `NUTRIBOT_SMTP_HOST` y `NUTRIBOT_SMTP_PORT`. `PUBLIC_ORIGIN` debe ser `https://nutribot.online` para que los enlaces apunten al dominio correcto. Sin contraseña SMTP, el servidor sigue funcionando, pero el envío de enlaces devuelve un error de configuración.

En Oracle, añadir `NUTRIBOT_SMTP_PASSWORD` a `/etc/nutribot/nutribot.env` con el mismo procedimiento privado usado para las otras claves. No imprimir la contraseña en la terminal, en capturas, en el historial de comandos o en el journal. Un cambio en ese archivo requiere reiniciar el servicio para que lea el valor nuevo.

## Despliegue de la base de datos

La migración `017_password_reset.sql` crea la tabla de tokens y exige el despliegue manual planificado descrito en [CONTINUOUS-DEPLOYMENT.md](CONTINUOUS-DEPLOYMENT.md#cambios-de-base-de-datos). Antes de fusionar, detener `nutribot-deploy.timer` para que no intente instalar la versión nueva por sí solo. Tras aprobar el PR y publicarse la release inmutable del SHA completo de `main`, ejecutar `pull-release.py --allow-migration SHA_COMPLETO`, comprobar el flujo de correo y volver a activar el temporizador.

La prueba funcional consiste en solicitar un enlace para una cuenta propia, abrirlo, fijar una contraseña nueva y confirmar que pide iniciar sesión. Probar que un segundo uso del mismo enlace falla. Desde el portal, enviar un enlace a una cuenta de prueba y comprobar que el destinatario recibe el formulario de cambio.
