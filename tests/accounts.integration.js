import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { openDatabase } from "../server/database.js";
import { postgresOptions } from "../server/postgres-config.js";
import { createAppServer } from "../server/app.js";
import { validateOutput } from "../server/recipes.js";
import { assignPlan } from "../server/plans.js";
const database = process.env.PGTESTDATABASE;
if (!database?.endsWith("_test") || database === process.env.PGDATABASE)
  throw Error("Usa una base de pruebas independiente terminada en _test.");
const credentials = (email, name = "Persona de prueba") => ({
  email,
  name,
  password: "Una frase larga de prueba 2026",
  birthDate: "2000-01-01",
});
const writable = (s) => ({
  revision: s.revision,
  profile: s.profile,
  pantry: s.pantry,
  pantryDates: s.pantryDates,
  saved: s.saved,
  feedback: s.feedback,
});

test("plans default to Basic, audit administrative changes, isolate users and survive profile resets", async (t) => {
  const f = await fixture(t);
  const id = await f.store.auth.register({ ...credentials("plan@example.test"),
    plan: "nutripro_plus", plan_code: "nutripro_plus" }, false);
  const account = f.store.forProfile(id);
  assert.deepEqual((await account.getState()).profile.plan, { code: "basico", name: "Básico" });
  assert.deepEqual((await f.store.getState()).profile.plan, { code: "basico", name: "Básico" });
  const catalog = (await f.sql.query("SELECT name FROM plans ORDER BY code")).rows.map(row => row.name);
  assert.deepEqual(catalog, ["Básico", "NutriPro", "NutriPro+"]);
  const countHistory = async () => Number((await f.sql.query("SELECT count(*) AS n FROM profile_plan_history WHERE profile_id=$1", [id])).rows[0].n);
  assert.equal(await countHistory(), 1);
  const change = { email: "plan@example.test", plan: "nutripro", reason: "Asignación de prueba" };
  assert.equal((await assignPlan(f.sql, change)).applied, false);
  assert.equal((await account.getState()).profile.plan.code, "basico");
  assert.equal(await countHistory(), 1);
  assert.equal((await assignPlan(f.sql, { ...change, apply: true })).applied, true);
  assert.equal(await countHistory(), 2);
  assert.equal((await account.getState()).profile.plan.code, "nutripro");
  assert.equal((await assignPlan(f.sql, { ...change, apply: true })).applied, false);
  assert.equal(await countHistory(), 2);
  await assignPlan(f.sql, { ...change, plan: "nutripro_plus", apply: true });
  const current = await account.getState();
  await account.saveState({ ...writable(current), profile: { ...current.profile,
    plan: { code: "basico" }, plan_code: "basico" } });
  const reset = await account.reset(current.revision + 1);
  assert.deepEqual(reset.profile.plan, { code: "nutripro_plus", name: "NutriPro+" });
  assert.equal((await f.store.getState()).profile.plan.code, "basico");
  assert.equal((await (await f.reopen()).forProfile(id).getState()).profile.plan.code, "nutripro_plus");
  await assert.rejects(assignPlan(f.sql, { ...change, plan: "admin", apply: true }), { code: "INVALID_PLAN" });
  await assert.rejects(assignPlan(f.sql, { ...change, reason: "", apply: true }), { code: "INVALID_REASON" });
  await assert.rejects(assignPlan(f.sql, { ...change, email: "missing@example.test", apply: true }), { code: "ACCOUNT_NOT_FOUND" });
  await assert.rejects(f.sql.query("UPDATE profiles SET plan_code='invalid' WHERE id=$1", [id]), { code: "23503" });
  await assert.rejects(f.sql.query("INSERT INTO plans VALUES('admin','Admin')"), { code: "23514" });
  const history = (await f.sql.query("SELECT from_plan,to_plan,reason FROM profile_plan_history WHERE profile_id=$1 ORDER BY id", [id])).rows;
  assert.deepEqual(history.map(row => [row.from_plan,row.to_plan]), [[null,"basico"],["basico","nutripro"],["nutripro","nutripro_plus"]]);
  assert.equal(history[1].reason, change.reason);
});

