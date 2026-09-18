# Colaborar en Nutribot

Primero sigue la instalación de [README.md](README.md). Cada integrante necesita acceso al repositorio, su propia copia local y su propio `.env`.

## Identidad de Git

Configura estos datos dentro de la carpeta del proyecto, sustituyendo los ejemplos. El correo puede ser el correo privado `noreply` que GitHub muestra en Configuración → Emails. Los commits incluyen esta identidad; no es una contraseña ni una clave de Gemini.

```sh
git config user.name "Tu nombre"
git config user.email "Tu correo de commits"
```

## Enviar una mejora

Antes de empezar, con tus cambios anteriores ya guardados en un commit:

```sh
git switch main
git pull --ff-only
git switch -c mejora/descripcion-corta
```

Sustituye `descripcion-corta` por el cambio que vas a realizar. Edita los archivos y ejecuta:

```sh
npm run check
git status
git diff
```

Revisa qué vas a incluir y agrega únicamente los archivos que modificaste. Por ejemplo, para un cambio de documentación:

```sh
git add README.md
git commit -m "docs: aclarar instalación"
git push -u origin mejora/descripcion-corta
```

En GitHub crea un **pull request** hacia `main`, describe qué cambia y cómo lo probaste. Pide revisión a un compañero y espera a que pasen las comprobaciones antes de integrarlo. Para exigir esto automáticamente, el propietario debe configurar las reglas de protección disponibles para el repositorio; el archivo de CI por sí solo no impide un push a `main`.

## Recibir cambios del equipo

Con tu trabajo ya guardado y después de integrar el pull request:

```sh
git switch main
git pull --ff-only
npm ci
npm run setup
npm run dev
```

`setup` conserva tus claves. Configura PostgreSQL y ejecuta `npm run db:init` para aplicar migraciones sin reiniciar datos existentes. Si hay nuevas variables en `.env.example`, agrégalas manualmente a tu `.env`. Git no sincroniza claves ni bases de datos; cada PC tiene su propia información. Usa `npm run db:backup` antes de cambios importantes del esquema y revisa [la guía de PostgreSQL](docs/POSTGRESQL.md).

Si Git informa conflictos o cambios locales pendientes, conserva tu trabajo y resuelve el conflicto con el equipo; no uses `reset --hard` ni pushes forzados para saltarte el problema.

## Claves y pruebas

- Nunca incluir `.env`, `data/`, bases SQLite, copias, claves, contraseñas ni datos médicos o personales reales en commits, capturas o incidencias.
- `git check-ignore .env` debe mostrar `.env`.
- `npm run check` usa un proveedor simulado; no requiere ninguna clave y no consume cuota. Antes de enviar cambios de servidor, ejecuta también `npm run test:postgres` contra tu base de pruebas separada.
- `npm run test:gemini:postgres` sí llama a Google con datos ficticios. Se ejecuta manualmente y no forma parte de GitHub Actions.
- Mantener `package-lock.json` junto con los cambios de dependencias para que `npm ci` reproduzca la instalación.

## Alcance del repositorio

Este repositorio contiene la aplicación actual, su servidor y documentación. El test antiguo y los documentos académicos originales no forman parte de la instalación. No se necesita Python, Flask ni TensorFlow para ejecutar esta versión.
