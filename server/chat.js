import { MAX_CHAT_MESSAGES } from "../src/conversation-limits.js";
import { AppError } from "./recipes.js";
import { validateRevision } from "./state-validation.js";
const string = (value, max) => typeof value === "string" && value.length <= max;
export function validateChat(raw) {
  validateRevision(raw?.revision);
  if (
    !Array.isArray(raw.messages) ||
    raw.messages.length > MAX_CHAT_MESSAGES ||
    !string(raw.draft, 500) ||
    ![15, 30, 60].includes(raw.maxTime) ||
    typeof raw.busy !== "boolean"
  )
    throw new AppError("INVALID_CHAT", "No se pudo guardar esta conversación.");
  const seen = new Set();
  const messages = raw.messages.map((message) => {
    if (
      !message ||
      !string(message.id, 100) ||
      !message.id ||
      seen.has(message.id) ||
      !["user", "bot"].includes(message.role) ||
      !string(message.text, 6000)
    )
      throw new AppError(
        "INVALID_CHAT",
        "Un mensaje no tiene un formato válido.",
      );
    seen.add(message.id);
    const recipeIds = message.recipeIds || [];
    const names = message.ingredientNames || [];
    if (
      !Array.isArray(recipeIds) ||
      recipeIds.length > 2 ||
      recipeIds.some((id) => !string(id, 100)) ||
      !Array.isArray(names) ||
      names.length > 20 ||
      names.some((name) => !string(name, 80))
    )
      throw new AppError(
        "INVALID_CHAT",
        "Los ingredientes o recetas del mensaje no son válidos.",
      );
    return {
      id: message.id,
      role: message.role,
      text: message.text,
      recipeIds,
      type: ["success", "review", "error", "empty", "notice"].includes(
        message.type,
      )
        ? message.type
        : "notice",
      source: message.source === "gemini" ? "gemini" : "local",
      ...(string(message.retryText, 500)
        ? { retryText: message.retryText }
        : {}),
      ...(typeof message.createdAt === "string" &&
      Number.isFinite(Date.parse(message.createdAt))
        ? { createdAt: new Date(message.createdAt).toISOString() }
        : {}),
      ...(names.length ? { ingredientNames: names } : {}),
    };
  });
  return {
    revision: raw.revision,
    messages,
    draft: raw.draft,
    maxTime: raw.maxTime,
    busy: raw.busy,
  };
}
