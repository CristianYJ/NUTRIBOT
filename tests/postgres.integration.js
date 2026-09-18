import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { openDatabase } from "../server/database.js";
import { postgresOptions } from "../server/postgres-config.js";
import { createAppServer } from "../server/app.js";
import { validateOutput } from "../server/recipes.js";

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
async function fixture(t) {
  const schema = "nutribot_test_" + randomBytes(8).toString("hex");
  const options = { database, schema };
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
    1,
  );
  assert.equal(
    (await f.sql.query("SELECT count(*)::integer AS n FROM recipes")).rows[0].n,
    6,
  );
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
test("weekly planner validates dates, portions, unique slots and current dietary restrictions", async (t) => {
  const f = await fixture(t);
  const plan = {
    revision: 0,
    date: "2026-10-05",
    meal: "Almuerzo",
    recipeId: "bowl",
    servings: 2,
  };
  const added = await f.store.addPlan(plan);
  assert(added.id);
  await assert.rejects(f.store.addPlan(plan), { code: "PLAN_EXISTS" });
  for (const patch of [
    { date: "2026-02-30" },
    { servings: 0 },
    { servings: 5 },
    { meal: "inventada" },
    { recipeId: "missing" },
  ])
    await assert.rejects(f.store.addPlan({ ...plan, ...patch }));
  const state = await f.store.getState();
  await f.store.saveState({
    ...writable(state),
    profile: { ...state.profile, medicalNotes: "Prueba de pausa" },
  });
  assert.equal((await f.store.getPlan())[0].compatible, false);
  await assert.rejects(
    f.store.addPlan({ ...plan, revision: 1, date: "2026-10-06" }),
    { code: "PLAN_RESTRICTED" },
  );
  await f.store.removePlan(added.id);
  assert.equal((await f.store.getPlan()).length, 0);
});
test("reset clears plan and personal recipes but keeps catalogue; stale AI cannot resurrect deleted data", async (t) => {
  const f = await fixture(t),
    r = result();
  await f.store.saveGenerated(r, 0);
  await f.store.addPlan({
    revision: 0,
    date: "2026-10-05",
    meal: "Cena",
    recipeId: r.recipes[0].id,
    servings: 1,
  });
  const state = await f.store.reset(0);
  assert.equal(state.generated.length, 0);
  assert.equal(state.recipes.length, 6);
  assert.equal((await f.store.getPlan()).length, 0);
  await assert.rejects(f.store.saveGenerated(r, 0), { code: "STATE_CONFLICT" });
  assert.equal((await f.store.summary()).generations, 0);
});
test("HTTP uses PostgreSQL restrictions, persists asynchronous results, and rejects foreign origins", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const server = createAppServer({
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
  assert.equal(
    (
      await send("/api/plan", "POST", {
        revision: 2,
        date: "2026-10-05",
        meal: "Almuerzo",
        recipeId: "bowl",
        servings: 1,
      })
    ).status,
    201,
  );
  assert.equal(
    (await (await send("/api/summary", "GET")).json()).plannedMeals,
    1,
  );
});
test("HTTP reports unavailable PostgreSQL without leaking database error details", async (t) => {
  const server = createAppServer({
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
