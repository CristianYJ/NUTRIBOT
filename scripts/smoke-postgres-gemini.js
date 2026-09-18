import pg from "pg";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/database.js";
import { postgresOptions } from "../server/postgres-config.js";
import { config } from "../server/config.js";
import { createAppServer } from "../server/app.js";

const database = process.env.PGTESTDATABASE;
const schema = "nutribot_live_" + randomBytes(8).toString("hex");
let store, server;
try {
  if (!database?.endsWith("_test") || database === process.env.PGDATABASE)
    throw new Error("Configura PGTESTDATABASE como base de pruebas separada.");
  if (!config.apiKey) throw new Error("Falta la clave Gemini en .env.");
  store = await openDatabase({ database, schema });
  const initial = await store.getState();
  await store.saveState({
    revision: initial.revision,
    profile: initial.profile,
    pantry: ["arroz", "frijoles", "tomate"],
    saved: [],
    feedback: {},
  });
  server = createAppServer({ ...config, store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/recipes/suggest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revision: 1,
        maxTime: 30,
        message: "Dame una receta casera con los ingredientes disponibles.",
      }),
      signal: AbortSignal.timeout(55000),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.text || "Falló la prueba de Gemini.");
  if (result.source !== "gemini" || !result.recipes?.length)
    throw new Error(
      "La respuesta de Gemini no incluyó recetas para esta prueba.",
    );
  const loaded = await store.getState();
  if (loaded.generated.length !== result.recipes.length)
    throw new Error("La receta no quedó guardada en PostgreSQL.");
  console.log(
    JSON.stringify(
      {
        provider: "gemini",
        database: "postgresql",
        generated: result.recipes.length,
        persisted: true,
        usedOnlyFictitiousData: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error.code
      ? "No se pudo completar la prueba. Ejecuta db:validate y revisa la conexión de Gemini."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await store?.close();
  if (database?.endsWith("_test") && database !== process.env.PGDATABASE) {
    const c = new pg.Client(postgresOptions({ database }));
    try {
      await c.connect();
      if (!/^nutribot_live_[a-f0-9]{16}$/.test(schema)) throw new Error();
      await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } catch {
      console.error(
        "No se pudo limpiar el esquema temporal de la prueba real.",
      );
      process.exitCode = 1;
    } finally {
      await c.end();
    }
  }
}