test("email lookup routes existing accounts to login and new emails to registration without authenticating", async (t) => {
  const f = await fixture(t);
  await f.store.auth.register(credentials("existing@example.test"), false);
  const server = createAppServer({ store: f.store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const lookup = (body) =>
    fetch(base + "/api/auth/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nutribot-Request": "1",
      },
      body: JSON.stringify(body),
    });
  for (const [email, nextStep] of [
    [" EXISTING@Example.Test ", "login"],
    ["new@example.test", "register"],
  ]) {
    const response = await lookup({ email });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await response.json(), { nextStep });
  }
  assert.equal((await lookup({ email: "invalid" })).status, 400);
  assert.equal((await lookup({ email: 123 })).status, 400);
  assert.equal((await fetch(base + "/api/auth/lookup")).status, 405);
  assert.equal(
    (
      await fetch(base + "/api/auth/lookup", {
        method: "POST",
        body: JSON.stringify({ email: "existing@example.test" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/auth/lookup", {
        method: "POST",
        headers: { origin: "https://evil.test", "X-Nutribot-Request": "1" },
        body: JSON.stringify({ email: "existing@example.test" }),
      })
    ).status,
    403,
  );
  assert.equal((await fetch(base + "/api/state")).status, 401);
  assert.equal(
    (await f.sql.query("SELECT count(*)::int AS n FROM auth_sessions")).rows[0]
      .n,
    0,
  );
  let last;
  for (let n = 0; n < 13; n++)
    last = await lookup({ email: "new@example.test" });
  assert.equal(last.status, 429);
});
async function fixture(t) {
  const schema = "nutribot_test_" + randomBytes(8).toString("hex");
  const store = await openDatabase({ database, schema });
  const sql = new pg.Client(
    postgresOptions({ database, options: `-c search_path=${schema},public` }),
  );
  await sql.connect();
  const stores = [store];
  t.after(async () => {
    await Promise.all(stores.map((s) => s.close()));
    if (
      !/^nutribot_test_[a-f0-9]{16}$/.test(schema) ||
      database === process.env.PGDATABASE
    )
      throw Error("Limpieza inválida");
    await sql.query(`DROP SCHEMA ${schema} CASCADE`);
    await sql.end();
  });
  return {
    store,
    sql,
    async reopen() {
      const next = await openDatabase({ database, schema });
      stores.push(next);
      return next;
    },
  };
}
test("accounts isolate pantry, custom catalog, recipes, favorites and chat across concurrent requests and restarts", async (t) => {
  const f = await fixture(t),
    legacy = await f.store.getState();
  const aliceId = await f.store.auth.register(
    { ...credentials("alice@example.test"), claimLegacy: true },
    true,
  );
  const bobId = await f.store.auth.register(
    credentials("bob@example.test", "Bob"),
    false,
  );
  assert.equal(aliceId, 1);
  const alice = f.store.forProfile(aliceId),
    bob = f.store.forProfile(bobId);
  assert.deepEqual((await alice.getState()).pantry, legacy.pantry);
  assert.deepEqual((await bob.getState()).pantry, []);
  const [a, b] = await Promise.all([alice.getState(), bob.getState()]);
  await Promise.all([
    alice.saveState({
      ...writable(a),
      profile: { ...a.profile, name: "Alice", birthDate: "2001-02-03" },
      pantry: ["arroz", "tomate"],
    }),
    bob.saveState({
      ...writable(b),
      profile: { ...b.profile, name: "Bob" },
      pantry: ["huevo"],
    }),
  ]);
  const onion = {
    name: "Cebolla propia",
    category: "Vegetales",
    animal: false,
    meat: false,
    allergens: [],
  };
  const [aa, bb] = await Promise.all([alice.getState(), bob.getState()]);
  const [withOnion, withOther] = await Promise.all([
    alice.addPantry({ revision: aa.revision, confirmed: true, items: [onion] }),
    bob.addPantry({
      revision: bb.revision,
      confirmed: true,
      items: [{ ...onion, name: "Papa propia" }],
    }),
  ]);
  const privateId = withOnion.ingredients.find(
    (item) => item.name === onion.name,
  ).id;
  assert(!withOther.ingredients.some((item) => item.id === privateId));
  await assert.rejects(
    bob.saveState({ ...writable(withOther), pantry: [privateId] }),
    { code: "INVALID_STATE" },
  );
  const result = validateOutput(
    {
      intent: "recipe",
      recipes: [
        {
          title: "Arroz con tomate",
          subtitle: "Prueba",
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
    "test",
  );
  await alice.saveGenerated(result, withOnion.revision);
  assert.equal((await bob.getState()).generated.length, 0);
  await assert.rejects(
    bob.saveState({ ...writable(withOther), saved: [result.recipes[0].id] }),
    { code: "INVALID_STATE" },
  );
  const aliceChatId = randomUUID();
  await alice.saveChat({
    id: aliceChatId,
    revision: 0,
    messages: [
      {
        id: "chat-a",
        role: "bot",
        text: "Receta",
        recipeIds: [result.recipes[0].id],
      },
    ],
    draft: "Mañana",
    maxTime: 30,
    busy: false,
  });
  await assert.rejects(
    bob.saveChat({
      id: randomUUID(),
      revision: 0,
      messages: [
        {
          id: "chat-b",
          role: "bot",
          text: "Ajena",
          recipeIds: [result.recipes[0].id],
        },
      ],
      draft: "",
      maxTime: 30,
      busy: false,
    }),
    { code: "INVALID_CHAT" },
  );
  const reopened = await f.reopen();
  assert.equal(
    (await reopened.forProfile(aliceId).getState()).profile.birthDate,
    "2001-02-03",
  );
  assert.equal(
    (await reopened.forProfile(aliceId).getChat(aliceChatId)).draft,
    "Mañana",
  );
  assert.equal((await reopened.forProfile(bobId).listChats()).items.length, 0);
  await bob.reset(withOther.revision);
  assert(
    (await alice.getState()).ingredients.some((item) => item.id === privateId),
  );
  assert.equal((await alice.getState()).generated.length, 1);
  const raw = (
    await f.sql.query("SELECT email,password_hash FROM profiles ORDER BY id")
  ).rows;
  assert(
    raw.every((row) => row.password_hash.startsWith("scrypt$131072$8$1$")),
  );
  assert(!JSON.stringify(await alice.getState()).includes("password_hash"));
});
test("authenticated HTTP blocks anonymous reads, enforces CSRF, persists sessions, and revokes logout", async (t) => {
  const f = await fixture(t);
  const server = createAppServer({
    store: f.store,
    network: { urls: ["http://192.168.1.10:8787"], qrCodes: [] },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    "Content-Type": "application/json",
    "X-Nutribot-Request": "1",
    Origin: base,
  };
  assert.equal((await fetch(base + "/api/state")).status, 401);
  assert.equal((await fetch(base + "/api/chats")).status, 401);
  assert.equal(
    (
      await fetch(base + "/api/pantry/add", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { ...headers, Origin: "https://evil.test" },
        body: JSON.stringify(credentials("http@example.test")),
      })
    ).status,
    403,
  );
  const register = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...credentials("http@example.test"),
      remember: true,
    }),
  });
  assert.equal(register.status, 200);
  const cookie = register.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=2592000/);
  const account = await register.json();
  const authenticated = {
    ...headers,
    Cookie: cookie.split(";")[0],
    "X-Nutribot-CSRF": account.csrfToken,
  };
  const state = await (
    await fetch(base + "/api/state", { headers: authenticated })
  ).json();
  assert.equal(
    (
      await fetch(base + "/api/state", {
        headers: {
          ...authenticated,
          "X-Nutribot-Account": String(account.profileId + 1),
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/api/state", {
        method: "PUT",
        headers: {
          ...authenticated,
          "X-Nutribot-Account": String(account.profileId + 1),
        },
        body: JSON.stringify(writable(state)),
      })
    ).status,
    401,
  );
  assert.equal(state.profile.email, "http@example.test");
  assert(!JSON.stringify(state).includes("scrypt$"));
  const missingCsrf = { ...authenticated };
  delete missingCsrf["X-Nutribot-CSRF"];
  assert.equal(
    (
      await fetch(base + "/api/state", {
        method: "PUT",
        headers: missingCsrf,
        body: JSON.stringify(writable(state)),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/api/state", {
        method: "PUT",
        headers: authenticated,
        body: JSON.stringify({
          ...writable(state),
          profile: {
            ...state.profile,
            birthDate: "1990-05-16",
            password_hash: "malicious",
            email: "other@example.test",
            plan: { code: "nutripro_plus", name: "NutriPro+" },
            plan_code: "nutripro_plus",
          },
        }),
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.store.forProfile(account.profileId).getState()).profile.email,
    "http@example.test",
  );
  assert.deepEqual((await f.store.forProfile(account.profileId).getState()).profile.plan,
    { code: "basico", name: "Básico" });
  const token = cookie.split(";")[0].split("=")[1],
    hash = createHash("sha256").update(token).digest("hex");
  assert(
    (await (await f.reopen()).auth.findSession(hash)).profileId ===
      account.profileId,
  );
  const logout = await fetch(base + "/api/auth/logout", {
    method: "POST",
    headers: authenticated,
    body: "{}",
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (await fetch(base + "/api/state", { headers: authenticated })).status,
    401,
  );
  const wrong = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "http@example.test", password: "incorrect" }),
  });
  assert.equal(wrong.status, 401);
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify(credentials("HTTP@example.test")),
  });
  assert.equal(login.status, 200);
  const newToken = login.headers.get("set-cookie").split(";")[0].split("=")[1];
  await f.sql.query(
    "UPDATE auth_sessions SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day'",
  );
  assert.equal(
    (
      await fetch(base + "/api/state", {
        headers: { Cookie: `nutribot_session=${newToken}` },
      })
    ).status,
    401,
  );
});
test("legacy profile can only be claimed once from the local PC and retains its existing data", async (t) => {
  const f = await fixture(t);
  const before = await f.store.getState();
  await assert.rejects(
    f.store.auth.register(
      { ...credentials("remote@example.test"), claimLegacy: true },
      false,
    ),
    { code: "LOCAL_SETUP_ONLY" },
  );
  assert.equal(await f.store.auth.hasLegacyProfile(), true);
  await f.store.auth.register(
    { ...credentials("owner@example.test"), claimLegacy: true },
    true,
  );
  await assert.rejects(
    f.store.auth.register(
      { ...credentials("intruder@example.test"), claimLegacy: true },
      true,
    ),
    { code: "LEGACY_ALREADY_CLAIMED" },
  );
  const after = await f.store.getState();
  assert.equal(after.profile.name, before.profile.name);
  assert.deepEqual(after.pantry, before.pantry);
  assert.deepEqual(after.saved, before.saved);
  assert.equal(after.profile.email, "owner@example.test");
});

