import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../server/sqlite-legacy.js";
import { createAppServer } from "../server/app.js";
import { validateOutput } from "../server/recipes.js";

const writable = (s) => ({
  revision: s.revision,
  profile: s.profile,
  pantry: s.pantry,
  saved: s.saved,
  feedback: s.feedback,
});
function temporary(t) {
  const parent = path.resolve(os.tmpdir());
  const folder = mkdtempSync(path.join(parent, "nutribot-test-"));
  t.after(() => {
    const resolved = path.resolve(folder);
    if (
      path.dirname(resolved) !== parent ||
      !path.basename(resolved).startsWith("nutribot-test-")
    )
      throw new Error("Ruta temporal inválida");
    rmSync(resolved, { recursive: true, force: true });
  });
  return path.join(folder, "test.sqlite");
}
const generated = (input) =>
  validateOutput(
    {
      intent: "recipe",
      recipes: [
        {
          title: "Arroz con tomate",
          subtitle: "Receta de prueba",
          time: 25,
          category: "Almuerzo",
          ingredients: ["arroz", "tomate"],
          amounts: ["50 g de arroz", "1 tomate"],
          steps: [
            "Cocina el arroz en agua potable y agrega el tomate lavado y cortado.",
          ],
        },
      ],
    },
    input,
    "fake-provider-for-tests",
  );

