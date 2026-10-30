import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { openDatabase } from "../server/database.js";
import { postgresOptions } from "../server/postgres-config.js";
import { createAppServer } from "../server/app.js";
import { validateOutput, parseInput, allowedIngredients } from "../server/recipes.js";
import { requireRecipeNutrition } from "../server/nutrition-readiness.js";

const database = process.env.PGTESTDATABASE;
if (
  !database ||
  !database.endsWith("_test") ||
  database === process.env.PGDATABASE
)
  throw new Error(
    "PGTESTDATABASE debe ser una base de pruebas distinta, terminada en _test.",
  );
const writable = (s) => ({
  revision: s.revision,
  profile: s.profile,
  pantry: s.pantry,
  saved: s.saved,
  feedback: s.feedback,
});
const result = () =>
  validateOutput(
    {
      intent: "recipe",
      recipes: [
        {
          title: "Arroz con tomate",
          subtitle: "Prueba automática",
          time: 25,
          category: "Almuerzo",
          ingredients: ["arroz", "tomate"],
          amounts: ["50 g de arroz", "1 tomate"],
          steps: ["Cocina el arroz en agua potable y agrega el tomate lavado."],
        },
      ],
    },
    {
      pantry: ["arroz", "tomate"],
      maxTime: 30,
      profile: { diet: "Sin preferencia", allergies: [] },
    },
    "fake-test-model",
  );
async function fixture(t, overrides = {}) {
  const schema = "nutribot_test_" + randomBytes(8).toString("hex");
  const options = { database, schema, ...overrides };
  const store = await openDatabase(options);
  const sql = new pg.Client(
    postgresOptions({ database, options: `-c search_path=${schema},public` }),
  );
  await sql.connect();
  const stores = [store];
  t.after(async () => {
    await Promise.all(stores.map((s) => s.close()));
    // Only the randomly named schema created by this test is removed, in the
    // explicitly configured test database. The application schema is untouched.
    if (
      !/^nutribot_test_[a-f0-9]{16}$/.test(schema) ||
      database === process.env.PGDATABASE
    )
      throw new Error("Destino de limpieza inválido");
    await sql.query(`DROP SCHEMA ${schema} CASCADE`);
    await sql.end();
  });
  return {
    store,
    sql,
    options,
    async reopen() {
      const next = await openDatabase(options);
      stores.push(next);
      return next;
    },
  };
}

test("PostgreSQL seeds normalized tables once and preserves data after another connection opens", async (t) => {
  const f = await fixture(t),
    s = await f.store.getState();
  assert.equal(s.ingredients.length, 14);
  assert.equal(s.recipes.length, 6);
  await f.store.saveState({
    ...writable(s),
    profile: {
      ...s.profile,
      name: "Prueba SQL",
      weight: "72.5",
      height: "170",
      allergies: ["Leche"],
    },
    pantry: ["arroz", "tomate"],
    saved: ["bowl"],
    feedback: { bowl: true },
  });
  const again = await (await f.reopen()).getState();
  assert.equal(again.profile.name, "Prueba SQL");
  assert.equal(again.profile.weight, "72.5");
  assert.equal(again.feedback.bowl, true);
  assert.deepEqual(again.pantry, ["arroz", "tomate"]);
  assert.equal(
    (await f.sql.query("SELECT count(*)::integer AS n FROM schema_migrations"))
      .rows[0].n,
    14,
  );
  assert.equal(
    (await f.sql.query("SELECT count(*)::integer AS n FROM recipes")).rows[0].n,
    6,
  );
});

test('Edamam saved recipes retain URI, title and meal without nutrition, stay within each account and clear on reset', async t => {
  const f = await fixture(t);
  const uri = 'http://www.edamam.com/ontologies/edamam.owl#recipe_test123';
  await f.store.saveEdamamFavorite(uri, 'Test recipe', 'Desayuno');
  assert.deepEqual(await (await f.reopen()).listEdamamFavorites(), [{ uri, title: 'Test recipe', meal: 'Desayuno' }]);
  const placeholders = (await f.sql.query('SELECT nutrition_cache,nutrition_cache_source,nutrition_cache_updated_at FROM edamam_favorites WHERE recipe_uri=$1', [uri])).rows[0];
  assert.deepEqual(placeholders, { nutrition_cache: null, nutrition_cache_source: null, nutrition_cache_updated_at: null });
  const mealColumns = (await f.sql.query("SELECT column_name FROM information_schema.columns WHERE table_name='edamam_meal_log' AND column_name IN ('nutrition_snapshot','nutrition_source','nutrition_recorded_at') ORDER BY column_name")).rows;
  assert.deepEqual(mealColumns.map(row => row.column_name), ['nutrition_recorded_at', 'nutrition_snapshot', 'nutrition_source']);
  await f.store.classifyEdamamFavorites([{ uri, title: 'Receta de prueba', meal: 'Cena' }]);
  assert.equal((await f.store.listEdamamFavorites())[0].meal, 'Desayuno');
  const oldUri = 'http://www.edamam.com/ontologies/edamam.owl#recipe_old456';
  await f.store.saveEdamamFavorite(oldUri, 'Old recipe');
  await f.store.classifyEdamamFavorites([{ uri: oldUri, title: 'Receta anterior', meal: 'Cena' }]);
  assert.deepEqual((await f.store.listEdamamFavorites())[0], { uri: oldUri, title: 'Receta anterior', meal: 'Cena' });
  const otherId = await f.store.auth.register({ name: 'Other recipe', email: 'edamam-fav@example.test', password: 'A long test password 2026', birthDate: '1990-01-01' }, false);
  assert.deepEqual(await f.store.forProfile(otherId).listEdamamFavorites(), []);
  const state = await f.store.getState();
  await f.store.reset(state.revision);
  assert.deepEqual(await f.store.listEdamamFavorites(), []);
});