test("separate conversations survive new sessions and restarts, reject cross-account access, and paginate", async (t) => {
  const f = await fixture(t);
  const aliceId = await f.store.auth.register(
      credentials("history-a@example.test"),
      false,
    ),
    bobId = await f.store.auth.register(
      credentials("history-b@example.test"),
      false,
    );
  const alice = f.store.forProfile(aliceId),
    bob = f.store.forProfile(bobId),
    first = randomUUID(),
    second = randomUUID();
  const chat = (id, text) => ({
    id,
    revision: 0,
    messages: [{ id: randomUUID(), role: "user", text }],
    draft: "",
    maxTime: 30,
    busy: false,
  });
  const saved = await alice.saveChat(chat(first, "Desayuno de ayer"));
  await alice.saveChat(chat(second, "Cena de hoy"));
  assert.equal((await alice.listChats()).items.length, 2);
  assert.equal(
    (await alice.getChat(first)).messages[0].text,
    "Desayuno de ayer",
  );
  await assert.rejects(bob.getChat(first), { code: "CHAT_NOT_FOUND" });
  await assert.rejects(bob.saveChat(chat(first, "No debe sobrescribir")), {
    code: "CHAT_NOT_FOUND",
  });
  assert.equal((await bob.listChats()).items.length, 0);
  await assert.rejects(
    alice.saveChat({ ...chat(first, "Versión atrasada"), revision: 0 }),
    { code: "CHAT_CONFLICT" },
  );
  await alice.saveChat({
    ...chat(first, "Desayuno actualizado"),
    revision: saved.revision,
  });
  for (let n = 0; n < 50; n++)
    await alice.saveChat(chat(randomUUID(), "Historial " + n));
  const page = await alice.listChats(),
    next = await alice.listChats(page.nextOffset);
  assert.equal(page.items.length, 50);
  assert.equal(next.items.length, 2);
  assert.equal(
    new Set([...page.items, ...next.items].map((item) => item.id)).size,
    52,
  );
  const reopened = await f.reopen();
  assert.equal(
    (await reopened.forProfile(aliceId).getChat(second)).messages[0].text,
    "Cena de hoy",
  );
  const state = await alice.getState();
  await alice.reset(state.revision);
  assert.equal((await alice.listChats()).items.length, 0);
  await assert.rejects(
    alice.saveChat({ ...chat(first, "Respuesta tardía"), revision: 2 }),
    { code: "CHAT_NOT_FOUND" },
  );
});

