# Instalar NutriBot desde el QR

La PWA utiliza el mismo servidor, cuentas y base de datos que la web. El APK queda para una etapa posterior.

1. En el menú del perfil, abre **Instalar en mi teléfono** y escanea el QR. El diálogo muestra solo el título y el código.
2. El QR público abre `https://nutribot.facheritossv.com/?install=1` y muestra el aviso de instalación antes de iniciar sesión.
3. Toca **Instalar NutriBot** y confirma en el navegador. Si no ofrece instalación directa, el aviso explica cómo usar el menú del navegador.
4. Abre NutriBot desde su icono: verás una bienvenida de 1,6 segundos con el logo (puedes saltarla con **Continuar**) y luego el acceso. Si la sesión todavía es válida, entras a tu cuenta directamente.

Escanear el QR no instala nada automáticamente. Los lectores con navegador integrado pueden requerir **Abrir en el navegador**. En Chrome/Samsung Internet busca **Instalar aplicación** o **Añadir a pantalla de inicio**; la etiqueta depende del navegador. En iPhone usa Safari, **Compartir → Añadir a pantalla de inicio**. La disponibilidad del aviso automático depende del navegador, su criterio de instalación y de si ya está instalada.

## Acceso y actualizaciones

- El acceso sigue limitado por las reglas de IP de Oracle. Instalarla no autoriza nuevas redes ni datos móviles.
- La instalación requiere HTTPS (o localhost para pruebas). El QR del menú siempre abre la versión publicada en el dominio HTTPS, incluso al probar desde la PC. El QR de la terminal sigue abriendo la versión local por HTTP.
- El manifiesto define nombre, iconos normales y maskable, y apertura en ventana independiente (`standalone`).
- El inicio instalado es `/?source=pwa#app`; la web y el QR mantienen la landing. Las rutas directas de la app se respetan. `/?source=pwa#app` también permite probar la bienvenida en el navegador local. Una instalación anterior puede necesitar reinstalarse o esperar a que el navegador actualice su manifiesto; el ID `/` se mantiene.
- El service worker guarda únicamente `/offline.html` y `/pwa/icon-192.png`. No guarda respuestas de API, credenciales, conversaciones ni datos de la despensa.
- Sin acceso al servidor se muestra un aviso. La aplicación no permite trabajar ni guardar cambios offline.
- Las páginas y archivos de la aplicación se cargan de la red: después del despliegue, cerrar y volver a abrir/recargar carga la versión nueva. Una sesión abierta no se recarga a la fuerza ni pierde un formulario por una actualización.

## Validación del despliegue

Ejecutar `npm run check`. Después del merge y del despliegue de Oracle, comprobar en un teléfono real conectado a una red autorizada: QR, confirmación, icono, apertura independiente, inicio de sesión y cámara. El diálogo de instalación del sistema y la cámara deben comprobarse en el dispositivo.

Comprobación desde Oracle, sin modificar el firewall:

```bash
curl --fail --silent --show-error --resolve nutribot.facheritossv.com:443:127.0.0.1 https://nutribot.facheritossv.com/manifest.webmanifest
```

Referencias: [instalación de PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [solicitud de instalación](https://web.dev/learn/pwa/installation-prompt).
