# Validar Nutribot antes de la entrega

La validación permite detectar errores concretos y repetir las comprobaciones. No demuestra ausencia absoluta de fallos ni certifica la seguridad clínica de las recetas. Ejecutar desde la raíz del repositorio, con PostgreSQL activo y `.env` configurado.

## Comprobación principal

```sh
npm run check:full
```

Debe terminar con código 0. Ejecuta:

1. `npm run check`: 27 pruebas del motor, API, proveedor simulado y compatibilidad de SQLite, más compilación de React.
2. `npm run test:postgres`: 9 pruebas adicionales contra PostgreSQL real, sin Google. Usa esquemas aleatorios exclusivamente en `PGTESTDATABASE`, distinta de la base real y terminada en `_test`, y los elimina al finalizar.
3. `npm run db:validate`: comprobación de integridad de la base real y del usuario limitado; no modifica los datos. Debe mostrar `valid: true`, ceros en incidencias y `limitedRole: true`.

## Casos automatizados de PostgreSQL

| Caso | Resultado esperado |
| --- | --- |
| Inicializar dos veces y reabrir conexión | No se duplican tablas ni catálogo; los cambios persisten |
| Guardar perfil/despensa/favoritos/opiniones | Se recuperan desde otra conexión |
| Insertar una referencia inexistente o peso negativo | PostgreSQL rechaza la operación |
| Texto con apariencia de SQL en el nombre | Se guarda como texto y no ejecuta SQL |
| Dos escrituras con la misma revisión | Una se guarda; la otra recibe conflicto |
| Guardar receta generada | Ingredientes y pasos quedan relacionados; nutrición de IA sigue vacía |
| Importación con un dato inválido | Se revierte todo; no deja una importación parcial |
| Repetir importación | No duplica recetas ni sobrescribe cambios |
| Planificar fecha imposible, porciones fuera de rango o hueco ocupado | Se rechaza y no altera el plan válido |
| Cambiar filtros después de planificar | La comida se señala para revisión |
| Borrar datos con una respuesta IA pendiente | La respuesta antigua no recrea datos |
| Notas médicas guardadas, aunque el cliente diga que no hay restricciones | La API pausa y no llama al proveedor |
| Solicitud desde otro origen | HTTP 403 |
| Base no disponible | HTTP 503 con mensaje comprensible y sin detalles privados |

## Demostración manual en cinco minutos

1. Abrir la app y DBeaver conectado a `nutribot_project`, esquema `nutribot`.
2. Con datos ficticios, elegir ingredientes y pedir una receta. Refrescar `recipe_summary`, `recipe_ingredients`, `recipe_steps` y `generation_events` en DBeaver. Las recetas importadas conservan su origen, pero no generan registros de llamadas nuevas retroactivamente.
3. Guardar la receta como favorita. Refrescar `favorites` y comprobar la relación con su ID.
4. En **Semana**, elegir fecha, comida, receta y porciones. Comprobar `weekly_plan_details` y la lista orientativa de ingredientes que faltan.
5. Recargar la app y volver a Semana: la comida debe seguir allí. Intentar añadir otra al mismo día/comida debe dar un aviso sin sobrescribirla.
6. Retirar la comida de prueba: desaparece del plan y la receta sigue en el recetario.

Para consultas de demostración de solo lectura, abrir [sql/validacion.sql](sql/validacion.sql) en el editor SQL de DBeaver. No cambiar directamente tablas del catálogo: también hay reglas de ingredientes versionadas en el servidor.

## Prueba real de Gemini con datos ficticios

```sh
npm run test:gemini:postgres
```

Consume cuota de Google. Crea un esquema de pruebas, usa arroz/frijoles/tomate y un perfil ficticio, llama a la API local con el proveedor real y comprueba que la receta queda en PostgreSQL. Debe mostrar `persisted: true`. No usa tu perfil real ni altera su historial. El esquema temporal se elimina al terminar. No forma parte de GitHub Actions.

Si falla por cuota, modelo, permisos, red o salida inválida, se informa del fallo; no se sustituye por una receta simulada. `npm run test:gemini` conserva la prueba anterior solo del proveedor, sin almacenamiento.

## Recuperación de una copia

```sh
npm run db:backup
npm run db:verify-backup
```

La segunda orden debe mostrar `restored: true` y `verifiedTables: 21`. Verifica una restauración real en la base de pruebas; no sobrescribe la principal. Las copias contienen los datos de la app y deben permanecer privadas. Comparar cantidades de registros no sustituye una revisión funcional después de una restauración definitiva.

## Fallos habituales

| Síntoma | Qué revisar |
| --- | --- |
| No se puede abrir PostgreSQL | Servicio activo, puerto y valores PG en `.env` |
| El administrador no conecta | Contraseña en `.env.postgres-admin`; no cambiar `pg_hba.conf` para saltar autenticación |
| Aparece una base anterior llamada `nutribot` | La actual es `nutribot_project` |
| DBeaver muestra las tablas antiguas | Crear una conexión PostgreSQL nueva; no usar el archivo SQLite |
| `pg_dump` no se encuentra | PostgreSQL 18 instalado y `PGBIN` o PATH correctos |
| Conflicto de revisión | Revisar cambios de otras pestañas y recargar la versión guardada |
| Copia no restaurable por esquema ocupado en pruebas | Conservar ese esquema y configurar otra base de pruebas vacía; la herramienta no lo borra |

GitHub Actions ejecuta las pruebas generales en Windows y Ubuntu y la integración con un PostgreSQL 18 efímero en Ubuntu. Sus credenciales son desechables y no tienen relación con tu PC.
