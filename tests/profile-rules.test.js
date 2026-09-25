import test from "node:test";
import assert from "node:assert/strict";
import { ingredients, initialProfile } from "../src/data.js";
import { profileRestrictions } from "../src/profile-rules.js";
import { requiresReview, matchesProfile } from "../src/engine.js";
import { parseInput, preflight, buildPrompt, allowedIngredients, validateOutput } from "../server/recipes.js";

const request = (exclusions = "pan blanco") => parseInput({
  pantry: ingredients.map((item) => item.id), maxTime: 30,
  message: "Quiero comer, tengo huevo, queso y aguacate en la nevera",
  profile: { ...initialProfile, allergies: ["Trigo / gluten", "Maní"], exclusions, needsReview: false },
});

test("screenshot profile allows cooking while keeping allergy filters", () => {
  const input = request();
  assert.equal(requiresReview({ ...initialProfile, exclusions: "pan blanco" }), false);
  assert.equal(preflight(input), null);
  assert(!allowedIngredients(input).includes("avena"));
  assert(allowedIngredients(input).includes("huevo"));
  const prompt = JSON.parse(buildPrompt(input));
  assert.equal(prompt.filtrosDelPerfilAplicados, true);
  assert.equal(prompt.alergiasDeclaradas, undefined);
  assert(!JSON.stringify(prompt).includes("pan blanco"));
  assert(!prompt.ingredientesPermitidos.some((item) => item.id === "avena"));
});

test("recognized food lists exclude ingredients on server and in saved recipes", () => {
  const input = request("Sin leche, huevos y aguacate");
  assert.equal(preflight(input), null);
  for (const id of ["leche", "queso", "huevo", "aguacate"]) {
    assert(!allowedIngredients(input).includes(id));
    assert.equal(matchesProfile({ ingredients: [id], allergens: [] }, input.profile), false);
  }
});

test("unknown or clinical restrictions still pause without guessing", () => {
  for (const exclusions of ["pan blanco, alimento desconocido", "dieta renal", "sin huevo excepto los martes", "no pan blanco pero sí huevo"]) {
    const input = request(exclusions);
    assert.equal(preflight(input).type, "review");
    assert.equal(requiresReview(input.profile), true);
  }
  const result = profileRestrictions({ ...initialProfile, exclusions: "pan blanco", medicalNotes: "Indicación médica" });
  assert.equal(result.needsReview, true);
  assert.match(result.reason, /Indicaciones de mi profesional/);
});

test("provider cannot reintroduce excluded ingredients or bread in recipe text", () => {
  const recipe = {
    title: "Huevo cocido", subtitle: "Una porción", time: 15, category: "Cena",
    ingredients: ["huevo"], amounts: ["1 huevo"], steps: ["Cuece el huevo completamente en agua potable."],
  };
  assert.equal(validateOutput({ intent: "recipe", recipes: [recipe] }, request(), "test").type, "success");
  assert.throws(() => validateOutput({ intent: "recipe", recipes: [recipe] }, request("huevo"), "test"), { code: "INVALID_AI_OUTPUT" });
  recipe.steps.push("Sirve con pan blanco.");
  assert.throws(() => validateOutput({ intent: "recipe", recipes: [recipe] }, request(), "test"), { code: "INVALID_AI_OUTPUT" });
});
