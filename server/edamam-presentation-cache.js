import { createHash } from 'node:crypto';
import { validateEdamamUri } from './edamam.js';
import { mealLabel, validatePresentationInput } from './edamam-presentation.js';

const version = 1;
const fingerprint = value => createHash('sha256').update(JSON.stringify([version, value])).digest('hex');
const detailHash = recipe => fingerprint([recipe.title, recipe.ingredientLines, recipe.time, recipe.meal, recipe.mealTypes]);

export async function getCachedRecipePresentation(input, store) {
  if (!input?.uri || !store?.getEdamamPresentation) return null;
  let recipe;
  try { recipe = validatePresentationInput(input); } catch { return null; }
  return store.getEdamamPresentation(validateEdamamUri(input.uri), 'detail', detailHash(recipe));
}

export async function cachedRecipePresentation(input, options, store, present) {
  const recipe = validatePresentationInput(input);
  if (!input.uri || !store?.getEdamamPresentation || !store?.saveEdamamPresentation)
    return present(recipe, options);
  const uri = validateEdamamUri(input.uri);
  const kind = input.kind === 'shopping' ? 'shopping' : 'detail';
  const hash = detailHash(recipe);
  const cached = await store.getEdamamPresentation(uri, kind, hash);
  if (cached) return cached;
  const result = await present(recipe, options);
  await store.saveEdamamPresentation({ uri, title: recipe.title, kind, hash, ...result });
  return result;
}

export async function cachedChoicePresentations(recipes, mealType, options, store, present) {
  if (!recipes.length) return [];
  if (!store?.getEdamamPresentation || !store?.saveEdamamPresentation || recipes.some(recipe => !recipe.uri))
    return present(recipes, mealType, options);
  const keys = recipes.map(recipe => ({
    uri: validateEdamamUri(recipe.uri), title: recipe.title,
    hash: fingerprint([recipe.title, recipe.mealTypes, mealType]),
  }));
  const cached = await Promise.all(keys.map(key => store.getEdamamPresentation(key.uri, 'choice', key.hash)));
  const missing = recipes.map((recipe, index) => cached[index] ? null : { recipe, index }).filter(Boolean);
  if (missing.length) {
    const generated = await present(missing.map(item => item.recipe), mealType, options);
    if (generated.length !== missing.length) throw new Error('La traducción no coincide con las recetas.');
    await Promise.all(missing.map(async (item, index) => {
      const result = generated[index];
      cached[item.index] = result;
      await store.saveEdamamPresentation({ ...keys[item.index], kind: 'choice',
        titleEs: result.titleEs, meal: result.meal });
    }));
  }
  return cached.map(value => ({ titleEs: value.titleEs, meal: mealLabel(mealType) || value.meal }));
}
