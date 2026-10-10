import pg from "pg";
import { parseArgs } from "node:util";
import { assignPlan } from "./plans.js";
import { databaseErrorMessage, postgresOptions } from "./postgres-config.js";

let client;
try {
  const { values } = parseArgs({ options: {
    email: { type: "string" }, plan: { type: "string" }, reason: { type: "string" },
    apply: { type: "boolean", default: false },
  } });
  if (!values.email || !values.plan || !values.reason) {
    throw Error('Uso: npm run plans:assign -- --email usuario@ejemplo.com --plan basico --reason "Motivo" [--apply]');
  }
  client = new pg.Client(postgresOptions({ options: "-c search_path=nutribot,public" }));
  await client.connect();
  const result = await assignPlan(client, { ...values });
  console.log(JSON.stringify(result, null, 2));
  console.log(values.apply ? "Operación completada. El usuario verá el plan al recargar." : "Vista previa: no se modificaron datos. Añade --apply para aplicar el cambio.");
} catch (error) {
  console.error(error.code && !["INVALID_PLAN", "INVALID_EMAIL", "INVALID_REASON", "ACCOUNT_NOT_FOUND"].includes(error.code)
    ? databaseErrorMessage(error) : error.message);
  process.exitCode = 1;
} finally { await client?.end(); }
