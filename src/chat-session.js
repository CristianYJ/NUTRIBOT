const key = "nutribot.chat.v1";

// Only this tab's session stores conversation text. Recipe details come from PostgreSQL.
export function readChat(storage, recipes) {
  const empty = { messages: [], draft: "", maxTime: 30 };
  try {
    const saved = JSON.parse(storage.getItem(key));
    if (!saved || !Array.isArray(saved.messages)) return empty;
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const messages = saved.messages.slice(-40).filter((m) =>
      ["user", "bot"].includes(m.role) && typeof m.text === "string" && typeof m.id === "string"
    ).map((m) => ({
      ...m,
      recipes: (Array.isArray(m.recipeIds) ? m.recipeIds : []).map((id) => byId.get(id)).filter(Boolean),
    }));
    if (saved.busy) messages.push({
      id: crypto.randomUUID(), role: "bot", source: "local", type: "notice", recipes: [],
      text: "La página se recargó durante la solicitud. Revisa Mis recetas antes de volver a pedirla; puede haberse guardado allí.",
    });
    return { messages, draft: typeof saved.draft === "string" ? saved.draft.slice(0, 500) : "", maxTime: [15, 30, 60].includes(saved.maxTime) ? saved.maxTime : 30 };
  } catch { return empty; }
}

export function writeChat(storage, { messages, draft, maxTime, busy }) {
  try {
    storage.setItem(key, JSON.stringify({
      messages: messages.slice(-40).map(({ recipes, ...message }) => ({
        ...message, recipeIds: recipes?.map((r) => r.id) || [],
      })), draft, maxTime, busy,
    }));
    return true;
  } catch { return false; }
}
