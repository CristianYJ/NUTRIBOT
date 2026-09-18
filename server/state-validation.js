import { ingredients, allergyOptions } from "../src/data.js";
import { AppError } from "./recipes.js";

export const goals = [
  "Comer más variado",
  "Aprovechar mis ingredientes",
  "Mantener mi peso",
  "Bajar de peso",
  "Aumentar de peso",
];
export const diets = ["Sin preferencia", "Vegetariana", "Vegana"];
const ids = new Set(ingredients.map((i) => i.id));
const string = (s, max) => typeof s === "string" && s.length <= max;
const measurement = (s, min, max) =>
  string(s, 12) &&
  (s === "" ||
    (s.trim() !== "" &&
      Number.isFinite(Number(s)) &&
      Number(s) >= min &&
      Number(s) <= max));
const unique = (a, max, accepts) =>
  Array.isArray(a) &&
  a.length <= max &&
  new Set(a).size === a.length &&
  a.every(accepts);
export function validateRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new AppError(
      "INVALID_STATE",
      "La versión de los datos no es válida.",
    );
}
export function validateState(raw) {
  const p = raw?.profile;
  validateRevision(raw?.revision);
  if (
    !p ||
    !string(p.name, 35) ||
    !p.name.trim() ||
    !measurement(p.weight, 20, 400) ||
    !measurement(p.height, 80, 250) ||
    !goals.includes(p.goal) ||
    !diets.includes(p.diet) ||
    !string(p.exclusions, 1000) ||
    !string(p.medicalNotes, 2000) ||
    !unique(p.allergies, allergyOptions.length, (a) =>
      allergyOptions.includes(a),
    ) ||
    !unique(raw.pantry, ids.size, (id) => ids.has(id)) ||
    !unique(raw.saved, 1000, (id) => string(id, 100) && id.length > 0) ||
    !raw.feedback ||
    Array.isArray(raw.feedback) ||
    typeof raw.feedback !== "object" ||
    Object.keys(raw.feedback).length > 1000 ||
    Object.entries(raw.feedback).some(
      ([id, value]) =>
        !id.length || id.length > 100 || typeof value !== "boolean",
    ) ||
    Object.hasOwn(raw, "generated")
  ) {
    throw new AppError(
      "INVALID_STATE",
      "Revisa el perfil, la despensa y las recetas guardadas. Las recetas de IA se guardan desde el servidor.",
    );
  }
  return {
    revision: raw.revision,
    profile: {
      name: p.name.trim(),
      weight: p.weight,
      height: p.height,
      goal: p.goal,
      diet: p.diet,
      allergies: [...p.allergies],
      exclusions: p.exclusions.trim(),
      medicalNotes: p.medicalNotes.trim(),
    },
    pantry: [...raw.pantry],
    saved: [...raw.saved],
    feedback: { ...raw.feedback },
  };
}
