import { ingredients, allergyOptions } from "./data.js";
import { foodKey } from "./ingredient-utils.js";

export const foodRules = {
  leche: { allergens: ["Leche"], animal: true },
  queso: { allergens: ["Leche"], animal: true },
  huevo: { allergens: ["Huevo"], animal: true },
  pollo: { allergens: [], animal: true, meat: true },
  avena: { allergens: ["Trigo / gluten"] },
};
const normalize = (value) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const exclusions = new Map();
for (const item of ingredients) {
  exclusions.set(normalize(item.id), [item.id]);
  exclusions.set(normalize(item.name), [item.id]);
}
for (const allergy of allergyOptions) {
  const ids = ingredients.filter((item) =>
    foodRules[item.id]?.allergens?.includes(allergy)).map((item) => item.id);
  const key = normalize(allergy);
  // Prefer the broader allergen filter (e.g. leche excludes queso too).
  exclusions.set(key, ids);
  for (const alias of key.split(" / ")) exclusions.set(alias, ids);
}
for (const [alias, ids] of Object.entries({
  huevos: ["huevo"], quesos: ["queso"], lacteos: ["leche", "queso"],
  palta: ["aguacate"], banana: ["banano"], frijol: ["frijoles"],
  "pan blanco": [], pan: [], "pan integral": [],
})) exclusions.set(alias, ids);

// Accept only complete, known food names, never guess a medical instruction.
// Unknown instructions remain pending; catalog names can be excluded directly.
export function profileRestrictions(profile, catalog = ingredients) {
  const rules = new Map(exclusions);
  for (const item of catalog) {
    const name = normalize(item.name);
    if (!rules.has(name) || !rules.get(name).includes(item.id))
      rules.set(name, [...new Set([...(rules.get(name) || []), item.id])]);
    for (const allergen of ingredientRule(item).allergens || []) {
      for (const alias of [normalize(allergen), ...normalize(allergen).split(" / "), ...(allergen === "Leche" ? ["lacteos"] : [])])
        rules.set(alias, [...new Set([...(rules.get(alias) || []), item.id])]);
    }
  }
  const text = normalize(profile.exclusions || "");
  const parts = text ? text.split(/[,;\n]+|\s+y\s+/).map((part) =>
    part.trim().replace(/^(?:sin|evito|evitar|no como)\s+/, "")) : [];
  const resolve = (part) => rules.has(part) ? rules.get(part)
    : catalog.filter(item => foodKey(item.name) === foodKey(part)).map(item => item.id);
  const unknown = parts.some((part) => !rules.has(part) && !resolve(part).length);
  const excludedIngredients = [...new Set(parts.flatMap(resolve))];
  const reason = profile.medicalNotes?.trim()
    ? 'El campo “Indicaciones de mi profesional” contiene texto. Nutribot no puede interpretar esas indicaciones. Revísalo en tu perfil; si lo llenaste por error, corrígelo y guarda los cambios.'
    : unknown
      ? 'No pude reconocer todos los alimentos de “Otros alimentos que evito”. Escribe nombres como huevo, queso o pan blanco, separados por comas. Las indicaciones clínicas necesitan revisión.'
      : "";
  return { excludedIngredients, needsReview: Boolean(reason), reason };
}

export const ingredientRule = (item) => foodRules[item?.id] || item || {};