test("database migrations seed once and keep profile, pantry, recipes and favorites after reopen", (t) => {
  const filename = temporary(t);
  let db = openDatabase(filename);
  try {
    const state = db.getState();
    assert.equal(state.ingredients.length, 14);
    assert.equal(state.recipes.length, 6);
    const edited = writable(state);
    edited.profile = {
      ...edited.profile,
      name: "Persona de prueba",
      allergies: ["Leche"],
    };
    edited.pantry = ["arroz", "tomate"];
    edited.saved = ["bowl"];
    edited.feedback = { bowl: true };
    const saved = db.saveState(edited);
    const result = generated({
      pantry: edited.pantry,
      maxTime: 30,
      profile: { diet: "Sin preferencia", allergies: [] },
    });
    db.saveGenerated(result, saved.revision);
    db.close();
    db = openDatabase(filename);
    const loaded = db.getState();
    assert.equal(loaded.profile.name, edited.profile.name);
    assert.deepEqual(loaded.profile.allergies, ["Leche"]);
    assert.deepEqual(loaded.pantry, edited.pantry);
    assert.deepEqual(loaded.saved, ["bowl"]);
    assert.equal(loaded.feedback.bowl, true);
    assert.deepEqual(loaded.generated, result.recipes);
    assert.equal(loaded.recipes.length, 6);
    const view = new DatabaseSync(filename, { readOnly: true });
    try {
      assert.equal(
        view.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n,
        1,
      );
      assert.equal(
        view
          .prepare(
            "SELECT COUNT(*) AS n FROM recipe_ingredients WHERE recipe_id=?",
          )
          .get(result.recipes[0].id).n,
        2,
      );
      assert.deepEqual(view.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      view.close();
    }
  } finally {
    db.close();
  }
});

test("invalid state and unknown references roll back without overwriting stored data", () => {
  const db = openDatabase(":memory:");
  try {
    const initial = db.getState();
    for (const patch of [
      { pantry: ["unknown"] },
      { saved: ["missing-recipe"] },
      { profile: { ...initial.profile, height: "NaN" } },
      { profile: { ...initial.profile, medicalNotes: "x".repeat(2001) } },
      { feedback: { missing: true } },
      { generated: [] },
      { revision: -1 },
    ]) {
      assert.throws(() => db.saveState({ ...writable(initial), ...patch }));
      assert.deepEqual(db.getState(), initial);
    }
    const literal = "'); DROP TABLE recipes; --";
    db.saveState({
      ...writable(initial),
      profile: { ...initial.profile, name: literal },
    });
    assert.equal(db.getState().profile.name, literal);
    assert.equal(db.getState().recipes.length, 6);
  } finally {
    db.close();
  }
});

test("concurrent revisions and late AI results cannot undo a reset", () => {
  const db = openDatabase(":memory:");
  try {
    const initial = db.getState();
    const result = generated({
      pantry: initial.pantry,
      maxTime: 30,
      profile: { diet: "Sin preferencia", allergies: [] },
    });
    db.saveGenerated(result, initial.revision);
    db.saveState({ ...writable(initial), saved: [result.recipes[0].id] });
    assert.throws(() => db.saveState(writable(initial)), {
      code: "STATE_CONFLICT",
    });
    const reset = db.reset(db.getState().revision);
    assert.equal(reset.generated.length, 0);
    assert.deepEqual(reset.saved, []);
    assert.equal(reset.recipes.length, 6);
    assert.equal(reset.ingredients.length, 14);
    assert.throws(() => db.saveGenerated(result, initial.revision), {
      code: "STATE_CONFLICT",
    });
    assert.equal(db.getState().generated.length, 0);
  } finally {
    db.close();
  }
});

async function withApi(run, generator = generated) {
  const store = openDatabase(":memory:");
  let calls = 0;
  const server = createAppServer({
    store,
    generate: async (input) => {
      calls++;
      return generator(input);
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const send = (route, method, body, headers = {}) =>
    fetch(url + route, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    await run(send, store, () => calls);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
}

test("stored food exclusions reach generation and cannot be overridden by the client", () =>
  withApi(async (send, store, calls) => {
    const initial = store.getState();
    const state = store.saveState({
      ...writable(initial),
      profile: { ...initial.profile, allergies: ["Maní", "Trigo / gluten"], exclusions: "pan blanco, huevo" },
    });
    const response = await send("/api/recipes/suggest", "POST", {
      revision: state.revision, maxTime: 30,
      message: "Quiero comer, tengo huevo, queso y aguacate en la nevera",
      profile: { exclusions: "", needsReview: false },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).type, "success");
    assert.equal(calls(), 1);
  }, (input) => {
    assert.equal(input.profile.exclusions, "pan blanco, huevo");
    assert.equal(input.profile.needsReview, false);
    assert.deepEqual(input.profile.allergies, ["Maní", "Trigo / gluten"]);
    return generated(input);
  }));

test("HTTP state saves and generation uses stored restrictions, with history persisted on server", () =>
  withApi(async (send, store, calls) => {
    const initial = await (await send("/api/state", "GET")).json();
    const body = {
      ...writable(initial),
      profile: {
        ...initial.profile,
        medicalNotes: "Nota ficticia para revisión",
      },
    };
    assert.equal(
      (
        await send("/api/state", "PUT", body, {
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
    const updated = await (await send("/api/state", "PUT", body)).json();
    const suggestion = {
      message: "Dame una receta",
      maxTime: 30,
      revision: updated.revision,
      pantry: ["huevo"],
      profile: { needsReview: false },
    };
    const paused = await (
      await send("/api/recipes/suggest", "POST", suggestion)
    ).json();
    assert.equal(paused.type, "review");
    assert.equal(calls(), 0);
    const cleared = await (
      await send("/api/state", "PUT", {
        ...body,
        revision: updated.revision,
        profile: initial.profile,
      })
    ).json();
    const result = await (
      await send("/api/recipes/suggest", "POST", {
        ...suggestion,
        revision: cleared.revision,
      })
    ).json();
    assert.equal(result.recipes.length, 1);
    assert.equal(calls(), 1);
    assert.equal(store.getState().generated[0].id, result.recipes[0].id);
    assert.equal(
      (await send("/api/recipes/suggest", "POST", suggestion)).status,
      409,
    );
    assert.equal(
      (
        await send("/api/state", "PUT", {
          ...writable(store.getState()),
          generated: result.recipes,
        })
      ).status,
      400,
    );
    assert.equal(
      (await send("/api/state", "DELETE", { revision: cleared.revision }))
        .status,
      200,
    );
    assert.equal(store.getState().generated.length, 0);
  }));

test("HTTP rejects stale provider output if another tab changed the profile while waiting", async () => {
  let finish, started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  await withApi(
    async (send, store) => {
      const state = store.getState();
      const response = send("/api/recipes/suggest", "POST", {
        revision: state.revision,
        message: "Dame una receta",
        maxTime: 30,
      });
      await waiting;
      store.reset(state.revision);
      finish();
      assert.equal((await response).status, 409);
      assert.equal(store.getState().generated.length, 0);
    },
    async (input) => {
      started();
      await new Promise((resolve) => {
        finish = resolve;
      });
      return generated(input);
    },
  );
});
