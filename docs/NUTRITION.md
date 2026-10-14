# Nutrición de recetas

Las recetas nuevas pasan una comprobación antes de guardarse o mostrarse: cada ingrediente debe tener una ficha USDA con energía, carbohidratos, fibra, proteína, grasa, grasa saturada, azúcares y sodio, además de gramos por persona. Los nutrientes generados por el modelo o enviados por el navegador no se usan.

Cuando falta identificar un ingrediente, el chat devuelve `nutrition_setup` sin recetas. Para frijoles negros pregunta si están secos o cocidos sin sal; para aceite vegetal pregunta el tipo. Otros alimentos pueden buscarse por nombre, preparación o marca. Gemini traduce únicamente la consulta al inglés; el usuario confirma el resultado de FoodData Central. No se selecciona automáticamente la primera coincidencia traducida.

Al confirmar, el servidor consulta el FDC ID y guarda los valores de esa ficha en `ingredient_usda_links`, dentro de la cuenta. Se aprovecha la tabla existente: no se requiere una migración. Las referencias completas se reutilizan incluso si USDA no está disponible. Las referencias genéricas revisadas del catálogo siguen siendo estimaciones y aparecen en las fuentes de la receta.

“Continuar con mi receta” vuelve a generar con el historial, los comensales y las descripciones USDA seleccionadas. La preparación puede variar: no se guarda una receta incompleta como si estuviera lista. El modelo recibe el estado crudo/cocido de las referencias para expresar cantidades acordes con él. Esto no constituye una medición del alimento real ni garantiza la exactitud de las cantidades propuestas por el modelo.

El cálculo por persona usa `nutriente por 100 g × gramos por persona / 100`; el total se multiplica por los comensales. La sal equivalente se deriva del sodio (`mg × 2.5 / 1000`). Un dato ausente permanece desconocido; un cero informado por USDA sí se conserva como cero. No se asignan colores de salud ni índice glucémico a partir de estos datos.

Si la ficha está incompleta, la API falla o falta el peso, la propuesta queda pendiente. No se puede garantizar cobertura de todos los alimentos ni disponibilidad de la API. Solo se acepta otra ficha si corresponde al alimento utilizado, no simplemente porque tenga más campos.

Las recetas antiguas conservan sus datos y pueden identificar los ingredientes pendientes desde su panel nutricional. El panel permite ver los FDC ID y abrir las fuentes.

Para probar localmente: reinicia `npm run dev`, solicita una receta que use frijoles negros o aceite vegetal sin referencia guardada, confirma su tipo y continúa. Revisa el total y la vista por persona. No hace falta publicar ni desplegar estos cambios.

Referencias: [API oficial de FoodData Central](https://fdc.nal.usda.gov/api-guide/) y [documentación de los datos](https://fdc.nal.usda.gov/data-documentation/).