test('admin diagnostics retain a bounded trace and allow only the configured account', async t => {
  const f = await fixture(t);
  const id = await f.store.auth.register({ name: 'Administrator', email: 'admin@example.test', password: 'A long test password 2026', birthDate: '1990-01-01' }, false);
  assert.equal(await f.store.isAdmin(id, 'admin@example.test'), true);
  assert.equal(await f.store.isAdmin(1, 'admin@example.test'), false);
  await f.store.forProfile(id).recordAdminEvent({ requestId: randomUUID(), provider: 'gemini', outcome: 'error',
    stage: 'gemini_recipe', errorCode: 'INVALID_AI_OUTPUT', reasons: ['UNDECLARED_SEASONING'],
    message: '2 personas', previousMessage: 'Cena mexicana', pantryCount: 3, maxTime: 30, mode: 'initial', durationMs: 240 });
  const events = await f.store.listAdminEvents();
  assert.equal(events.items.length, 1);
  assert.equal(events.items[0].accountId, id);
  assert.deepEqual(events.items[0].reasons, ['UNDECLARED_SEASONING']);
  const summary = await f.store.adminSummary();
  assert.equal(summary.errors24h, 1);
  assert.equal(summary.quality.activeAccounts, 1);
  assert.equal(summary.byProvider[0].provider, 'gemini');
  assert.equal(summary.daily.length, 7);
  assert.equal((await f.store.adminSummary('year', 2026)).daily.at(-1).errors, 1);
  assert.equal((await f.store.listAdminEvents({ provider: 'edamam' })).items.length, 0);
  assert.equal((await f.store.listAdminEvents({ accountId: id, search: 'INVALID_AI_OUTPUT' })).items.length, 1);
  assert.equal((await f.store.listAdminEvents({ accountId: 1 })).items.length, 0);
  assert.equal((await f.store.findAdminAccount('admin@example.test')).account.id, id);
  assert.equal((await f.store.findAdminAccount(String(id))).recent.length, 1);
});

test('configured administrator receives GOAT Mode quotas while other Basic accounts stay Basic', async t => {
  const f = await fixture(t, { adminEmail: 'admin@example.test' });
  const id = await f.store.auth.register({ name: 'Administrator', email: 'admin@example.test',
    password: 'A long test password 2026', birthDate: '1990-01-01' }, false);
  const admin = f.store.forProfile(id);
  const goat = await admin.getUsage();
  assert.deepEqual(goat.plan, { code: 'goat', name: 'GOAT Mode' });
  assert.equal(goat.recipes.limit, 100);
  assert.equal(goat.vision.limit, 60);
  const normal = await f.store.getUsage();
  assert.deepEqual(normal.plan, { code: 'basico', name: 'Básico' });
  assert.equal(normal.recipes.limit, 4);
  assert.equal(normal.vision.limit, 1);
  assert.equal((await f.sql.query('SELECT plan_code FROM profiles WHERE id=$1', [id])).rows[0].plan_code, 'basico');
  const token = await admin.reserveUsage('recipes');
  assert.equal((await admin.getUsage()).recipes.pending, 1);
  await admin.finishUsage(token, true);
  assert.equal((await admin.getUsage()).recipes.used, 1);
});

