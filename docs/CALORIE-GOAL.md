# Meta de calorías

La meta es manual, opcional y privada por cuenta. La sugerencia no se guarda automáticamente.
La migración 008 añade nutrition_goals y tres campos opcionales al perfil. Respaldar antes de aplicarla en producción.

La estimación de mantenimiento usa Mifflin–St Jeor: 10*peso(kg)+6.25*estatura(cm)-5*edad +5 (masculino) o -161 (femenino), multiplicado por actividad aproximada 1.4/1.6/1.8/2 y redondeado a 50 kcal. No es el modelo dinámico del NIDDK ni una pauta para adelgazar. No calcula si faltan datos, fuera de 19–78 años, ni sin confirmar elegibilidad (sin embarazo/lactancia ni pauta clínica específica).

Fuentes: https://pubmed.ncbi.nlm.nih.gov/2305711/ y https://www.niddk.nih.gov/bwp

El círculo usa calorías conocidas / meta actual, muestra datos parciales y conserva el porcentaje sobre 100% aunque el arco se limite a una vuelta. Los días históricos se comparan explícitamente con la meta actual.
Los nuevos registros permiten elegir desayuno, almuerzo o cena y guardan ese dato en el snapshot. Los antiguos usan la categoría de la receta; el panel lo indica. Los valores siguen siendo por una persona.
