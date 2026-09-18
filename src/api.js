export async function requestRecipe({ maxTime, message, signal, revision }) {
  let response;
  try {
    response = await fetch("/api/recipes/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(55000)]),
      body: JSON.stringify({
        maxTime,
        message,
        revision,
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

export async function stateRequest(method = "GET", body, signal) {
  let response;
  try {
    response = await fetch("/api/state", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
        : AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error(
      "No se pudo conectar para guardar o cargar tus datos. Comprueba que el servidor siga abierto.",
    );
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.text || "No se pudieron guardar tus datos.");
    error.code = data.error;
    throw error;
  }
  return data;
}