test('admin analytics counts measured provider calls, HTTP activity, plans and account history', async t => {
  const f = await fixture(t, { adminEmail: 'admin@example.test' });
  const id = await f.store.auth.register({ name: 'Analytics user', email: 'analytics@example.test',
    password: 'A long test password 2026', birthDate: '1990-01-01' }, false);
  await f.store.recordApiCall({ profileId: id, provider: 'edamam', operation: 'recipe_search',
    outcome: 'success', statusCode: 200, durationMs: 320 });
  await f.store.recordApiCall({ profileId: id, provider: 'gemini', operation: 'generate_content',
    model: 'gemini-test', outcome: 'http_error', statusCode: 429, durationMs: 2100 });
  await f.store.recordHttpRequest({ profileId: id, feature: 'recipes', statusCode: 200, durationMs: 850 });
  const dormant = await f.store.auth.register({ name: 'Dormant user', email: 'dormant@example.test',
    password: 'A long test password 2026', birthDate: '1990-01-01' }, false);
  await f.sql.query("UPDATE profiles SET created_at=now()-interval '31 days' WHERE id=$1", [dormant]);
  const api = await f.store.adminApiSummary();
  assert.equal(api.calls.length, 2);
  assert.equal(api.providers.find(row => row.provider === 'edamam').success, 1);
  assert.equal(api.providers.find(row => row.provider === 'gemini').failed, 1);
  assert.equal((await f.store.adminApiSummary('year', 2026)).providers.find(row => row.provider === 'edamam').total, 1);
  const users = await f.store.adminUsersSummary();
  assert.equal(users.total, 2);
  assert.equal(users.active, 1);
  assert.equal(users.inactive, 1);
  assert.equal(users.free, 2);
  assert.equal(users.features.at(-1).recipes, 1);
  assert.equal(users.planTrend.at(-1).free, 2);
  assert.equal(users.performance.serverUnder2s, 100);
  assert.equal(users.performance.apiUnder2s, 50);
  const detail = await f.store.adminAccountDetail(id);
  assert.equal(detail.usage.recipes.limit, 4);
  assert.equal(detail.calls.length, 2);
  assert.equal(detail.effectivePlan, 'Básico');
  await f.sql.query("UPDATE profiles SET plan_code='nutripro' WHERE id=$1", [id]);
  assert.equal((await f.store.adminUsersSummary()).estimatedMonthlyCents, 299);
  assert.equal((await f.store.adminUsersSummary('quarter')).planTrend.at(-1).paid, 1);
  assert.ok((await f.store.adminAccountDetail(id)).paidSince);
  await f.sql.query("UPDATE profiles SET plan_code='basico' WHERE id=$1", [id]);
  assert.ok((await f.store.adminAccountDetail(id)).freeSinceAfterPaid);
});

test('daily aggregate migration backfills available detailed metrics without account data', async t => {
  const f = await fixture(t);
  await f.store.recordApiCall({ provider: 'edamam', operation: 'recipe_search',
    outcome: 'success', statusCode: 200, durationMs: 300 });
  await f.sql.query('DROP TABLE admin_daily_metrics');
  await f.sql.query('DELETE FROM schema_migrations WHERE version IN (13,14)');
  const reopened = await f.reopen();
  const rows = (await f.sql.query("SELECT source,category,outcome,total FROM admin_daily_metrics WHERE source='api'")).rows;
  assert.deepEqual(rows, [{ source: 'api', category: 'edamam', outcome: 'success', total: 1 }]);
  assert.equal((await reopened.adminApiSummary('year', 2026)).providers.find(item => item.provider === 'edamam').total, 1);
});

test('USDA links and grams persist per recipe and enforce structured limits', async (t) => {
  const f = await fixture(t);
  const state = await f.store.getState();
  const recipe = state.recipes.find((item) => item.ingredients.length > 2);
  await f.store.saveState({ ...writable(state), profile: { ...state.profile, maxSodiumMg: '100' } });
  const initial = await f.store.getRecipeNutrition(recipe.id, 2);
  const lookupItems = await f.store.getIngredientNutritionItems(recipe.ingredients);
  assert.deepEqual(lookupItems.map((item) => item.ingredientId), recipe.ingredients);
  assert(lookupItems.every((item) => item.name && item.usda === null));
  assert(initial.ingredients.every((item) => item.gramsPerPerson > 0));
  assert.equal(initial.nutrition.perPerson.kcal, null);
  assert.equal(initial.nutrition.checks.maxSodiumMg, 'unknown');
  const suggestion = { type: 'success', text: 'Una receta', recipes: [{ ingredients: recipe.ingredients, grams: recipe.ingredients.map(() => 100) }] };
  const pending = await f.store.screenGeneratedNutrition(suggestion, (await f.store.getState()).profile);
  assert.equal(pending.recipes.length, 1);
  assert.match(pending.text, /No se pudo verificar/);
  const nutrients = { kcal: 100, protein: 2, carbs: 10, fat: 2, saturatedFat: 1, sodium: 50, sugars: 1, fiber: 3 };
  for (const ingredientId of recipe.ingredients) {
    await f.store.setRecipeGrams(recipe.id, ingredientId, 100);
    await f.store.setIngredientUsda(ingredientId, { fdcId: 1234, description: 'Alimento de prueba', dataType: 'Foundation', nutrients });
  }
  const calculated = await (await f.reopen()).getRecipeNutrition(recipe.id, 2);
  assert.equal(calculated.nutrition.perPerson.kcal, 100 * recipe.ingredients.length);
  assert.equal(calculated.nutrition.total.kcal, 200 * recipe.ingredients.length);
  assert.equal(calculated.nutrition.total.fiber, 6 * recipe.ingredients.length);
  assert.equal(calculated.nutrition.complete, true);
  assert.equal(calculated.nutrition.checks.maxSodiumMg, 'exceeds');
  const screened = await f.store.screenGeneratedNutrition(suggestion, (await f.store.getState()).profile);
  assert.equal(screened.type, 'review');
  assert.equal(screened.recipes.length, 0);
  await f.store.reset(1);
  assert.equal((await f.store.getRecipeNutrition(recipe.id, 2)).nutrition.perPerson.kcal, null);
});

