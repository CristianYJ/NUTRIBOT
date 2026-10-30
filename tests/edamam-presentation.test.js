import test from 'node:test';
import assert from 'node:assert/strict';
import { presentEdamamRecipe, presentEdamamChoices } from '../server/edamam-presentation.js';
import { hydrateEdamamMeals, summarizeMeals } from '../server/meals.js';

test('Gemini translates Edamam ingredients without changing quantities and estimates difficulty', async () => {
  const input = { title: 'Chicken rolls', ingredientLines: ['75g low-fat cheese', '3 flour tortillas'], time: 15, meal: 'Almuerzo' };
  const result = await presentEdamamRecipe(input, { generate: async request => {
    assert.match(request.instruction, /no omitas alérgenos/i);
    return { output: { titleEs: 'Rollitos de pollo', meal: 'Cena', ingredientLinesEs: ['75 g de queso bajo en grasa', '3 tortillas de harina'], difficulty: 'Fácil' } };
  } });
  assert.deepEqual(result, { titleEs: 'Rollitos de pollo', meal: 'Almuerzo', ingredientLinesEs: ['75 g de queso bajo en grasa', '3 tortillas de harina'], difficulty: 'Fácil' });
  await assert.rejects(presentEdamamRecipe(input, { generate: async () => ({ output: {
    titleEs: 'Rollitos de pollo', meal: 'Almuerzo', ingredientLinesEs: ['70 g de queso', '3 tortillas'], difficulty: 'Fácil',
  } }) }), { code: 'INVALID_AI_OUTPUT' });
});

test('Gemini translates both choice titles in one call and keeps the requested meal', async () => {
  let calls = 0;
  const choices = await presentEdamamChoices([{ title: 'Chicken tacos', mealTypes: ['Lunch'] }, { title: 'Rice bowl', mealTypes: [] }], 'Dinner', {
    generate: async request => {
      calls++;
      assert.equal(JSON.parse(request.parts[0].text).recipes.length, 2);
      return { output: { choices: [{ titleEs: 'Tacos de pollo', meal: 'Almuerzo' }, { titleEs: 'Tazón de arroz', meal: 'Almuerzo' }] } };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(choices, [{ titleEs: 'Tacos de pollo', meal: 'Cena' }, { titleEs: 'Tazón de arroz', meal: 'Cena' }]);
});

test('Edamam meal nutrition is calculated live without adding nutrients to stored meal events', async () => {
  const uri = 'http://www.edamam.com/ontologies/edamam.owl#recipe_abc123';
  const event = { id: 'meal-1', externalUri: uri, title: 'Chicken rolls', mealType: 'Almuerzo', nutrition: null };
  const data = { date: '2026-10-29', meals: [event], week: [{ date: '2026-10-29', meals: [event] }] };
  let calls = 0;
  const hydrated = await hydrateEdamamMeals(data, async requested => {
    calls++; assert.equal(requested, uri);
    return { caloriesPerServing: 220, nutrientsPerServing: { carbohydratesG: 12, proteinG: 18, fatG: 8, sodiumMg: 400 } };
  });
  assert.equal(calls, 1);
  assert.equal(hydrated.totals.kcal, 220);
  assert.equal(hydrated.week[0].totals.protein, 18);
  assert.equal(hydrated.meals[0].nutrition.salt, 1);
  assert.equal(data.meals[0].nutrition, null);
  assert.equal(summarizeMeals(data.meals).totals.kcal, null);
});
