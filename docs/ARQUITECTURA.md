# Camino del simulacro al MVP

**Actualización: Gemini local implementado.** El cliente llama a `/api/recipes/suggest`; el servidor filtra ingredientes y valida respuestas de Google. Ver [GEMINI.md](GEMINI.md). Base nutricional, autenticación y publicación siguen pendientes. El resto conserva el plan original; el contrato completo del MVP aún no está implementado.

## Punto de partida

El alcance del primer avance del proyecto pide perfil, ingredientes, restricciones, recetas con pasos y porciones, datos nutricionales y retroalimentación. Esta versión permite evaluar ese recorrido sin depender del antiguo servidor Flask.

## Componentes de la aplicación real

1. **Cliente móvil:** trasladar las pantallas aprobadas a una aplicación móvil o empaquetar el cliente web tras evaluar los requisitos de cámara, notificaciones, funcionamiento sin conexión y distribución. La interfaz actual es React para navegador, no React Native.
2. **Backend:** autenticación, perfiles, inventario con cantidades, reglas, catálogo y llamadas al proveedor de IA. Nunca enviar claves de proveedor al teléfono.
3. **Base de datos:** usuarios, perfiles, restricciones normalizadas, ingredientes, cantidades y unidades, recetas, ingredientes por receta, fuentes nutricionales, favoritos, opiniones y revisiones.
4. **Servicio de IA:** recibe contexto mínimo, utiliza ingredientes permitidos y devuelve un esquema estructurado. No tiene autoridad para modificar restricciones ni emitir validaciones clínicas.
5. **Validación posterior:** verificar ingredientes, alérgenos, porciones, unidades y esquema antes de mostrar la respuesta. Datos incompletos o incompatibles deben detener la recomendación.
6. **Fuente nutricional:** calcular porciones y macros con datos estructurados trazables. No usar números inventados por el modelo.

## Contrato propuesto, todavía no implementado

`POST /api/recipes/suggest`

Entrada: ingredientes normalizados con cantidades/unidades, filtros de alergias, preferencias y tiempo máximo. El servidor obtiene el perfil del usuario autenticado y valida los datos. Los documentos o notas médicas no deben enviarse a un proveedor sin un flujo específico de consentimiento, minimización y revisión profesional.

Salida: estado `ok`, `no_match` o `needs_review`; recetas con identificadores de ingredientes, cantidades, pasos, porciones, fuente y estado de revisión. Los números nutricionales deben incluir procedencia y versión. Los errores de IA y de red necesitan mensajes recuperables y no deben convertirse silenciosamente en resultados de demo.

La función `generateDemo` en `src/engine.js` señala el punto de separación para reemplazar el proveedor local por el backend. Cambiar esa función por una llamada de red no implementa por sí solo la seguridad, autenticación, base nutricional ni revisión profesional.

## Orden de construcción

| Etapa                   | Entrega                                    | Criterio para avanzar                                         |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| 1. Validación visual    | Cinco pantallas y recorrido interactivo    | Equipo y usuarios comprenden la despensa, filtros y resultado |
| 2. Datos y reglas       | Catálogos, unidades, alergias y pruebas    | Exclusiones obligatorias y casos sin coincidencias pasan      |
| 3. Backend e IA         | Generación estructurada y errores visibles | Credenciales solo en servidor; entradas y salidas verificadas |
| 4. Revisión nutricional | Fuentes, cálculo de porciones y revisión   | Trazabilidad y criterios aceptados por profesional            |
| 5. Aplicación móvil     | Navegación nativa, distribución de prueba  | Pruebas en dispositivos físicos y accesibilidad               |
| 6. Piloto               | Sesiones de uso y retroalimentación        | Hallazgos corregidos antes de una publicación comercial       |

No se proponen diagnósticos, dosis ni modificación de tratamientos. Las indicaciones de un profesional necesitan un flujo explícito de revisión; su mera captura no es validación.

## Trabajo del equipo

- Gestión: mantener prioridades y criterios de aceptación.
- UI/UX: validar pantallas y recorridos con usuarios.
- Desarrollo: separar cliente, servidor y reglas; cambios mediante pull requests.
- QA: probar incompatibilidades, vacíos, errores de red, restauración y dispositivos.
- Profesional en nutrición: revisar criterios, fuentes y límites antes del piloto.

El repositorio incluye una verificación básica para GitHub. Configurar protección de rama y revisores requiere crear primero el remoto.
