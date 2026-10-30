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
  "conservacion", "derechos", "normativa", "cambios",
];
export function publicPage(hash) {
  if (hash === '#restablecer' || /^#restablecer\/[a-f0-9]{64}$/.test(hash)) return 'reset';
  if (hash === "#politica-privacidad" || privacySectionIds.includes(hash.slice(1))) return "privacy";
  return !hash || hash === "#" || landingSections.includes(hash.slice(1))
    ? "landing"
    : "auth";
}
