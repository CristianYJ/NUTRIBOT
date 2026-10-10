# Despliegue continuo de Nutribot

Repositorio público: `CristianYJ/NUTRIBOT`. Producción: rama `main`, Oracle ARM64.

## Flujo del equipo

1. Crear una rama para cada cambio y abrir un Pull Request hacia `main`.
2. El workflow **Nutribot Oracle / verify** ejecuta pruebas, compilación, pruebas
   de integración con PostgreSQL 18 aislado y pruebas del instalador.
3. Revisar el PR y fusionarlo. Cada push a `main` vuelve a pasar las comprobaciones
   y publica una release `oracle-<SHA>` con el código del servidor y `dist`.
4. Oracle consulta cada cinco minutos el commit actual de `main`. Solo instala
   su paquete si el workflow de ese mismo commit terminó con éxito. Verifica el
   SHA-256 publicado por GitHub y el manifiesto interno antes de extraer archivos.
5. Instala dependencias de producción en ARM64, sin scripts npm, con un usuario
   separado sin acceso a secretos. Guarda una copia de PostgreSQL, cambia la
   versión, reinicia Nutribot y prueba HTTPS con `/api/health`, que comprueba la DB.
6. Si falla el arranque o la salud, restaura el código anterior. No restaura la
   base automáticamente: eso podría borrar datos escritos por usuarios.

El sitio puede interrumpirse unos segundos al reiniciar. No es despliegue sin
interrupción. Gemini no se invoca en las pruebas ni en la comprobación de salud.
La verificación de Actions demuestra CI, no que Oracle haya desplegado; consultar
el journal del servidor para saber qué commit está activo.

## Permisos de GitHub

No se necesita contraseña, token personal, clave SSH ni runner de Actions en
Oracle. Se descargan releases públicas por HTTPS. El workflow usa el
`GITHUB_TOKEN` temporal con `contents: write` exclusivamente en el job de publicación;
las comprobaciones de PR tienen solo lectura. No usa secretos de producción.

Una persona con permiso para subir workflows puede abrir el PR con estos archivos.
Si GitHub rechaza la publicación por políticas de Actions, el propietario debe
habilitar el permiso necesario en Settings → Actions → General. No dar permisos
administrativos al equipo entero. La sección Secrets de Actions, por sí sola,
no demuestra que un usuario sea administrador.

El propietario `CristianYJ` debe configurar la protección de `main`: PR obligatorio,
una aprobación y comprobación requerida `verify` del workflow Nutribot Oracle.
Antes de la primera publicación también debe activar **Settings → General →
Releases → Enable release immutability**. El actualizador rechaza releases
modificables o publicadas por una cuenta distinta de `github-actions[bot]`.
Esto evita sustituir el paquete después de que haya pasado la comprobación.
La opción solo afecta publicaciones futuras: si la primera falló por no tenerla
activa, habilitarla y publicar un nuevo commit. El workflow publica primero un
borrador con todos sus archivos y luego lo convierte en release inmutable.
Sin esa protección, un push directo que pase CI también se despliega.
Revisar especialmente cambios en `.github/workflows/`, dependencias y código del
servidor: quien puede cambiar producción puede acceder a los datos de la aplicación.
Si el repositorio pasa a privado, este mecanismo dejará de descargar y conservará
la última versión; requerirá revisar la autenticación.

## Primera publicación

Antes de subir, incluir los ajustes locales de modo público, la prueba
`public-deployment.test.js` y los archivos de `deploy/oracle`. Nunca subir `.env`,
llaves, dumps, certificados, `data`, `node_modules` o `postgres-admin.env`.
La nueva plantilla Caddy refleja el certificado DNS ya instalado; el despliegue
continuo NO reemplaza Caddy, certificados, unidades systemd ni archivos de `/etc`.

Después de fusionar este cambio, esperar que Actions publique la primera release.
Copiar los archivos revisados del instalador a Oracle usando la conexión SSH del
administrador. Desde la carpeta `deploy/oracle` ejecutar:

```bash
sudo bash install-cd.sh
sudo systemctl start nutribot-deploy.service
sudo journalctl -u nutribot-deploy.service -n 60 --no-pager
```

Solo después de comprobar el primer despliegue:

```bash
sudo systemctl enable --now nutribot-deploy.timer
sudo systemctl list-timers nutribot-deploy.timer --no-pager
```

El instalador no activa el temporizador por sí solo. No modifica el firewall:
se conserva la lista de IP autorizadas para entrar al sitio. Las nuevas personas
del equipo necesitarán que su IP de salida esté autorizada para usar producción.

## Operación y reversión

```bash
sudo journalctl -u nutribot-deploy.service -n 60 --no-pager
sudo cat /var/lib/nutribot-deploy/state.json
sudo systemctl disable --now nutribot-deploy.timer
sudo systemctl stop nutribot-deploy.service
sudo python3 /usr/local/lib/nutribot-deploy/pull-release.py --rollback
```

Detener el timer y el servicio antes de la reversión manual evita carreras. La
versión anterior se conserva en `/opt/nutribot/releases`. El primer despliegue
convierte el directorio `current` en un enlace y conserva la instalación inicial.
Un commit cuyo arranque falló no se reintenta automáticamente; corregirlo con un
nuevo commit. El journal pendiente permite intentar recuperar la versión anterior
si el proceso se interrumpe durante la activación.

Los respaldos están en `/var/lib/nutribot-deploy/backups`, privados de root.
Versiones y respaldos se conservan; revisar el espacio y copiar respaldos fuera
de la VM. El actualizador se detiene si queda menos de 1 GiB. Esto no sustituye un
plan de respaldo externo. La reversión automática cubre arranque y salud, no todos
los errores funcionales: probar también login y las funciones cambiadas.

## Cambios de base de datos

El arranque actual aplica migraciones. Por eso el despliegue automático bloquea
cambios en `server/database.js` y `server/postgres/`, incluso si CI pasa. También
bloquea adiciones y eliminaciones. Cambios CRLF/LF no cuentan como una migración.
Estos cambios necesitan una publicación manual planificada con respaldo y revisión
de compatibilidad; no quitar el control para forzar el despliegue. Las versiones
con cambios de base deben permitir volver al código anterior o tener un plan de
recuperación explícito. El despliegue no copia datos de la PC ni ejecuta provisionado.

## Certificado y fin del semestre

Certificado actual: vence el 8 de enero de 2027. A petición del usuario no se
configura renovación automática porque el proyecto termina después de noviembre.
El token de Hostinger usado para emitirlo ya no es necesario y se puede revocar.
El despliegue conserva `/etc/caddy/certs` y `/etc/nutribot`.

## Validación local

```text
npm run check
python -m unittest discover -s deploy/oracle/tests -v
```

Las pruebas de PostgreSQL se ejecutan en Actions con una base desechable, sin
credenciales de producción. Antes de considerar CD activo, verificar una ejecución
real en Actions, una instalación real en Oracle y el funcionamiento desde una IP
autorizada. Los scripts preparados no demuestran por sí solos esas comprobaciones.