test('pending nutrition saves no recipe, and confirmed USDA references survive reopening before generation', async t => {
  const f = await fixture(t);
  const suggestion = result();
  suggestion.servings = 3;
  suggestion.recipes[0].grams = [50, 100];
  const profile = (await f.store.getState()).profile;
  const pending = await requireRecipeNutrition(suggestion, f.store, '', undefined, profile, 'Arroz para tres', 'initial');
  assert.equal(pending.type, 'nutrition_setup');
  await f.store.saveGenerated(pending, 0);
  assert.equal((await f.store.getState()).generated.length, 0);
  for (const id of suggestion.recipes[0].ingredients) {
    await f.store.setIngredientUsda(id, {fdcId:1234, description:'Synthetic test food', dataType:'Foundation',
      nutrients:{kcal:100, protein:5, carbs:10, fat:2, saturatedFat:0, sodium:20, sugars:1, fiber:4}});
  }
  const reopened = await f.reopen();
  const complete = await requireRecipeNutrition(suggestion, reopened, '', undefined, profile, 'Arroz para tres', 'initial');
  assert.equal(complete.type, 'success');
  await reopened.saveGenerated(complete, 0);
  const stored = await reopened.getRecipeNutrition(suggestion.recipes[0].id, 3);
  assert.equal(stored.nutrition.complete, true);
  assert.equal(stored.nutrition.total.kcal, 450);
  const events = (await f.sql.query('SELECT outcome, recipe_count FROM generation_events ORDER BY id')).rows;
  assert.deepEqual(events, [{outcome:'nutrition_setup',recipe_count:0},{outcome:'success',recipe_count:1}]);
});

