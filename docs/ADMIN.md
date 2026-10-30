# Portal administrativo y diagnósticos

Configura `NUTRIBOT_ADMIN_EMAIL` en el `.env` privado del servidor con el correo de una cuenta ya registrada. Tras reiniciar, esa cuenta verá **Portal administrativo** en su menú de perfil. El servidor comprueba la sesión y el correo en cada petición a `/api/admin/*`; ocultar el enlace en la interfaz no es el control de acceso.

## Vistas incluidas

- **Incidentes:** código de error, etapa, proveedor, motivos de validación, duración, referencia y extractos de la consulta fallida y la consulta previa. La referencia de ocho caracteres que aparece en el chat se corresponde con el inicio del UUID mostrado en el portal.
- **Actividad:** resultados de búsquedas y conversaciones, además de errores. Permite ver si los fallos aumentan frente a las solicitudes exitosas.
- **Sistema:** disponibilidad de configuración de Gemini, Edamam y USDA, modelo activo y códigos de error frecuentes. No revela claves.

El registro se mantiene por 30 días. Los extractos se limitan a 300 caracteres y se sustituyen correos y números telefónicos; no se guardan fotos, claves, respuestas completas de Gemini ni recetas completas de Edamam. Los extractos pueden contener otros datos que la persona escribió en el chat, por lo que el acceso debe mantenerse restringido y la política de privacidad debe informar este uso. Un fallo del registro no altera la respuesta al usuario.

Los incidentes anteriores a esta versión no tienen datos de validación recuperables: `generation_events` solo guardaba resultado, modelo y cantidad de recetas de respuestas validadas.

La migración `010_admin_diagnostics.sql` crea la tabla de eventos. Igual que la migración de Edamam, un despliegue futuro requiere el procedimiento manual con respaldo descrito en [despliegue continuo](CONTINUOUS-DEPLOYMENT.md). Esta rama local no modifica producción.
