import test from 'node:test';
import assert from 'node:assert/strict';
import { presentEdamamRecipe, presentEdamamChoices } from '../server/edamam-presentation.js';
import { cachedRecipePresentation, cachedChoicePresentations, getCachedRecipePresentation } from '../server/edamam-presentation-cache.js';
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

test('Spanish presentation is reused across accounts and refreshed when source ingredients change', async () => {
  const rows = new Map();
  const store = {
    getEdamamPresentation: async (uri, kind, hash) => {
      const row = rows.get(`${uri}:${kind}:${hash}`);
      return row ? { titleEs: row.titleEs, ingredientLinesEs: row.ingredientLinesEs,
        difficulty: row.difficulty, meal: row.meal } : null;
    },
    saveEdamamPresentation: async value => { rows.set(`${value.uri}:${value.kind}:${value.hash}`, value); },
  };
  const uri = 'http://www.edamam.com/ontologies/edamam.owl#recipe_shared';
  const input = { uri, title: 'Chicken rolls', ingredientLines: ['3 flour tortillas'], time: 15, meal: 'Almuerzo' };
  let calls = 0;
  const present = async recipe => {
    calls++;
    return { titleEs: 'Rollitos de pollo', ingredientLinesEs: recipe.ingredientLines.map(() => '3 tortillas de harina'),
      difficulty: 'Fácil', meal: 'Almuerzo' };
  };
  const first = await cachedRecipePresentation(input, {}, store, present);
  const second = await cachedRecipePresentation(input, {}, store, present);
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].title, 'Chicken rolls');
  assert.equal(JSON.stringify([...rows.values()]).includes('3 flour tortillas'), false);
  assert.deepEqual(await getCachedRecipePresentation(input, store), first);
  assert.equal(await getCachedRecipePresentation({ ...input, ingredientLines: ['4 flour tortillas'] }, store), null);
  await cachedRecipePresentation({ ...input, ingredientLines: ['4 flour tortillas'] }, {}, store, present);
  assert.equal(calls, 2);
});

test('chat choice cache translates only misses and preserves their order', async () => {
  const rows = new Map();
  const store = {
    getEdamamPresentation: async (uri, kind, hash) => rows.get(`${uri}:${kind}:${hash}`) || null,
    saveEdamamPresentation: async value => { rows.set(`${value.uri}:${value.kind}:${value.hash}`, value); },
  };
  const recipes = [
    { uri: 'http://www.edamam.com/ontologies/edamam.owl#recipe_one', title: 'Chicken soup', mealTypes: ['Lunch'] },
    { uri: 'http://www.edamam.com/ontologies/edamam.owl#recipe_two', title: 'Rice bowl', mealTypes: ['Lunch'] },
  ];
  let translated = [];
  const present = async missing => {
    translated.push(missing.map(item => item.title));
    return missing.map(item => ({ titleEs: item.title === 'Rice bowl' ? 'Tazón de arroz' : 'Sopa de pollo', meal: 'Almuerzo' }));
  };
  await cachedChoicePresentations(recipes.slice(0, 1), 'Lunch', {}, store, present);
  const result = await cachedChoicePresentations(recipes, 'Lunch', {}, store, present);
  assert.deepEqual(translated, [['Chicken soup'], ['Rice bowl']]);
  assert.deepEqual(result.map(item => item.titleEs), ['Sopa de pollo', 'Tazón de arroz']);
  await cachedChoicePresentations(recipes, 'Lunch', {}, store, present);
  assert.equal(translated.length, 2);
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
