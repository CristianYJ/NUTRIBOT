import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "./auth-api.js";

export function encodeConversation({ messages, draft, maxTime, busy }) {
  return {
    messages: messages.map(({ recipes, photo, ...message }) => ({
      ...message,
      recipeIds: recipes?.map((recipe) => recipe.id) || message.recipeIds || [],
    })),
    draft,
    maxTime,
    busy,
  };
}
export function useChatPersistence(initial, snapshot) {
  const serialized = JSON.stringify(encodeConversation(snapshot));
  const latest = useRef(serialized),
    accepted = useRef(serialized),
    revision = useRef(initial?.revision || 0),
    running = useRef(null);
  latest.current = serialized;
  const activeId = useRef(initial.id);
  const [id, setId] = useState(initial.id),
    [lastSaved, setLastSaved] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  async function flush() {
    if (running.current) return running.current;
    const work = async () => {
      setError(null);
      try {
        while (latest.current !== accepted.current) {
          const pending = latest.current;
          setSaving(true);
          const response = await authenticatedFetch(
            "/api/chats/" + activeId.current,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...JSON.parse(pending),
                revision: revision.current,
              }),
              signal: AbortSignal.timeout(12000),
            },
          );
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.text || "No se pudo guardar el chat.");
          revision.current = result.revision;
          accepted.current = pending;
          setLastSaved(result.chat);
        }
      } catch (problem) {
        setError(problem);
        throw problem;
      } finally {
        setSaving(false);
      }
    };
    running.current = Promise.resolve()
      .then(work)
      .finally(() => {
        running.current = null;
      });
    return running.current;
  }
  useEffect(() => {
    if (serialized === accepted.current || error) return;
    const timer = setTimeout(() => {
      flush().catch(() => {});
    }, 450);
    return () => clearTimeout(timer);
  }, [serialized, error]);
  useEffect(() => {
    const preventLoss = (event) => {
      if (latest.current !== accepted.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, []);
  return {
    id,
    lastSaved,
    error,
    saving: saving || serialized !== accepted.current,
    flush,
    discardPending() {
      accepted.current = latest.current;
    },
    acceptConversation(chat, snapshot) {
      const value = JSON.stringify(encodeConversation(snapshot));
      latest.current = value;
      accepted.current = value;
      revision.current = chat.revision || 0;
      activeId.current = chat.id;
      setId(chat.id);
      setLastSaved(null);
      setError(null);
    },
  };
}
