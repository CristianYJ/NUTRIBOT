import pg from "pg";
import { randomUUID } from "node:crypto";
import { validatePantryItems } from "./pantry.js";
import { findIngredient } from "../src/ingredient-utils.js";
import { readFileSync } from "node:fs";
import {
  ingredients,
  recipes,
  initialPantry,
  initialProfile,
  allergyOptions,
} from "../src/data.js";
import { AppError, foodRules, validateOutput } from "./recipes.js";
import {
  validateState,
  validateRevision,
  goals,
  diets,
} from "./state-validation.js";
import { postgresOptions } from "./postgres-config.js";

export async function openDatabase(options = {}) {
  const { schema = "nutribot", ...connection } = options;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Esquema inválido");
  const pool = new pg.Pool(
    postgresOptions({
      ...connection,
      options: `-c search_path=${schema},public`,
    }),
  );
  pool.on("error", () => {}); // Idle-client errors are surfaced by the next request, without secrets.
  async function transaction(work, readOnly = false) {
    const client = await pool.connect();
    try {
      await client.query(
        readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
      );
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  async function checkRevision(c, expected) {
    validateRevision(expected);
    const row = (
      await c.query("SELECT revision FROM profiles WHERE id=1 FOR UPDATE")
    ).rows[0];
    if (!row || row.revision !== expected)
      throw new AppError(
        "STATE_CONFLICT",
        "Los datos cambiaron en otra pestaña. Recarga la versión guardada antes de continuar.",
        409,
      );
  }
  async function writeProfile(c, p) {
    await c.query(
      "UPDATE profiles SET name=$1,weight_kg=$2,height_cm=$3,goal=$4,diet=$5,exclusions=$6,medical_notes=$7,updated_at=now() WHERE id=1",
      [
        p.name,
        p.weight === "" ? null : Number(p.weight),
        p.height === "" ? null : Number(p.height),
        p.goal,
        p.diet,
        p.exclusions,
        p.medicalNotes,
      ],
    );
    await c.query("DELETE FROM profile_allergies WHERE profile_id=1");
    for (const a of p.allergies)
      await c.query("INSERT INTO profile_allergies VALUES(1,$1)", [a]);
  }
  async function writePantry(c, pantry) {
    await c.query("DELETE FROM pantry_items WHERE profile_id=1");
    for (const [pos, id] of pantry.entries())
      await c.query("INSERT INTO pantry_items VALUES(1,$1,$2)", [id, pos]);
  }
  async function insertRecipe(c, r, source) {
    await c.query(
      `INSERT INTO recipes(id,profile_id,source,title,subtitle,minutes,category,emoji,photo,vegan,vegetarian,model,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        r.id,
        source === "gemini" ? 1 : null,
        source,
        r.title,
        r.subtitle,
        r.time,
        r.category,
        r.emoji || "🍽️",
        Boolean(r.photo),
        r.vegan ?? !r.ingredients.some((id) => foodRules[id]?.animal),
        r.vegetarian ?? !r.ingredients.some((id) => foodRules[id]?.meat),
        r.model || null,
        r.createdAt || new Date().toISOString(),
      ],
    );
    for (const [pos, id] of r.ingredients.entries())
      await c.query("INSERT INTO recipe_ingredients VALUES($1,$2,$3,$4)", [
        r.id,
        id,
        r.amounts[pos],
        pos,
      ]);
    for (const [pos, step] of r.steps.entries())
      await c.query("INSERT INTO recipe_steps VALUES($1,$2,$3)", [
        r.id,
        pos,
        step,
      ]);
    for (const a of r.allergens)
      await c.query("INSERT INTO recipe_allergens VALUES($1,$2)", [r.id, a]);
    if (source === "catalog" && r.nutrition)
      await c.query(
        "INSERT INTO recipe_nutrition_examples VALUES($1,$2,$3,$4,$5,'demo_unverified')",
        [r.id, ...r.nutrition],
      );
  }
  async function readRecipes(c) {
    const rows = (
      await c.query(
        "SELECT * FROM recipes WHERE source='catalog' OR profile_id=1 ORDER BY created_at DESC,id",
      )
    ).rows;
    const map = new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          time: r.minutes,
          category: r.category,
          emoji: r.emoji,
          photo: r.photo,
          vegan: r.vegan,
          vegetarian: r.vegetarian,
          source: r.source,
          model: r.model,
          createdAt: r.created_at.toISOString(),
          ingredients: [],
          amounts: [],
          steps: [],
          allergens: [],
          nutrition: null,
        },
      ]),
    );
    for (const row of (
      await c.query(
        "SELECT * FROM recipe_ingredients ORDER BY recipe_id,position",
      )
    ).rows) {
      const r = map.get(row.recipe_id);
      if (r) {
        r.ingredients.push(row.ingredient_id);
        r.amounts.push(row.amount);
      }
    }
    for (const row of (
      await c.query("SELECT * FROM recipe_steps ORDER BY recipe_id,position")
    ).rows)
      map.get(row.recipe_id)?.steps.push(row.instruction);
    for (const row of (
      await c.query(
        "SELECT * FROM recipe_allergens ORDER BY recipe_id,allergen",
      )
    ).rows)
      map.get(row.recipe_id)?.allergens.push(row.allergen);
    for (const row of (await c.query("SELECT * FROM recipe_nutrition_examples"))
      .rows) {
      const r = map.get(row.recipe_id);
      if (r)
        r.nutrition = [row.kcal, row.protein_g, row.carbs_g, row.fat_g].map(
          Number,
        );
    }
    return [...map.values()];
  }
  async function readIngredients(c) {
    const items = (await c.query("SELECT id,name,category,unit,emoji,animal,meat FROM ingredients ORDER BY position")).rows;
    const allergens = (await c.query("SELECT ingredient_id,allergen FROM ingredient_allergens ORDER BY allergen")).rows;
    return items.map(item => ({ ...item, allergens: allergens.filter(a => a.ingredient_id === item.id).map(a => a.allergen) }));
  }
  async function readState(c) {
    const p = (await c.query("SELECT * FROM profiles WHERE id=1")).rows[0];
    const all = await readRecipes(c);
    return {
      revision: p.revision,
      profile: {
        name: p.name,
        weight: p.weight_kg === null ? "" : String(Number(p.weight_kg)),
        height: p.height_cm === null ? "" : String(Number(p.height_cm)),
        goal: p.goal,
        diet: p.diet,
        exclusions: p.exclusions,
        medicalNotes: p.medical_notes,
        allergies: (
          await c.query(
            "SELECT allergen FROM profile_allergies WHERE profile_id=1 ORDER BY allergen",
          )
        ).rows.map((r) => r.allergen),
      },
      pantry: (
        await c.query(
          "SELECT ingredient_id FROM pantry_items WHERE profile_id=1 ORDER BY position",
        )
      ).rows.map((r) => r.ingredient_id),
      saved: (
        await c.query(
          "SELECT recipe_id FROM favorites WHERE profile_id=1 ORDER BY recipe_id",
        )
      ).rows.map((r) => r.recipe_id),
      feedback: Object.fromEntries(
        (
          await c.query(
            "SELECT recipe_id,liked FROM recipe_feedback WHERE profile_id=1",
          )
        ).rows.map((r) => [r.recipe_id, r.liked]),
      ),
      generated: all.filter((r) => r.source === "gemini"),
      recipes: all.filter((r) => r.source === "catalog"),
      ingredients: await readIngredients(c),
    };
  }
  async function writeState(c, s) {
    for (const id of new Set([...s.saved, ...Object.keys(s.feedback)])) {
      if (
        !(
          await c.query(
            "SELECT id FROM recipes WHERE id=$1 AND (source='catalog' OR profile_id=1)",
            [id],
          )
        ).rowCount
      )
        throw new AppError(
          "INVALID_STATE",
          "Una receta ya no existe. Recarga la página.",
        );
    }
    await writeProfile(c, s.profile);
    await writePantry(c, s.pantry);
    await c.query("DELETE FROM favorites WHERE profile_id=1");
    await c.query("DELETE FROM recipe_feedback WHERE profile_id=1");
    for (const id of s.saved)
      await c.query(
        "INSERT INTO favorites(profile_id,recipe_id) VALUES(1,$1)",
        [id],
      );
    for (const [id, liked] of Object.entries(s.feedback))
      await c.query(
        "INSERT INTO recipe_feedback(profile_id,recipe_id,liked) VALUES(1,$1,$2)",
        [id, liked],
      );
  }
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(72461901)");
      await c.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const version = (
        await c.query(
          "SELECT COALESCE(MAX(version),0) AS n FROM schema_migrations",
        )
      ).rows[0].n;
      if (version > 1) throw new Error("Esquema de una versión posterior");
      if (version === 0) {
        await c.query(
          readFileSync(
            new URL("./postgres/001_schema.sql", import.meta.url),
            "utf8",
          ),
        );
        for (const name of diets)
          await c.query("INSERT INTO diets VALUES($1)", [name]);
        for (const name of goals)
          await c.query("INSERT INTO goals VALUES($1)", [name]);
        for (const name of allergyOptions)
          await c.query("INSERT INTO allergens VALUES($1)", [name]);
        for (const name of new Set(ingredients.map((i) => i.category)))
          await c.query("INSERT INTO ingredient_categories VALUES($1)", [name]);
        for (const unit of new Set(ingredients.map((i) => i.unit)))
          await c.query("INSERT INTO units VALUES($1)", [unit]);
        await c.query(
          "INSERT INTO profiles(id,name,goal,diet) VALUES(1,$1,$2,$3)",
          [initialProfile.name, initialProfile.goal, initialProfile.diet],
        );
        await c.query(
          "SELECT setval(pg_get_serial_sequence('profiles','id'),1,true)",
        );
        for (const [pos, i] of ingredients.entries()) {
          await c.query(
            "INSERT INTO ingredients VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              i.id,
              i.name,
              i.category,
              i.unit,
              i.emoji,
              Boolean(foodRules[i.id]?.animal),
              Boolean(foodRules[i.id]?.meat),
              pos,
            ],
          );
          for (const a of foodRules[i.id]?.allergens || [])
            await c.query("INSERT INTO ingredient_allergens VALUES($1,$2)", [
              i.id,
              a,
            ]);
        }
        await writePantry(c, initialPantry);
        for (const r of recipes) await insertRecipe(c, r, "catalog");
        await c.query("INSERT INTO schema_migrations(version) VALUES(1)");
      }
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
  const store = {
    provider: "postgresql",
    async health() {
      await pool.query("SELECT 1");
      return true;
    },
    getState: () => transaction(readState, true),
    async saveState(raw) {
      return transaction(async (c) => {
        await checkRevision(c, raw?.revision);
        const s = validateState(raw, await readIngredients(c));
        await writeState(c, s);
        return (
          await c.query(
            "UPDATE profiles SET revision=revision+1 WHERE id=1 RETURNING revision",
          )
        ).rows[0];
      });
    },
    async addPantry(raw) {
      validateRevision(raw?.revision);
      if (raw.confirmed !== true) throw new AppError("REVIEW_REQUIRED", "Revisa los ingredientes antes de agregarlos.");
      const items = validatePantryItems(raw.items);
      return transaction(async c => {
        await checkRevision(c, raw.revision);
        const catalog = await readIngredients(c);
        const current = (await c.query("SELECT ingredient_id FROM pantry_items WHERE profile_id=1 ORDER BY position")).rows.map(r => r.ingredient_id);
        let position = Number((await c.query("SELECT COALESCE(MAX(position),-1)+1 AS n FROM ingredients")).rows[0].n);
        for (const item of items) {
          let existing = findIngredient(item.name, catalog);
          if (!existing) {
            if (catalog.length >= 200) throw new AppError("STORAGE_LIMIT", "El catálogo admite hasta 200 ingredientes.", 409);
            await c.query("INSERT INTO ingredient_categories VALUES($1) ON CONFLICT DO NOTHING", [item.category]);
            existing = { ...item, id: "food-" + randomUUID(), unit: "unidad", emoji: "🥗" };
            await c.query("INSERT INTO ingredients VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
              [existing.id, existing.name, existing.category, existing.unit, existing.emoji, existing.animal, existing.meat, position++]);
            for (const a of existing.allergens) await c.query("INSERT INTO ingredient_allergens VALUES($1,$2)", [existing.id, a]);
            catalog.push(existing);
          }
          if (!current.includes(existing.id)) current.push(existing.id);
        }
        await writePantry(c, current);
        await c.query("UPDATE profiles SET revision=revision+1 WHERE id=1");
        return readState(c);
      });
    },
    saveGenerated(result, expected) {
      return transaction(async (c) => {
        await checkRevision(c, expected);
        const count = Number(
          (
            await c.query(
              "SELECT count(*) AS n FROM recipes WHERE profile_id=1 AND source='gemini'",
            )
          ).rows[0].n,
        );
        if (count + result.recipes.length > 1000)
          throw new AppError(
            "STORAGE_LIMIT",
            "Alcanzaste el límite local de 1000 recetas. Crea una copia antes de limpiar los datos.",
            409,
          );
        for (const r of result.recipes) await insertRecipe(c, r, "gemini");
        await c.query(
          "INSERT INTO generation_events(profile_id,model,outcome,recipe_count) VALUES(1,$1,$2,$3)",
          [result.model || "unknown", result.type, result.recipes.length],
        );
      });
    },
    reset(expected) {
      return transaction(async (c) => {
        await checkRevision(c, expected);
        for (const table of [
          "meal_plans",
          "favorites",
          "recipe_feedback",
          "generation_events",
        ])
          await c.query(`DELETE FROM ${table} WHERE profile_id=1`);
        await c.query(
          "DELETE FROM recipes WHERE profile_id=1 AND source='gemini'",
        );
        await writeProfile(c, initialProfile);
        await writePantry(c, initialPantry);
        await c.query("DELETE FROM ingredients WHERE id LIKE 'food-%'");
        await c.query("UPDATE profiles SET revision=revision+1 WHERE id=1");
        return readState(c);
      });
    },
    importSqlite(legacy) {
      return transaction(async (c) => {
        await c.query("SELECT revision FROM profiles WHERE id=1 FOR UPDATE");
        if (
          (await c.query("SELECT 1 FROM data_imports WHERE source='sqlite-v1'"))
            .rowCount
        )
          return { alreadyImported: true };
        const state = await readState(c);
        if (
          state.revision !== 0 ||
          state.generated.length ||
          state.saved.length ||
          (await c.query("SELECT 1 FROM meal_plans LIMIT 1")).rowCount
        )
          throw new AppError(
            "IMPORT_NOT_EMPTY",
            "La base destino ya tiene cambios. La importación no los sobrescribirá.",
            409,
          );
        const input = {
          pantry: ingredients.map((i) => i.id),
          maxTime: 60,
          profile: { diet: "Sin preferencia", allergies: [] },
        };
        for (const r of legacy.generated) {
          const validated = validateOutput(
            { intent: "recipe", recipes: [r] },
            input,
            r.model || "legacy-gemini",
          ).recipes[0];
          await insertRecipe(
            c,
            { ...validated, id: r.id, createdAt: r.createdAt },
            "gemini",
          );
        }
        await writeState(
          c,
          validateState({
            revision: 0,
            profile: legacy.profile,
            pantry: legacy.pantry,
            saved: legacy.saved,
            feedback: legacy.feedback,
          }),
        );
        await c.query("UPDATE profiles SET revision=1 WHERE id=1");
        await c.query(
          "INSERT INTO data_imports(source,recipe_count) VALUES('sqlite-v1',$1)",
          [legacy.generated.length],
        );
        return { importedRecipes: legacy.generated.length };
      });
    },
    summary: () =>
      transaction(
        async (c) => ({
          provider: "postgresql",
          schemaVersion: 1,
          ingredients: Number(
            (await c.query("SELECT count(*) AS n FROM ingredients")).rows[0].n,
          ),
          examples: Number(
            (
              await c.query(
                "SELECT count(*) AS n FROM recipes WHERE source='catalog'",
              )
            ).rows[0].n,
          ),
          generated: Number(
            (
              await c.query(
                "SELECT count(*) AS n FROM recipes WHERE profile_id=1 AND source='gemini'",
              )
            ).rows[0].n,
          ),
          favorites: Number(
            (
              await c.query(
                "SELECT count(*) AS n FROM favorites WHERE profile_id=1",
              )
            ).rows[0].n,
          ),
          plannedMeals: Number(
            (
              await c.query(
                "SELECT count(*) AS n FROM meal_plans WHERE profile_id=1",
              )
            ).rows[0].n,
          ),
          generations: Number(
            (
              await c.query(
                "SELECT count(*) AS n FROM generation_events WHERE profile_id=1",
              )
            ).rows[0].n,
          ),
        }),
        true,
      ),
    close: () => pool.end(),
  };
  return store;
}
