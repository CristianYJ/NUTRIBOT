import { AppError, allowedIngredients } from './recipes.js';
import { generateStructured } from './gemini.js';

const allergyHealth = {
  Leche: 'dairy-free', Huevo: 'egg-free', 'Trigo / gluten': 'gluten-free',
  Maní: 'peanut-free', 'Frutos secos': 'tree-nut-free', Soya: 'soy-free',
  Pescado: 'fish-free', Mariscos: 'shellfish-free', Sésamo: 'sesame-free',
};
const fields = ['uri', 'label', 'image', 'source', 'url', 'yield', 'healthLabels',
  'ingredientLines', 'ingredients', 'calories', 'glycemicIndex', 'totalTime',
  'mealType', 'dishType', 'cuisineType', 'totalNutrients', 'totalCO2Emissions', 'co2EmissionsClass'];
const recipeUri = /^http:\/\/www\.edamam\.com\/ontologies\/edamam\.owl#recipe_[a-zA-Z0-9_-]{1,100}$/;
const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } };
export function requestedServings(message) {
  if (/\b(?:solo para m[ií]|solo para uno|para m[ií])\b/i.test(message)) return 1;
  const found = String(message || '').match(/\b(1[0-2]|[1-9])\s*(?:personas?|porciones?)\b/i);
  return found ? Number(found[1]) : 0;
}
export function validateEdamamUri(uri) {
  if (typeof uri !== 'string' || !recipeUri.test(uri)) throw new AppError('INVALID_RECIPE', 'La referencia de Edamam no es válida.');
  return uri;
}
export function edamamFilters(input) {
  return {
    health: [...input.profile.allergies.map(allergy => allergyHealth[allergy]).filter(Boolean),
      ...({ Vegana: ['vegan'], Vegetariana: ['vegetarian'] }[input.profile.diet] || [])],
    excluded: input.profile.exclusions.split(/[,;\n]/).map(x => x.trim()).filter(Boolean).slice(0, 12),
  };
}
export async function planEdamam(input, { apiKey, model, signal, plan = generateStructured }) {
  const eligible = new Set(allowedIngredients(input));
  const pantry = input.catalog.filter(item => eligible.has(item.id) && input.pantry.includes(item.id)).slice(0, 60);
  const schema = { type: 'object', additionalProperties: false, properties: {
    intent: { type: 'string', enum: ['recipe', 'conversation', 'out_of_scope', 'needs_review'] },
    reply: { type: 'string' }, query: { type: 'string' },
    terms: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      id: { type: 'string' }, english: { type: 'string' },
    }, required: ['id', 'english'] } },
    excludedEnglish: { type: 'array', items: { type: 'string' } },
    mealType: { type: 'string', enum: ['', 'Breakfast', 'Lunch', 'Dinner', 'Snack'] },
    cuisineType: { type: 'string', enum: ['', 'Mexican', 'Italian', 'Asian', 'American', 'Mediterranean', 'Indian', 'South American'] },
    dishType: { type: 'string', enum: ['', 'Main course', 'Salad', 'Soup', 'Sandwiches', 'Desserts', 'Side dish', 'Starter'] },
    maxCalories: { type: 'integer', minimum: 0, maximum: 2000 },
    maxIngredients: { type: 'integer', minimum: 0, maximum: 30 },
    maxGlycemicIndex: { type: 'integer', minimum: 0, maximum: 100 },
    servings: { type: 'integer', minimum: 0, maximum: 12 },
  }, required: ['intent', 'reply', 'query', 'terms', 'excludedEnglish', 'mealType', 'cuisineType', 'dishType', 'maxCalories', 'maxIngredients', 'maxGlycemicIndex', 'servings'] };
  const { output } = await plan({ instruction: 'Eres el asistente de Nutribot. Conversa en español. Usa el historial para mantener la intención original cuando el usuario solo responda con un número de personas. Para buscar recetas, traduce a inglés 1 a 3 ingredientes principales de la despensa y forma una consulta breve en inglés. Traduce también las exclusiones indicadas; no las omitas. Usa filtros de tipo de comida, cocina, plato, calorías por porción, cantidad de ingredientes e índice glucémico solo si el usuario los pide expresamente; usa 0 cuando no los pide. Devuelve servings=0 si aún no se conoce el número de personas. No inventes recetas ni datos nutricionales. Si es charla general, responde sin buscar. Usa solo IDs presentes en la despensa. No hagas recomendaciones médicas.',
    parts: [{ text: JSON.stringify({ message: input.message, history: input.history.slice(-4).map(({ role, text, servings }) => ({ role, text, servings: servings || undefined })), pantry, maxTime: input.maxTime, diet: input.profile.diet, exclusions: input.profile.exclusions }) }], schema }, { apiKey, model, signal });
  if (!output || !['recipe', 'conversation', 'out_of_scope', 'needs_review'].includes(output.intent)) throw new AppError('INVALID_AI_OUTPUT', 'Gemini no pudo interpretar la solicitud.', 502);
  const terms = (Array.isArray(output.terms) ? output.terms : []).filter(term => eligible.has(term.id) && input.pantry.includes(term.id) && /^[a-zA-Z -]{2,50}$/.test(term.english)).slice(0, 12);
  const fallback = pantry.slice(0, 2).map(item => ({ id: item.id, english: item.name }));
  const query = typeof output.query === 'string' && /^[a-zA-Z ,'-]{2,100}$/.test(output.query) ? output.query : (terms.length ? terms : fallback).slice(0, 2).map(t => t.english).join(' ');
  return { intent: output.intent, reply: String(output.reply || '').slice(0, 1000), query,
    terms: terms.length ? terms : fallback,
    mealType: ['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(output.mealType) ? output.mealType : '',
    cuisineType: ['Mexican', 'Italian', 'Asian', 'American', 'Mediterranean', 'Indian', 'South American'].includes(output.cuisineType) ? output.cuisineType : '',
    dishType: ['Main course', 'Salad', 'Soup', 'Sandwiches', 'Desserts', 'Side dish', 'Starter'].includes(output.dishType) ? output.dishType : '',
    maxCalories: Number.isInteger(output.maxCalories) && output.maxCalories >= 50 && output.maxCalories <= 2000 ? output.maxCalories : 0,
    maxIngredients: Number.isInteger(output.maxIngredients) && output.maxIngredients >= 1 && output.maxIngredients <= 30 ? output.maxIngredients : 0,
    maxGlycemicIndex: Number.isInteger(output.maxGlycemicIndex) && output.maxGlycemicIndex >= 1 && output.maxGlycemicIndex <= 100 ? output.maxGlycemicIndex : 0,
    servings: requestedServings(input.message) || [...input.history].reverse().find(item => Number.isInteger(item.servings) && item.servings >= 1 && item.servings <= 12)?.servings ||
      (Number.isInteger(output.servings) && output.servings >= 1 && output.servings <= 12 ? output.servings : 0),
    excludedEnglish: (Array.isArray(output.excludedEnglish) ? output.excludedEnglish : [])
      .filter(value => typeof value === 'string' && /^[a-zA-Z -]{2,60}$/.test(value)).slice(0, 12) };
}
export function makeSearchUrl(input, plan, appId, appKey) {
  const url = new URL('https://api.edamam.com/api/recipes/v2');
  url.searchParams.set('type', 'public'); url.searchParams.set('app_id', appId); url.searchParams.set('app_key', appKey);
  url.searchParams.set('q', plan.query); url.searchParams.set('time', String(input.maxTime));
  const filters = edamamFilters(input);
  for (const label of filters.health) url.searchParams.append('health', label);
  for (const word of [...new Set([...filters.excluded, ...(plan.excludedEnglish || [])])]) url.searchParams.append('excluded', word);
  if (plan.mealType) url.searchParams.set('mealType', plan.mealType);
  if (plan.cuisineType) url.searchParams.set('cuisineType', plan.cuisineType);
  if (plan.dishType) url.searchParams.set('dishType', plan.dishType);
  if (plan.maxCalories) url.searchParams.set('calories', String(plan.maxCalories));
  if (plan.maxIngredients) url.searchParams.set('ingr', String(plan.maxIngredients));
  if (plan.maxGlycemicIndex) url.searchParams.set('glycemicIndex', String(plan.maxGlycemicIndex));
  if (input.mode === 'more') url.searchParams.set('random', 'true');
  for (const field of fields) url.searchParams.append('field', field);
  return url;
}
export function shapeRecipe(raw, terms = []) {
  if (!raw || !recipeUri.test(raw.uri || '') || typeof raw.label !== 'string') return null;
  const foods = Array.isArray(raw.ingredients) ? raw.ingredients.map(i => normalized(i.food)).filter(Boolean) : [];
  const matched = terms.filter(({ english }) => foods.some(food => food.includes(normalized(english)) || normalized(english).includes(food)));
  const missing = terms.filter(term => !matched.includes(term));
  const portions = Number(raw.yield) || 1;
  const calories = Number(raw.calories);
  const gi = Number(raw.glycemicIndex);
  return { uri: raw.uri, title: raw.label.slice(0, 150), mealTypes: Array.isArray(raw.mealType) ? raw.mealType.filter(value => ['Breakfast', 'Lunch', 'Dinner'].includes(value)).slice(0, 3) : [], image: safeUrl(raw.image), source: String(raw.source || '').slice(0, 100),
    sourceUrl: safeUrl(raw.url), servings: portions, time: Number(raw.totalTime) || null,
    healthLabels: Array.isArray(raw.healthLabels) ? raw.healthLabels.filter(x => typeof x === 'string').slice(0, 80) : [],
    caloriesPerServing: Number.isFinite(calories) ? Math.round(calories / portions) : null,
    glycemicIndex: raw.glycemicIndex != null && Number.isFinite(gi) ? gi : null,
    ingredientLines: Array.isArray(raw.ingredientLines) ? raw.ingredientLines.filter(x => typeof x === 'string').slice(0, 35) : [],
    ingredients: Array.isArray(raw.ingredients) ? raw.ingredients.slice(0, 35).map(i => ({ food: String(i.food || ''), quantity: Number(i.quantity) || 0, measure: i.measure || '', aisle: i.foodCategory || '' })) : [],
    matched: matched.map(x => x.id), missing: missing.map(x => x.id),
    co2Class: raw.co2EmissionsClass || null, totalCO2Emissions: Number.isFinite(raw.totalCO2Emissions) ? raw.totalCO2Emissions : null,
    nutrientsPerServing: Object.fromEntries([['saturatedFatG', 'FASAT'], ['sodiumMg', 'NA'], ['sugarG', 'SUGAR'],
      ['proteinG', 'PROCNT'], ['carbohydratesG', 'CHOCDF'], ['fatG', 'FAT'], ['fiberG', 'FIBTG']].map(([name, code]) =>
      [name, Number.isFinite(Number(raw.totalNutrients?.[code]?.quantity)) ? Number(raw.totalNutrients[code].quantity) / portions : null])),
  };
}
export function createEdamam({ appId, appKey, fetchImpl = fetch, now = Date.now } = {}) {
  const calls = [];
  const check = () => { if (!appId || !appKey) throw new AppError('EDAMAM_UNCONFIGURED', 'Configura EDAMAM_APP_ID y EDAMAM_APP_KEY en el servidor.', 503);
    while (calls.length && now() - calls[0] >= 60000) calls.shift();
    if (calls.length >= 9) throw new AppError('EDAMAM_RATE_LIMIT', 'Edamam permite 10 llamadas por minuto. Espera un momento.', 429);
    calls.push(now()); };
  async function call(url, options = {}) {
    check(); let response;
    try { response = await fetchImpl(url, { ...options, headers: { 'Accept-Language': 'en', ...(options.headers || {}) }, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) }); }
    catch { throw new AppError('EDAMAM_UNAVAILABLE', 'No se pudo conectar con Edamam. Inténtalo de nuevo.', 502); }
    if (!response.ok) throw new AppError(response.status === 429 ? 'EDAMAM_QUOTA' : 'EDAMAM_UNAVAILABLE',
      response.status === 429 ? 'Edamam alcanzó su límite de llamadas. Espera un momento.' : 'Edamam no pudo entregar las recetas. Revisa la configuración y vuelve a intentar.', response.status === 429 ? 429 : 502);
    try { return await response.json(); } catch { throw new AppError('EDAMAM_RESPONSE', 'Edamam devolvió una respuesta no válida.', 502); }
  }
  function lookupUrl(uri) { const url = new URL('https://api.edamam.com/api/recipes/v2/by-uri');
    url.searchParams.set('app_id', appId); url.searchParams.set('app_key', appKey); url.searchParams.set('uri', validateEdamamUri(uri));
    for (const field of fields) url.searchParams.append('field', field); return url; }
  return {
    async search(input, plan, signal) {
      const data = await call(makeSearchUrl(input, plan, appId, appKey), { signal });
      const requiredLabels = edamamFilters(input).health.map(normalized);
      const activeLimits = Object.entries({ saturatedFatG: input.nutritionLimits?.maxSaturatedFatG,
        sodiumMg: input.nutritionLimits?.maxSodiumMg, sugarG: input.nutritionLimits?.maxSugarG }).filter(([, limit]) => Boolean(limit));
      const previous = new Set((input.history || []).flatMap(message => message.edamamRefs || []).map(ref => ref.uri));
      const recipes = (data.hits || []).filter(hit => requiredLabels.every(label =>
        (hit.recipe?.healthLabels || []).some(actual => normalized(actual) === label)))
        .map(hit => shapeRecipe(hit.recipe, plan.terms)).filter(Boolean)
        .filter(recipe => !previous.has(recipe.uri))
        .filter(recipe => activeLimits.every(([name, limit]) => recipe.nutrientsPerServing[name] == null || recipe.nutrientsPerServing[name] <= Number(limit)))
        .map(recipe => ({ ...recipe, nutritionLimitsUnverified: activeLimits.some(([name]) => recipe.nutrientsPerServing[name] == null) }))
        .filter(recipe => recipe.missing.length <= 2).sort((a, b) => a.missing.length - b.missing.length)
        .filter((recipe, index, list) => list.findIndex(other => other.uri === recipe.uri || normalized(other.title) === normalized(recipe.title)) === index)
        .slice(0, 2);
      return { recipes, count: Number(data.count) || 0 };
    },
    async detail(uri, signal) { const data = await call(lookupUrl(uri), { signal });
      const recipe = (data.hits || []).map(hit => shapeRecipe(hit.recipe)).find(Boolean);
      if (!recipe) throw new AppError('RECIPE_UNAVAILABLE', 'Esta receta ya no está disponible en Edamam.', 404);
      return recipe; },
    async shopping(uri, servings, signal) { validateEdamamUri(uri);
      if (!Number.isInteger(servings) || servings < 1 || servings > 12) throw new AppError('INVALID_SERVINGS', 'Elige entre 1 y 12 porciones.');
      const url = new URL('https://api.edamam.com/api/shopping-list/v2'); url.searchParams.set('app_id', appId); url.searchParams.set('app_key', appKey);
      url.searchParams.set('beta', 'true'); url.searchParams.set('shopping-cart', 'true');
      const data = await call(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: [{ quantity: servings, measure: 'http://www.edamam.com/ontologies/edamam.owl#Measure_serving', item: uri }] }), signal });
      return { items: (data.entries || []).slice(0, 80).map(entry => ({ food: String(entry.food || '').slice(0, 100), aisle: String(entry.foodCategory || '').slice(0, 80), quantities: (entry.quantities || []).slice(0, 4).map(q => ({ quantity: Number(q.quantity) || 0, measure: String(q.measure || ''), qualifiers: Array.isArray(q.qualifiers) ? q.qualifiers.slice(0, 3) : [] })) })), cartUrl: safeUrl(data._links?.['shopping-cart']?.href) };
    },
  };
}
