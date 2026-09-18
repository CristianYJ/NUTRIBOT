import { recipes } from "./data.js";
export function requiresReview(profile) {
  return Boolean(profile.medicalNotes.trim() || profile.exclusions.trim());
}
export function matchesProfile(recipe, profile) {
  if (requiresReview(profile)) return false;
  if (recipe.allergens.some((a) => profile.allergies.includes(a))) return false;
  if (profile.diet === "Vegana" && !recipe.vegan) return false;
  if (profile.diet === "Vegetariana" && !recipe.vegan && !recipe.vegetarian)
    return false;
  return true;
}
export function availability(recipe, pantry) {
  const missing = recipe.ingredients.filter((id) => !pantry.includes(id));
  return {
    missing,
    available: recipe.ingredients.length - missing.length,
    total: recipe.ingredients.length,
  };
}
export function recommend(pantry, profile, maxTime = 60, catalog = recipes) {
  return catalog.filter(
    (r) =>
      matchesProfile(r, profile) &&
      r.time <= maxTime &&
      !availability(r, pantry).missing.length,
  );
}
// Adapter boundary: replace this demo provider with a server request in the AI phase.
// Never put provider credentials in a mobile build or VITE_* environment variable.
export function generateDemo({ pantry, profile, maxTime, message = "" }) {
  if (requiresReview(profile))
    return {
      type: "review",
      text: "Guardé tus indicaciones. Este simulacro no puede interpretar restricciones escritas ni recetas médicas. Las sugerencias quedan en pausa hasta que se revisen; no se ha validado compatibilidad clínica.",
      recipes: [],
    };
  if (
    /diabet|embaraz|renal|medic|alerg|intoler|sin\s|evitar|no\s+(puedo|como)|celiac|hiperten/i.test(
      message,
    )
  )
    return {
      type: "review",
      text: "Esa indicación necesita quedar registrada en tu perfil antes de buscar recetas. Usa las opciones de alergias o escribe la indicación para revisión. El simulacro no interpreta restricciones clínicas del chat.",
      recipes: [],
    };
  const result = recommend(pantry, profile, maxTime);
  return {
    type: result.length ? "success" : "empty",
    text: result.length
      ? `Encontré ${result.length === 1 ? "una idea" : result.length + " ideas"} del catálogo de demostración con tus ingredientes, dentro de ${maxTime} minutos. Apliqué los filtros seleccionados en tu perfil. Revisa las cantidades y etiquetas antes de cocinar.`
      : "Todavía no hay una receta del catálogo que combine tus ingredientes, filtros y tiempo. Prueba aumentando el tiempo o añade a tu despensa otros ingredientes que sí tengas.",
    recipes: result,
  };
}
