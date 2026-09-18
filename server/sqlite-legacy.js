import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ingredients,
  recipes,
  initialPantry,
  initialProfile,
} from "../src/data.js";
import { AppError } from "./recipes.js";
import { validateState, validateRevision } from "./state-validation.js";

export const databasePath = fileURLToPath(
  new URL("../data/nutribot.sqlite", import.meta.url),
);

export function openDatabase(filename = databasePath) {
  if (filename !== ":memory:")
    mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename, { timeout: 3000 });
  db.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;",
  );
  const transaction = (work) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const revision = () =>
    db.prepare("SELECT revision FROM profiles WHERE id=1").get().revision;
  function checkRevision(expected) {
    validateRevision(expected);
    if (revision() !== expected)
      throw new AppError(
        "STATE_CONFLICT",
        "Los datos cambiaron en otra pestaña. Recarga la versión guardada antes de continuar.",
        409,
      );
  }
  function writeProfile(p) {
    db.prepare(
      "UPDATE profiles SET name=?,weight=?,height=?,goal=?,diet=?,exclusions=?,medical_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=1",
    ).run(
      p.name,
      p.weight,
      p.height,
      p.goal,
      p.diet,
      p.exclusions,
      p.medicalNotes,
    );
    db.exec("DELETE FROM profile_allergies WHERE profile_id=1");
    for (const allergy of p.allergies)
      db.prepare("INSERT INTO profile_allergies VALUES(1,?)").run(allergy);
  }
  function writePantry(pantry) {
    db.exec("DELETE FROM pantry_items WHERE profile_id=1");
    pantry.forEach((id, pos) =>
      db.prepare("INSERT INTO pantry_items VALUES(1,?,?)").run(id, pos),
    );
  }
  function insertRecipe(r, source) {
    db.prepare(
      "INSERT INTO recipes(id,source,title,model,created_at,payload) VALUES(?,?,?,?,?,?)",
    ).run(
      r.id,
      source,
      r.title,
      r.model || null,
      r.createdAt || new Date().toISOString(),
      JSON.stringify(r),
    );
    r.ingredients.forEach((id, pos) =>
      db
        .prepare("INSERT INTO recipe_ingredients VALUES(?,?,?,?)")
        .run(r.id, id, r.amounts[pos], pos),
    );
  }
  try {
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT",
    );
    const version =
      db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()
        .version || 0;
    if (version > 1)
      throw new Error("La base usa una versión más reciente de Nutribot.");
    if (version === 0)
      transaction(() => {
        db.exec(
          readFileSync(
            new URL("./migrations/001_initial.sql", import.meta.url),
            "utf8",
          ),
        );
        db.prepare(
          "INSERT INTO profiles(id,name,weight,height,goal,diet,exclusions,medical_notes) VALUES(1,?,?,?,?,?,?,?)",
        ).run(
          initialProfile.name,
          "",
          "",
          initialProfile.goal,
          initialProfile.diet,
          "",
          "",
        );
        ingredients.forEach((i, pos) =>
          db
            .prepare("INSERT INTO ingredients VALUES(?,?,?,?,?,?)")
            .run(i.id, i.name, i.category, i.unit, i.emoji, pos),
        );
        writePantry(initialPantry);
        recipes.forEach((r) => insertRecipe(r, "catalog"));
        db.prepare("INSERT INTO schema_migrations(version) VALUES(1)").run();
      });
  } catch (error) {
    db.close();
    throw error;
  }

  const readState = () => {
    const p = db.prepare("SELECT * FROM profiles WHERE id=1").get();
    return {
      revision: p.revision,
      profile: {
        name: p.name,
        weight: p.weight,
        height: p.height,
        goal: p.goal,
        diet: p.diet,
        exclusions: p.exclusions,
        medicalNotes: p.medical_notes,
        allergies: db
          .prepare(
            "SELECT allergy FROM profile_allergies WHERE profile_id=1 ORDER BY allergy",
          )
          .all()
          .map((r) => r.allergy),
      },
      pantry: db
        .prepare(
          "SELECT ingredient_id FROM pantry_items WHERE profile_id=1 ORDER BY position",
        )
        .all()
        .map((r) => r.ingredient_id),
      saved: db
        .prepare(
          "SELECT recipe_id FROM favorites WHERE profile_id=1 ORDER BY recipe_id",
        )
        .all()
        .map((r) => r.recipe_id),
      feedback: Object.fromEntries(
        db
          .prepare(
            "SELECT recipe_id,liked FROM recipe_feedback WHERE profile_id=1",
          )
          .all()
          .map((r) => [r.recipe_id, Boolean(r.liked)]),
      ),
      generated: db
        .prepare(
          "SELECT payload FROM recipes WHERE source='gemini' ORDER BY created_at DESC, rowid DESC",
        )
        .all()
        .map((r) => JSON.parse(r.payload)),
      recipes: db
        .prepare(
          "SELECT payload FROM recipes WHERE source='catalog' ORDER BY rowid",
        )
        .all()
        .map((r) => JSON.parse(r.payload)),
      ingredients: db
        .prepare(
          "SELECT id,name,category,unit,emoji FROM ingredients ORDER BY position",
        )
        .all(),
    };
  };
  return {
    // A read transaction gives a consistent snapshot even if DBeaver has another connection.
    getState: () => transaction(readState),
    saveState(raw) {
      const s = validateState(raw);
      return transaction(() => {
        checkRevision(s.revision);
        for (const id of new Set([...s.saved, ...Object.keys(s.feedback)])) {
          if (!db.prepare("SELECT id FROM recipes WHERE id=?").get(id))
            throw new AppError(
              "INVALID_STATE",
              "Una receta ya no existe. Recarga la página.",
              400,
            );
        }
        writeProfile(s.profile);
        writePantry(s.pantry);
        db.exec(
          "DELETE FROM favorites WHERE profile_id=1; DELETE FROM recipe_feedback WHERE profile_id=1",
        );
        s.saved.forEach((id) =>
          db.prepare("INSERT INTO favorites VALUES(1,?)").run(id),
        );
        Object.entries(s.feedback).forEach(([id, liked]) =>
          db
            .prepare("INSERT INTO recipe_feedback VALUES(1,?,?)")
            .run(id, Number(liked)),
        );
        db.exec("UPDATE profiles SET revision=revision+1 WHERE id=1");
        return { revision: revision() };
      });
    },
    saveGenerated(result, expectedRevision) {
      transaction(() => {
        checkRevision(expectedRevision);
        if (!result.recipes.length) return;
        const count = db
          .prepare("SELECT COUNT(*) AS n FROM recipes WHERE source='gemini'")
          .get().n;
        if (count + result.recipes.length > 1000)
          throw new AppError(
            "STORAGE_LIMIT",
            "Alcanzaste el límite local de 1000 recetas. Haz una copia y limpia los datos antes de generar más.",
            409,
          );
        result.recipes.forEach((r) => insertRecipe(r, "gemini"));
      });
    },
    reset(expectedRevision) {
      return transaction(() => {
        checkRevision(expectedRevision);
        db.exec(
          "DELETE FROM favorites; DELETE FROM recipe_feedback; DELETE FROM recipes WHERE source='gemini'",
        );
        writeProfile(initialProfile);
        writePantry(initialPantry);
        db.exec("UPDATE profiles SET revision=revision+1 WHERE id=1");
        return readState();
      });
    },
    close: () => db.close(),
  };
}
