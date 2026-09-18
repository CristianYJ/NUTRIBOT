# Nutribot

Aplicación web con vista móvil que genera recetas con **Gemini de Google**, a partir de los ingredientes disponibles, preferencias y alergias declaradas. Incluye despensa, perfil, asistente, recetario con favoritos y planificación semanal.

**PostgreSQL 18 + Gemini:** datos persistentes en 21 tablas relacionadas, planificación de comidas y lista orientativa de ingredientes que faltan. Ver [instalación y DBeaver](docs/POSTGRESQL.md) y [cómo validar el proyecto](docs/VALIDACION.md).

Es un prototipo en desarrollo: funciona localmente en el navegador. Todavía no es una app Android/iOS instalable ni un servicio publicado. Las recetas generadas por Gemini se distinguen de las tarjetas de ejemplo.

## Instalar en otra PC

### 1. Requisitos

- [Git](https://git-scm.com/downloads).
- [Node.js](https://nodejs.org/en/download) **22, versión 22.19 o posterior dentro de la serie 22**, con npm incluido. Si usas nvm, `nvm install` y `nvm use` leen `.nvmrc` donde esa función esté disponible.
- [PostgreSQL 18](https://www.postgresql.org/download/) instalado y activo. DBeaver es opcional para consultar las tablas.
- Un editor como Visual Studio Code.
- Acceso a este repositorio; si es privado, el propietario debe invitarte como colaborador y debes aceptar la invitación.
- Una clave de [Google AI Studio](https://aistudio.google.com/api-keys) para generar recetas. La interfaz y las pruebas automáticas pueden usarse sin clave; la generación real requiere acceso y cuota del modelo.

Comprueba la instalación desde una terminal nueva:

```sh
node --version
npm --version
git --version
```

### 2. Descargar e instalar

Los mismos comandos sirven en Windows, macOS y Linux:

```sh
git clone https://github.com/CristianYJ/NUTRIBOT.git
cd NUTRIBOT
npm ci
npm run setup
```

`npm ci` instala las versiones de `package-lock.json`. `npm run setup` crea `.env` si falta y conserva las claves existentes. A continuación sigue [POSTGRESQL.md](docs/POSTGRESQL.md) para preparar el acceso privado del administrador y ejecutar:

```sh
npm run db:provision
npm run db:init
```

Se crean `nutribot_project` y `nutribot_project_test` con un usuario limitado. Las bases ajenas se conservan. Si vienes de SQLite, detén la app e importa una sola vez con `npm run db:import:sqlite` antes de empezar a editar la base nueva.

### 3. Guardar tu clave

Abre `.env` en tu editor. Pega tu propia clave después del signo `=` en `GEMINI_API_KEY=` y guarda el archivo. No la pegues en el chat, en archivos de código ni en commits.

El modelo predeterminado es `gemini-3.5-flash-lite`; `GEMINI_MODEL` permite cambiarlo por uno compatible al que tu cuenta tenga acceso. Cada integrante configura su propia clave. `.env` está ignorado por Git; `.env.example` contiene únicamente la plantilla sin secretos.

### 4. Iniciar

```sh
npm run dev
```

Abre [Nutribot en vista móvil](http://127.0.0.1:5173/?mobile=1). El comando inicia la interfaz y el servidor de IA juntos. Mantén abierta esa terminal; para detenerlos presiona **Ctrl+C**. Reinicia después de modificar `.env`.

Para la primera prueba selecciona arroz, frijoles y tomate en Despensa y pide una receta con esos ingredientes en Asistente. Una respuesta real llevará la indicación de Gemini. Las pruebas consumen cuota de tu cuenta de Google.

La dirección `127.0.0.1` funciona en la misma PC. Cada compañero ejecuta su propia copia; ese enlace no permite acceder desde otro teléfono ni desde Internet.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run setup` | Preparar `.env` conservando las claves |
| `npm run db:provision` | Crear las bases y el usuario de PostgreSQL local |
| `npm run db:init` | Aplicar el esquema y catálogo sin duplicarlos |
| `npm run db:validate` | Comprobar integridad y permisos de la base actual |
| `npm run db:backup` | Crear una copia privada con pg_dump |
| `npm run db:verify-backup` | Restaurar una copia en pruebas y comprobarla |
| `npm run dev` | Iniciar interfaz y API local |
| `npm run check` | Pruebas generales y compilación, sin Google ni PostgreSQL |
| `npm run test:postgres` | Pruebas de integración en PostgreSQL real, sin Google |
| `npm run check:full` | Pruebas generales, integración, compilación e integridad |
| `npm run test:gemini:postgres` | Prueba real opcional de IA y persistencia con datos ficticios; consume cuota |
| `npm run build` | Compilar la interfaz |
| `npm start` | Servir la compilación y API en `http://127.0.0.1:8787` |

Detén el servidor de desarrollo antes de usar `npm start`, porque ambos necesitan el puerto 8787. `npm run preview` es equivalente a `npm start`.

## Trabajar en equipo

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para crear ramas, enviar cambios y actualizar tu copia. GitHub Actions ejecuta las pruebas y compilación en Windows y Ubuntu en cada push y pull request, sin claves de Google. Un trabajo adicional prueba la integración en PostgreSQL 18.

Solo se publica esta carpeta. Los PDF académicos y el test original están fuera del repositorio. `node_modules/`, `dist/`, `.env`, `data/` (copias y SQLite histórico) y los archivos temporales de verificación no se suben.

**Subir código a GitHub no publica la aplicación en Internet.** El despliegue es una etapa posterior: requiere alojar también el servidor, configurar su secreto y preparar controles de acceso y uso. Publicar únicamente `dist/` en GitHub Pages no conecta la IA.

## Problemas frecuentes

| Problema | Solución |
| --- | --- |
| No reconoce `node`, `npm` o `git` | Instala el requisito y abre una terminal nueva |
| PowerShell bloquea `npm.ps1` | Usa `npm.cmd` en lugar de `npm`, o abre Símbolo del sistema |
| PostgreSQL no conecta | Comprueba servicio y variables PG de `.env`; consulta POSTGRESQL.md |
| Falta la clave | Ejecuta `npm run setup`, completa `.env`, guarda y reinicia |
| Google rechaza clave, modelo o cuota | Revisa tu proyecto y acceso en AI Studio; la app muestra el error y permite volver a intentar |
| Puerto 5173 o 8787 ocupado | Detén la otra instancia de Nutribot con Ctrl+C y vuelve a iniciar |
| No encuentra `package.json` | Abre la terminal dentro de la carpeta clonada `NUTRIBOT` |
| GitHub indica repositorio inexistente | Comprueba la URL, la invitación y la cuenta con que te autenticas |
| Hay notas médicas o exclusiones escritas | La generación se pausa para revisión; no interpreta indicaciones clínicas |

## Datos y límites

- Al generar se envían a Google el mensaje, ingredientes permitidos, tiempo, preferencia y alergias declaradas. Nombre, peso, estatura y texto de notas médicas/exclusiones no se envían. Evita datos personales en los mensajes de prueba.
- No interpreta recetas médicas, calcula necesidades nutricionales ni certifica compatibilidad con alergias. Las validaciones de ingredientes y filtros son parciales; no garantizan ausencia de trazas o contaminación cruzada.
- Las recetas de IA no inventan calorías/macros; los valores del catálogo son ejemplos. Peso, estatura y objetivo forman parte del prototipo de perfil.
- Cada petición es independiente; no se envía historial remoto. Para modificar una receta, describe la petición completa.
- Perfil, despensa, favoritos, opiniones, recetas generadas y planificación se guardan en PostgreSQL; el chat vive en memoria. Espera a ver «Cambios guardados en esta PC» antes de cerrar. Restaurar borra los datos de esta instalación, no copias de seguridad ni datos ya procesados por Google.
- La base no está cifrada por la app. No hay cuentas: las pestañas de una misma instalación comparten el perfil. Cada compañero tiene su propia base en su PC; no hay sincronización remota.
- Los datos temporales de la versión anterior no se importan automáticamente. SQLite se puede importar explícitamente una sola vez. El catálogo sigue siendo de demostración; PostgreSQL no aporta validación nutricional ni clínica.

## Estructura y documentación

```text
src/                 Interfaz React, catálogo y cliente de la API
server/              API local, conexión a Gemini y validación
server/postgres/     Esquema PostgreSQL versionado
scripts/             Preparación y copias de seguridad
data/                Copias privadas y SQLite histórico (ignorado por Git)
tests/               Pruebas unitarias e integración con base separada
public/              Recursos visuales
docs/                Documentación técnica y antecedentes
.github/workflows/   Verificación automática
```

- [Integración con Gemini](docs/GEMINI.md).
- [PostgreSQL, tablas, DBeaver y copias](docs/POSTGRESQL.md).
- [Validación y demostración para la entrega](docs/VALIDACION.md).
- [Arquitectura y evolución prevista](docs/ARQUITECTURA.md).
- [Verificaciones realizadas](docs/VERIFICACION.md).
- [Revisión del proyecto original](docs/REVISION-ORIGINAL.md).
- [Guion histórico del primer simulacro](docs/SIMULACROS.md).
- [Procedencia de recursos visuales](docs/ASSETS.md). La imagen principal fue generada con IA. Se usan DM Sans y Manrope mediante Google Fonts, con fuentes del sistema como respaldo.
