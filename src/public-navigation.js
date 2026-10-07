export const landingSections = [
  "welcome",
  "como-funciona",
  "beneficios-impacto",
  "comparativa",
  "modelo-respaldo",
  "planes",
  "privacidad",
];
export function publicPage(hash) {
  return !hash || hash === "#" || landingSections.includes(hash.slice(1))
    ? "landing"
    : "auth";
}