test("custom pantry persists, deduplicates, filters recipes and resets atomically", async (t) => {
  const f = await fixture(t);
  const item = { name: "Cebolla", category: "Vegetales", animal: false, meat: false, allergens: [] };
  await assert.rejects(f.store.addPantry({ revision: 0, items: [item] }), { code: "REVIEW_REQUIRED" });
  let state = await f.store.addPantry({ revision: 0, confirmed: true, items: [item, { ...item, name: "Yogur", category: "Lácteos", animal: true, allergens: ["Leche"] }] });
  const onion = state.ingredients.find(i => i.name === "Cebolla");
  assert(onion.id.startsWith("food-")); assert(state.pantry.includes(onion.id));
  assert.equal(state.ingredients.length, 16);
  state = await f.store.addPantry({ revision: state.revision, confirmed: true, items: [{ ...item, name: "CEBOLLAS" }] });
  assert.equal(state.ingredients.length, 16);
  await assert.rejects(f.store.addPantry({ revision: 0, confirmed: true, items: [item] }), { code: "STATE_CONFLICT" });
  const other = await f.reopen();
  assert.deepEqual((await other.getState()).ingredients, state.ingredients);
  await f.store.saveState({ ...writable(state), profile: { ...state.profile, allergies: ["Leche"] } });
  state = await f.store.getState();
  const input = parseInput({ pantry: state.pantry, maxTime: 30, message: "Dame una receta", profile: { ...state.profile, needsReview: false } }, state.ingredients);
  assert(!allowedIngredients(input).includes(state.ingredients.find(i => i.name === "Yogur").id));
  const recipe = validateOutput({ intent: "recipe", recipes: [{ title: "Cebolla cocida", subtitle: "Prueba", time: 15, category: "Cena", ingredients: [onion.id], amounts: ["1 cebolla"], steps: ["Cocina la cebolla en agua potable."] }] }, input, "test");
  await f.store.saveGenerated(recipe, state.revision);
  assert.equal((await f.store.getState()).generated[0].ingredients[0], onion.id);
  const reset = await f.store.reset(state.revision);
  assert.equal(reset.ingredients.length, 14); assert.equal(reset.generated.length, 0);
});
test("PostgreSQL enforces foreign keys and check constraints even outside the API", async (t) => {
  const f = await fixture(t);
  for (const [query, values, code] of [
    ["UPDATE profiles SET weight_kg=-2 WHERE id=1", [], "23514"],
    [
      "INSERT INTO favorites(profile_id,recipe_id) VALUES(1,$1)",
      ["missing"],
      "23503",
    ],
    ["INSERT INTO recipe_steps VALUES('bowl',0,'Duplicado')", [], "23505"],
    [
      "INSERT INTO profile_allergies VALUES(1,'alergia inventada')",
      [],
      "23503",
    ],
  ])
    await assert.rejects(f.sql.query(query, values), { code });
  const s = await f.store.getState();
  await assert.rejects(
    f.store.saveState({
      ...writable(s),
      profile: { ...s.profile, name: "No guardar" },
      saved: ["missing"],
    }),
  );
  assert.equal((await f.store.getState()).profile.name, s.profile.name);
  const literal = "'); DROP TABLE recipes; --";
  await f.store.saveState({
    ...writable(s),
    profile: { ...s.profile, name: literal },
  });
  assert.equal((await f.store.getState()).profile.name, literal);
});
test("PostgreSQL concurrent writes lock the revision and prevent lost updates", async (t) => {
  const f = await fixture(t),
    second = await f.reopen(),
    s = await f.store.getState();
  const attempts = await Promise.allSettled([
    f.store.saveState({ ...writable(s), pantry: ["arroz"] }),
    second.saveState({ ...writable(s), pantry: ["tomate"] }),
  ]);
  assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    attempts.find((x) => x.status === "rejected").reason.code,
    "STATE_CONFLICT",
  );
  assert.equal((await f.store.getState()).revision, 1);
});
test("PostgreSQL stores generated recipes as ingredients and steps, with audit events and no fake nutrition", async (t) => {
  const f = await fixture(t),
    r = result();
  await f.store.saveGenerated(r, 0);
  let s = await f.store.getState();
  await f.store.saveState({
    ...writable(s),
    saved: [r.recipes[0].id],
    feedback: { [r.recipes[0].id]: true },
  });
  s = await (await f.reopen()).getState();
  assert.equal(s.generated[0].id, r.recipes[0].id);
  assert.deepEqual(s.generated[0].steps, r.recipes[0].steps);
  assert.equal(s.generated[0].nutrition, null);
  assert.equal(
    (await f.sql.query("SELECT count(*)::integer AS n FROM generation_events"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await f.sql.query(
        "SELECT ingredient_count::integer AS n FROM recipe_summary WHERE id=$1",
        [r.recipes[0].id],
      )
    ).rows[0].n,
    2,
  );
  assert.deepEqual(s.saved, [r.recipes[0].id]);
});
test("SQLite import is atomic, repeatable, and refuses to overwrite an edited target", async (t) => {
  const f = await fixture(t),
    legacy = await f.store.getState();
  legacy.generated = result().recipes;
  legacy.saved = [legacy.generated[0].id];
  legacy.profile.name = "Origen";
  const invalid = {
    ...legacy,
    generated: [
      ...legacy.generated,
      { ...legacy.generated[0], id: "bad", time: 999 },
    ],
  };
  await assert.rejects(f.store.importSqlite(invalid));
  assert.equal((await f.store.getState()).generated.length, 0);
  assert.deepEqual(await f.store.importSqlite(legacy), { importedRecipes: 1 });
  assert.deepEqual(await f.store.importSqlite(legacy), {
    alreadyImported: true,
  });
  const s = await f.store.getState();
  assert.equal(s.profile.name, "Origen");
  assert.deepEqual(s.saved, legacy.saved);
  const other = await fixture(t),
    o = await other.store.getState();
  await other.store.saveState(writable(o));
  await assert.rejects(other.store.importSqlite(legacy), {
    code: "IMPORT_NOT_EMPTY",
  });
});
test("reset clears personal recipes but keeps catalogue; stale AI cannot resurrect deleted data", async (t) => {
  const f = await fixture(t),
    r = result();
  await f.store.saveGenerated(r, 0);

  const state = await f.store.reset(0);
  assert.equal(state.generated.length, 0);
  assert.equal(state.recipes.length, 6);
  await assert.rejects(f.store.saveGenerated(r, 0), { code: "STATE_CONFLICT" });
  assert.equal((await f.store.summary()).generations, 0);
});
test("HTTP uses PostgreSQL restrictions, persists asynchronous results, and rejects foreign origins", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const server = createAppServer({ requireCompleteNutrition: false, authentication: false,
    store: f.store,
    generate: async () => {
      calls++;
      return result();
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (route, method, body, headers = {}) =>
    fetch(base + route, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal(
    (await (await send("/api/health", "GET")).json()).database,
    "postgresql",
  );
  assert.equal(
    (await send("/api/plan", "POST", {}, { Origin: "https://evil.example" }))
      .status,
    403,
  );
  let state = await f.store.getState();
  await f.store.saveState({
    ...writable(state),
    profile: { ...state.profile, exclusions: "Indicación ficticia" },
  });
  const prompt = {
    revision: 1,
    maxTime: 30,
    message: "Quiero cocinar",
    profile: { needsReview: false },
  };
  assert.equal(
    (await (await send("/api/recipes/suggest", "POST", prompt)).json()).type,
    "review",
  );
  assert.equal(calls, 0);
  state = await f.store.getState();
  await f.store.saveState({
    ...writable(state),
    profile: { ...state.profile, exclusions: "" },
  });
  const response = await send("/api/recipes/suggest", "POST", {
    ...prompt,
    revision: 2,
  });
  assert.equal(response.status, 200);
  assert.equal((await f.store.getState()).generated.length, 1);
  const usage = await (await send("/api/plan", "GET")).json();
  assert.equal(usage.recipes.used, 1);
  assert.equal(usage.recipes.remaining, 3);
  assert.equal((await f.store.summary()).generated, 1);
});

test('plan quotas serialize concurrent reservations across connections and survive reset', async t => {
  const f = await fixture(t), other = await f.reopen();
  const attempts = await Promise.allSettled(Array.from({length: 8}, (_, n) => (n % 2 ? other : f.store).reserveUsage('recipes')));
  const tokens = attempts.filter(r => r.status === 'fulfilled').map(r => r.value);
  assert.equal(tokens.length, 4);
  assert(attempts.filter(r => r.status === 'rejected').every(r => r.reason.code === 'PLAN_LIMIT'));
  assert.equal((await f.store.getUsage()).recipes.pending, 4);
  await other.finishUsage(tokens[0], false);
  const replacement = await f.store.reserveUsage('recipes');
  for (const token of [...tokens.slice(1), replacement]) await f.store.finishUsage(token, true);
  // Cleanup after a successful HTTP request must not erase the charged usage.
  await other.finishUsage(replacement, false);
  await f.store.reset((await f.store.getState()).revision);
  const after = await (await f.reopen()).getUsage();
  assert.equal(after.recipes.used, 4);
  assert.equal(after.recipes.pending, 0);
  await assert.rejects(other.reserveUsage('recipes'), {code: 'PLAN_LIMIT'});
  await f.sql.query("UPDATE profiles SET plan_code='nutripro' WHERE id=1");
  assert.equal((await other.getUsage()).recipes.remaining, 31);
  await f.sql.query("UPDATE profiles SET plan_code='nutripro_plus' WHERE id=1");
  const max = await other.getUsage();
  assert.equal(max.plan.name, 'NutriMax');
  assert.equal(max.recipes.remaining, 96);
  assert.equal(max.vision.limit, 60);
  await f.sql.query("UPDATE profiles SET plan_code='basico' WHERE id=1");
  await assert.rejects(other.reserveUsage('recipes'), {code: 'PLAN_LIMIT'});
  // Only the disposable test schema is altered to simulate previous periods.
  await f.sql.query("UPDATE plan_usage SET period_start=period_start-7 WHERE feature='recipes'");
  assert.equal((await other.getUsage()).recipes.remaining, 4);
});

test('photo quota is monthly, isolated by account, and releases expired reservations', async t => {
  const f = await fixture(t);
  const id = Number((await f.sql.query("INSERT INTO profiles(name,goal,diet) VALUES('Otra cuenta','Comer más variado','Sin preferencia') RETURNING id")).rows[0].id);
  const other = f.store.forProfile(id);
  const token = await f.store.reserveUsage('vision');
  await assert.rejects(f.store.reserveUsage('vision'), {code: 'PLAN_LIMIT'});
  const otherToken = await other.reserveUsage('vision');
  await assert.rejects(other.finishUsage(token, true), {code: 'USAGE_EXPIRED'});
  await other.finishUsage(otherToken, true);
  await f.sql.query("UPDATE plan_usage SET created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' WHERE id=$1", [token]);
  const replacement = await f.store.reserveUsage('vision');
  await f.store.finishUsage(replacement, true);
  assert.equal((await f.store.getUsage()).vision.used, 1);
  await assert.rejects(f.store.reserveUsage('vision'), {code:'PLAN_LIMIT'});
  await f.sql.query("UPDATE plan_usage SET period_start=(period_start-interval '1 month')::date WHERE profile_id=1 AND feature='vision'");
  assert.equal((await f.store.getUsage()).vision.remaining, 1);
  assert.equal((await other.getUsage()).vision.remaining, 0);
});

test('recipe storage and usage commit atomically; clarification and failed storage are free', async t => {
  const f = await fixture(t);
  let token = await f.store.reserveUsage('recipes');
  await f.store.saveGenerated({type:'conversation',text:'¿Para cuántas personas?',recipes:[]}, 0, token);
  assert.equal((await f.store.getUsage()).recipes.remaining, 4);
  token = await f.store.reserveUsage('recipes');
  await f.sql.query("UPDATE plan_usage SET created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' WHERE id=$1", [token]);
  await assert.rejects(f.store.saveGenerated(result(), 0, token), {code:'USAGE_EXPIRED'});
  assert.equal((await f.store.getState()).generated.length, 0);
  assert.equal((await f.sql.query("SELECT count(*)::int n FROM generation_events WHERE outcome='success'")).rows[0].n, 0);
  token = await f.store.reserveUsage('recipes');
  const generated = result();
  generated.recipes.push(result().recipes[0]);
  await f.store.saveGenerated(generated, 0, token);
  assert.equal((await f.store.getState()).generated.length, 2);
  assert.equal((await f.store.getUsage()).recipes.used, 1);
});

async function quotaHttp(t, options = {}) {
  const f = await fixture(t);
  const server = createAppServer({authentication:false,requireCompleteNutrition:false,store:f.store,...options});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const post = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    return {status:response.status,body:await response.json()};
  };
  return {...f,post};
}

test('HTTP photo analysis rejects text, charges only nonempty success, and keeps manual entry available', async t => {
  let calls = 0;
  const item = {name:'Cebolla',category:'Vegetales',animal:false,meat:false,allergens:[]};
  const f = await quotaHttp(t, {analyze:async () => { calls++; return {items:calls === 1 ? [] : [item]}; }});
  const photo = {image:{mimeType:'image/png',data:Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')}};
  assert.equal((await f.post('/api/pantry/analyze',{text:'Tengo cebolla'})).body.error,'MANUAL_ONLY');
  assert.equal(calls,0);
  assert.equal((await f.post('/api/pantry/analyze',photo)).status,200);
  assert.equal((await f.store.getUsage()).vision.remaining,1);
  assert.equal((await f.post('/api/pantry/analyze',photo)).status,200);
  assert.equal((await f.post('/api/pantry/analyze',photo)).body.error,'PLAN_LIMIT');
  assert.equal(calls,2);
  assert.equal((await f.post('/api/pantry/add',{revision:0,confirmed:true,items:[item]})).status,200);
  assert.equal((await f.store.getUsage()).vision.used,1);
});

test('HTTP generation failures and clarifications release quota; exhausted accounts never call AI', async t => {
  let calls = 0;
  const f = await quotaHttp(t, {generate:async () => {
    calls++;
    if (calls === 1) throw new Error('Synthetic provider failure');
    if (calls === 2) return {type:'conversation',text:'¿Para cuántas personas?',recipes:[]};
    return result();
  }});
  const prompt = {revision:0,message:'Quiero arroz con tomate para dos personas',maxTime:30};
  assert.equal((await f.post('/api/recipes/suggest',prompt)).status,503);
  assert.equal((await f.store.getUsage()).recipes.pending,0);
  assert.equal((await f.post('/api/recipes/suggest',prompt)).body.type,'conversation');
  assert.equal((await f.store.getUsage()).recipes.used,0);
  assert.equal((await f.post('/api/recipes/suggest',prompt)).body.type,'success');
  for(let i=0;i<3;i++) await f.store.finishUsage(await f.store.reserveUsage('recipes'),true);
  assert.equal((await f.post('/api/recipes/suggest',prompt)).body.error,'PLAN_LIMIT');
  assert.equal(calls,3);
});
test("HTTP reports unavailable PostgreSQL without leaking database error details", async (t) => {
  const server = createAppServer({ requireCompleteNutrition: false, authentication: false,
    store: {
      provider: "postgresql",
      health: async () => {
        throw new Error("SECRET_CONNECTION_DETAILS");
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/health`,
    );
    assert.equal(r.status, 503);
    assert(!(await r.text()).includes("SECRET_CONNECTION_DETAILS"));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('consumed meals snapshot one serving, deduplicate retries, isolate accounts and preserve nutrition when rated',async t=>{
  const f=await fixture(t),id=randomUUID();
  const state=await f.store.getState(),bowl=state.recipes.find(r=>r.id==='bowl');
  const nutrients={kcal:100,carbs:12,fiber:2,protein:4,fat:3,saturatedFat:1,sugars:2,sodium:50};
  for(const ingredientId of bowl.ingredients){
    await f.store.setRecipeGrams('bowl',ingredientId,100);
    await f.store.setIngredientUsda(ingredientId,{fdcId:12345,description:'Synthetic test food',dataType:'Foundation',nutrients});
  }
  const bodies={recipeId:'bowl',servings:12,nutrition:{kcal:999999},eatenAt:'2000-01-01',rating:5};
  await Promise.all([f.store.recordMeal(id,bodies),f.store.recordMeal(id,bodies)]);
  let today=await f.store.getTodayMeals();
  assert.equal(today.week.length,7);
  assert.equal(today.week.find(d=>d.date===today.date).totals.kcal,today.totals.kcal);
  assert.equal(today.meals.length,1);assert.equal(today.meals[0].rating,null);
  assert.equal(today.totals.kcal,bowl.ingredients.length*100);assert.equal(today.meals[0].servings,1);
  assert.equal(today.date,(await f.sql.query("SELECT to_char(now() AT TIME ZONE 'America/El_Salvador','YYYY-MM-DD') AS date")).rows[0].date);
  // A later USDA correction does not rewrite the historical meal snapshot.
  await f.store.setIngredientUsda(bowl.ingredients[0],{fdcId:12345,description:'Updated test food',dataType:'Foundation',nutrients:{...nutrients,kcal:800}});
  await f.store.rateMeal(id,4);assert.equal((await f.store.getTodayMeals()).totals.kcal,today.totals.kcal);
  assert.equal((await (await f.reopen()).getTodayMeals()).meals[0].rating,4);
  assert.throws(()=>f.store.rateMeal(id,6),{code:'INVALID_RATING'});
  const otherId=await f.store.auth.register({name:'Another test user',email:'meals@example.test',password:'Una frase larga de prueba 2026',birthDate:'2000-01-01'},false);
  const other=f.store.forProfile(otherId);
  assert.equal((await other.getTodayMeals()).meals.length,0);
  assert.equal((await other.getTodayMeals()).week.reduce((n,d)=>n+d.count,0),0);
  await assert.rejects(other.rateMeal(id,5),{code:'NOT_FOUND'});
  await other.removeMeal(id);assert.equal((await f.store.getTodayMeals()).meals.length,1);
  const generated=result();await f.store.saveGenerated(generated,0);
  await assert.rejects(other.recordMeal(randomUUID(),{recipeId:generated.recipes[0].id}),{code:'NOT_FOUND'});
  // The same recipe eaten again is an explicit second meal, not a rating change.
  const second=randomUUID();await f.store.recordMeal(second,{recipeId:'bowl'});
  assert.equal((await f.store.getTodayMeals()).meals.length,2);
  await f.sql.query("UPDATE meal_log SET meal_date=meal_date-1 WHERE id=$1",[second]);
  assert.equal((await f.store.getTodayMeals()).meals.length,1);
  await f.store.removeMeal(id);assert.equal((await f.store.getTodayMeals()).totals.kcal,0);
  await f.store.recordMeal(randomUUID(),{recipeId:'bowl'});
  await f.store.reset((await f.store.getState()).revision);
  assert.equal(Number((await f.sql.query('SELECT count(*) AS n FROM meal_log WHERE profile_id=1')).rows[0].n),0);
});

test('meal log stores unknown nutrients honestly and ignores client totals',async t=>{
  const f=await fixture(t);
  await f.store.recordMeal(randomUUID(),{recipeId:'bowl',nutrition:{kcal:123}});
  const today=await f.store.getTodayMeals();
  assert.equal(today.complete,false);assert.equal(today.totals.kcal,null);assert.equal(today.missing.kcal,1);
});

test('Edamam meal events retain only URI and title, and stay isolated by account',async t=>{
  const f=await fixture(t),id=randomUUID();
  const uri='http://www.edamam.com/ontologies/edamam.owl#recipe_abc123';
  const body={uri,title:'Chicken rolls',mealType:'Cena',nutrition:{kcal:9999}};
  await f.store.recordEdamamMeal(id,body);
  await f.store.recordEdamamMeal(id,body);
  const today=await f.store.getTodayMeals();
  assert.equal(today.meals.length,1);
  assert.equal(today.meals[0].externalUri,uri);
  assert.equal(today.meals[0].nutrition,null);
  assert.equal(today.totals.kcal,null);
  const row=(await f.sql.query('SELECT * FROM edamam_meal_log WHERE id=$1',[id])).rows[0];
  assert.deepEqual(Object.keys(row).sort(),['eaten_at','id','meal_date','meal_type','nutrition_recorded_at','nutrition_snapshot','nutrition_source','profile_id','recipe_title','recipe_uri'].sort());
  assert.equal(row.nutrition_snapshot, null);
  const otherId=await f.store.auth.register({name:'Another user',email:'edamam-meal@example.test',password:'A long test password 2026',birthDate:'2000-01-01'},false);
  assert.equal((await f.store.forProfile(otherId).getTodayMeals()).meals.length,0);
  await f.store.forProfile(otherId).removeMeal(id);
  assert.equal((await f.store.getTodayMeals()).meals.length,1);
  await f.store.removeMeal(id);
  assert.equal((await f.store.getTodayMeals()).meals.length,0);
});

test('calorie goal and estimate profile persist per account, while meal types survive recipe edits',async t=>{
 const f=await fixture(t),state=await f.store.getState();
 assert.equal((await f.store.getTodayMeals()).goalKcal,null);
 await f.store.saveState({...writable(state),profile:{...state.profile,weight:'70',height:'175',birthDate:'1990-01-01',calorieSex:'male',calorieActivity:'light',calorieEstimateEligible:true}});
 const profile=(await (await f.reopen()).getState()).profile;
 assert.equal(profile.calorieSex,'male');assert.equal(profile.calorieActivity,'light');assert.equal(profile.calorieEstimateEligible,true);
 assert.ok((await f.store.getTodayMeals()).suggestedKcal>0);
 await f.store.setNutritionGoal(2200);
 assert.equal((await (await f.reopen()).getTodayMeals()).goalKcal,2200);
 for(const value of [0,-1,20001,1.2,'2000',NaN])assert.throws(()=>f.store.setNutritionGoal(value),{code:'INVALID_GOAL'});
 const otherId=await f.store.auth.register({name:'Other goal',email:'goal@example.test',password:'A long test password 2026',birthDate:'1990-01-01'},false);
 assert.equal((await f.store.forProfile(otherId).getTodayMeals()).goalKcal,null);
 assert.equal((await f.store.forProfile(otherId).getTodayMeals()).suggestedKcal,null);
 const id=randomUUID();await f.store.recordMeal(id,{recipeId:'bowl',mealType:'Cena'});
 await f.sql.query("UPDATE recipes SET category='Desayuno' WHERE id='bowl'");
 const day=await f.store.getTodayMeals();assert.equal(day.meals[0].mealType,'Cena');
 assert.equal(day.byMeal.find(g=>g.type==='Cena').count,1);
 assert.equal(day.week.find(d=>d.date===day.date).meals[0].mealType,'Cena');
 assert.throws(()=>f.store.recordMeal(randomUUID(),{recipeId:'bowl',mealType:'invalid'}),{code:'INVALID_MEAL_TYPE'});
 await f.store.setNutritionGoal(null);assert.equal((await f.store.getTodayMeals()).goalKcal,null);
});
