import { randomBytes } from "node:crypto";
import { createAppServer } from "./app.js";
import { config } from "./config.js";
import { openDatabase } from "./database.js";
import { connectionInfo, printConnection, localTls } from "./network.js";

export async function startNutribot(development = false) {
  let store, api, vite;
  async function stop() {
    if (vite) await vite.close();
    if (api)
      await new Promise((resolve) => {
        api.close(resolve);
        api.closeAllConnections();
      });
    if (store) await store.close();
  }
  try {
    const tls = localTls();
    const network = await connectionInfo(
      development ? 5173 : 8787,
      Boolean(tls),
    );
    network.proxySecret = development
      ? randomBytes(32).toString("hex")
      : undefined;
    store = await openDatabase();
    api = createAppServer({
      ...config,
      store,
      network,
      serveStatic: !development,
      tls: development ? undefined : tls,
    });
    await new Promise((resolve, reject) => {
      api.once("error", reject);
      api.listen(8787, development ? "127.0.0.1" : "0.0.0.0", resolve);
    });
    if (development) {
      const { createServer } = await import("vite");
      vite = await createServer({
        configLoader: "native",
        server: {
          host: "0.0.0.0",
          https: tls || undefined,
          proxy: {
            "/api": {
              target: "http://127.0.0.1:8787",
              configure(proxy) {
                proxy.on("proxyReq", (request, incoming) => {
                  request.setHeader("x-nutribot-proxy", network.proxySecret);
                  request.setHeader(
                    "x-nutribot-client",
                    incoming.socket.remoteAddress || "unknown",
                  );
                  request.setHeader(
                    "x-nutribot-protocol",
                    tls ? "https" : "http",
                  );
                });
              },
            },
          },
        },
      });
      await vite.listen();
    }
    console.log(
      `Nutribot: ${config.apiKey ? "Gemini configurado" : "falta configurar la clave de Gemini"}.`,
    );
    await printConnection(network, development ? 5173 : 8787);
  } catch (error) {
    await stop();
    console.error(
      error.code === "EADDRINUSE" || /Port 5173 is already in use/.test(error.message)
        ? "Nutribot ya está abierto o sus puertos están ocupados. Detén la instancia anterior con Ctrl+C antes de ejecutar npm run dev o npm start."
        : "No se pudo iniciar Nutribot. Comprueba PostgreSQL y, si configuraste HTTPS, los archivos del certificado.",
    );
    process.exitCode = 1;
    return;
  }
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await stop();
      process.exit(0);
    });
}
