# Guion para presentar el prototipo

**Guion histórico del simulacro original.** Ahora «Vamos a cocinar» llama a Gemini y sus resultados varían. Ya no se garantiza recibir exactamente bowl y ensalada. Perfil, despensa y favoritos se conservan. Ver [GEMINI.md](GEMINI.md) para la integración actual.

Duración sugerida: 5 a 7 minutos. Usar datos ficticios. El botón superior permite alternar la vista amplia y el marco móvil.

## 1. Del ingrediente a la receta

Abrir Inicio. Mostrar los seis ingredientes iniciales. Pulsar «Vamos a cocinar»: aparecen el bowl de la casa y la ensalada. Abrir el bowl, revisar ingredientes y cantidades, cambiar a dos porciones y marcar pasos. Guardar con el corazón; luego abrir Mis recetas > Guardadas. Explicar que el modo demo consulta ejemplos y que el backend con IA es la siguiente etapa.

## 2. Despensa que cambia

En Mi despensa quitar Tomate. Buscar recetas: no aparecen recetas completas con el inventario restante. Añadir Tomate y Tortilla de maíz. Ahora las tostaditas también pueden sugerirse. El recetario muestra ingredientes faltantes sin afirmar que están disponibles.

## 3. Restricciones obligatorias

Añadir Leche, Avena y Banano a la despensa. En el perfil seleccionar Leche como alergia y guardar. La receta de avena y las quesadillas quedan fuera del recetario filtrado, incluso si se habían guardado. Retirar un filtro solo si forma parte de este ejercicio con datos ficticios.

## 4. Indicación pendiente de revisión

En «Indicaciones de mi profesional» escribir «Ejemplo de indicación pendiente de revisión». Guardar y buscar recetas. La app pausa las sugerencias y pide revisión: no finge interpretar una prescripción. El mismo comportamiento se aplica a «Otros alimentos que evito».

## 5. Nuevo comienzo

En Mi perfil pulsar «Restaurar demostración y borrar cambios» y confirmar. Se restauran ingredientes y perfil de ejemplo y se borran favoritos, opiniones y chat.

## Preguntas para las pruebas de usuario

- ¿Entendiste qué ingredientes estaban disponibles y cuáles faltaban?
- ¿Encontraste dónde registrar tus restricciones?
- ¿La receta deja claras las cantidades y los pasos?
- ¿Distinguiste una sugerencia de ejemplo de una recomendación revisada?
- ¿Qué paso te resultó confuso o innecesario?

Registrar observaciones sin incluir datos médicos reales en el repositorio.
