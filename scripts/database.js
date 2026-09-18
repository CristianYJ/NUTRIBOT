import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { openDatabase, databasePath } from "../server/database.js";

try {
  if (process.argv[2] === "init") {
    const store = openDatabase();
    const state = store.getState();
    store.close();
    console.log(
      `Base lista: ${state.ingredients.length} ingredientes, ${state.recipes.length} recetas de ejemplo, ${state.generated.length} recetas de IA.`,
    );
    console.log(`Archivo para abrir con DBeaver: ${databasePath}`);
  } else if (process.argv[2] === "backup") {
    const folder = new URL("../data/backups/", import.meta.url);
    mkdirSync(folder, { recursive: true });
    const destination = fileURLToPath(
      new URL(`nutribot-${Date.now()}-${randomUUID()}.sqlite`, folder),
    );
    const source = new DatabaseSync(databasePath, {
      readOnly: true,
      timeout: 3000,
    });
    try {
      await backup(source, destination);
    } finally {
      source.close();
    }
    console.log(`Copia privada creada: ${destination}`);
  } else {
    throw new Error("Comando desconocido");
  }
} catch {
  console.error(
    "No se pudo preparar o copiar la base. Ejecuta npm run setup y comprueba los permisos y el espacio disponible.",
  );
  process.exitCode = 1;
}
