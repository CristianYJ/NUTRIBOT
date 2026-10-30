import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { createAuthStore } from "./auth-store.js";
import { conversationStore } from "./conversations.js";
import { ageFromBirthDate } from "../src/date-utils.js";
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
import { calculateRecipeNutrition } from "./nutrition.js";
import { estimatedGrams } from "./auto-nutrition.js";
import { mealStore } from './meals.js';
import { createPlanUsage } from './plan-usage.js';
import { createAdminDiagnostics } from './admin-diagnostics.js';
import { createAdminAnalytics } from './admin-analytics.js';

export async function openDatabase(options = {}) {
  const { schema = "nutribot", adminEmail = '', ...connection } = options;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Esquema inválido");
  const pool = new pg.Pool(
    postgresOptions({
      ...connection,
      options: `-c search_path=${schema},public`,
    }),
  );
  const accountScope = new AsyncLocalStorage();
  const profileId = () => accountScope.getStore() ?? 1;
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
      await c.query(
        `SELECT revision FROM profiles WHERE id=${profileId()} FOR UPDATE`,
      )
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
      `UPDATE profiles SET name=$1,weight_kg=$2,height_cm=$3,goal=$4,diet=$5,exclusions=$6,medical_notes=$7,birth_date=$8,max_saturated_fat_g=$9,max_sodium_mg=$10,max_sugar_g=$11,calorie_sex=$12,calorie_activity=$13,calorie_estimate_eligible=$14,updated_at=now() WHERE id=${profileId()}`,
      [
        p.name,
        p.weight === "" ? null : Number(p.weight),
        p.height === "" ? null : Number(p.height),
        p.goal,
        p.diet,
        p.exclusions,
        p.medicalNotes,
        p.birthDate || null,
        p.maxSaturatedFatG || null,
        p.maxSodiumMg || null,
        p.maxSugarG || null,
        p.calorieSex || "",p.calorieActivity || "",p.calorieEstimateEligible ?? false,
      ],
    );
    await c.query(
      `DELETE FROM profile_allergies WHERE profile_id=${profileId()}`,
    );
    for (const a of p.allergies)
      await c.query(`INSERT INTO profile_allergies VALUES(${profileId()},$1)`, [
        a,
      ]);
  }
  async function writePantry(c, pantry) {
    await c.query(`DELETE FROM pantry_items WHERE profile_id=${profileId()} AND NOT (ingredient_id=ANY($1::varchar[]))`,[pantry]);
    for (const [pos, id] of pantry.entries())
      await c.query(`INSERT INTO pantry_items(profile_id,ingredient_id,position) VALUES(${profileId()},$1,$2) ON CONFLICT(profile_id,ingredient_id) DO UPDATE SET position=EXCLUDED.position`, [
        id,
        pos,
      ]);
  }
  async function insertRecipe(c, r, source) {
    await c.query(
      `INSERT INTO recipes(id,profile_id,source,title,subtitle,minutes,category,emoji,photo,vegan,vegetarian,model,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        r.id,
        source === "gemini" ? profileId() : null,
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
    for (const [pos, id] of r.ingredients.entries()) {
      await c.query("INSERT INTO recipe_ingredients(recipe_id,ingredient_id,amount,position) VALUES($1,$2,$3,$4)", [
        r.id,
        id,
        r.amounts[pos],
        pos,
      ]);
      if (r.grams?.[pos] != null)
        await c.query("UPDATE recipe_ingredients SET grams_per_person=$1 WHERE recipe_id=$2 AND ingredient_id=$3", [r.grams[pos], r.id, id]);
    }
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
        `SELECT * FROM recipes WHERE source='catalog' OR profile_id=${profileId()} ORDER BY created_at DESC,id`,
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
          grams: [],
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
        r.grams.push(row.grams_per_person === null ? null : Number(row.grams_per_person));
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
    const items = (
      await c.query(
        `SELECT id,name,category,unit,emoji,animal,meat FROM ingredients WHERE profile_id IS NULL OR profile_id=${profileId()} ORDER BY position`,
      )
    ).rows;
    const allergens = (
      await c.query(
        "SELECT ingredient_id,allergen FROM ingredient_allergens ORDER BY allergen",
      )
    ).rows;
    return items.map((item) => ({
      ...item,
      allergens: allergens
        .filter((a) => a.ingredient_id === item.id)
        .map((a) => a.allergen),
    }));
  }
  async function readState(c) {
    const p = (
      await c.query(
        `SELECT id,name,weight_kg,height_cm,calorie_sex,calorie_activity,calorie_estimate_eligible,goal,diet,exclusions,medical_notes,max_saturated_fat_g,max_sodium_mg,max_sugar_g,revision,email,plan_code,(SELECT name FROM plans WHERE code=profiles.plan_code) AS plan_name,to_char(birth_date,'YYYY-MM-DD') AS birth_date FROM profiles WHERE id=${profileId()}`,
      )
    ).rows[0];
    const all = await readRecipes(c);
    return {
      revision: p.revision,
      profile: {
        id: Number(p.id),
        email: p.email || "",
        birthDate: p.birth_date || "",
        age: ageFromBirthDate(p.birth_date),
        name: p.name,
        plan: { code: p.plan_code, name: p.plan_name },
        calorieSex:p.calorie_sex,calorieActivity:p.calorie_activity,calorieEstimateEligible:p.calorie_estimate_eligible,
        weight: p.weight_kg === null ? "" : String(Number(p.weight_kg)),
        height: p.height_cm === null ? "" : String(Number(p.height_cm)),
        goal: p.goal,
        diet: p.diet,
        exclusions: p.exclusions,
        medicalNotes: p.medical_notes,
        maxSaturatedFatG: p.max_saturated_fat_g === null ? "" : String(Number(p.max_saturated_fat_g)),
        maxSodiumMg: p.max_sodium_mg === null ? "" : String(Number(p.max_sodium_mg)),
        maxSugarG: p.max_sugar_g === null ? "" : String(Number(p.max_sugar_g)),
        allergies: (
          await c.query(
            `SELECT allergen FROM profile_allergies WHERE profile_id=${profileId()} ORDER BY allergen`,
          )
        ).rows.map((r) => r.allergen),
      },
      pantry: (
        await c.query(
          `SELECT ingredient_id FROM pantry_items WHERE profile_id=${profileId()} ORDER BY position`,
        )
      ).rows.map((r) => r.ingredient_id),
      saved: (
        await c.query(
          `SELECT recipe_id FROM favorites WHERE profile_id=${profileId()} ORDER BY recipe_id`,
        )
      ).rows.map((r) => r.recipe_id),
      feedback: Object.fromEntries(
        (
          await c.query(
            `SELECT recipe_id,liked FROM recipe_feedback WHERE profile_id=${profileId()}`,
          )
        ).rows.map((r) => [r.recipe_id, r.liked]),
      ),
      generated: all.filter((r) => r.source === "gemini"),
      recipes: all.filter((r) => r.source === "catalog"),
      ingredients: await readIngredients(c),
      pantryDates: Object.fromEntries((await c.query("SELECT ingredient_id,to_char(start_date,'YYYY-MM-DD') AS start_date,estimate_rule,custom_days,to_char(label_date,'YYYY-MM-DD') AS label_date FROM pantry_dates WHERE profile_id=$1",[profileId()])).rows.map(row=>[row.ingredient_id,{startDate:row.start_date||'',rule:row.estimate_rule,customDays:row.custom_days,labelDate:row.label_date||''}])),
    };
  }
  async function writeState(c, s) {
    for (const id of new Set([...s.saved, ...Object.keys(s.feedback)])) {
      if (
        !(
          await c.query(
            `SELECT id FROM recipes WHERE id=$1 AND (source='catalog' OR profile_id=${profileId()})`,
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
    if(s.pantryDates!==undefined){
      await c.query('DELETE FROM pantry_dates WHERE profile_id=$1',[profileId()]);
      for(const [id,date] of Object.entries(s.pantryDates))await c.query('INSERT INTO pantry_dates(profile_id,ingredient_id,start_date,estimate_rule,custom_days,label_date) VALUES($1,$2,$3,$4,$5,$6)',[profileId(),id,date.startDate||null,date.rule,date.customDays,date.labelDate||null]);
    }
    await c.query(`DELETE FROM favorites WHERE profile_id=${profileId()}`);
    await c.query(
      `DELETE FROM recipe_feedback WHERE profile_id=${profileId()}`,
    );
    for (const id of s.saved)
      await c.query(
        `INSERT INTO favorites(profile_id,recipe_id) VALUES(${profileId()},$1)`,
        [id],
      );
    for (const [id, liked] of Object.entries(s.feedback))
      await c.query(
        `INSERT INTO recipe_feedback(profile_id,recipe_id,liked) VALUES(${profileId()},$1,$2)`,
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
      if (version > 14) throw new Error("Esquema de una versión posterior");
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
          `INSERT INTO profiles(id,name,goal,diet) VALUES(${profileId()},$1,$2,$3)`,
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
      if (version < 2) {
        await c.query(
          readFileSync(
            new URL("./postgres/002_accounts.sql", import.meta.url),
            "utf8",
          ),
        );
        await c.query("INSERT INTO schema_migrations(version) VALUES(2)");
      }
      if(version<3){
        await c.query(readFileSync(new URL('./postgres/003_chat_history_pantry_dates.sql',import.meta.url),'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(3)');
      }
      if (version < 4) {
        await c.query(readFileSync(new URL('./postgres/004_user_plans.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(4)');
      }
      if (version < 5) {
        await c.query(readFileSync(new URL('./postgres/005_usda_nutrition.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(5)');
      }
      if (version < 6) {
        await c.query(readFileSync(new URL('./postgres/006_plan_usage.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(6)');
      }
      if (version < 7) {
        await c.query(readFileSync(new URL('./postgres/007_meal_log.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(7)');
      }
      if (version < 8) {
        await c.query(readFileSync(new URL('./postgres/008_nutrition_goal.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(8)');
      }
      if (version < 9) {
        await c.query(readFileSync(new URL('./postgres/009_edamam_favorites.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(9)');
      }
      if (version < 10) {
        await c.query(readFileSync(new URL('./postgres/010_admin_diagnostics.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(10)');
      }
      if (version < 11) {
        await c.query(readFileSync(new URL('./postgres/011_edamam_meals.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(11)');
      }
      if (version < 12) {
        await c.query(readFileSync(new URL('./postgres/012_admin_api_metrics.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(12)');
      }
      if (version < 13) {
        await c.query(readFileSync(new URL('./postgres/013_admin_daily_metrics.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(13)');
      }
      if (version < 14) {
        await c.query(readFileSync(new URL('./postgres/014_edamam_saved_meal.sql', import.meta.url), 'utf8'));
        await c.query('INSERT INTO schema_migrations(version) VALUES(14)');
      }
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
  async function readRecipeNutrition(c,recipeId,servings = 1) {
        const profile = (await c.query(`SELECT max_saturated_fat_g,max_sodium_mg,max_sugar_g FROM profiles WHERE id=${profileId()}`)).rows[0];
        const rows = (await c.query(
          `SELECT ri.ingredient_id,i.name,ri.amount,r.source,COALESCE(o.grams_per_person,ri.grams_per_person) AS grams_per_person,
            u.fdc_id,u.description,u.data_type,u.nutrients
           FROM recipe_ingredients ri
           JOIN recipes r ON r.id=ri.recipe_id
           JOIN ingredients i ON i.id=ri.ingredient_id
           LEFT JOIN recipe_gram_overrides o ON o.recipe_id=ri.recipe_id AND o.ingredient_id=ri.ingredient_id AND o.profile_id=$2
           LEFT JOIN ingredient_usda_links u ON u.ingredient_id=ri.ingredient_id AND u.profile_id=$2
           WHERE ri.recipe_id=$1 AND (r.source='catalog' OR r.profile_id=$2)
           ORDER BY ri.position`, [recipeId, profileId()])).rows;
        if (!rows.length) throw new AppError('NOT_FOUND', 'Receta no encontrada.', 404);
        const items = rows.map((row) => ({
          ingredientId: row.ingredient_id,
          name: row.name,
          amount: row.amount,
          gramsPerPerson: row.grams_per_person === null ? estimatedGrams(recipeId, row.ingredient_id, row.amount, row.source) : Number(row.grams_per_person),
          usda: row.fdc_id === null ? null : { fdcId: Number(row.fdc_id), description: row.description, dataType: row.data_type, nutrients: row.nutrients },
        }));
        return { ingredients: items, nutrition: calculateRecipeNutrition(items, servings, {
          maxSaturatedFatG: profile.max_saturated_fat_g,
          maxSodiumMg: profile.max_sodium_mg,
          maxSugarG: profile.max_sugar_g,
        }) };
  }
  const usage = createPlanUsage({ transaction, profileId, adminEmail });
  const store = {
    ...createAdminDiagnostics({ transaction, profileId, pool }),
    ...createAdminAnalytics({ transaction, adminEmail }),
    ...mealStore({transaction,profileId,readRecipeNutrition}),
    getUsage: usage.getUsage,
    reserveUsage: usage.reserveUsage,
    finishUsage: usage.finishUsage,
    auth: createAuthStore(pool, transaction),
    ...conversationStore(transaction,profileId,readRecipes),
    provider: "postgresql",
    async health() {
      await pool.query("SELECT 1");
      return true;
    },
    getState: () => transaction(readState, true),
    listEdamamFavorites: () => transaction(async c => (await c.query(
      'SELECT recipe_uri AS uri,title,meal FROM edamam_favorites WHERE profile_id=$1 ORDER BY created_at DESC', [profileId()],
    )).rows, true),
    saveEdamamFavorite(uri, title, meal = null) {
      if (typeof title !== 'string' || !title.trim() || title.length > 150) throw new AppError('INVALID_RECIPE', 'El nombre de la receta no es válido.');
      if (meal !== null && !['Desayuno', 'Almuerzo', 'Cena'].includes(meal)) throw new AppError('INVALID_RECIPE', 'La categoría de la receta no es válida.');
      return transaction(async c => {
        await c.query('INSERT INTO edamam_favorites(profile_id,recipe_uri,title,meal) VALUES($1,$2,$3,$4) ON CONFLICT(profile_id,recipe_uri) DO UPDATE SET title=EXCLUDED.title, meal=COALESCE(EXCLUDED.meal,edamam_favorites.meal)', [profileId(), uri, title.trim(), meal]);
        return { saved: true };
      });
    },
    classifyEdamamFavorites(items) { return transaction(async c => {
      for (const item of items) {
        if (!['Desayuno', 'Almuerzo', 'Cena'].includes(item.meal)) continue;
        await c.query('UPDATE edamam_favorites SET meal=$3, title=$4 WHERE profile_id=$1 AND recipe_uri=$2 AND meal IS NULL', [profileId(), item.uri, item.meal, item.title]);
      }
    }); },
    removeEdamamFavorite(uri) { return transaction(async c => {
      await c.query('DELETE FROM edamam_favorites WHERE profile_id=$1 AND recipe_uri=$2', [profileId(), uri]);
      return { saved: false };
    }); },
    getIngredientNutritionItems(ids) {
      if (!Array.isArray(ids) || ids.length > 28 || ids.some((id) => typeof id !== 'string' || !id || id.length > 60))
        throw new AppError('INVALID_INGREDIENT', 'Lista de ingredientes inválida.');
      return transaction(async (c) => (await c.query(
        `SELECT i.id AS ingredient_id,i.name,u.fdc_id,u.description,u.data_type,u.nutrients
         FROM ingredients i LEFT JOIN ingredient_usda_links u ON u.ingredient_id=i.id AND u.profile_id=$2
         WHERE i.id=ANY($1::varchar[]) AND (i.profile_id IS NULL OR i.profile_id=$2)
         ORDER BY array_position($1::varchar[],i.id)`, [ids, profileId()])).rows.map((row) => ({
          ingredientId: row.ingredient_id, name: row.name,
          usda: row.fdc_id === null ? null : { fdcId: Number(row.fdc_id), description: row.description, dataType: row.data_type, nutrients: row.nutrients },
        })), true);
    },
    getRecipeNutrition(recipeId, servings = 1) {
      if (typeof recipeId !== 'string' || recipeId.length > 100 || !recipeId) throw new AppError('INVALID_RECIPE', 'Receta inválida.');
      return transaction(c => readRecipeNutrition(c,recipeId,servings),true);
    },
    setRecipeGrams(recipeId, ingredientId, grams) {
      if (typeof recipeId !== 'string' || recipeId.length > 100 || typeof ingredientId !== 'string' || ingredientId.length > 60 || typeof grams !== 'number' || !Number.isFinite(grams) || grams <= 0 || grams > 5000)
        throw new AppError('INVALID_GRAMS', 'Indica entre 0,01 y 5000 gramos por persona.');
      return transaction(async (c) => {
        const allowed = await c.query(`SELECT 1 FROM recipe_ingredients ri JOIN recipes r ON r.id=ri.recipe_id WHERE ri.recipe_id=$1 AND ri.ingredient_id=$2 AND (r.source='catalog' OR r.profile_id=$3)`, [recipeId, ingredientId, profileId()]);
        if (!allowed.rowCount) throw new AppError('NOT_FOUND', 'Ingrediente de receta no encontrado.', 404);
        await c.query(`INSERT INTO recipe_gram_overrides(profile_id,recipe_id,ingredient_id,grams_per_person) VALUES($1,$2,$3,$4) ON CONFLICT(profile_id,recipe_id,ingredient_id) DO UPDATE SET grams_per_person=EXCLUDED.grams_per_person`, [profileId(), recipeId, ingredientId, grams]);
        return { saved: true };
      });
    },
    setIngredientUsda(ingredientId, food) {
      if (typeof ingredientId !== 'string' || !ingredientId || ingredientId.length > 60)
        throw new AppError('INVALID_INGREDIENT', 'Ingrediente inválido.');
      return transaction(async (c) => {
        const allowed = await c.query(`SELECT 1 FROM ingredients WHERE id=$1 AND (profile_id IS NULL OR profile_id=$2)`, [ingredientId, profileId()]);
        if (!allowed.rowCount) throw new AppError('NOT_FOUND', 'Ingrediente no encontrado.', 404);
        await c.query(`INSERT INTO ingredient_usda_links(profile_id,ingredient_id,fdc_id,description,data_type,nutrients) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(profile_id,ingredient_id) DO UPDATE SET fdc_id=EXCLUDED.fdc_id,description=EXCLUDED.description,data_type=EXCLUDED.data_type,nutrients=EXCLUDED.nutrients,updated_at=now()`, [profileId(), ingredientId, food.fdcId, food.description, food.dataType, food.nutrients]);
        return { saved: true };
      });
    },
    screenGeneratedNutrition(result, profile) {
      if (result.type !== 'success' || !result.recipes?.length || ![profile.maxSaturatedFatG, profile.maxSodiumMg, profile.maxSugarG].some(Boolean)) return Promise.resolve(result);
      return transaction(async (c) => {
        const links = new Map((await c.query(`SELECT ingredient_id, nutrients FROM ingredient_usda_links WHERE profile_id=${profileId()}`)).rows.map((row) => [row.ingredient_id, row.nutrients]));
        let unverified = false;
        const recipes = result.recipes.filter((recipe) => {
          const items = recipe.ingredients.map((id, index) => ({ gramsPerPerson: recipe.grams?.[index] ?? null, usda: links.has(id) ? { nutrients: links.get(id) } : null }));
          const { checks } = calculateRecipeNutrition(items, 1, profile);
          if (Object.values(checks).includes('exceeds')) return false;
          if (Object.values(checks).includes('unknown')) unverified = true;
          return true;
        });
        if (!recipes.length) return { ...result, type: 'review', recipes: [], text: 'Las recetas propuestas superan al menos un límite nutricional configurado en tu perfil. Prueba otra petición o ajusta tus ingredientes.' };
        return { ...result, recipes, text: unverified ? `${result.text} No se pudo verificar algún límite nutricional porque faltan cantidades o datos de USDA para ciertos ingredientes.` : result.text };
      }, true);
    },
    async saveState(raw) {
      return transaction(async (c) => {
        await checkRevision(c, raw?.revision);
        const s = validateState(raw, await readIngredients(c));
        await writeState(c, s);
        return (
          await c.query(
            `UPDATE profiles SET revision=revision+1 WHERE id=${profileId()} RETURNING revision`,
          )
        ).rows[0];
      });
    },
    async addPantry(raw) {
      validateRevision(raw?.revision);
      if (raw.confirmed !== true)
        throw new AppError(
          "REVIEW_REQUIRED",
          "Revisa los ingredientes antes de agregarlos.",
        );
      const items = validatePantryItems(raw.items);
      return transaction(async (c) => {
        await checkRevision(c, raw.revision);
        const catalog = await readIngredients(c);
        const current = (
          await c.query(
            `SELECT ingredient_id FROM pantry_items WHERE profile_id=${profileId()} ORDER BY position`,
          )
        ).rows.map((r) => r.ingredient_id);
        await c.query("SELECT pg_advisory_xact_lock(72461902)");
        let position = Number(
          (
            await c.query(
              "SELECT COALESCE(MAX(position),-1)+1 AS n FROM ingredients",
            )
          ).rows[0].n,
        );
        for (const item of items) {
          let existing = findIngredient(item.name, catalog);
          if (!existing) {
            if (catalog.length >= 200)
              throw new AppError(
                "STORAGE_LIMIT",
                "El catálogo admite hasta 200 ingredientes.",
                409,
              );
            await c.query(
              "INSERT INTO ingredient_categories VALUES($1) ON CONFLICT DO NOTHING",
              [item.category],
            );
            existing = {
              ...item,
              id: "food-" + randomUUID(),
              unit: "unidad",
              emoji: "🥗",
            };
            await c.query(
              "INSERT INTO ingredients(id,name,category,unit,emoji,animal,meat,position,profile_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
              [
                existing.id,
                existing.name,
                existing.category,
                existing.unit,
                existing.emoji,
                existing.animal,
                existing.meat,
                position++,
                profileId(),
              ],
            );
            for (const a of existing.allergens)
              await c.query("INSERT INTO ingredient_allergens VALUES($1,$2)", [
                existing.id,
                a,
              ]);
            catalog.push(existing);
          }
          if (!current.includes(existing.id)) current.push(existing.id);
        }
        await writePantry(c, current);
        await c.query(
          `UPDATE profiles SET revision=revision+1 WHERE id=${profileId()}`,
        );
        return readState(c);
      });
    },
    saveGenerated(result, expected, usageToken) {
      return transaction(async (c) => {
        await checkRevision(c, expected);
        const count = Number(
          (
            await c.query(
              `SELECT count(*) AS n FROM recipes WHERE profile_id=${profileId()} AND source='gemini'`,
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
          `INSERT INTO generation_events(profile_id,model,outcome,recipe_count) VALUES(${profileId()},$1,$2,$3)`,
          [result.model || "unknown", result.type, result.recipes.length],
        );
        await usage.complete(c, usageToken, result.type === 'success' && result.recipes.length > 0);
      });
    },
    reset(expected) {
      return transaction(async (c) => {
        await checkRevision(c, expected);
        for (const table of [
          "meal_log",
          "edamam_meal_log",
          "nutrition_goals",
          "recipe_gram_overrides",
          "ingredient_usda_links",
          "meal_plans",
          "favorites",
          "edamam_favorites",
          "recipe_feedback",
          "generation_events",
        ])
          await c.query(`DELETE FROM ${table} WHERE profile_id=${profileId()}`);
        await c.query(
          `DELETE FROM recipes WHERE profile_id=${profileId()} AND source='gemini'`,
        );
        const current = await readState(c);
        await writeProfile(
          c,
          current.profile.email
            ? {
                ...initialProfile,
                name: current.profile.name,
                birthDate: current.profile.birthDate,
              }
            : initialProfile,
        );
        await c.query('DELETE FROM pantry_dates WHERE profile_id=$1',[profileId()]);
        await writePantry(c, initialPantry);
        await c.query("DELETE FROM ingredients WHERE profile_id=$1", [
          profileId(),
        ]);
        await c.query(
          "DELETE FROM conversations WHERE profile_id=$1",
          [profileId()],
        );
        await c.query(
          `UPDATE profiles SET revision=revision+1 WHERE id=${profileId()}`,
        );
        return readState(c);
      });
    },
    importSqlite(legacy) {
      return transaction(async (c) => {
        await c.query(
          `SELECT revision FROM profiles WHERE id=${profileId()} FOR UPDATE`,
        );
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
          const imported = { ...r };
          if (Array.isArray(imported.grams) && imported.grams.every((value) => value === null)) delete imported.grams;
          const validated = validateOutput(
            { intent: "recipe", recipes: [imported] },
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
        await c.query(`UPDATE profiles SET revision=1 WHERE id=${profileId()}`);
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
          schemaVersion: 11,
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
                `SELECT count(*) AS n FROM recipes WHERE profile_id=${profileId()} AND source='gemini'`,
              )
            ).rows[0].n,
          ),
          favorites: Number(
            (
              await c.query(
                `SELECT count(*) AS n FROM favorites WHERE profile_id=${profileId()}`,
              )
            ).rows[0].n,
          ),
          plannedMeals: Number(
            (
              await c.query(
                `SELECT count(*) AS n FROM meal_plans WHERE profile_id=${profileId()}`,
              )
            ).rows[0].n,
          ),
          generations: Number(
            (
              await c.query(
                `SELECT count(*) AS n FROM generation_events WHERE profile_id=${profileId()}`,
              )
            ).rows[0].n,
          ),
        }),
        true,
      ),
    close: () => pool.end(),
  };
  store.forProfile = (id) => {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new AppError(
        "UNAUTHORIZED",
        "Inicia sesión para acceder a tu cocina.",
        401,
      );
    const scoped = { provider: store.provider };
    for (const name of [
      "health",
      "getTodayMeals",
        "setNutritionGoal",
      "recordMeal",
      "recordEdamamMeal",
      "rateMeal",
      "removeMeal",
      "getUsage",
      "reserveUsage",
      "finishUsage",
      "getState",
      "saveState",
      "addPantry",
      "saveGenerated",
      "recordAdminEvent",
      "listEdamamFavorites",
      "saveEdamamFavorite",
      "removeEdamamFavorite",
      "getRecipeNutrition",
      "getIngredientNutritionItems",
      "setRecipeGrams",
      "setIngredientUsda",
      "screenGeneratedNutrition",
      "reset",
      "listChats",
      "getChat",
      "saveChat",
    ])
      scoped[name] = (...args) =>
        accountScope.run(id, () => store[name](...args));
    return scoped;
  };
  return store;
}
