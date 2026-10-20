# Despensa manual y Nutri-Vision

En **Mi despensa**, usa **Agregar manualmente** para escribir cada alimento, elegir categoría y revisar alérgenos. Esta entrada es gratuita en todos los planes y no llama a la IA. **Nutri-Vision** analiza una foto y propone una lista editable; solo **Agregar a mi despensa** guarda los alimentos.

- Revisa nombres, tipos de alimento y alérgenos antes de confirmar. Las fotos pueden omitir información de las etiquetas.
- Se reutilizan ingredientes existentes por nombre normalizado y alias comunes. Los nuevos quedan en PostgreSQL y se pueden seleccionar, quitar de la despensa y usar en recetas.
- Se admiten 20 ingredientes por operación y hasta 200 en el catálogo local. La despensa mantiene presencia de alimentos y fechas editables, no cantidades.
- Las fotos JPG, PNG o WebP de hasta 15 MB se reducen en el navegador y se envían a Gemini como JPEG de hasta 3 MB. Nutribot no almacena la imagen en su base de datos.
- El análisis no guarda ingredientes, pero un resultado con alimentos identificados consume un uso mensual de Nutri-Vision, aunque después se cierre la revisión. Los errores y resultados vacíos no consumen cupo. El guardado valida los datos y la versión del estado en una transacción; no sobrescribe cambios de otra pestaña.
- Los filtros de alergias y dieta usan los datos revisados del ingrediente. Una identificación de imagen no certifica ausencia de alérgenos.

## Desarrollo

- `src/PantryImport.jsx`: entrada de texto/foto, revisión y confirmación.
- `server/pantry.js`: validación y reconocimiento.
- `server/database.js`: catálogo persistente y guardado de la despensa.
- `server/recipes.js` y `src/profile-rules.js`: recetas y filtros con catálogo dinámico.
- `POST /api/pantry/analyze`: solo imagen, con cuota de Nutri-Vision. Rechaza texto con `MANUAL_ONLY` antes de llamar al proveedor.
- `POST /api/pantry/add`: lista revisada, `confirmed: true` y `revision` actual.

La migración 006 añade el registro de consumo por cuenta. Los ingredientes siguen usando las tablas existentes. Reinicia `npm run dev` para cargar las rutas nuevas. Consulta las reglas de consumo en [Planes](PLANS.md).

Pruebas: `npm test`, `npm run test:postgres` (base de pruebas configurada) y `npm run build`. En entornos que restringen el cargador de configuración de Vite puede usarse `npm run build -- --configLoader native`.

La integración de imágenes utiliza [el formato inlineData documentado por Google](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding?hl=en).
