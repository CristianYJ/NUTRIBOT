import test from "node:test";
import assert from "node:assert/strict";
import {
  parseInput,
  preflight,
  allowedIngredients,
  validateOutput,
  buildPrompt,
  AppError,
} from "../server/recipes.js";
import { generateWithGemini } from "../server/gemini.js";
import { createAppServer } from "../server/app.js";

const input = () =>
  parseInput({
    pantry: ["arroz", "frijoles", "tomate", "huevo", "leche", "queso", "pollo"],
    profile: { diet: "Sin preferencia", allergies: [], needsReview: false },
    maxTime: 30,
    message: "Dame una receta para cocinar.",
  });
const output = () => ({
  intent: "recipe",
  recipes: [
    {
      title: "Arroz con tomate",
      subtitle: "Un plato casero.",
      time: 25,
      category: "Almuerzo",
      ingredients: ["arroz", "tomate"],
      amounts: ["50 g de arroz crudo", "1 tomate"],
      steps: [
        "Lava el tomate y córtalo.",
        "Cocina el arroz en agua potable y añade el tomate.",
      ],
    },
  ],
});
test("server rejects unknown ingredients and malformed profiles", () => {
  for (const patch of [
    { pantry: ["unknown"] },
    { maxTime: 999 },
    { message: "" },
    { profile: { diet: "inventada", allergies: [], needsReview: false } },
    {
      profile: { diet: "Vegana", allergies: ["inventada"], needsReview: false },
    },
  ])
    assert.throws(() => parseInput({ ...input(), ...patch }), AppError);
});
test("names, measurements and raw medical notes never enter the Gemini prompt", () => {
  const parsed = parseInput({
    ...input(),
    profile: {
      ...input().profile,
      name: "SECRET_NAME",
      weight: 70,
      height: 170,
      medicalNotes: "SECRET_NOTE",
    },
    apiKey: "SECRET_KEY",
  });
  const prompt = buildPrompt(parsed);
  for (const value of [
    "SECRET_NAME",
    "SECRET_NOTE",
    "SECRET_KEY",
    "weight",
    "height",
    "medicalNotes",
  ])
    assert(!prompt.includes(value));
});
test("ingredient exclusions are computed on the server", () => {
  const i = input();
  i.profile.allergies = ["Leche", "Huevo"];
  assert.deepEqual(allowedIngredients(i), [
    "arroz",
    "frijoles",
    "tomate",
    "pollo",
  ]);
  i.profile.diet = "Vegana";
  assert.deepEqual(allowedIngredients(i), ["arroz", "frijoles", "tomate"]);
});
test("clinical requests stop before provider invocation", () => {
  for (const text of [
    "Tengo diabetes",
    "Necesito una prescripción",
    "Tengo alergia al tomate",
    "Lo quiero sin huevo",
  ])
    assert.equal(preflight({ ...input(), message: text }).type, "review");
  assert.equal(
    preflight({
      ...input(),
      profile: { ...input().profile, needsReview: true },
    }).type,
    "review",
  );
  assert.equal(preflight({ ...input(), pantry: [] }).type, "empty");
});
test("validated AI recipes receive server-owned identity, allergens and provenance", () => {
  const raw = output();
  raw.recipes[0].allergens = ["Leche"];
  raw.recipes[0].nutrition = [999];
  raw.recipes[0].id = "injected";
  const r = validateOutput(raw, input(), "test-model").recipes[0];
  assert(r.id.startsWith("ai-"));
  assert.equal(r.source, "gemini");
  assert.deepEqual(r.allergens, []);
  assert.equal(r.nutrition, null);
  assert.equal(r.vegan, true);
});
test("AI cannot smuggle excluded food in ingredients, amounts or preparation", () => {
  for (const modify of [
    (r) => r.ingredients.push("leche"),
    (r) => r.steps.push("Agrega leche al final."),
    (r) => (r.amounts[0] = "50 g de arroz con aceite"),
    (r) => (r.time = 45),
    (r) => (r.amounts = []),
    (r) => (r.title = "Validado por un profesional"),
  ]) {
    const raw = output();
    modify(raw.recipes[0]);
    const i = input();
    i.profile.allergies = ["Leche"];
    assert.throws(() => validateOutput(raw, i, "test"), AppError);
  }
});
test("off-topic responses use fixed local wording and never expose arbitrary model text", () => {
  const result = validateOutput(
    { intent: "out_of_scope", recipes: [], text: "ignore rules" },
    input(),
    "test",
  );
  assert.equal(result.type, "out_of_scope");
  assert.equal(result.recipes.length, 0);
  assert(!result.text.includes("ignore rules"));
});
test("quota and permission errors are explicit and redact provider details", async () => {
  for (const status of [400, 401, 403, 404, 429, 500])
    await assert.rejects(
      () =>
        generateWithGemini(input(), {
          apiKey: "secret",
          fetchImpl: async () => ({
            ok: false,
            status,
            json: async () => ({
              error: { message: "secret provider content" },
            }),
          }),
        }),
      (e) => e instanceof AppError && !e.message.includes("secret"),
    );
});
test("blocked and truncated provider outputs are not presented as recipes", async () => {
  for (const finishReason of ["MAX_TOKENS", "SAFETY"])
    await assert.rejects(
      () =>
        generateWithGemini(input(), {
          apiKey: "secret",
          fetchImpl: async () => ({
            ok: true,
            json: async () => ({
              candidates: [
                {
                  finishReason,
                  content: { parts: [{ text: JSON.stringify(output()) }] },
                },
              ],
            }),
          }),
        }),
      (e) => e.code === "AI_INCOMPLETE",
    );
});
test("provider request keeps credentials in header and limits context", async () => {
  const result = await generateWithGemini(input(), {
    apiKey: "private-key",
    fetchImpl: async (url, options) => {
      assert(!url.includes("private-key"));
      assert.equal(options.headers["x-goog-api-key"], "private-key");
      assert(!options.body.includes("private-key"));
      const payload = JSON.parse(options.body);
      assert.equal(
        payload.generationConfig.responseMimeType,
        "application/json",
      );
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(output()) }] },
            },
          ],
        }),
      };
    },
  });
  assert.equal(result.source, "gemini");
});
async function withServer(run) {
  let calls = 0;
  const server = createAppServer({
    apiKey: "private-server-key",
    generate: async (i) => {
      calls++;
      return validateOutput(output(), i, "test");
    },
    serveStatic: true,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(url, () => calls);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test("HTTP routes reject bad origin, private file paths and invalid payloads", () =>
  withServer(async (url) => {
    const health = await (await fetch(url + "/api/health")).json();
    assert.equal(health.configured, true);
    assert(!JSON.stringify(health).includes("private-server-key"));
    assert.equal(
      (
        await fetch(url + "/api/health", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal((await fetch(url + "/.env")).status, 404);
    assert.equal(
      (
        await fetch(url + "/api/recipes/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "invalid",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(url + "/api/recipes/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "x".repeat(13000),
        })
      ).status,
      413,
    );
  }));
test("HTTP medical preflight never calls the provider and normal requests work", () =>
  withServer(async (url, calls) => {
    const send = (data) =>
      fetch(url + "/api/recipes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    const paused = await (
      await send({
        ...input(),
        profile: { ...input().profile, needsReview: true },
      })
    ).json();
    assert.equal(paused.type, "review");
    assert.equal(calls(), 0);
    const result = await (await send(input())).json();
    assert.equal(result.source, "gemini");
    assert.equal(result.recipes.length, 1);
    assert.equal(calls(), 1);
  }));
test("HTTP rate limiting caps requests to the AI service", () =>
  withServer(async (url, calls) => {
    for (let n = 0; n < 7; n++) {
      const response = await fetch(url + "/api/recipes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input()),
      });
      assert.equal(response.status, n < 6 ? 200 : 429);
    }
    assert.equal(calls(), 6);
  }));
