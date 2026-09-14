# Integración local de Gemini

Se verificó una respuesta real de Google y una receta nueva con arroz, frijoles y tomate. Modelo: `gemini-3.5-flash-lite`. Se eligió porque Google indicó que `gemini-2.5-flash-lite` ya no estaba disponible para usuarios nuevos y recomendó ese reemplazo.

## Probar

1. Ejecutar `npm run dev`.
2. Abrir `http://127.0.0.1:5173/?mobile=1`.
3. Pulsar «Vamos a cocinar» o escribir una petición culinaria completa.
4. Abrir el resultado y guardar con el corazón.
5. Revisar Recetas > Guardadas: la etiqueta Gemini distingue las recetas generadas de los ejemplos.

«IA habilitada» solo confirma que el servidor tiene una clave configurada. Una respuesta «Generado con Gemini» confirma una llamada efectiva. La generación varía y cada petición es independiente, sin historial remoto.

## Controles

- Esquema y validación posterior de título, tiempo, ingredientes, cantidades y pasos.
- Ingredientes permitidos calculados en servidor según inventario, dieta y alergias.
- Metadatos de alérgenos y origen calculados por el servidor, no confiados al modelo.
- Comprobación adicional de menciones de ingredientes conocidos excluidos en cantidades y preparación.
- Pausa por notas médicas, restricciones escritas y señales clínicas en el mensaje.
- Instrucción de responder solo sobre cocina y respuesta fija para salida fuera de tema.
- Errores de clave, modelo, cuota, red y formato visibles, sin reemplazo por demo.
- Límite de 6 solicitudes por minuto y 2 simultáneas; cuerpo de 12 KB y plazo de Google de 45 segundos.
- Cancelación al cambiar ingredientes, perfil o tiempo durante la generación.
- API local sin CORS abierto; rechazo de orígenes ajenos y rutas privadas.

Los filtros de texto son parciales, no una comprensión exhaustiva del lenguaje. No certifican trazas, productos ni seguridad clínica. Las recetas de IA no están revisadas por un profesional y no tienen datos nutricionales hasta integrar una fuente verificable.

## Privacidad

Google recibe el mensaje actual, ingredientes permitidos, tiempo, preferencia y alergias. El cliente no envía nombre, peso, estatura ni texto de notas médicas/exclusiones a la API local de recetas; solo un booleano indica si debe pausar. Un mensaje libre puede contener datos personales si el usuario los escribe. Usar datos ficticios.

La clave se lee en servidor desde `.env`, nunca se imprime ni se incluye en la compilación. `.env.example` no contiene una clave real. No usar el prefijo `VITE_` para secretos. Reiniciar el servidor al cambiar la clave. Restaurar datos locales no elimina solicitudes ya procesadas por Google; sus condiciones y la configuración de la cuenta aplican.

## Fuentes

- [Claves de Gemini](https://ai.google.dev/gemini-api/docs/api-key)
- [Instrucciones de sistema](https://ai.google.dev/gemini-api/docs/text-generation)
- [Salidas estructuradas](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)

Se usa REST `generateContent`, comprobado con la clave configurada. No se usan sesiones remotas de la API Interactions.
