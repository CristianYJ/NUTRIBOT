# Despensa por texto o imagen

En **Mi despensa**, usa **Agregar por texto** o **Agregar por foto**. Gemini propone una lista editable; solo **Agregar a mi despensa** la guarda. También existe una entrada manual que no necesita Gemini.

- Revisa nombres, tipos de alimento y alérgenos antes de confirmar. Las fotos pueden omitir información de las etiquetas.
- Se reutilizan ingredientes existentes por nombre normalizado y alias comunes. Los nuevos quedan en PostgreSQL y se pueden seleccionar, quitar de la despensa y usar en recetas.
- Se admiten 20 ingredientes por operación y hasta 200 en el catálogo local. La despensa mantiene presencia de alimentos, no cantidades ni vencimientos.
- Las fotos JPG, PNG o WebP de hasta 12 MB se reducen en el navegador a 1600 píxeles y se envían a Gemini como JPEG de hasta 3 MB. Nutribot no almacena la imagen en su base de datos.
- El análisis no guarda nada. El guardado valida los datos y la versión del estado en una transacción; no sobrescribe cambios de otra pestaña.
- Los filtros de alergias y dieta usan los datos revisados del ingrediente. Una identificación de imagen no certifica ausencia de alérgenos.

## Desarrollo

- `src/PantryImport.jsx`: entrada de texto/foto, revisión y confirmación.
- `server/pantry.js`: validación y reconocimiento.
- `server/database.js`: catálogo persistente y guardado de la despensa.
- `server/recipes.js` y `src/profile-rules.js`: recetas y filtros con catálogo dinámico.
- `POST /api/pantry/analyze`: texto o imagen, sin persistencia.
- `POST /api/pantry/add`: lista revisada, `confirmed: true` y `revision` actual.

No requiere una migración: utiliza las tablas de ingredientes y despensa existentes. Reinicia `npm run dev` para cargar las rutas nuevas.

Pruebas: `npm test`, `npm run test:postgres` (base de pruebas configurada) y `npm run build`. En entornos que restringen el cargador de configuración de Vite puede usarse `npm run build -- --configLoader native`.

La integración de imágenes utiliza [el formato inlineData documentado por Google](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding?hl=en).
