# CDN de Cloudflare para nutribot.online

El origen sigue siendo Oracle (`159.54.144.45`), con Caddy y PostgreSQL. El
plan gratuito de Cloudflare actúa como proxy HTTPS y CDN. No se migran el
backend, las sesiones ni la base de datos.

## DNS y TLS

- En Cloudflare, `A @ → 159.54.144.45` y
  `CNAME www → nutribot.online` deben estar **Proxied**. Replicar cualquier
  registro de correo antes de cambiar los nameservers; la importación inicial
  encontró solo esos dos registros web.
- En Hostinger, cambiar los nameservers de `nutribot.online` por los dos
  asignados en el panel de Cloudflare. No cambiar los de `facheritossv.com`:
  la redirección de ese dominio se administra por separado.
- Comprobar que no quede un registro DS antiguo en el registrador. Si se desea
  DNSSEC, activarlo de nuevo desde Cloudflare cuando la zona esté activa.
- Configurar SSL/TLS como **Full (Strict)**. Oracle ya presenta certificados
  válidos para `nutribot.online` y `www.nutribot.online`; no usar Flexible.
  Mantener 80/443 abiertos para que Caddy pueda renovar sus certificados.

## Caché

El servidor devuelve `Cache-Control: public, max-age=31536000, immutable`
solo para archivos de `/assets/` con hash de compilación. HTML, manifest,
service worker y rutas `/api/` siguen con `Cache-Control: no-store`.
Cloudflare puede cachear CSS y JS versionados con su comportamiento normal;
no activar una regla global de **Cache Everything**.

Publicar el cambio del servidor antes de medir el acierto de caché. Para
comprobarlo, consultar una URL real de `/assets/` dos veces y revisar
`CF-Cache-Status`; confirmar que `/api/health` y `/` mantienen `no-store`.
Verificar también inicio de sesión, una petición autenticada y la PWA.

## Comprobación y reversión

```bash
curl -I https://nutribot.online/assets/ARCHIVO-CON-HASH.js
curl -i https://nutribot.online/api/health
curl -I https://www.nutribot.online/
```

Si falla la activación, revisar primero el estado de la zona, los registros
DNS y el certificado Edge. Para volver temporalmente al DNS anterior,
restaurar en Hostinger `cosmos.dns-parking.com` y `nova.dns-parking.com`.
La propagación de DNS puede impedir que la reversión sea inmediata.
