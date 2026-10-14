const ids = values => (Array.isArray(values) ? values : []).filter(id => typeof id === "string" && id.length <= 100);
// Only cooking dialogue crosses the recipe API; never photos or profile fields.
export function recipeContext(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter(m => m && ["user", "bot"].includes(m.role) && typeof m.text === "string" && m.type !== "error")
    .slice(-12).map(m => ({
      role: m.role, text: m.text.slice(0, 1000),
      ...(Number.isInteger(m.servings) && m.servings >= 1 && m.servings <= 12 ? { servings: m.servings } : {}),
      recipeIds: ids(m.recipeIds || (Array.isArray(m.recipes) ? m.recipes.map(r => r?.id) : [])).slice(0, 2),
      ...(Array.isArray(m.missingIngredients) ? { missingIngredients: ids(m.missingIngredients).slice(0, 14) } : {}),
    }));
}
