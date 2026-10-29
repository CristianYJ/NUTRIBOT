import test from 'node:test';
import assert from 'node:assert/strict';
import { createEdamam, edamamFilters, makeSearchUrl, shapeRecipe, validateEdamamUri } from '../server/edamam.js';
import { createAppServer } from '../server/app.js';
import { ingredients } from '../src/data.js';
import { encodeConversation } from '../src/useChatPersistence.js';

const uri = 'http://www.edamam.com/ontologies/edamam.owl#recipe_abc123';
const input = { maxTime: 30, profile: { diet: 'Vegana', allergies: ['Maní', 'Leche'], exclusions: 'cebolla; ajo' } };
test('Edamam search applies trusted profile filters and keeps credentials server side', () => {
  assert.deepEqual(edamamFilters(input), { health: ['peanut-free', 'dairy-free', 'vegan'], excluded: ['cebolla', 'ajo'] });
  const url = makeSearchUrl(input, { query: 'tomato rice', mealType: 'Dinner' }, 'private-id', 'private-key');
  assert.equal(url.searchParams.get('q'), 'tomato rice');
  assert.equal(url.searchParams.get('time'), '30');
  assert.deepEqual(url.searchParams.getAll('health'), ['peanut-free', 'dairy-free', 'vegan']);
  assert.equal(url.searchParams.getAll('field').includes('glycemicIndex'), true);
  assert.throws(() => validateEdamamUri('https://evil.example/recipe'));
});
test('recipe result shows actual glycemic index and marks absent values unavailable', () => {
  const base = { uri, label: 'Rice bowl', yield: 2, calories: 500, ingredients: [{ food: 'rice' }], ingredientLines: ['rice'] };
  const terms = [{ id: 'arroz', english: 'rice' }];
  assert.equal(shapeRecipe({ ...base, glycemicIndex: 42 }, terms).glycemicIndex, 42);
  assert.equal(shapeRecipe(base, terms).glycemicIndex, null);
  assert.equal(shapeRecipe(base, terms).caloriesPerServing, 250);
  assert.deepEqual(shapeRecipe(base, terms).matched, ['arroz']);
});
test('one search call ranks pantry terms and excludes results missing requested allergy labels', async () => {
  let calls = 0;
  const api = createEdamam({ appId: 'id', appKey: 'key', fetchImpl: async () => {
    calls++;
    return { ok: true, json: async () => ({ hits: [
      { recipe: { uri, label: 'Safe', healthLabels: ['Peanut-Free', 'Dairy-Free', 'Vegan'], ingredients: [{ food: 'rice' }] } },
      { recipe: { uri: uri + 'x', label: 'Unsafe', healthLabels: ['Vegan'], ingredients: [{ food: 'rice' }] } },
    ] }) };
  } });
  const result = await api.search(input, { query: 'rice', terms: [{ id: 'arroz', english: 'rice' }] });
  assert.equal(calls, 1);
  assert.deepEqual(result.recipes.map(r => r.title), ['Safe']);
});
test('HTTP suggestion uses Edamam without saving full recipes or calling legacy Gemini generation', async t => {
  let legacyCalls = 0, searches = 0;
  const store = { getState: async () => ({ revision: 0, pantry: ['arroz'], ingredients,
    profile: { diet: 'Sin preferencia', allergies: [], exclusions: '', needsReview: false }, generated: [] }),
    saveGenerated: async () => { legacyCalls++; } };
  const server = createAppServer({ authentication: false, store, edamamAppId: 'id', edamamAppKey: 'key',
    edamamPlan: async () => ({ intent: 'recipe', reply: 'Encontré opciones.', query: 'rice', terms: [{ id: 'arroz', english: 'rice' }] }),
    edamamFetch: async () => { searches++; return { ok: true, json: async () => ({ hits: [{ recipe: { uri, label: 'Rice bowl', healthLabels: [], ingredients: [{ food: 'rice' }], glycemicIndex: 51 } }] }) }; },
    generate: async () => { legacyCalls++; throw new Error('Legacy generation called'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recipes/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: 0, maxTime: 30, message: 'Arroz', mode: 'initial' }) });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.source, 'edamam');
  assert.equal(result.externalRecipes[0].glycemicIndex, 51);
  assert.equal(searches, 1);
  assert.equal(legacyCalls, 0);
  const persisted = encodeConversation({ messages: [{ id: 'm', role: 'bot', text: 'Listo', externalRecipes: result.externalRecipes }], draft: '', maxTime: 30, busy: false });
  assert.deepEqual(persisted.messages[0].edamamRefs, [{ uri, title: 'Rice bowl' }]);
  assert.equal(JSON.stringify(persisted).includes('glycemicIndex'), false);
});
