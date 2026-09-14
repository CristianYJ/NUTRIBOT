// Explicit live test. Uses the Google API quota; never runs as part of npm test.
import { config } from "./config.js";
import { parseInput } from "./recipes.js";
import { generateWithGemini } from "./gemini.js";
const input = parseInput({
  pantry: ["arroz", "frijoles", "aguacate", "tomate", "limon", "cilantro"],
  profile: { diet: "Vegana", allergies: [], needsReview: false },
  maxTime: 30,
  message: "Dame una receta casera con estos ingredientes para una persona.",
});
try {
  const result = await generateWithGemini(input, config);
  if (result.type !== "success")
    throw new Error("No se recibió una receta en la prueba.");
  console.log(
    JSON.stringify({
      ok: true,
      provider: result.source,
      model: result.model,
      titles: result.recipes.map((r) => r.title),
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      code: error.code || "SMOKE_FAILED",
      message: error.message,
    }),
  );
  process.exitCode = 1;
}
