import { createServer } from "vite";
import { createAppServer } from "./app.js";
import { config } from "./config.js";
import { openDatabase } from "./database.js";
let store;
try {
  store = await openDatabase();
} catch {
  console.error(
    "No se pudo abrir PostgreSQL. Revisa .env y ejecuta npm run db:init.",
  );
  process.exit(1);
}
const api = createAppServer({ ...config, store });
api.on("error", () => {
  console.error("No se pudo abrir el servidor local en el puerto 8787.");
  process.exit(1);
});
await new Promise((resolve) => api.listen(8787, "127.0.0.1", resolve));
let vite;
try {
  vite = await createServer();
  await vite.listen();
} catch {
  api.close();
  console.error(
    "No se pudo iniciar Nutribot: comprueba que el puerto 5173 esté disponible.",
  );
  process.exit(1);
}
console.log(
  `Nutribot: ${config.apiKey ? "clave Gemini configurada" : "falta configurar la clave Gemini"}.`,
);
vite.printUrls();
async function stop() {
  await vite.close();
  await new Promise((resolve) => {
    api.close(resolve);
    api.closeAllConnections();
  });
  await store.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
