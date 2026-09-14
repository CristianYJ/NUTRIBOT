export async function requestRecipe({
  pantry,
  profile,
  maxTime,
  message,
  signal,
}) {
  let response;
  try {
    response = await fetch("/api/recipes/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(55000)]),
      body: JSON.stringify({
        pantry,
        maxTime,
        message,
        profile: {
          diet: profile.diet,
          allergies: profile.allergies,
          needsReview: Boolean(
            profile.exclusions.trim() || profile.medicalNotes.trim(),
          ),
        },
      }),
    });
  } catch {
    if (signal.aborted)
      throw new DOMException("Solicitud cancelada", "AbortError");
    throw new Error(
      "No se pudo conectar con el servidor de Nutribot. Comprueba que npm run dev siga abierto e inténtalo de nuevo.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "El servidor no devolvió una respuesta válida. Comprueba que esté iniciado.",
    );
  }
  if (!response.ok)
    throw new Error(
      result.text || "No se pudo generar la receta. Inténtalo de nuevo.",
    );
  if (!Array.isArray(result.recipes) || typeof result.text !== "string")
    throw new Error("La respuesta del servidor no tiene el formato esperado.");
  return result;
}