test("pantry dates persist through reordering and imports; bulk removal is atomic and scoped", async (t) => {
  const f = await fixture(t),
    alice = f.store.forProfile(
      await f.store.auth.register(credentials("dates-a@example.test"), false),
    ),
    bob = f.store.forProfile(
      await f.store.auth.register(credentials("dates-b@example.test"), false),
    );
  const start = await alice.getState(),
    date = {
      startDate: "2026-09-29",
      rule: "eggs",
      customDays: null,
      labelDate: "",
    };
  await alice.saveState({
    ...writable(start),
    pantry: ["huevo", "arroz", "tomate"],
    pantryDates: {
      huevo: date,
      tomate: {
        startDate: "",
        rule: "",
        customDays: null,
        labelDate: "2026-10-03",
      },
    },
  });
  let state = await alice.getState();
  assert.deepEqual(state.pantryDates.huevo, date);
  await alice.saveState({
    ...writable(state),
    pantry: ["tomate", "arroz", "huevo"],
  });
  state = await alice.addPantry({
    revision: state.revision + 1,
    confirmed: true,
    items: [
      {
        name: "Cebolla propia",
        category: "Vegetales",
        animal: false,
        meat: false,
        allergens: [],
      },
    ],
  });
  assert.deepEqual(state.pantryDates.huevo, date);
  assert.deepEqual((await bob.getState()).pantryDates, {});
  const bobState = await bob.getState();
  await assert.rejects(
    bob.saveState({ ...writable(bobState), pantryDates: { huevo: date } }),
    { code: "INVALID_PANTRY_DATES" },
  );
  await assert.rejects(
    alice.saveState({
      ...writable(state),
      pantry: ["arroz"],
      pantryDates: { huevo: date },
    }),
    { code: "INVALID_PANTRY_DATES" },
  );
  assert.equal((await alice.getState()).pantry.length, 4);
  await alice.saveState({
    ...writable(state),
    pantry: ["arroz"],
    pantryDates: {},
  });
  const reopened = await f.reopen(),
    after = await reopened.forProfile(start.profile.id).getState();
  assert.deepEqual(after.pantry, ["arroz"]);
  assert.deepEqual(after.pantryDates, {});
  assert.equal(
    (await f.sql.query("SELECT count(*)::int AS n FROM pantry_dates")).rows[0]
      .n,
    0,
  );
});

