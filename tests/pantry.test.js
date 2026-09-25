import test from "node:test";
import assert from "node:assert/strict";
import { pantryParts, validatePantryItems, analyzePantry } from "../server/pantry.js";
import { parseInput, allowedIngredients, validateOutput, buildPrompt } from "../server/recipes.js";
import { createAppServer } from "../server/app.js";
import { generateWithGemini } from "../server/gemini.js";
import { initialProfile, ingredients } from "../src/data.js";
import { profileRestrictions } from "../src/profile-rules.js";
const item = { name: "Cebolla", category: "Vegetales", animal: false, meat: false, allergens: [] };
const photo = { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=" };
test("text/image validation rejects oversized, mismatched and unsupported input", () => {
  assert.equal(pantryParts({ text: "  dos cebollas  " })[0].text, "dos cebollas");
  assert.deepEqual(pantryParts({ image: photo })[1].inlineData, photo);
  for (const raw of [{}, { text: "x".repeat(2001) }, { image: { ...photo, mimeType: "image/jpeg" } }, { image: { ...photo, data: "x".repeat(4194305) } }, { image: { mimeType: "image/svg+xml", data: "PHN2Zz4=" } }])
    assert.throws(() => pantryParts(raw));
});
test("ingredient review normalizes duplicate names and rejects malformed metadata", () => {
  assert.equal(validatePantryItems([item, { ...item, name: "cebollas" }]).length, 1);
  for (const patch of [{ name: "<script>" }, { category: "fake" }, { meat: true }, { allergens: ["fake"] }])
    assert.throws(() => validatePantryItems([{ ...item, ...patch }]));
});
test("image recognition sends inline bytes and only returns reviewed-shape candidates", async () => {
  const response = await analyzePantry({ image: photo }, { apiKey: "secret", fetchImpl: async (_, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.contents[0].parts[1].inlineData, photo);
    assert(!options.body.includes("secret"));
    return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ items: [item] }) }] } }] }) };
  } });
  assert.deepEqual(response.items, [item]);
});
test("custom ingredients enter prompts and recipes, with dietary and exclusion filters", () => {
  const custom = { ...item, id: "food-test" };
  const dairy = { ...item, name: "Yogur", id: "food-yogur", animal: true, allergens: ["Leche"] };
  const catalog = [...ingredients, custom, dairy];
  const input = parseInput({ pantry: [custom.id, dairy.id], maxTime: 30, message: "Dame una receta", profile: { ...initialProfile, needsReview: false, allergies: ["Leche"] } }, catalog);
  assert.deepEqual(allowedIngredients(input), [custom.id]);
  assert(JSON.parse(buildPrompt(input)).ingredientesPermitidos.some(i => i.nombre === "Cebolla"));
  assert.deepEqual(profileRestrictions({ ...initialProfile, exclusions: "leche" }, catalog).excludedIngredients.sort(), ["leche", "queso", dairy.id].sort());
  const output = { intent: "recipe", recipes: [{ title: "Cebolla cocida", subtitle: "Una porción", time: 15, category: "Cena", ingredients: [custom.id], amounts: ["1 cebolla"], steps: ["Cocina la cebolla en agua potable."] }] };
  assert.equal(validateOutput(output, input, "test").recipes[0].vegan, true);
  input.profile.exclusions = "cebolla";
  assert.deepEqual(allowedIngredients(input), []);
  assert.throws(() => validateOutput(output, input, "test"));
  assert.throws(() => parseInput({ ...input, catalog })); // Client cannot invent trusted IDs.
});
test("pantry API is POST-only, origin protected and analyzes without saving", async () => {
  let analyses = 0, writes = 0;
  const server = createAppServer({ analyze: async raw => { pantryParts(raw); analyses++; return { items: [item] }; }, store: { addPantry: async () => { writes++; return {}; } } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/api/pantry/analyze")).status, 405);
    const send = (headers = {}) => fetch(base + "/api/pantry/analyze", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ text: "cebolla" }) });
    assert.equal((await send({ Origin: "https://evil.example" })).status, 403);
    assert.deepEqual((await (await send()).json()).items, [item]);
    assert.equal(analyses, 1); assert.equal(writes, 0);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test("recipe transport uses compact IDs then restores database IDs", async () => {
  const custom = { ...item, id: "food-01234567-1234-1234-1234-012345678901" };
  const input = parseInput({ pantry: [custom.id], profile: { ...initialProfile, needsReview: false }, maxTime: 30, message: "Cocina cebolla" }, [custom]);
  const result = await generateWithGemini(input, { apiKey: "test", fetchImpl: async (_, options) => {
    const body = JSON.parse(options.body);
    assert(!options.body.includes(custom.id));
    assert.equal(JSON.parse(body.contents[0].parts[0].text).ingredientesPermitidos[0].id, "custom0");
    const recipe = { title: "Cebolla cocida", subtitle: "Una porción", time: 15, category: "Cena", ingredients: ["custom0"], amounts: ["1 cebolla"], steps: ["Cocina la cebolla en agua potable."] };
    return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ intent: "recipe", recipes: [recipe] }) }] } }] }) };
  } });
  assert.deepEqual(result.recipes[0].ingredients, [custom.id]);
});
