import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { databaseErrorMessage } from "../server/postgres-config.js";
const adminFile = new URL("../.env.postgres-admin", import.meta.url);
const appFile = new URL("../.env", import.meta.url);
let client;
try {
  const admin = parseEnv(readFileSync(adminFile, "utf8"));
  if (!admin.PGPASSWORD)
    throw Object.assign(new Error(), { code: "ADMIN_REQUIRED" });
  if (!["127.0.0.1", "localhost"].includes(admin.PGHOST))
    throw new Error("Local only");
  client = new pg.Client({
    host: admin.PGHOST,
    port: Number(admin.PGPORT || 5432),
    user: admin.PGUSER || "postgres",
    password: admin.PGPASSWORD,
    database: "postgres",
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  const appText = readFileSync(appFile, "utf8"),
    app = parseEnv(appText);
  const role = "nutribot_app";
  const existing = (
    await client.query("SELECT rolname FROM pg_roles WHERE rolname=$1", [role])
  ).rowCount;
  const password =
    existing && app.PGUSER === role && app.PGPASSWORD
      ? app.PGPASSWORD
      : randomBytes(32).toString("hex");
  if (existing && (app.PGUSER !== role || !app.PGPASSWORD))
    throw Object.assign(new Error(), { code: "ROLE_EXISTS" });
  for (const database of ["nutribot_project", "nutribot_project_test"]) {
    const found = await client.query(
      "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
      [database],
    );
    if (found.rowCount && found.rows[0].owner !== role)
      throw Object.assign(new Error(), { code: "DATABASE_EXISTS" });
  }
  if (!existing) {
    // Fixed role and random hexadecimal secret; no user input is interpolated.
    await client.query(
      `CREATE ROLE nutribot_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`,
    );
  }
  const replacements = {
    PGHOST: admin.PGHOST,
    PGPORT: admin.PGPORT || "5432",
    PGUSER: role,
    PGPASSWORD: password,
    PGDATABASE: "nutribot_project",
    PGTESTDATABASE: "nutribot_project_test",
  };
  const retained = appText
    .split(/\r?\n/)
    .filter(
      (line) =>
        !Object.keys(replacements).some((key) => line.startsWith(key + "=")),
    )
    .join("\n")
    .trimEnd();
  writeFileSync(
    appFile,
    retained +
      "\n\n# Conexión privada de Nutribot a PostgreSQL\n" +
      Object.entries(replacements)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") +
      "\n",
    { mode: 0o600 },
  );
  for (const database of ["nutribot_project", "nutribot_project_test"]) {
    const found = await client.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [database],
    );
    if (!found.rowCount)
      await client.query(`CREATE DATABASE ${database} OWNER nutribot_app`);
  }
  console.log(
    "Bases nutribot_project y nutribot_project_test listas. Conexión de la app guardada en .env; no se modificaron bases ajenas.",
  );
} catch (error) {
  const messages = {
    ADMIN_REQUIRED:
      "Completa PGPASSWORD en .env.postgres-admin (no en el chat) y vuelve a ejecutar.",
    ROLE_EXISTS:
      "Ya existe nutribot_app y faltan sus credenciales en .env. No se cambió su contraseña.",
    DATABASE_EXISTS:
      "Una base con ese nombre pertenece a otro usuario. Se detuvo sin modificarla.",
    ENOENT: "Crea .env y .env.postgres-admin según docs/POSTGRESQL.md.",
  };
  console.error(messages[error.code] || databaseErrorMessage(error));
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
