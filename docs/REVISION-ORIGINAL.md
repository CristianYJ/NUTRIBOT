# Qué se encontró en TEST_NUTRIBOT

Revisión de código, sin ejecutar ni deserializar los modelos binarios antiguos.

- Cliente React/Vite con un chat que envía `mensaje` a `http://127.0.0.1:5000/chat`.
- Servidor Flask que carga un modelo TensorFlow, tokenizador y codificador.
- El modelo predice una categoría. Con confianza inferior a 0.3 responde que no entendió; en otro caso usa `random.choice` para devolver una respuesta del CSV.
- Es un clasificador con respuestas predefinidas, no generación de recetas por ingredientes.
- El dataset revisado contiene frases de entrenamiento artificiales como `Ejemplo 0 bajar_peso` y respuestas con afirmaciones de revisión profesional sin evidencia adjunta.
- El endpoint observado no recibe inventario, peso, estatura, alergias, cantidades ni historial. No demuestra validación de restricciones.
- `CORS(app)` permite orígenes amplios y `debug=True` es una configuración de desarrollo, no de publicación.

Se conserva la idea del chat y la separación futura entre cliente y servidor. No se trasladaron la lógica aleatoria ni las afirmaciones de validación al nuevo prototipo. La carpeta original y los PDF no se modificaron.

Los documentos locales revisados como referencia fueron `NutriBot_Primer_Avance_2.0 (3).pdf` y `Brown Beige and Orange Playful Nature's Nutrition Presentation (4).pdf`. El alcance funcional y los controles descritos en el primer avance guían el prototipo. Este análisis no verifica las estadísticas ni la normativa citadas por esos PDF.
