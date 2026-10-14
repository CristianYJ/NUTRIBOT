import { normalizeName } from '../src/ingredient-utils.js';
import { calculateRecipeNutrition, nutrientFields } from './nutrition.js';
import { resolveAutomaticUsdaLinks } from './auto-nutrition.js';

// Descriptions checked against the official FDC API. No nutrient values are stored here.
const choices = {
  'frijoles negros': {
    question: '¿Cómo están tus frijoles negros?', query: 'Beans black',
    options: [
      { fdcId: 173735, label: 'Cocidos en agua, sin sal añadida' },
      { fdcId: 173734, label: 'Secos / crudos' },
    ],
  },
  'aceite vegetal': {
    question: '¿De qué tipo es tu aceite? Revisa la etiqueta.', query: 'Oil vegetable',
    options: [
      { fdcId: 172336, label: 'Canola' },
      { fdcId: 171025, label: 'Girasol (convencional, rico en linoleico)' },
      { fdcId: 171029, label: 'Maíz' },
      { fdcId: 171411, label: 'Soya', allergen: 'Soya' },
    ],
  },
};
export function hasCompleteNutrients(food) {
  return Boolean(food && Number.isSafeInteger(food.fdcId) && food.fdcId > 0 && Object.keys(nutrientFields)
    .every(field => typeof food.nutrients?.[field] === 'number' && Number.isFinite(food.nutrients[field]) && food.nutrients[field] >= 0));
}
export function nutritionQuestion(item, allergies = []) {
  const definition = choices[normalizeName(item.name)];
  const selected = definition?.options.find(option => option.fdcId === item.usda?.fdcId);
  return { ingredientId: item.ingredientId, name: item.name,
    question: definition?.question || `Confirma el alimento que corresponde a ${item.name}.`,
    query: definition?.query || '',
    options: (definition?.options || []).filter(option => !allergies.includes(option.allergen)),
    complete: hasCompleteNutrients(item.usda) && !allergies.includes(selected?.allergen),
    reference: item.usda ? { fdcId: item.usda.fdcId, description: item.usda.description } : null,
  };
}
export function referenceChoices(name) { return choices[normalizeName(name)]?.options || []; }

export async function requireRecipeNutrition(result, store, apiKey, fetchImpl, profile, retryText, mode) {
  if (result.type !== 'success' || !result.recipes?.length) return result;
  const ids = [...new Set(result.recipes.flatMap(recipe => recipe.ingredients))];
  let items = await store.getIngredientNutritionItems(ids);
  const deadline = AbortSignal.timeout(8000);
  const boundedFetch = (url, options = {}) => (fetchImpl || fetch)(url, { ...options,
    signal: options.signal ? AbortSignal.any([options.signal, deadline]) : deadline,
  });
  const lookup = await resolveAutomaticUsdaLinks(store, items, apiKey, boundedFetch);
  items = await store.getIngredientNutritionItems(ids);
  const byId = new Map(items.map(item => [item.ingredientId, item]));
  const missing = ids.filter(id => !byId.has(id) || !nutritionQuestion(byId.get(id), profile?.allergies).complete);
  const missingGrams = result.recipes.some(recipe => recipe.ingredients.some((_, index) =>
    !Number.isFinite(recipe.grams?.[index]) || recipe.grams[index] <= 0));
  if (missing.length || missingGrams) {
    const names = missing.map(id => byId.get(id)?.name || id);
    return { type: 'nutrition_setup', source: 'local', recipes: [], servings: result.servings,
      nutritionIngredientIds: missing, retryText, retryMode: mode,
      text: missing.length
        ? `Antes de completar la receta, necesito identificar estos alimentos: ${names.join(', ')}. Confirma cuáles usas para calcular con datos USDA.`
        : 'La propuesta no trajo todos los pesos necesarios. Vuelve a generar la receta para calcular sus nutrientes.',
      ...(lookup.unavailable ? { nutritionUnavailable: true } : {}),
    };
  }
  // Totals always come from FDC values and grams; provider-supplied nutrition is ignored.
  return { ...result, recipes: result.recipes.map(recipe => ({ ...recipe,
    nutrition: null,
    nutritionSummary: calculateRecipeNutrition(recipe.ingredients.map((id, index) => ({
      ...byId.get(id), gramsPerPerson: recipe.grams[index],
    })), result.servings || 1, profile),
  })) };
}
