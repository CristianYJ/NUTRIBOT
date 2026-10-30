# Portal administrativo y diagnósticos

Cada cuenta registrada tiene `profiles.role_code`, limitado por PostgreSQL a `user` o `admin`. El servidor consulta el rol en cada petición a `/api/admin/*`; conceder o revocar el rol surte efecto sin reiniciar ni volver a iniciar sesión. El enlace **Admin** aparece como primera opción de la navegación principal y móvil solo para cuentas autorizadas. No hay una ruta HTTP para cambiar roles.

La migración `016_account_roles.sql` concede el rol `admin` **una sola vez** a la cuenta existente indicada por `NUTRIBOT_ADMIN_EMAIL` en el entorno privado del servidor. Configura esa variable antes de desplegar la migración para conservar el acceso actual. Después, la variable no concede acceso ni vuelve a asignar el rol al reiniciar; la base de datos es la autoridad. Si la cuenta aún no existía al migrar, concede el rol explícitamente en la base.

Para autorizar a otro miembro del equipo desde Oracle, un operador con acceso administrativo a PostgreSQL ejecuta (sustituye el correo por una cuenta ya registrada):

```bash
sudo -u postgres /usr/pgsql-18/bin/psql -d nutribot_project -c "UPDATE nutribot.profiles SET role_code='admin' WHERE email='persona@ejemplo.com' RETURNING id,email,role_code;"
```

La salida debe contener exactamente una cuenta. Para revocar, usa la misma instrucción con `role_code='user'`. `profile_role_history` registra cada cambio, fecha y usuario de PostgreSQL que lo ejecutó. Mantén este acceso SQL entre operadores de confianza; un administrador del portal puede consultar diagnósticos de cuentas.

Las cuentas con rol `admin` muestran **GOAT Mode** en el encabezado y reciben los mismos cupos de aplicación que NutriMax: 100 generaciones de recetas por semana y 60 análisis de Nutri-Vision por mes. El plan guardado no cambia. Las cuentas ordinarias conservan sus cupos. Los límites propios de los proveedores externos siguen aplicando.

## Vistas incluidas

- **Resumen:** cuentas totales, activas e inactivas, solicitudes por función, tiempos de respuesta del servidor y proveedores, consultas de recetas, evolución de planes e ingresos mensuales estimados por planes asignados. Las gráficas ofrecen vistas semanal, mensual, trimestral y anual; en la anual se elige el año. “Activa” significa registro o actividad de cuenta en los últimos 30 días; el dato no mide tiempo en pantalla.
- **Incidentes:** filtros de período, resultado, proveedor, referencia, código, etapa y cuenta. El detalle muestra motivos de validación, duración y extractos de la consulta fallida y la anterior. La referencia de ocho caracteres del chat corresponde al inicio del UUID mostrado en el portal.
- **Calidad de recetas:** tasa de error, porcentaje y número de búsquedas con dos opciones, una opción, sin resultados y solicitudes de más alternativas.
- **Uso de APIs:** llamadas reales a Google AI Studio (modelo configurado de Gemini), Edamam Recipe Search Enterprise Basic y USDA FoodData Central, con éxito, fallos HTTP o de red, operación, duración y tendencia diaria. El conteo empieza con esta migración y no equivale al consumo facturado por el proveedor.
- **Usuarios y soporte:** búsqueda al inicio, totales por actividad y plan y las 10 cuentas más recientes. Al abrir un resultado, su ficha reemplaza la tabla; el botón Volver y el historial del navegador la restauran. La ficha muestra cupos y usos del período, historial de cambios de plan, fechas de registro y último cambio de perfil, diagnósticos y llamadas recientes. Restablecer contraseña aparece desactivado hasta implementar el flujo.
- **Sistema:** configuración de Gemini, Edamam y USDA, modelo activo, tiempo de ejecución del servidor y códigos de error frecuentes. No revela claves ni verifica la disponibilidad externa.

Los registros detallados se mantienen por 30 días. Los extractos se limitan a 300 caracteres y se sustituyen correos y números telefónicos; no se guardan fotos, claves, respuestas completas de Gemini ni recetas completas de Edamam. Los extractos pueden contener otros datos que la persona escribió en el chat, por lo que el acceso debe mantenerse restringido y la política de privacidad debe informar este uso. Un fallo del registro no altera la respuesta al usuario.

Los totales diarios de recetas, proveedores y funciones no contienen cuentas, textos ni claves. Se conservan por años calendario completos: el año actual y los cinco anteriores, comenzando en 2026. La migración incorpora los registros detallados todavía disponibles, pero no puede reconstruir meses anteriores que ya se eliminaron. El historial de cambios de plan aporta los cortes históricos de cuentas gratuitas y de pago. El p95 mostrado en Resumen se calcula con los registros detallados disponibles de los últimos 30 días; el porcentaje ≤2 s usa el período seleccionado.

Los nuevos registros de llamadas externas y solicitudes HTTP guardan solamente cuenta, proveedor o función, estado, código HTTP, duración y fecha. No guardan URLs (que pueden contener claves), prompts, respuestas ni imágenes. El valor mensual estimado usa los precios anunciados ($2.99 NutriPro y $9.99 NutriMax) multiplicados por las cuentas con esos planes asignados. No representa ingresos cobrados: los pagos y suscripciones aún no están integrados. GOAT Mode conserva el plan Básico en la base y no suma a esa proyección.

Los incidentes anteriores a esta versión no tienen datos de validación recuperables: `generation_events` solo guardaba resultado, modelo y cantidad de recetas de respuestas validadas.

Las migraciones `010_admin_diagnostics.sql`, `012_admin_api_metrics.sql`, `013_admin_daily_metrics.sql` y `016_account_roles.sql` crean los diagnósticos, las métricas y los roles. El despliegue requiere el procedimiento manual con respaldo descrito en [despliegue continuo](CONTINUOUS-DEPLOYMENT.md).
