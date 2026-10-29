# Edamam en Nutribot

Configura `EDAMAM_APP_ID` y `EDAMAM_APP_KEY` en el `.env` del **servidor**, además de `GEMINI_API_KEY`. Reinicia el proceso. El navegador nunca recibe las credenciales de Edamam. Gemini interpreta la conversación y traduce la intención de búsqueda; Edamam suministra las recetas, los ingredientes, las calorías y el índice glucémico cuando existe. Nutri-Vision sigue usando Gemini.

La búsqueda aplica dieta, alergias, exclusiones, tipo de comida, cocina y tiempo. Puede usar filtros de calorías por porción, índice glucémico y número de ingredientes cuando la persona los pide. El servidor usa una solicitud de Edamam por búsqueda, limita el total del proceso a 9 llamadas por minuto y no hace precargas ni reintentos automáticos. La ficha y la lista de compras se consultan únicamente cuando el usuario las solicita. Los resultados se muestran durante la sesión; el chat y las favoritas conservan solo URI y nombre, y vuelven a consultar Edamam al abrir una ficha. Esto respeta la restricción de almacenamiento de Enterprise Basic. La lista de compras muestra cantidades y un enlace al carrito cuando Edamam lo devuelve. La preparación enlaza al sitio de origen porque las recetas web no suelen incluir instrucciones en la API.

El índice glucémico se muestra únicamente si Edamam lo devuelve. La despensa registra presencia, no cantidad; el usuario debe verificar los ingredientes completos, las cantidades y los alérgenos. El perfil médico escrito no se verifica automáticamente.

La migración `009_edamam_favorites.sql` crea una tabla que guarda exclusivamente URI y nombre de cada favorita. El despliegue automático actual exige un procedimiento manual para cambios de esquema: crear respaldo, aplicar migración y desplegar la versión de aplicación. No fusionar el PR esperando que se despliegue por la ruta automática.

Referencias: [API de recetas y lista de compras](https://api.edamam.com/doc/open-api/recipe-search-v2.yaml), [atribución](https://developer.edamam.com/attribution), [Enterprise Basic](https://developer.edamam.com/edamam-recipe-api).