test("version 2 upgrade preserves previous account conversations and pantry rows", async (t) => {
  const schema = "nutribot_test_" + randomBytes(8).toString("hex");
  const sql = new pg.Client(
    postgresOptions({ database, options: `-c search_path=${schema},public` }),
  );
  await sql.connect();
  let store;
  t.after(async () => {
    await store?.close();
    if (
      !/^nutribot_test_[a-f0-9]{16}$/.test(schema) ||
      database === process.env.PGDATABASE
    )
      throw Error("Invalid test cleanup");
    await sql.query(`DROP SCHEMA ${schema} CASCADE`);
    await sql.end();
  });
  await sql.query(`CREATE SCHEMA ${schema}`);
  await sql.query(
    readFileSync(
      new URL("../server/postgres/001_schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await sql.query(
    "CREATE TABLE schema_migrations(version integer PRIMARY KEY,applied_at timestamptz DEFAULT now()); INSERT INTO schema_migrations(version) VALUES(1),(2); INSERT INTO diets VALUES('Sin preferencia'); INSERT INTO goals VALUES('Comer más variado'); INSERT INTO profiles(id,name,goal,diet) VALUES(1,'Anterior','Comer más variado','Sin preferencia'),(2,'Otra cuenta','Comer más variado','Sin preferencia'); INSERT INTO ingredient_categories VALUES('Vegetales'); INSERT INTO units VALUES('unidad'); INSERT INTO ingredients VALUES('tomate','Tomate','Vegetales','unidad','🍅',false,false,0); INSERT INTO pantry_items VALUES(1,'tomate',0)",
  );
  await sql.query(
    readFileSync(
      new URL("../server/postgres/002_accounts.sql", import.meta.url),
      "utf8",
    ),
  );
  const messages = [
    {
      id: "legacy",
      role: "user",
      text: "Conversación anterior a la actualización",
      recipeIds: [],
    },
  ];
  await sql.query(
    "UPDATE conversations SET messages=$1,revision=7 WHERE profile_id=1",
    [JSON.stringify(messages)],
  );
  store = await openDatabase({ database, schema });
  const history = await store.forProfile(1).listChats();
  assert.equal(history.items.length, 1);
  const restored = await store.forProfile(1).getChat(history.items[0].id);
  assert.deepEqual(restored.messages, messages);
  assert.equal(restored.revision, 7);
  assert.deepEqual((await store.forProfile(1).getState()).pantry, ["tomate"]);
  assert.deepEqual((await store.forProfile(1).getState()).pantryDates, {});
  assert.equal((await store.forProfile(2).listChats()).items.length, 0);
  assert.deepEqual((await store.forProfile(1).getState()).profile.plan, { code: "basico", name: "Básico" });
  assert.equal((await sql.query("SELECT count(*)::int AS n FROM profile_plan_history")).rows[0].n, 2);
});
