import { createAppServer } from "./app.js";
import { config } from "./config.js";
import { openDatabase } from "./database.js";
const store = openDatabase();
const server = createAppServer({ ...config, serveStatic: true, store });
server.on("close", () => store.close());
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close();
    server.closeAllConnections();
  });
server.on("error", () => {
  console.error("No se pudo iniciar Nutribot en el puerto 8787.");
  process.exit(1);
});
server.listen(8787, "127.0.0.1", () =>
  console.log("Nutribot disponible localmente en http://127.0.0.1:8787"),
);
