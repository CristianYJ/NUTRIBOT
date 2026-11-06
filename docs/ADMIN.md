# Portal administrativo y diagnósticos

Cada cuenta registrada tiene `profiles.role_code`: `user`, `admin` (Staff) o `goat` (GOAT Mode). El servidor consulta el rol en cada petición administrativa; conceder o revocar Staff surte efecto sin reiniciar ni volver a iniciar sesión. El enlace **Admin** aparece como primera opción de la navegación principal y móvil para Staff y GOAT Mode.

La migración `018_goat_role.sql` incorpora GOAT Mode. Al aplicarla, la cuenta existente indicada por `NUTRIBOT_ADMIN_EMAIL` pasa de `admin` a `goat` una sola vez. Después, la variable no concede acceso ni vuelve a asignar el rol al reiniciar; la base de datos es la autoridad. Si la cuenta aún no existía al migrar, un operador de PostgreSQL debe asignarle `goat` expresamente.

Para autorizar a otro miembro del equipo desde Oracle, un operador con acceso administrativo a PostgreSQL ejecuta (sustituye el correo por una cuenta ya registrada):

```bash
sudo -u postgres /usr/pgsql-18/bin/psql -d nutribot_project -c "UPDATE nutribot.profiles SET role_code='admin' WHERE email='persona@ejemplo.com' RETURNING id,email,role_code;"
```

La salida debe contener exactamente una cuenta. Para revocar, usa la misma instrucción con `role_code='user'`. `profile_role_history` registra cada cambio, fecha y usuario de PostgreSQL que lo ejecutó. Mantén este acceso SQL entre operadores de confianza; un administrador del portal puede consultar diagnósticos de cuentas.

Las cuentas con rol `admin` muestran **Staff** y reciben los mismos cupos que NutriMax: 22 generaciones de recetas por semana y 6 análisis de Nutri-Vision por mes. Las cuentas `goat` muestran **GOAT Mode** y no tienen límite de generaciones ni de análisis dentro de la aplicación; sus usos se siguen contando. Staff y GOAT Mode son planes efectivos derivados del rol: el plan asignado en la base no cambia. Los límites propios de los proveedores externos siguen aplicando.

## Vistas incluidas

- **Resumen:** cuentas totales, activas e inactivas, solicitudes por función, tiempos de respuesta del servidor y proveedores, consultas de recetas, evolución de planes e ingresos mensuales estimados por planes asignados. Las gráficas ofrecen vistas semanal, mensual, trimestral y anual; en la anual se elige el año. “Activa” significa registro o actividad de cuenta en los últimos 30 días; el dato no mide tiempo en pantalla.
- **Incidentes:** filtros de período, resultado, proveedor, referencia, código, etapa y cuenta. El detalle muestra motivos de validación, duración y extractos de la consulta fallida y la anterior. La referencia de ocho caracteres del chat corresponde al inicio del UUID mostrado en el portal.
- **Calidad de recetas:** tasa de error, porcentaje y número de búsquedas con dos opciones, una opción, sin resultados y solicitudes de más alternativas.
- **Uso de APIs:** llamadas reales a Google AI Studio (modelo configurado de Gemini), Edamam Recipe Search Enterprise Basic y USDA FoodData Central, con éxito, fallos HTTP o de red, operación, duración y tendencia diaria. El conteo empieza con esta migración y no equivale al consumo facturado por el proveedor.
- **Usuarios y soporte:** búsqueda al inicio, totales por actividad y plan y las 10 cuentas más recientes. Al abrir un resultado, su ficha reemplaza la tabla; el botón Volver y el historial del navegador la restauran. La ficha muestra cupos y usos del período, fechas de registro y último cambio de perfil, diagnósticos y llamadas recientes. Staff y GOAT pueden enviar al correo registrado un enlace para cambiar la contraseña. Solo GOAT puede asignar o quitar Staff y cambiar el plan de otra cuenta mediante el selector; las rutas verifican ese privilegio en PostgreSQL y registran el actor. GOAT no puede modificar su propia cuenta ni otra cuenta GOAT desde el portal.
- **Sistema:** configuración de Gemini, Edamam y USDA, modelo activo, tiempo de ejecución del servidor y códigos de error frecuentes. No revela claves ni verifica la disponibilidad externa.

Los registros detallados se mantienen por 30 días. Los extractos se limitan a 300 caracteres y se sustituyen correos y números telefónicos; no se guardan fotos, claves, respuestas completas de Gemini ni recetas completas de Edamam. Los extractos pueden contener otros datos que la persona escribió en el chat, por lo que el acceso debe mantenerse restringido y la política de privacidad debe informar este uso. Un fallo del registro no altera la respuesta al usuario.

Los totales diarios de recetas, proveedores y funciones no contienen cuentas, textos ni claves. Se conservan por años calendario completos: el año actual y los cinco anteriores, comenzando en 2026. La migración incorpora los registros detallados todavía disponibles, pero no puede reconstruir meses anteriores que ya se eliminaron. El historial de cambios de plan aporta los cortes históricos de cuentas gratuitas y de pago. El p95 mostrado en Resumen se calcula con los registros detallados disponibles de los últimos 30 días; el porcentaje ≤2 s usa el período seleccionado.

Los nuevos registros de llamadas externas y solicitudes HTTP guardan solamente cuenta, proveedor o función, estado, código HTTP, duración y fecha. No guardan URLs (que pueden contener claves), prompts, respuestas ni imágenes. El valor mensual estimado usa los precios anunciados ($2.99 NutriPro y $9.99 NutriMax) multiplicados por las cuentas ordinarias con esos planes asignados. No representa ingresos cobrados: los pagos y suscripciones aún no están integrados. Staff y GOAT Mode quedan fuera de los grupos gratis y de pago, de las tres líneas de evolución de membresías y de esa proyección.

Los incidentes anteriores a esta versión no tienen datos de validación recuperables: `generation_events` solo guardaba resultado, modelo y cantidad de recetas de respuestas validadas.

La pestaña **Sistema** reúne cambios de rol y plan ya auditados, arranques y paradas registradas por la aplicación, errores del servidor, fallos de proveedores y errores de recetas. Permite filtrar los últimos 1, 7 o 30 días y descargar un PDF de hasta 500 registros. No lee el journal de systemd ni registra mensajes, claves o contraseñas. Los eventos de servidor empiezan al instalar la migración 019; los historiales anteriores disponibles se muestran sin inventar datos faltantes.

Las migraciones `010_admin_diagnostics.sql`, `012_admin_api_metrics.sql`, `013_admin_daily_metrics.sql`, `016_account_roles.sql`, `018_goat_role.sql` y `019_system_audit.sql` crean los diagnósticos, las métricas, los roles y el registro de actividad. El despliegue requiere el procedimiento manual con respaldo descrito en [despliegue continuo](CONTINUOUS-DEPLOYMENT.md).
