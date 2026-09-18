import pg from "pg";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { postgresOptions } from "../server/postgres-config.js";
import { pgTool } from "./pg-tools.js";

const testDatabase = process.env.PGTESTDATABASE;
let source,
  target,
  created = false;
try {
  if (
    !testDatabase?.endsWith("_test") ||
    testDatabase === process.env.PGDATABASE
  )
    throw new Error(
      "Configura una base de pruebas separada en PGTESTDATABASE.",
    );
  source = new pg.Client(postgresOptions());
  target = new pg.Client(postgresOptions({ database: testDatabase }));
  await source.connect();
  await target.connect();
  if (
    (await target.query("SELECT 1 FROM pg_namespace WHERE nspname='nutribot'"))
      .rowCount
  )
    throw new Error(
      "El esquema nutribot ya existe en pruebas. No se sobrescribió; usa una base de pruebas vacía para validar la restauración.",
    );
  const folder = new URL("../data/backups/", import.meta.url);
  mkdirSync(folder, { recursive: true });
  const file = fileURLToPath(
    new URL(`verified-${Date.now()}-${randomUUID()}.dump`, folder),
  );
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (await source.query("SELECT pg_export_snapshot() AS id"))
    .rows[0].id;
  const tables = (
    await source.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='nutribot' ORDER BY tablename",
    )
  ).rows.map((r) => r.tablename);
  const expected = {};
  for (const name of tables) {
    if (!/^[a-z_]+$/.test(name)) throw new Error("Tabla inesperada");
    expected[name] = Number(
      (await source.query(`SELECT count(*) AS n FROM nutribot.${name}`)).rows[0]
        .n,
    );
  }
  await pgTool("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--schema=nutribot",
    "--snapshot",
    snapshot,
    "--file",
    file,
  ]);
  await source.query("COMMIT");
  created = true;
  await pgTool(
    "pg_restore",
    [
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--dbname",
      testDatabase,
      file,
    ],
    testDatabase,
  );
  for (const name of tables) {
    const actual = Number(
      (await target.query(`SELECT count(*) AS n FROM nutribot.${name}`)).rows[0]
        .n,
    );
    if (actual !== expected[name])
      throw new Error(
        "La copia restaurada no coincide con el número de registros de origen.",
      );
  }
  console.log(
    JSON.stringify(
      {
        restored: true,
        verifiedTables: tables.length,
        sourceUnchanged: true,
        backup: file,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error.code
      ? "No se pudo validar la restauración de PostgreSQL. Revisa servicio, configuración y permisos."
      : error.message,
  );
  process.exitCode = 1;
} finally {
  if (
    created &&
    target &&
    testDatabase?.endsWith("_test") &&
    testDatabase !== process.env.PGDATABASE
  )
    await target.query("DROP SCHEMA IF EXISTS nutribot CASCADE").catch(() => {
      console.error(
        "No se pudo limpiar el esquema temporal de restauración en pruebas.",
      );
      process.exitCode = 1;
    });
  await source?.end().catch(() => {});
  await target?.end().catch(() => {});
}
