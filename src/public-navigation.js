export const landingSections = [
  "welcome",
  "como-funciona",
  "beneficios-impacto",
  "comparativa",
  "modelo-respaldo",
  "planes",
  "privacidad",
];
export const privacySectionIds = [
  "privacy-main", "responsable", "datos", "uso", "gemini", "edamam", "usda", "cookies",
  "conservacion", "derechos", "cambios",
];
export function publicPage(hash) {
  if (hash === "#politica-privacidad" || privacySectionIds.includes(hash.slice(1))) return "privacy";
  return !hash || hash === "#" || landingSections.includes(hash.slice(1))
    ? "landing"
    : "auth";
}
