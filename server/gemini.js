import {
  AppError,
  allowedIngredients,
  buildPrompt,
  responseSchema,
  SYSTEM_INSTRUCTION,
  validateOutput,
} from "./recipes.js";

export async function generateStructured(
  { parts, instruction, schema },
  { apiKey, model = "gemini-3.5-flash-lite", fetchImpl = fetch, signal } = {},
) {
  if (!apiKey)
    throw new AppError(
      "MISSING_API_KEY",
      "Falta configurar GEMINI_API_KEY en el servidor. Guarda la clave en .env y reinicia Nutribot.",
      503,
    );
  if (!/^gemini-[a-z0-9.-]+$/.test(model))
    throw new AppError(
      "INVALID_MODEL",
      "La configuración del modelo Gemini no es válida.",
      503,
    );
  let response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
          : AbortSignal.timeout(45000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 3000,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
          },
        }),
      },
    );
  } catch {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "No se pudo completar la conexión con Gemini. Revisa la conexión a Internet e inténtalo de nuevo.",
      502,
    );
  }
  if (!response.ok) {
    // Never forward provider error bodies, URLs, headers, keys or user content.
    const errors = {
      400: [
        "PROVIDER_REQUEST_REJECTED",
        "Google rechazó la solicitud. Revisa la clave y la configuración del modelo en el servidor.",
      ],
      401: [
        "INVALID_API_KEY",
        "Google no aceptó la clave API. Revisa la clave guardada y reinicia Nutribot.",
      ],
      403: [
        "PROVIDER_FORBIDDEN",
        "Google no autorizó esta solicitud. Revisa los permisos y restricciones de la clave en AI Studio.",
      ],
      404: [
        "MODEL_UNAVAILABLE",
        "El modelo configurado no está disponible para esta clave.",
      ],
      429: [
        "PROVIDER_QUOTA",
        "Google indicó que se alcanzó el límite de solicitudes o la cuota disponible. Revisa el uso en AI Studio antes de reintentar.",
      ],
    };
    const [code, text] = errors[response.status] || [
      "PROVIDER_UNAVAILABLE",
      "Gemini no está disponible en este momento. Inténtalo más tarde.",
    ];
    throw new AppError(code, text, response.status === 429 ? 429 : 502);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new AppError(
      "INVALID_AI_OUTPUT",
      "Gemini devolvió una respuesta que no se pudo leer.",
      502,
    );
  }
  const candidate = data.candidates?.[0];
  if (!candidate || candidate.finishReason !== "STOP")
    throw new AppError(
      "AI_INCOMPLETE",
      "Gemini no completó una receta utilizable. No se mostrará una respuesta parcial.",
      502,
    );
  let output;
  try {
    output = JSON.parse(
      candidate.content.parts
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join(""),
    );
  } catch {
    throw new AppError(
      "INVALID_AI_OUTPUT",
      "Gemini devolvió un formato inesperado. Vuelve a intentarlo.",
      502,
    );
  }
  return { output, model };
}

export async function generateWithGemini(input, config = {}) {
  // Keep schema enum values short; database UUIDs can exceed the provider's
  // structured-output grammar budget when repeated in a nested recipe array.
  const wireIds = new Map(allowedIngredients(input).map((id, index) =>
    [id, id.startsWith("food-") ? `custom${index}` : id]));
  const databaseIds = new Map([...wireIds].map(([id, wire]) => [wire, id]));
  const prompt = JSON.parse(buildPrompt(input));
  prompt.ingredientesPermitidos = prompt.ingredientesPermitidos.map(item =>
    ({ ...item, id: wireIds.get(item.id) }));
  const { output, model } = await generateStructured({
    parts: [{ text: JSON.stringify(prompt) }],
    instruction: SYSTEM_INSTRUCTION + " Todos los elementos de ingredientesPermitidos están disponibles. Los identificadores customN corresponden a alimentos agregados por el usuario: interpreta su nombre y úsalos normalmente en las recetas. En cantidades y pasos conserva el nombre completo cuando distingue una variedad o estado (por ejemplo, arroz cocido).",
    schema: responseSchema([...wireIds.values()]),
  }, config);
  if (Array.isArray(output?.recipes)) {
    for (const recipe of output.recipes) {
      if (Array.isArray(recipe?.ingredients))
        recipe.ingredients = recipe.ingredients.map(id => databaseIds.get(id) || id);
    }
  }
  return validateOutput(output, input, model);
}
