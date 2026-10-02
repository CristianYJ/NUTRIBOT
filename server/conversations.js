import { AppError } from "./recipes.js";
import { validateChat } from "./chat.js";
function chatId(id) {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new AppError("INVALID_CHAT", "La conversación no es válida.");
  return id;
}
function summary(row) {
  return {
    id: row.id,
    title: row.title || "Conversación de cocina",
    updatedAt: row.updated_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    messageCount: row.message_count,
  };
}
const summaryColumns = `id,created_at,updated_at,jsonb_array_length(messages) AS message_count,
  left(COALESCE((SELECT value->>'text' FROM jsonb_array_elements(messages) WHERE value->>'role'='user' LIMIT 1),NULLIF(draft,'')),100) AS title`;
export function conversationStore(transaction, profileId, readRecipes) {
  return {
    listChats(offset = 0) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
        throw new AppError(
          "INVALID_CHAT",
          "La página del historial no es válida.",
        );
      return transaction(async (c) => {
        const rows = (
          await c.query(
            `SELECT ${summaryColumns} FROM conversations WHERE profile_id=$1 AND (jsonb_array_length(messages)>0 OR draft<>'') ORDER BY updated_at DESC,id DESC LIMIT 51 OFFSET $2`,
            [profileId(), offset],
          )
        ).rows;
        return {
          items: rows.slice(0, 50).map(summary),
          nextOffset: rows.length > 50 ? offset + 50 : null,
        };
      }, true);
    },
    getChat(id) {
      chatId(id);
      return transaction(async (c) => {
        const row = (
          await c.query(
            "SELECT id,revision,messages,draft,max_time,busy FROM conversations WHERE id=$1 AND profile_id=$2",
            [id, profileId()],
          )
        ).rows[0];
        if (!row)
          throw new AppError(
            "CHAT_NOT_FOUND",
            "Esta conversación no está disponible.",
            404,
          );
        return {
          id: row.id,
          revision: row.revision,
          messages: row.messages,
          draft: row.draft,
          maxTime: row.max_time,
          busy: row.busy,
        };
      }, true);
    },
    saveChat(raw) {
      const id = chatId(raw?.id),
        chat = validateChat(raw);
      return transaction(async (c) => {
        // Create on the first edit. Empty sessions never accumulate in history.
        if (chat.revision === 0)
          await c.query(
            "INSERT INTO conversations(id,profile_id) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
            [id, profileId()],
          );
        const row = (
          await c.query(
            "SELECT revision FROM conversations WHERE id=$1 AND profile_id=$2 FOR UPDATE",
            [id, profileId()],
          )
        ).rows[0];
        if (!row)
          throw new AppError(
            "CHAT_NOT_FOUND",
            "Esta conversación no está disponible.",
            404,
          );
        if (row.revision !== chat.revision)
          throw new AppError(
            "CHAT_CONFLICT",
            "El chat cambió en otro dispositivo. Abre de nuevo la conversación guardada.",
            409,
          );
        const allowed = new Set(
          (await readRecipes(c)).map((recipe) => recipe.id),
        );
        if (
          chat.messages.some((message) =>
            message.recipeIds.some((recipeId) => !allowed.has(recipeId)),
          )
        )
          throw new AppError(
            "INVALID_CHAT",
            "Una receta no pertenece a tu cuenta o ya no existe.",
          );
        const saved = (
          await c.query(
            `UPDATE conversations SET revision=revision+1,messages=$3,draft=$4,max_time=$5,busy=$6,updated_at=now() WHERE id=$1 AND profile_id=$2 RETURNING revision,${summaryColumns}`,
            [
              id,
              profileId(),
              JSON.stringify(chat.messages),
              chat.draft,
              chat.maxTime,
              chat.busy,
            ],
          )
        ).rows[0];
        return { revision: saved.revision, chat: summary(saved) };
      });
    },
  };
}
