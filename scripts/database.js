import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { openDatabase } from "../server/database.js";
import {
  databaseErrorMessage,
  postgresOptions,
} from "../server/postgres-config.js";
import { pgTool } from "./pg-tools.js";
let store;
try {
  const action = process.argv[2];
  if (action === "backup") {
    const folder = new URL("../data/backups/", import.meta.url);
    mkdirSync(folder, { recursive: true });
    const destination = fileURLToPath(
      new URL(`postgres-${Date.now()}-${randomUUID()}.dump`, folder),
    );
    await pgTool("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--schema=nutribot",
      "--file",
      destination,
    ]);
    await pgTool("pg_restore", ["--list", destination]);
    console.log(
      `Copia privada de PostgreSQL creada y archivo comprobado: ${destination}`,
    );
  } else {
    store = await openDatabase();
    if (action === "init")
      console.log(JSON.stringify(await store.summary(), null, 2));
    else if (action === "import-sqlite") {
      const { DatabaseSync, backup } = await import("node:sqlite");
      const { openDatabase: openLegacy, databasePath } = await import(
        "../server/sqlite-legacy.js"
      );
      const folder = new URL("../data/backups/", import.meta.url);
      mkdirSync(folder, { recursive: true });
      const destination = fileURLToPath(
        new URL(`before-postgres-${Date.now()}.sqlite`, folder),
      );
      const source = new DatabaseSync(databasePath, { readOnly: true });
      try {
        await backup(source, destination);
      } finally {
        source.close();
      }
      // Read the snapshot, leaving the original SQLite database untouched.
      const legacy = openLegacy(destination);
      try {
        console.log(
          JSON.stringify(await store.importSqlite(legacy.getState())),
        );
      } finally {
        legacy.close();
      }
    } else if (action === "validate") {
      const c = new pg.Client(postgresOptions());
      await c.connect();
      try {
        await c.query("BEGIN READ ONLY");
        await c.query("SET LOCAL search_path=nutribot,public");
        const checks = {
          orphanRecipes:
            "SELECT count(*)::integer AS n FROM recipes r WHERE NOT EXISTS(SELECT 1 FROM recipe_ingredients i WHERE i.recipe_id=r.id) OR NOT EXISTS(SELECT 1 FROM recipe_steps s WHERE s.recipe_id=r.id)",
          invalidNumbers:
            "SELECT count(*)::integer AS n FROM profiles WHERE weight_kg<20 OR weight_kg>400 OR height_cm<80 OR height_cm>250",
          invalidAiNutrition:
            "SELECT count(*)::integer AS n FROM recipe_nutrition_examples n JOIN recipes r ON r.id=n.recipe_id WHERE r.source<>'catalog'",
          unvalidatedConstraints:
            "SELECT count(*)::integer AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='nutribot' AND NOT convalidated",
          invalidStepOrder:
            "SELECT count(*)::integer AS n FROM (SELECT recipe_id FROM recipe_steps GROUP BY recipe_id HAVING min(position)<>0 OR max(position)+1<>count(*)) x",
        };
        const results = {};
        for (const [name, sql] of Object.entries(checks))
          results[name] = (await c.query(sql)).rows[0].n;
        const role = (
          await c.query(
            "SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user",
          )
        ).rows[0];
        const summary = await store.summary();
        const valid =
          Object.values(results).every((n) => n === 0) &&
          summary.ingredients === 14 &&
          summary.examples === 6 &&
          !role.rolsuper &&
          !role.rolcreatedb &&
          !role.rolcreaterole;
        console.log(
          JSON.stringify(
            {
              valid,
              checks: results,
              limitedRole:
                !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole,
              ...summary,
            },
            null,
            2,
          ),
        );
        if (!valid) process.exitCode = 1;
        await c.query("ROLLBACK");
      } finally {
        await c.end();
      }
    } else throw new Error("Comando desconocido");
  }
} catch (error) {
  console.error(error.code ? databaseErrorMessage(error) : error.message);
  process.exitCode = 1;
} finally {
  await store?.close();
}
