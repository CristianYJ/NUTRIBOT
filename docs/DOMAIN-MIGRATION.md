# Cambio a nutribot.online sin Cloudflare

Esta migración cambia la dirección pública de NutriBot; no modifica PostgreSQL
ni las credenciales. El dominio antiguo queda como redirección mientras su
certificado siga vigente. Las sesiones y la PWA instaladas bajo el dominio
anterior no se trasladan: los usuarios deberán iniciar sesión e instalar la
aplicación de nuevo en `nutribot.online`.

## Preparación

1. En el proveedor DNS actual, cambiar el registro `A` de `@` para que
   `nutribot.online` apunte a `159.54.144.45`. El registro `A` llamado
   `nutribot` corresponde a `nutribot.nutribot.online`, no al dominio principal.
   Mantener `www` como CNAME a `nutribot.online` y retirar cualquier `AAAA` de
   `@` o `www` que apunte a otro servidor. Conservar registros de correo si los
   hay. Esperar hasta que ambos nombres resuelvan a Oracle.
2. En OCI y firewalld permitir TCP 80 y 443 desde Internet. Caddy necesita
   acceso público para obtener automáticamente los certificados del dominio
   principal y de `www`. Mantener SSH restringido y no abrir PostgreSQL (5432)
   ni el proceso Node (8787).
3. Respaldar en privado `/etc/caddy/Caddyfile`,
   `/etc/nutribot/nutribot.env` y
   `/usr/local/lib/nutribot-deploy/pull-release.py`. Detener el temporizador de
   despliegue durante el cambio:

   ```bash
   sudo systemctl disable --now nutribot-deploy.timer
   ```

## Activación en Oracle

4. Copiar los archivos revisados `deploy/oracle/Caddyfile` y
   `deploy/oracle/pull-release.py` del mismo commit a Oracle. Instalar el
   primero como `/etc/caddy/Caddyfile` y el segundo como
   `/usr/local/lib/nutribot-deploy/pull-release.py`, conservando propietarios y
   permisos actuales. El despliegue automático de la aplicación no reemplaza
   estos archivos del sistema.
5. Editar únicamente la línea `PUBLIC_ORIGIN` en
   `/etc/nutribot/nutribot.env` para dejar
   `PUBLIC_ORIGIN="https://nutribot.online"`. No volver a ejecutar
   `configure-secrets.py`: se niega a sobrescribir la configuración existente.
   No copiar el `.env` local ni mostrar secretos en la terminal.
6. Reiniciar Caddy y NutriBot, verificar sus registros y esperar a que Caddy
   emita los certificados. Confirmar HTTPS antes de reactivar el temporizador:

   ```bash
   sudo systemctl restart caddy nutribot
   sudo journalctl -u caddy -u nutribot -n 60 --no-pager
   curl --fail --show-error --silent https://nutribot.online/api/health
   curl --fail --show-error --silent -o /dev/null -w '%{http_code}\n' https://nutribot.online/
   curl --head https://www.nutribot.online/
   ```

   Comprobar inicio de sesión, QR de instalación, una receta y que las
   redirecciones conserven la ruta. El comprobador de salud del despliegue usa
   el nombre nuevo aunque resuelva localmente a `127.0.0.1` en Oracle.
7. Solo cuando esas comprobaciones funcionen, reactivar el temporizador:

   ```bash
   sudo systemctl enable --now nutribot-deploy.timer
   sudo systemctl list-timers nutribot-deploy.timer --no-pager
   ```

## Redirección del dominio anterior

Para que las direcciones antiguas lleguen al sitio nuevo, conservar registros
DNS `A` para `nutribot.facheritossv.com` y
`www.nutribot.facheritossv.com` apuntando a `159.54.144.45`. El registro
`www.nutribot` se crea en la zona DNS de `facheritossv.com`, no en la de
`nutribot.online`. Si hay un `AAAA` antiguo para cualquiera de esos nombres,
retirarlo o corregirlo. Comprobar la resolución de ambos antes de activar en
Oracle el bloque `www.nutribot.facheritossv.com` del Caddyfile.

El bloque sin `www` utiliza el certificado ya instalado; su vencimiento debe
verificarse y renovarse para mantener esa redirección. Caddy obtiene uno
automáticamente para el nombre con `www` cuando DNS y puertos 80/443 funcionan.
Validar la configuración y comprobar con `curl -I` que ambos nombres devuelven
un `Location: https://nutribot.online/...` sin error TLS. Cloudflare se
configurará después.

Las PWA ya instaladas bajo el dominio anterior conservan su origen. La
redirección puede abrir el sitio nuevo, pero no traslada automáticamente la
instalación, la sesión ni los datos locales del navegador. Los usuarios deben
iniciar sesión e instalar la PWA desde `nutribot.online` para tenerla asociada
al dominio nuevo.
