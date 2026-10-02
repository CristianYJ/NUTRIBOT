# Chat y despensa

## Conversaciones

El cuadro lateral de Nutribot IA reúne Conversación, Visión Refri, Guía paso a paso e Historial de chats. En móvil aparece encima del chat y se puede desplegar la lista de ingredientes.

Cada inicio de sesión o recarga abre una conversación nueva. **Nuevo chat** también abre otra sin borrar la anterior. El historial muestra el primer mensaje, la fecha y el número de mensajes; incluye borradores y permite recuperar recetas guardadas. Las conversaciones son privadas de cada cuenta. Las nuevas páginas vacías no llenan el historial. Se admiten 200 mensajes por conversación; al alcanzar ese límite se pide abrir otra, conservando todos los anteriores.

Durante la solicitud se muestra «Nuestros chefsitos estan trabajando en tu solicitud». Ya no hay una cabecera de disponibilidad ni un aviso permanente de guardado. Los indicadores de guardado en curso y los errores siguen visibles cuando corresponden.

## Despensa

El panel junto al título reúne el número de ingredientes, Buscar recetas, Agregar por texto y Por foto. **En mi despensa** muestra los alimentos añadidos; **Catálogo de alimentos** permite agregar otros.

Para quitar varios: pulsa **Seleccionar varios**, marca los ingredientes y pulsa **Quitar N de la despensa**. **Seleccionar visibles** respeta la búsqueda y la categoría actuales. Las recetas se conservan; las fechas de los ingredientes retirados se eliminan junto con su presencia en la despensa.

Pulsa la fecha debajo de un ingrediente para indicar la fecha del envase o estimar su vencimiento a partir de la fecha de compra/preparación y su conservación. La fecha del envase tiene prioridad. Para alimentos sin referencia puedes introducir tu propio plazo en días. Los ingredientes anteriores quedan **Sin fecha** hasta que completes esos datos.

Las referencias de refrigeración a 4 °C o menos usan el extremo inferior de los intervalos de [FoodSafety.gov](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts). Son estimaciones editables, no una garantía del estado del alimento. No se deduce una fecha de compra a partir de una foto.

## Archivos principales

| Cambio | Archivos |
| --- | --- |
| Chat e historial | `src/AssistantWorkspace.jsx`, `src/App.jsx`, `src/useChatPersistence.js`, `server/conversations.js` |
| Despensa y fechas | `src/PantryWorkspace.jsx`, `src/pantry-expiry.js`, `server/pantry-dates.js` |
| Diseño adaptable | `src/pantry-chat.css` |
| Persistencia y API | `server/database.js`, `server/app.js`, `server/state-validation.js` |
| Migración sin pérdida del chat previo | `server/postgres/003_chat_history_pantry_dates.sql` |

Para actualizar: detén Nutribot, ejecuta `npm run db:backup`, `npm run db:init` y `npm run build`. Inicia con `npm start` (puerto 8787) o `npm run dev` (puerto 5173). Recarga el navegador para recibir la nueva interfaz. No ejecutes ambas modalidades a la vez.
