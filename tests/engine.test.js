import test from "node:test";
import assert from "node:assert/strict";
import {
  generateDemo,
  recommend,
  availability,
  matchesProfile,
} from "../src/engine.js";
import {
  initialPantry,
  initialProfile,
  ingredients,
  recipes,
} from "../src/data.js";

test("default pantry returns only recipes with all required ingredients", () => {
  const result = recommend(initialPantry, initialProfile);
  assert.deepEqual(
    result.map((r) => r.id),
    ["bowl", "ensalada"],
  );
  for (const r of result)
    assert.equal(availability(r, initialPantry).missing.length, 0);
});
test("empty pantry does not invent ingredients", () => {
  assert.deepEqual(recommend([], initialProfile), []);
  assert.equal(
    generateDemo({ pantry: [], profile: initialProfile, maxTime: 30 }).type,
    "empty",
  );
});
test("removing an ingredient immediately invalidates dependent recipes", () => {
  assert.deepEqual(
    recommend(
      initialPantry.filter((x) => x !== "tomate"),
      initialProfile,
    ),
    [],
  );
});
test("milk allergy blocks both milk and cheese recipes", () => {
  const result = recommend(
    ingredients.map((i) => i.id),
    { ...initialProfile, allergies: ["Leche"] },
  );
  assert(!result.some((r) => ["avena", "quesadilla"].includes(r.id)));
});
test("egg restriction and vegan diet remain mandatory", () => {
  const egg = recipes.find((r) => r.id === "huevos");
  assert.equal(
    matchesProfile(egg, { ...initialProfile, allergies: ["Huevo"] }),
    false,
  );
  assert(
    recommend(
      ingredients.map((i) => i.id),
      { ...initialProfile, diet: "Vegana" },
    ).every((r) => r.vegan),
  );
});
test("medical and unstructured restrictions pause recommendations", () => {
  for (const patch of [
    { medicalNotes: "Indicación ficticia para revisar" },
    { exclusions: "Alergia a un ingrediente no catalogado" },
  ]) {
    const profile = { ...initialProfile, ...patch };
    assert.deepEqual(recommend(initialPantry, profile), []);
    assert.equal(
      generateDemo({ pantry: initialPantry, profile, maxTime: 60 }).type,
      "review",
    );
  }
});
test("restriction messages are routed to profile rather than a recipe", () => {
  for (const message of [
    "Tengo alergia a la leche",
    "Quiero algo sin huevo",
    "No puedo comer tomate",
  ]) {
    const result = generateDemo({
      pantry: initialPantry,
      profile: initialProfile,
      maxTime: 30,
      message,
    });
    assert.equal(result.type, "review");
    assert.equal(result.recipes.length, 0);
  }
});
test("time constraint excludes slow recipes", () => {
  const r = recommend(initialPantry, initialProfile, 15);
  assert.deepEqual(
    r.map((x) => x.id),
    ["ensalada"],
  );
});
test("catalog ingredient ids and quantities stay consistent", () => {
  for (const r of recipes) {
    assert.equal(r.ingredients.length, r.amounts.length);
    for (const id of r.ingredients)
      assert(ingredients.some((i) => i.id === id));
  }
});
