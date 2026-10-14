import { foodKey, normalizeName } from '../src/ingredient-utils.js';
import { getUsdaFood, searchUsdaFoods } from './nutrition.js';

// Reviewed generic FoodData Central records. Product-specific foods still need
// their own label data; these records are estimates for unbranded ingredients.
const baseFdcIds = {
  arroz: 169756, frijoles: 173735, aguacate: 171705, tomate: 2709719,
  limon: 167747, cilantro: 169997, huevo: 171287, pollo: 171077,
  tortilla: 2707823, queso: 2705745, espinaca: 168462, avena: 2708489,
  banano: 173944, leche: 2705385,
};
const namedFdcIds = {
  'nuez': 170187, 'nueces': 170187, 'nueces de nogal': 170187,
  'mantequilla': 173430, 'mantequilla sin sal': 173430,
  'harina': 169761, 'harina de trigo': 169761, 'harina de trigo blanca': 169761,
  'azucar': 169655, 'azucar blanca': 169655, 'azucar morena': 168833,
  'arandano': 171711, 'arandanos': 171711, 'arandanos azules': 171711,
  'brocoli': 170379, 'lechuga': 2709789, 'guisantes': 170419,
  'chicharos': 170419, 'col china': 170390, 'bok choy': 170390,
  'col rizada': 168421, 'kale': 168421, 'remolacha': 169145,
  'betabel': 169145, 'atun enlatado': 2706311, 'atun en lata': 2706311,
  'cebolla': 170000, 'zanahoria': 170393, 'papa': 170026,
  'patata': 170026, 'ajo': 2709786, 'pepino': 2346406,
  'coliflor': 169986, 'repollo': 169975, 'pimiento rojo': 170108,
  'pimenton rojo': 170108, 'lentejas cocidas': 172421,
  'garbanzos cocidos': 173757, 'fresas': 167762, 'fresa': 167762,
  'manzana': 2709215, 'aceite de oliva': 2710186,
  'mani': 2515376, 'cacahuates': 2515376, 'camarones': 175179,
  'camaron': 175179, 'salmon': 2706284, 'carne molida': 2705853,
  'pasta seca': 168927, 'pan integral': 2707709,
  // Verified against FDC descriptions: table salt, raw sweet green pepper,
  // and a raw composite of beef retail cuts (lean + fat, all grades).
  'sal': 173468, 'sal de mesa': 173468,
  'chile verde': 170427, 'pimiento verde': 170427,
  'carne de res': 174757,
  'frijoles negros cocidos sin sal': 173735,
  'frijoles negros secos': 173734,
  'aceite de canola': 172336,
  'aceite de maiz': 171029,
  'aceite de soya': 171411,

};

const catalogGrams = {
  bowl: { arroz: 92, frijoles: 130, aguacate: 75, tomate: 120, limon: 15, cilantro: 2 },
  tostadas: { tortilla: 50, frijoles: 86, aguacate: 75, tomate: 120 },
  ensalada: { aguacate: 75, tomate: 240, limon: 15, cilantro: 2 },
  huevos: { huevo: 100, tomate: 120, tortilla: 50 },
  avena: { avena: 40, banano: 118, leche: 244 },
  quesadilla: { tortilla: 50, queso: 50, espinaca: 30 },
};
const unmatchedUntil = new Map();

export function estimatedGrams(recipeId, ingredientId, amount, source) {
  if (source === 'catalog') return catalogGrams[recipeId]?.[ingredientId] ?? null;
  const grams = String(amount || '').match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:g|gramos)\b/i);
  return grams ? Number(grams[1].replace(',', '.')) : null;
}

export function curatedFdcId(ingredientId, name) {
  return baseFdcIds[ingredientId] || baseFdcIds[foodKey(name)] || namedFdcIds[normalizeName(name)] || null;
}

export async function findAutomaticUsdaFood(item, apiKey, fetchImpl = fetch) {
  if (item.usda && Object.hasOwn(item.usda.nutrients || {}, 'fiber')) return null;
  if (item.usda?.fdcId) return getUsdaFood(item.usda.fdcId, apiKey, fetchImpl);
  const curated = curatedFdcId(item.ingredientId, item.name);
  if (curated) return getUsdaFood(curated, apiKey, fetchImpl);
  if (['frijoles negros', 'aceite vegetal'].includes(normalizeName(item.name))) return null;
  if ((unmatchedUntil.get(item.ingredientId) || 0) > Date.now()) return null;
  // Conservative fallback for an English or already translated custom name.
  // A broad or branded search hit is not silently treated as the same food.
  const candidates = await searchUsdaFoods(item.name, apiKey, fetchImpl);
  const wanted = normalizeName(item.name);
  const exact = candidates.find((food) => food.dataType !== 'Branded' && normalizeName(food.description) === wanted);
  if (!exact) unmatchedUntil.set(item.ingredientId, Date.now() + 24 * 60 * 60 * 1000);
  return exact ? getUsdaFood(exact.fdcId, apiKey, fetchImpl) : null;
}

export async function resolveAutomaticUsdaLinks(store, items, apiKey, fetchImpl = fetch) {
  const missing = items.filter((item) => !item.usda || !Object.hasOwn(item.usda.nutrients || {}, 'fiber'));
  if (!apiKey) return { unavailable: missing.length > 0, unmatched: missing.map((item) => item.name) };
  const results = [];
  for (let offset = 0; offset < missing.length; offset += 4) {
    results.push(...await Promise.allSettled(missing.slice(offset, offset + 4).map(async (item) => {
      const food = await findAutomaticUsdaFood(item, apiKey, fetchImpl);
      if (food) await store.setIngredientUsda(item.ingredientId, food);
      return Boolean(food);
    })));
  }
  return {
    unavailable: results.some((result) => result.status === 'rejected'),
    unmatched: missing.filter((item, index) => results[index].status !== 'fulfilled' || !results[index].value).map((item) => item.name),
  };
}

export function nutritionReferenceNotes(items) {
  const notes = {
    173468: 'Sal: se usa la ficha de sal de mesa.',
    170427: 'Chile verde: se usa pimiento dulce verde crudo.',
    174757: 'Carne de res: se usa una referencia de varios cortes crudos, con carne y grasa. El corte real puede cambiar los valores.',
  };
  return [...new Set(items.map(item => notes[item.usda?.fdcId]).filter(Boolean))];
}
