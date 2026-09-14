import { constants, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major !== 22 || minor < 12) {
  console.error("Nutribot requiere Node.js 22 (22.12 o superior dentro de la versión 22).");
  process.exit(1);
}

try {
  copyFileSync(
    fileURLToPath(new URL("../.env.example", import.meta.url)),
    fileURLToPath(new URL("../.env", import.meta.url)),
    constants.COPYFILE_EXCL,
  );
  console.log("Se creó .env. Ábrelo en tu editor y guarda tu clave después de GEMINI_API_KEY=.");
} catch (error) {
  if (error.code !== "EEXIST") {
    console.error("No se pudo preparar .env. Comprueba los permisos de la carpeta.");
    process.exit(1);
  }
  console.log(".env ya existe; se conservó sin cambios.");
}
console.log("Después ejecuta npm run dev y abre http://127.0.0.1:5173/?mobile=1");
