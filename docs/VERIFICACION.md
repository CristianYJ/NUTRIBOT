# Verificación del prototipo

## PostgreSQL + planificación, versión 0.2 (17 de septiembre de 2026)

- PostgreSQL 18: bases dedicadas `nutribot_project` y `nutribot_project_test`, esquema de aplicación `nutribot`, 21 tablas y 2 vistas. La app usa un rol sin superusuario, creación de bases ni administración de roles.
- Migración de SQLite conservando perfil, despensa, 2 recetas generadas y 2 favoritos. Se compararon los datos tras importar y se conservó el archivo original con una copia privada. No se modificó la base preexistente `nutribot`.
- 27 pruebas generales y 9 pruebas de integración con PostgreSQL aprobadas, junto con la compilación. La integración cubre restricciones SQL, transacciones, concurrencia, importación, planificación, API y fallos de conexión. Se ejecuta en esquemas aislados de la base de pruebas.
- `db:validate` comprobó integridad, relaciones, pasos ordenados y separación de nutrición ilustrativa respecto a recetas de IA.
- `db:verify-backup` creó una copia consistente y la restauró en la base de pruebas: coincidieron los recuentos de las 21 tablas. Se retiró el esquema restaurado sin cambiar el origen.
- Una llamada real a Gemini con perfil ficticio generó una receta y comprobó su persistencia en un esquema aislado de PostgreSQL. La prueba no envió el perfil personal almacenado en la app.
- Navegador: se añadió una comida de 2 porciones, se recuperó al recargar, se abrió el detalle con esas porciones y se comprobaron los ingredientes faltantes. Después se retiró únicamente la comida de prueba. Vista móvil revisada.
- Procedimiento reproducible: [VALIDACION.md](VALIDACION.md). Instalación y conexión en DBeaver: [POSTGRESQL.md](POSTGRESQL.md).
- Estas comprobaciones cubren los casos descritos; no garantizan ausencia total de errores. Continúa siendo una app local con un perfil, sin autenticación ni validación clínica.

## SQLite + Gemini (17 de septiembre de 2026)

- 27 pruebas automáticas aprobadas. Las 5 nuevas cubren persistencia tras reabrir, migración sin duplicados, relaciones entre tablas, validación/rollback, consultas parametrizadas, conflictos de revisión, borrado y generación desde el estado almacenado.
- Compilación de producción aprobada con Node 22.19 y Vite 7.3.6.
- Prueba en navegador: cambio de nombre ficticio y favorito recuperados después de recargar; nombre de demostración restaurado al terminar.
- Una generación real de Gemini produjo «Arroz con Frijoles». Receta, favorito y opinión persistieron tras detener el servidor de desarrollo e iniciar el servidor de producción. La receta quedó visible en Guardadas.
- Copia realizada con `npm run db:backup`; archivo de copia abierto por SQLite con `PRAGMA integrity_check = ok` y receta generada presente.
- Descarga de `.env`, base y WAL bloqueada por Vite (403); rutas privadas ausentes del servidor de producción (404).
- No se accedió a datos de otras bases instaladas. Se creó exclusivamente `data/nutribot.sqlite` para este proyecto.
- Esta etapa usa un perfil por instalación y no incluye autenticación, sincronización entre PCs ni una base nutricional validada.

## Preparación para colaboración en GitHub

- Exportación limpia del contenido preparado para Git, sin `.env` ni `node_modules` originales.
- Instalación con `npm ci` en Windows, Node.js 22: aprobada.
- `npm run setup` creó la plantilla privada; una segunda ejecución conservó exactamente el archivo existente.
- En esa copia, las 22 pruebas y la compilación pasaron sin clave ni llamadas a Google.
- `npm run dev` inició interfaz y API: página y `/api/health` respondieron 200; configuración de Gemini ausente, como corresponde a una instalación nueva.
- Vite actualizado a 7.3.6; npm informó cero vulnerabilidades conocidas en esa instalación, incluidas dependencias de desarrollo. No equivale a una auditoría completa de la aplicación.
- Se comprobó que la clave local no aparece en los archivos preparados para el repositorio, sin mostrar su valor.
- CI configurado para Windows y Ubuntu. La comprobación manual de instalación se realizó en Windows; no se afirma una prueba manual en macOS o Linux.

## Actualización: conexión con Gemini

- 22 pruebas aprobadas, incluyendo 13 nuevas de entradas/salidas, filtros en servidor, errores del proveedor, HTTP, origen, rutas privadas y cuotas locales. Las pruebas no usan Google ni claves reales.
- Compilación de producción aprobada tras integrar cliente y servidor.
- Clave configurada comprobada sin imprimirla. Consulta de modelos de Google respondida con HTTP 200.
- Google rechazó el primer modelo con 404 por no estar disponible para usuarios nuevos y recomendó `gemini-3.5-flash-lite`. Con el reemplazo se recibió y validó una receta real.
- Prueba desde el navegador: «Vamos a cocinar» devolvió Arroz con Frijoles y Tomate; detalle con cantidades y pasos; receta guardada y visible en Guardadas con etiqueta Gemini.
- Recetas de IA no muestran macros de ejemplo ni se mezclan con los del catálogo.
- Prueba real de petición ajena a cocina vía API local: respuesta HTTP 200, origen Gemini, estado `out_of_scope`, cero recetas y redirección hacia cocina.
- Comprobación local de que la clave no aparece en `dist/` ni archivos registrados en Git, sin mostrar su valor. `.env` continúa ignorado.
- Registro del navegador sin errores capturados al cierre de la revisión.
- El servicio sigue siendo local. No se probó despliegue público ni dispositivos físicos; no hay certificación clínica de filtros o recetas.

## Verificación histórica de la primera entrega

Fecha: 14 de septiembre de 2026.

## Automatizada

- 9 pruebas del motor aprobadas: ingredientes completos, despensa vacía, eliminación de ingredientes, leche/queso, huevo/veganismo, revisión de notas, mensajes con restricciones, tiempo y coherencia del catálogo.
- Compilación de producción con Vite aprobada.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades reportadas en las dependencias de producción en esta ejecución. No equivale a una auditoría de seguridad de la aplicación.

## Navegador

- Inicio en vista amplia: imagen y controles renderizados.
- Generación desde Inicio: devuelve bowl y ensalada con la despensa inicial.
- Detalle: cambiar a 2 porciones muestra multiplicadores; guardar una receta actualiza favoritos; marcar un paso cambia su estado.
- Perfil: guardar 70 kg y 170 cm ficticios; seleccionar Leche elimina avena y quesadillas del catálogo filtrado.
- Nota ficticia de revisión: el recetario entra en estado de pausa y conserva favoritos.
- Despensa móvil: quitar Tomate produce el estado sin coincidencias al buscar.
- Restauración: vuelve al perfil e ingredientes de demostración y borra cambios de prueba.
- Adaptación visual revisada a 390 × 844 y 320 × 740. Corregido recorte del título y desbordamiento en 320 px. Inicio y perfil sin desbordamiento horizontal tras la corrección.
- Vista móvil dentro del marco de presentación revisada en escritorio.
- Registro del navegador consultado al cierre: sin errores ni advertencias capturadas.

## Límites

No se realizaron pruebas en teléfonos físicos, iOS, Android, lectores de pantalla, backend real ni servicios de IA. No hay verificación clínica de recetas o cálculos. El resultado valida la demostración local y sus reglas de catálogo, no una aplicación lista para producción.
