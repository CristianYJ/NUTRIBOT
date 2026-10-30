import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
try {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT")
    throw new Error("No se pudo cargar el archivo local .env.");
}
export const config = {
  apiKey: process.env.GEMINI_API_KEY?.trim(),
  usdaApiKey: process.env.USDA_API_KEY?.trim(),
  edamamAppId: process.env.EDAMAM_APP_ID?.trim(),
  edamamAppKey: process.env.EDAMAM_APP_KEY?.trim(),
  adminEmail: process.env.NUTRIBOT_ADMIN_EMAIL?.trim().toLowerCase(),
  model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
};
