# Nutribot en Oracle Linux ARM64

## Estado y alcance

Actualización del despliegue: HTTPS y PostgreSQL ya se comprobaron en Oracle.
El certificado se emitió mediante DNS-01, se carga desde `/etc/caddy/certs` y vence
el 8 de enero de 2027. Se conserva el acceso limitado por IP; no hay renovación
automática por decisión del usuario. El flujo colaborativo y la instalación del
actualizador se documentan en [CONTINUOUS-DEPLOYMENT.md](CONTINUOUS-DEPLOYMENT.md).
La lista de preparación más abajo describe la instalación inicial; no repetir
restauraciones ni creación de credenciales sobre el servidor existente.

La base `nutribot_project` ya fue restaurada y verificada en PostgreSQL 18. El rol
de ejecución es `nutribot_app`. Este paquete prepara la aplicación para
`https://nutribot.facheritossv.com`; subirlo no inicia ni publica la aplicación.
La instalación del servicio, las credenciales, la autenticación PostgreSQL,
Caddy y la conectividad HTTPS se deben comprobar en el servidor antes de publicar.

## Configuración de la aplicación

En la PC se conserva el modo HTTP local mientras `PUBLIC_ORIGIN` y
`NUTRIBOT_PROXY_SECRET` no estén definidos. En Oracle se definen ambos: un origen
HTTPS sin ruta y un secreto de 32 bytes aleatorios codificados como 64 caracteres
hexadecimales. El modo público solo funciona con `npm start`, escucha en
`127.0.0.1:8787` y rechaza solicitudes que no provengan del proxy local autenticado.

Caddy recibe 80/443 y sobrescribe las cabeceras internas del proxy usando la IP
de su conexión entrante. No configurar otros proxies delante de Caddy sin revisar
esta política. Las cookies de sesión son HttpOnly, SameSite=Strict y Secure. El QR
apunta al dominio público. El modo público nunca permite reclamar perfiles locales
sin contraseña. Los usuarios ya migrados acceden con su correo y contraseña.

## Archivos preparados

- `deploy/oracle/Caddyfile`: dominio, certificado DNS existente y proxy local.
- `deploy/oracle/nutribot.service`: servicio Node con usuario de sistema `nutribot`,
  directorio `/opt/nutribot/current`, acceso de solo lectura a archivos del sistema
  y credenciales tomadas de `/etc/nutribot/nutribot.env`.
- `deploy/oracle/caddy-environment.conf`: drop-in para
  `/etc/systemd/system/caddy.service.d/environment.conf`.
- `deploy/oracle/configure-secrets.py`: ejecutar en Oracle con `sudo python3`.
  Pide la contraseña del rol de Oracle y la clave de Gemini sin mostrarlas.
  Escribe archivos privados para systemd, genera el secreto del proxy y se niega
  a sobrescribir configuraciones existentes. No hace falta compartir claves en el chat.

No copiar `.env`, `postgres-admin.env`, `node_modules` de Windows ni los dumps
dentro del directorio servido. El paquete incluye `dist` compilado; instalar las
dependencias de ejecución en ARM64 con `npm ci --omit=dev --ignore-scripts` como
usuario sin privilegios antes de colocar la versión en `/opt/nutribot/current`.
El árbol final debe pertenecer a root y ser legible, pero no modificable, por
`nutribot`. La aplicación sirve exclusivamente archivos estáticos de `dist`.

## Comprobaciones pendientes en Oracle

1. Corregir de forma persistente las URLs PGDG que reciben un minor vacío en
   Oracle Linux: actualmente solo funcionaron usando `--releasever=9.8`. Limitar
   el cambio al repositorio PGDG, mantener las firmas GPG y comprobar `dnf makecache`
   sin sobrescritura global de la versión de Oracle. Revisar este ajuste al cambiar
   de versión menor del sistema.
2. Mantener PostgreSQL escuchando en `localhost`. En `pg_hba.conf`, antes de reglas
   generales de TCP, permitir solo el rol y la base de la aplicación:

   ```text
   host nutribot_project nutribot_app 127.0.0.1/32 scram-sha-256
   host nutribot_project nutribot_app ::1/128      scram-sha-256
   ```

   Hacer copia del archivo, verificar `pg_hba_file_rules` y recargar PostgreSQL.
   Probar la contraseña mediante `psql -h 127.0.0.1 -U nutribot_app -d nutribot_project -W`.
   Conservar la autenticación administrativa local existente; no abrir 5432.
3. Preparar el usuario de sistema y la versión de la aplicación, instalar las
   dependencias y crear las credenciales privadas.
4. Invalidar las sesiones copiadas del entorno local únicamente en la base de
   Oracle antes de la primera publicación; conservar cuentas, contraseñas y datos.
5. Instalar Caddy desde una fuente oficial compatible con EL9/aarch64. Instalar
   sus archivos y el servicio de Nutribot. Validar Caddy con su variable de entorno
   cargada, no con un secreto vacío. Arrancar servicios y comprobar sus registros
   sin mostrar credenciales. No desactivar SELinux; resolver reglas específicas
   si sus registros indican un bloqueo.
6. Comprobar que el A del dominio es `159.54.144.45` y que no existe un AAAA
   apuntando a otro servidor. Permitir TCP 80/443 en la lista de seguridad de OCI
   y en la zona activa de firewalld. En OCI conservar únicamente las IP de origen
   autorizadas (inicialmente `190.120.18.166/32`). Conservar SSH; no abrir 8787 ni 5432.
7. Verificar HTTPS desde Internet, rechazo de archivos privados, login con una
   cuenta migrada, datos de esa cuenta, cierre de sesión, QR y una solicitud de IA.
   El paquete por sí solo no demuestra estas verificaciones.
8. Programar respaldos privados de PostgreSQL y conservar una copia fuera de la
   VM. Un dump en el mismo disco no protege de la pérdida de la instancia.

Referencias: [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[instalación de Caddy](https://caddyserver.com/docs/install),
[reglas de autenticación PostgreSQL](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html).
