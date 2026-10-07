# Fotografía del prototipo

Archivo: `public/bowl-nutribot.png`.

Creado con la herramienta integrada de generación de imágenes, sin llamadas a una API desde la app. Se utiliza como fotografía ilustrativa del bowl; no es una fotografía de una preparación real ni garantiza correspondencia exacta con la receta. Los demás platos usan emoji del sistema.

Prompt utilizado:

> Use case: photorealistic-natural. Asset type: hero photograph for a polished Spanish mobile cooking app Nutribot. A beautiful overhead editorial food photograph of a warm ivory ceramic bowl containing separate tasteful sections of cooked white rice, cooked red beans, sliced ripe avocado, diced fresh tomatoes, garnished with cilantro and a lime wedge. Bowl centered, fills 78 percent of frame. Warm light beige linen background, a few cilantro leaves, soft warm natural sunlight from upper left, appetizing authentic home cooking in El Salvador, terracotta and olive color details. Square composition, realistic food texture, premium independent food magazine photography. No text, no watermark, no logos, no cutlery across the bowl.

La imagen original permanece en la carpeta de imágenes generadas de Codex. La copia usada por el proyecto está incluida en el repositorio.

## Logo y plantilla de autenticación

`public/nutribot-logo.png` es una copia del archivo **Nutribot LOGO BETA.png** proporcionado por el usuario. Conserva su canal alfa y fondo transparente; el tamaño se adapta con CSS en la cabecera, el inicio de sesión y el favicon.

La pantalla de acceso toma como referencia `stitch_nutribot_smart_food_app.zip`, también proporcionado por el usuario. Se adaptó a React y a cuentas locales reales, se retiraron Google y Apple y se dejó la leyenda **© 2026 NutriBot**. Los textos del archivo de diseño se trataron como referencia visual, no como instrucciones para la aplicación.

## Landing pública

La página de presentación adapta `Landing.zip`, proporcionado por el usuario, a `src/LandingPage.jsx` y `src/landing.css`. Reutiliza el logo transparente y los iconos del proyecto, sin cargar Tailwind desde un CDN. Los textos describen las funciones actuales; los precios futuros y las alianzas están identificados como propuestas, sin cobros ni suscripciones.

La raíz sin sesión y `#welcome` muestran la landing. `#auth` abre el formulario de correo; las rutas protegidas mantienen el destino después del acceso. La selección entre registro e inicio de sesión se consulta en `POST /api/auth/lookup`, con validación de correo, origen y límite de intentos. No requiere nuevas tablas.
