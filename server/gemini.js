import {
  AppError,
  allowedIngredients,
  eligibleIngredients,
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
  const scopes = ["pantry", "catalog"];
  let repair = false;
  let issues = [];
  for (const scope of scopes) {
    const ids = scope === "pantry" ? allowedIngredients(input) : eligibleIngredients(input);
    if (!ids.length) continue;
    // Short aliases keep custom UUIDs out of the provider's schema grammar.
    const wireIds = new Map(ids.map((id, index) =>
      [id, id.startsWith("food-") ? `custom${index}` : id]));
    const databaseIds = new Map([...wireIds].map(([id, wire]) => [wire, id]));
    const prompt = JSON.parse(buildPrompt(input, scope));
    prompt.ingredientesPermitidos = prompt.ingredientesPermitidos.map(item =>
      ({ ...item, id: wireIds.get(item.id) }));
    prompt.ingredientesEnDespensa = prompt.ingredientesEnDespensa.map(id => wireIds.get(id));
    prompt.referenciasNutricionales = prompt.referenciasNutricionales.filter(item => wireIds.has(item.id)).map(item => ({ ...item, id: wireIds.get(item.id) }));
    prompt.faltantesConfirmados = prompt.faltantesConfirmados.map(id => wireIds.get(id)).filter(Boolean);
    if (repair) prompt.problemasDetectados = issues.map(issue => ({
      reason: issue.reason,
      ...(issue.ingredientId && wireIds.has(issue.ingredientId) ? { ingredientId: wireIds.get(issue.ingredientId) } : {}),
    }));
    if (repair) prompt.correccion = "La receta anterior no pasó la validación. Regenera usando solo los IDs permitidos; declara todos los ingredientes mencionados, cantidades y gramos coherentes y no incluyas extras en los pasos.";
    const { output, model } = await generateStructured({
      parts: [{ text: JSON.stringify(prompt) }],
      instruction: SYSTEM_INSTRUCTION + " Los identificadores customN corresponden a alimentos agregados por el usuario: interpreta su nombre y úsalos normalmente en las recetas. En cantidades y pasos conserva el nombre completo cuando distingue una variedad o estado (por ejemplo, arroz cocido).",
      schema: responseSchema([...wireIds.values()]),
    }, config);
    if (Array.isArray(output?.recipes)) {
      for (const recipe of output.recipes) {
        if (Array.isArray(recipe?.ingredients))
          recipe.ingredients = recipe.ingredients.map(id => databaseIds.get(id) || id);
      }
    }
    let result;
    try {
      result = validateOutput(output, input, model, scope);
    } catch (error) {
      if (scope === "pantry" && !repair && error.code === "INVALID_AI_OUTPUT") {
        scopes[1] = "pantry";
        repair = true;
        issues = error.validationIssues || [];
        continue;
      }
      throw error;
    }
    if (result.type === "review" || result.type === "out_of_scope" || result.type === "conversation") return result;
    if (result.type !== "success") continue;
    const seen = new Set((input.previous || []).map((title) => title.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
    result.recipes = result.recipes.filter((recipe) => {
      const title = recipe.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(title)) return false;
      seen.add(title);
      return true;
    });
    if (result.recipes.length) {
      const ready = result.recipes.filter(recipe => recipe.ingredients.every(id => input.pantry.includes(id) || input.approvedMissing?.includes(id)));
      if (ready.length) result.recipes = ready;
      const missing = [...new Set(result.recipes.flatMap(recipe => recipe.ingredients))]
        .filter(id => !input.pantry.includes(id) && !input.approvedMissing?.includes(id));
      if (missing.length) {
        const names = missing.map(id => input.catalog.find(item => item.id === id)?.name || id);
        return { type: "conversation", source: "gemini", model: result.model,
          servings: result.servings, recipes: [], missingIngredients: missing,
          text: `Con tu despensa no encontré una opción que cumpla la petición. Para preparar ${result.recipes[0].title} faltarían: ${names.join(", ")}. ¿Puedes conseguirlos o prefieres que busquemos otro plato con lo que tienes?` };
      }
      result.text = result.recipes.some((recipe) => recipe.ingredients.some((id) => !input.pantry.includes(id)))
        ? `Encontré una alternativa cercana. Te indico qué ingredientes faltan para prepararla. Revisa cantidades, preparación y etiquetas.${input.hasProfessionalNotes ? " Las indicaciones escritas de tu profesional no se verificaron automáticamente." : ""}`
        : result.text;
      return result;
    }
  }
  return { type: "empty", source: "gemini", text: "No encontré otra receta distinta que cumpla tus filtros y el tiempo indicado. Prueba ampliar el tiempo o tu despensa.", recipes: [] };
}
