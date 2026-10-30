# Portal administrativo y diagnósticos

Configura `NUTRIBOT_ADMIN_EMAIL` en el `.env` privado del servidor con el correo de una cuenta ya registrada. Tras reiniciar, esa cuenta verá **Admin** como primera opción de la navegación principal y móvil. El servidor comprueba la sesión y el correo en cada petición a `/api/admin/*`; ocultar el enlace en la interfaz no es el control de acceso.

La cuenta administradora muestra **GOAT Mode** en el encabezado y recibe los mismos cupos de aplicación que NutriMax: 100 generaciones de recetas por semana y 60 análisis de Nutri-Vision por mes. El plan guardado de la cuenta no cambia; la distinción se aplica por correo configurado al comprobar y reservar usos en el servidor. Las cuentas ordinarias conservan sus cupos. Los límites propios de los proveedores externos siguen aplicando.

## Vistas incluidas

- **Resumen:** consultas, tasa de error, proporción de búsquedas con dos opciones, duración p95, tendencia diaria e incidentes recientes.
- **Incidentes:** filtros de período, resultado, proveedor, referencia, código, etapa y cuenta. El detalle muestra motivos de validación, duración y extractos de la consulta fallida y la anterior. La referencia de ocho caracteres del chat corresponde al inicio del UUID mostrado en el portal.
- **Calidad de recetas:** búsquedas con dos opciones, una opción, sin resultados y solicitudes de más alternativas.
- **Uso de APIs:** eventos atribuidos al proveedor final y tiempos del flujo. Son diagnósticos del flujo de recetas, no conteo real de llamadas ni facturación del proveedor.
- **Usuarios y soporte:** búsqueda exacta por correo o ID para ver plan registrado y referencias recientes. No permite modificar cuentas.
- **Sistema:** configuración de Gemini, Edamam y USDA, modelo activo, tiempo de ejecución del servidor y códigos de error frecuentes. No revela claves ni verifica la disponibilidad externa.

El registro se mantiene por 30 días. Los extractos se limitan a 300 caracteres y se sustituyen correos y números telefónicos; no se guardan fotos, claves, respuestas completas de Gemini ni recetas completas de Edamam. Los extractos pueden contener otros datos que la persona escribió en el chat, por lo que el acceso debe mantenerse restringido y la política de privacidad debe informar este uso. Un fallo del registro no altera la respuesta al usuario.

Los incidentes anteriores a esta versión no tienen datos de validación recuperables: `generation_events` solo guardaba resultado, modelo y cantidad de recetas de respuestas validadas.

La migración `010_admin_diagnostics.sql` crea la tabla de eventos. Igual que la migración de Edamam, un despliegue futuro requiere el procedimiento manual con respaldo descrito en [despliegue continuo](CONTINUOUS-DEPLOYMENT.md). Esta rama local no modifica producción.
