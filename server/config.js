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
  model: process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite",
};
