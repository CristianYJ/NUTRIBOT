import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUsdaFood, calculateRecipeNutrition, searchUsdaFoods, getUsdaFood } from '../server/nutrition.js';
import { parseInput, validateOutput } from '../server/recipes.js';
import { curatedFdcId, estimatedGrams, resolveAutomaticUsdaLinks } from '../server/auto-nutrition.js';
import { createAppServer } from '../server/app.js';

const sample = {
  fdcId: 1234,
  description: 'Food, raw',
  dataType: 'Foundation',
  foodNutrients: [
    { nutrient: { id: 1008 }, amount: 100 },
    { nutrient: { id: 1003 }, amount: 5 },
    { nutrient: { id: 1005 }, amount: 10 },
    { nutrient: { id: 1004 }, amount: 2 },
    { nutrient: { id: 1258 }, amount: 1 },
    { nutrient: { id: 1093 }, amount: 200 },
    { nutrient: { id: 2000 }, amount: 3 },
    { nutrient: { id: 1079 }, amount: 4 },
  ],
};

test('USDA data is converted from per 100 g into per person and recipe totals', () => {
  const food = parseUsdaFood(sample);
  const result = calculateRecipeNutrition([{ gramsPerPerson: 150, usda: food }], 3, { maxSodiumMg: '250', maxSaturatedFatG: '2' });
  assert.equal(result.perPerson.kcal, 150);
  assert.equal(result.total.kcal, 450);
  assert.equal(result.perPerson.sodium, 300);
  assert.equal(result.perPerson.fiber, 6);
  assert.equal(result.perPerson.salt, 0.75);
  assert.equal(result.checks.maxSodiumMg, 'exceeds');
  assert.equal(result.checks.maxSaturatedFatG, 'within');
});

test('catalog quantities and reviewed USDA matches are available without user searches', async () => {
  assert.equal(estimatedGrams('bowl', 'arroz', '½ taza de arroz crudo', 'catalog'), 92);
  assert.equal(curatedFdcId('arroz', 'Arroz'), 169756);
  assert.equal(curatedFdcId('food-custom', 'Nueces'), 170187);
  const stored = [];
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ...sample, fdcId: 169756 }) });
  const result = await resolveAutomaticUsdaLinks({ setIngredientUsda: async (...args) => stored.push(args) }, [{ ingredientId: 'arroz', name: 'Arroz', usda: null }], 'test-key', fetchImpl);
  assert.deepEqual(result.unmatched, []);
  assert.equal(stored[0][0], 'arroz');
  assert.equal(stored[0][1].nutrients.fiber, 4);
  const cached = await resolveAutomaticUsdaLinks({}, [{ ingredientId: 'arroz', name: 'Arroz', usda: stored[0][1] }], '');
  assert.deepEqual(cached, { unavailable: false, unmatched: [] });
});

test('opening a recipe calculates and caches USDA nutrition without a search by the user', async (t) => {
  let linkedFood = null;
  let providerCalls = 0;
  const store = {
    async getRecipeNutrition(_id, servings) {
      const ingredients = [{ ingredientId: 'arroz', name: 'Arroz', gramsPerPerson: 100, usda: linkedFood }];
      return { ingredients, nutrition: calculateRecipeNutrition(ingredients, servings) };
    },
    async setIngredientUsda(_id, food) { linkedFood = food; },
  };
  const server = createAppServer({ authentication: false, store, usdaApiKey: 'test-key', usdaFetch: async () => {
    providerCalls++;
    return { ok: true, json: async () => sample };
  } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/nutrition/recipes/bowl?servings=3`;
  const first = await (await fetch(url)).json();
  assert.equal(first.nutrition.total.kcal, 300);
  assert.equal(first.nutrition.total.fiber, 12);
  assert.deepEqual(first.lookup.unmatched, []);
  assert.equal((await (await fetch(url)).json()).nutrition.perPerson.kcal, 100);
  assert.equal(providerCalls, 1);
});

test('missing nutrient or quantity remains unknown instead of being counted as zero', () => {
  const food = parseUsdaFood({ ...sample, foodNutrients: sample.foodNutrients.filter((n) => n.nutrient.id !== 1258) });
  const result = calculateRecipeNutrition([{ gramsPerPerson: 100, usda: food }], 2, { maxSaturatedFatG: '2' });
  assert.equal(result.perPerson.saturatedFat, null);
  assert.equal(result.checks.maxSaturatedFatG, 'unknown');
  assert.equal(calculateRecipeNutrition([{ gramsPerPerson: null, usda: food }], 2).perPerson.kcal, null);
});

test('limits compare the unrounded value', () => {
  const food = parseUsdaFood({ ...sample, foodNutrients: sample.foodNutrients.map((entry) => entry.nutrient.id === 1093 ? { ...entry, amount: 100.04 } : entry) });
  const result = calculateRecipeNutrition([{ gramsPerPerson: 100, usda: food }], 1, { maxSodiumMg: '100' });
  assert.equal(result.perPerson.sodium, 100.04);
  assert.equal(result.checks.maxSodiumMg, 'exceeds');
});

test('USDA calls stay server side and use the configured key', async () => {
  const seen = [];
  const fakeFetch = async (url) => {
    seen.push(url);
    return { ok: true, json: async () => url.pathname.endsWith('/foods/search') ? { foods: [sample] } : sample };
  };
  assert.equal((await searchUsdaFoods('Food', 'server-secret', fakeFetch))[0].fdcId, 1234);
  assert.equal((await getUsdaFood(1234, 'server-secret', fakeFetch)).nutrients.protein, 5);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((url) => url.searchParams.get('api_key') === 'server-secret'));
});

test('Gemini grams must align with declared ingredients', () => {
  const input = parseInput({ pantry: ['arroz', 'tomate'], maxTime: 30, message: 'Arroz con tomate', profile: { diet: 'Sin preferencia', allergies: [], needsReview: false } });
  const recipe = { title: 'Arroz con tomate', subtitle: 'Plato sencillo', time: 25, category: 'Almuerzo', ingredients: ['arroz', 'tomate'], amounts: ['50 g de arroz', '100 g de tomate'], grams: [50, 100], steps: ['Cocina el arroz en agua potable y agrega el tomate lavado.'] };
  assert.deepEqual(validateOutput({ intent: 'recipe', recipes: [recipe] }, input, 'test').recipes[0].grams, [50, 100]);
  assert.throws(() => validateOutput({ intent: 'recipe', recipes: [{ ...recipe, grams: [50] }] }, input, 'test'), { code: 'INVALID_AI_OUTPUT' });
});
