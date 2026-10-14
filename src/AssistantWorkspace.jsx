import NutritionClarification from "./NutritionClarification.jsx";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import RecipePantryImpact from "./RecipePantryImpact.jsx";
import { availability, matchesProfile } from "./engine.js";

function MessageStamp({ message, name }) {
  const date = message.createdAt ? new Date(message.createdAt) : null;
  return (
    <small className="culinary-message-stamp">
      {date && !Number.isNaN(date.getTime()) && (
        <>
          {date.toLocaleTimeString("es", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          ·{" "}
        </>
      )}
      {message.role === "user" ? name : "Nutribot"}
    </small>
  );
}

function ChatRecipe({ recipe, pantry, saved, onOpen, onSave, ingredients, servings = 1 }) {
  const { available: count, missing } = availability(recipe, pantry);
  return (
    <article className="culinary-recipe">
      <div className="culinary-recipe-heading">
        <div className="culinary-recipe-art" aria-hidden="true">
          {recipe.ingredients.slice(0, 3).map((id) => (
            <span key={id}>
              {ingredients.find((item) => item.id === id)?.emoji || "🥗"}
            </span>
          ))}
        </div>
        <div>
          <span className="culinary-kicker">{missing.length ? "ALTERNATIVA CERCANA" : "UNA IDEA CON TU DESPENSA"}</span>
          <h2>{recipe.title}</h2>
          <div className="culinary-badges">
            <span>{servings} {servings === 1 ? "persona" : "personas"}</span>
            <span>
              <Icon name="clock" size={14} />
              {recipe.time} min
            </span>
            <span className="mint">
              <Icon name="leaf" size={14} />
              {recipe.vegan
                ? "Vegetal"
                : recipe.vegetarian
                  ? "Vegetariana"
                  : "Casera"}
            </span>
            <span className="apricot">
              <Icon name="pantry" size={14} />
              {count} de {recipe.ingredients.length} ingredientes
            </span>
          </div>
        </div>
      </div>
      <p className="culinary-recipe-subtitle">{recipe.subtitle}</p>
      {missing.length > 0 && (
        <p className="culinary-recipe-subtitle">
          Te falta{missing.length > 1 ? "n" : ""}: {missing.map((id) => ingredients.find((item) => item.id === id)?.name || id).join(", ")}.
        </p>
      )}
      <div className="culinary-recipe-preview">
        <Icon name="chef" size={19} />
        <div>
          <strong>Así empieza tu receta</strong>
          <p>{recipe.steps[0]}</p>
        </div>
      </div>
      <RecipePantryImpact recipe={recipe} pantry={pantry} />
      <div className="culinary-recipe-actions">
        <button className="btn primary" onClick={() => onOpen(recipe, servings)}>
          <Icon name="book" size={17} />
          Ver receta completa
        </button>
        <button
          className="btn secondary"
          aria-pressed={saved.includes(recipe.id)}
          onClick={() => onSave(recipe.id)}
        >
          <Icon name="heart" size={17} />
          {saved.includes(recipe.id) ? "Guardada" : "Guardar receta"}
        </button>
      </div>
    </article>
  );
}

export default function AssistantWorkspace({
  profile,
  pantry,
  ingredients,
  messages,
  message,
  setMessage,
  maxTime,
  setMaxTime,
  busy,
  saved,
  generated,
  generate: requestGeneration,
  onNewChat,
  chatId,
  chatHistory,
  onSelectChat,
  historyLoading,
  historyError,
  onRefreshHistory,
  hasMoreHistory,
  onMoreHistory,
  onNavigate,
  onImport,
  onOpenRecipe,
  onSave,
}) {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 800px)").matches);
  const workspaceRef = useRef(null);
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  const eligible = (recipe) =>
    matchesProfile(recipe, profile, ingredients) &&
    recipe.time <= maxTime;
  const usable = (recipe) => eligible(recipe) && !availability(recipe, pantry).missing.length;
  const recent = generated.filter(eligible).slice(0, 3);
  const lastRecipe =
    [...messages]
      .reverse()
      .flatMap((m) => m.recipes || [])
      .find(usable) || recent.find(usable);
  const guide = () => {
    setToolPanel(null);
    if (lastRecipe) onOpenRecipe(lastRecipe); else onNavigate("recipes");
  };
  const conversationRef = useRef(null);
  const latestMessageRef = useRef(null);
  const followLatest = useRef(true);
  const lastMessageId = messages.at(-1)?.id;
  const previousMessage = useRef({ chatId, lastMessageId });
  const generate = (...args) => {
    followLatest.current = true;
    return requestGeneration(...args);
  };
  useEffect(() => {
    const previous = previousMessage.current;
    previousMessage.current = { chatId, lastMessageId };
    if (previous.chatId !== chatId) {
      followLatest.current = true;
      const conversation = conversationRef.current;
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
      return;
    }
    if (previous.lastMessageId === lastMessageId || !followLatest.current) return;
    const frame = requestAnimationFrame(() => {
      if (document.querySelector("dialog[open]")) return;
      const conversation = conversationRef.current, latest = latestMessageRef.current;
      if (!conversation || !latest) return;
      conversation.scrollTo({
        top: conversation.scrollTop + latest.getBoundingClientRect().top - conversation.getBoundingClientRect().top - 20,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chatId, lastMessageId]);
  const [toolPanel, setToolPanel] = useState(() => compact ? null : "history");
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const change = () => { setCompact(media.matches); setToolPanel(media.matches ? null : "history"); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const shell = workspaceRef.current?.closest(".assistant-shell");
    const viewport = window.visualViewport;
    if (!shell || !viewport) return;
    const resize = () => {
      if (compact && viewport.scale === 1) {
        shell.style.setProperty("--assistant-height", `${viewport.height}px`);
        const typing = document.activeElement?.matches("textarea, input");
        shell.dataset.keyboardOpen = String(Boolean(typing && (viewport.height < window.innerHeight - 100 || viewport.height < 500)));
      } else {
        shell.style.removeProperty("--assistant-height");
        delete shell.dataset.keyboardOpen;
      }
    };
    resize();
    viewport.addEventListener("resize", resize);
    document.addEventListener("focusin", resize);
    document.addEventListener("focusout", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      document.removeEventListener("focusin", resize);
      document.removeEventListener("focusout", resize);
      shell.style.removeProperty("--assistant-height");
      delete shell.dataset.keyboardOpen;
    };
  }, [compact]);
  const [historyPage, setHistoryPage] = useState(0);
  const selectTool = (panel) => {
    setToolPanel(current => current === panel ? null : panel);
    setHistoryPage(0);
    if (panel === "history" && toolPanel !== panel) onRefreshHistory();
  };
  return (
    <div className="culinary-assistant" ref={workspaceRef}>
      <h1 className="visually-hidden">Tu chat de cocina</h1>
      <div className="culinary-assistant-grid">
        <section
          className="culinary-chat"
          aria-label="Conversación con Nutribot"
        >
          <div
            className="culinary-conversation"
            ref={conversationRef}
            tabIndex={0}
            aria-label="Mensajes del chat"
            onScroll={e => {
              const box = e.currentTarget;
              followLatest.current = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
            }}
            aria-live="polite"
            aria-busy={busy}
          >
            <div className="culinary-message bot">
              <span className="culinary-message-avatar">
                <Icon name="bot" size={19} />
              </span>
              <div className="culinary-message-body">
                <div className="culinary-bubble">
                  <p>
                    ¡Hola, {profile.name.split(" ")[0] || "chef"}! ¿Qué se te
                    antoja preparar hoy? Puedes escribirme o{" "}
                    <button
                      className="inline-action"
                      disabled={busy}
                      onClick={() => onImport("image")}
                    >
                      usar Nutri-Vision
                    </button>{" "}
                    para agregar ingredientes y encontrar una idea con lo que
                    tienes.
                  </p>
                </div>
                <small className="culinary-message-stamp">
                  Nutribot
                </small>
              </div>
            </div>
            {!messages.length && (
              <div className="culinary-starter">
                <h2>Elige una sugerencia o cuéntame qué te gustaría cocinar</h2>
                <p>
                  Nuestros Chefsitos están para ayudarte con tu próxima idea.
                  <br />
                </p>
              </div>
            )}
            {messages.map((m, index) => (
              <div className={`culinary-message ${m.role}`} key={m.id} ref={index === messages.length - 1 ? latestMessageRef : null}>
                {m.role === "bot" && (
                  <span className="culinary-message-avatar">
                    <Icon name="bot" size={19} />
                  </span>
                )}
                <div className="culinary-message-body">
                  <div
                    className={`culinary-bubble ${m.type === "error" ? "error" : ""}`}
                  >
                    {typeof m.photo === "string" &&
                      m.photo.startsWith("data:image/jpeg;base64,") && (
                        <img
                          className="culinary-message-photo"
                          src={m.photo}
                          alt="Foto de alimentos agregados a tu despensa"
                        />
                      )}
                    <p>{m.text}</p>
                    {m.type === "nutrition_setup" && index === messages.length - 1 && (
                      <NutritionClarification ingredientIds={m.nutritionIngredientIds || []} disabled={busy}
                        onContinue={() => generate(m.retryText || "Continúa con la receta que estábamos preparando", m.retryMode || "initial")} />
                    )}
                    {m.type === "conversation" && !m.servings && /cuánt|cuant|solo para ti|personas/i.test(m.text) && index === messages.length - 1 && (
                      <div className="culinary-quick-replies" aria-label="Personas para cocinar">
                        {["Solo para mí", "2 personas", "3 personas", "4 personas"].map(reply => (
                          <button key={reply} disabled={busy} onClick={() => generate(reply)}>{reply}</button>
                        ))}
                      </div>
                    )}
                    {m.missingIngredients?.length > 0 && index === messages.length - 1 && (
                      <div className="culinary-quick-replies">
                        <button disabled={busy} onClick={() => generate("Sí, puedo conseguir los ingredientes que faltan.")}>Sí, puedo conseguirlos</button>
                        <button disabled={busy} onClick={() => generate("Mejor otro plato con lo que tengo en mi despensa.")}>Usar lo que tengo</button>
                      </div>
                    )}
                    {m.ingredientNames?.length > 0 && (
                      <div className="culinary-detected">
                        {m.ingredientNames.map((name, index) => (
                          <span key={`${name}-${index}`}>
                            <Icon name="check" size={13} />
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.type === "review" && (
                      <button
                        className="btn secondary"
                        onClick={() => onNavigate("profile")}
                      >
                        <Icon name="shield" size={16} />
                        Revisar mi perfil
                      </button>
                    )}
                    {m.type === "error" && (
                      <button
                        className="btn secondary"
                        onClick={() => generate(m.retryText, m.retryMode || "initial")}
                        disabled={busy}
                      >
                        <Icon name="reset" size={16} />
                        Reintentar
                      </button>
                    )}
                    {m.type === "empty" && (
                      <button
                        className="btn secondary"
                        onClick={() => onNavigate("pantry")}
                      >
                        <Icon name="pantry" size={16} />
                        Actualizar despensa
                      </button>
                    )}
                  </div>
                  {m.recipes?.filter(eligible).map((recipe) => (
                    <ChatRecipe
                      key={recipe.id}
                      recipe={recipe}
                      servings={m.servings || 1}
                      pantry={pantry}
                      saved={saved}
                      onOpen={onOpenRecipe}
                      onSave={onSave}
                      ingredients={ingredients}
                    />
                  ))}
                  {m.role === "bot" && ["success", "empty"].includes(m.type) && (
                    <button className="btn secondary" disabled={busy} onClick={() =>
                      generate([...messages.slice(0, index)].reverse().find((item) => item.role === "user")?.text || "¿Qué puedo cocinar con lo que tengo?", "more")
                    }>
                      <Icon name="reset" size={16} />
                      Generar más alternativas
                    </button>
                  )}
                  <MessageStamp message={m} name={profile.name} />
                </div>
              </div>
            ))}
            {busy && (
              <div className="culinary-message bot">
                <span className="culinary-message-avatar">
                  <Icon name="bot" size={19} />
                </span>
                <div className="culinary-thinking">
                  <span />
                  <span />
                  <span />
                  <small>
                    Nuestros chefsitos estan trabajando en tu solicitud
                  </small>
                </div>
              </div>
            )}
          </div>
          <div className={`culinary-composer-area${messages.length ? " has-messages" : ""}`}>
            <div className="culinary-suggestions">
              <span>
                <Icon name="sun" size={14} />
                SUGERENCIAS
              </span>
              <button
                disabled={busy}
                onClick={() => generate("¿Qué puedo cocinar con lo que tengo?")}
              >
                🍽️ Una idea para hoy
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  generate("Sugiere una receta rápida con mi despensa")
                }
              >
                ⚡ Algo rápido
              </button>
              <button
                disabled={busy}
                onClick={() => generate("Quiero aprovechar mis vegetales")}
              >
                🌱 Mis vegetales
              </button>
            </div>
            <form
              className="culinary-composer"
              onSubmit={(e) => {
                e.preventDefault();
                if (message.trim() && !busy) generate(message.trim());
              }}
            >
              <div className="culinary-compose-input">
                <textarea
                  aria-label="Mensaje para Nutribot"
                  placeholder={compact ? "¿Qué cocinamos hoy?" : "Escribe lo que tienes en mente… ¿qué cocinamos hoy?"}
                  value={message}
                  maxLength={500}
                  rows={2}
                  disabled={busy}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      if (message.trim() && !busy) generate(message.trim());
                    }
                  }}
                />
                <button
                  className="culinary-send"
                  type="submit"
                  aria-label="Enviar mensaje"
                  disabled={busy || !message.trim()}
                >
                  <Icon name="send" size={20} />
                </button>
              </div>
              <div className="culinary-compose-tools">
                <div>
                  <button type="button" className="culinary-compose-icon" disabled={busy} onClick={() => onImport("image")} aria-label="Usar Nutri-Vision: subir o tomar foto" title="Usar Nutri-Vision">
                    <Icon name="camera" size={21} />
                  </button>
                  <button type="button" className="culinary-compose-icon" disabled={busy} onClick={() => onImport("text")} aria-label="Agregar alimentos" title="Agregar alimentos">
                    <Icon name="plus" size={21} />
                  </button>
                </div>
                <label>
                  <Icon name="clock" size={16} />
                  <select
                    aria-label="Tiempo máximo"
                    value={maxTime}
                    onChange={(e) => setMaxTime(Number(e.target.value))}
                  >
                    <option value={15}>Hasta 15 min</option>
                    <option value={30}>Hasta 30 min</option>
                    <option value={60}>Hasta 60 min</option>
                  </select>
                </label>
              </div>
            </form>
            <p className="culinary-privacy">
              <Icon name="shield" size={13} />
              {compact ? "Tus consultas se comparten con nuestros socios para generar recetas." : "Las consultas se envían a nuestros socios para generar recetas más ricas y variadas para ti."}
            </p>
            {profile.medicalNotes?.trim() && (
              <p className="culinary-privacy" role="note">
                Las indicaciones escritas de tu profesional están guardadas, pero estas recetas no se verifican automáticamente frente a ellas.
              </p>
            )}
          </div>
        </section>
        <aside className="chat-sidebar" aria-label="Herramientas del chat">
          <button className="chat-sidebar-button new-chat" disabled={busy} onClick={async () => {
            if (await onNewChat()) { setToolPanel(compact ? null : "history"); setHistoryPage(0); }
          }}><Icon name="plus" size={20} /><span>Nuevo chat</span></button>
          <div className="chat-sidebar-tabs" aria-label="Vistas de tu cocina">
            <button id="chat-tool-history" className="chat-sidebar-button" aria-expanded={toolPanel === "history"} aria-controls="chat-sidebar-preview" onClick={() => selectTool("history")}>
              <Icon name="history" size={20} /><span>Historial</span>
            </button>
            <button id="chat-tool-pantry" className="chat-sidebar-button" aria-expanded={toolPanel === "pantry"} aria-controls="chat-sidebar-preview" onClick={() => selectTool("pantry")}>
              <Icon name="pantry" size={20} /><span>Despensa</span>
            </button>
            <button id="chat-tool-recipes" className="chat-sidebar-button" aria-expanded={toolPanel === "recipes"} aria-controls="chat-sidebar-preview" onClick={() => selectTool("recipes")}>
              <Icon name="book" size={20} /><span>Recetas recientes</span>
            </button>
          </div>
          <section id="chat-sidebar-preview" className="chat-sidebar-preview" hidden={!toolPanel} aria-labelledby={toolPanel ? `chat-tool-${toolPanel}` : undefined}>
        {toolPanel === "history" && (<div className="conversation-history">
                {historyLoading && (
                  <p role="status" className="culinary-muted">
                    Cargando historial…
                  </p>
                )}
                {historyError && (
                  <div role="alert">
                    <p>{historyError}</p>
                    <button className="text-btn" onClick={onRefreshHistory}>
                      Reintentar
                    </button>
                  </div>
                )}
                {!historyLoading && !historyError && !chatHistory.length && (
                  <p className="culinary-muted">
                    Tus chats aparecerán aquí cuando empieces a escribir.
                  </p>
                )}
                <ul>
                  {chatHistory.slice(historyPage * 3, historyPage * 3 + 3).map((chat) => (
                    <li key={chat.id}>
                      <button
                        aria-current={chat.id === chatId ? "true" : undefined}
                        disabled={busy}
                        onClick={async () => {
                          if (await onSelectChat(chat.id))
                            setToolPanel(compact ? null : "history");
                        }}
                      >
                        <Icon name="chat" size={17} />
                        <span>
                          <strong>{chat.title}</strong>
                          <small>
                            {new Date(chat.updatedAt).toLocaleString("es", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            · {chat.messageCount} mensajes
                          </small>
                        </span>
                        <Icon name="chevron" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                {chatHistory.length > 3 && <div className="chat-preview-pagination">
                  <button className="text-btn" disabled={historyPage === 0} onClick={() => setHistoryPage(page => page - 1)} aria-label="Conversaciones anteriores" title="Anterior"><span aria-hidden="true">◀</span></button>
                  <span>{historyPage + 1} / {Math.ceil(chatHistory.length / 3)}</span>
                  <button className="text-btn" disabled={(historyPage + 1) * 3 >= chatHistory.length} onClick={() => setHistoryPage(page => page + 1)} aria-label="Conversaciones siguientes" title="Siguiente"><span aria-hidden="true">▶</span></button>
                </div>}
                {hasMoreHistory && (
                  <button
                    className="text-btn"
                    disabled={historyLoading}
                    onClick={onMoreHistory}
                  >
                    Cargar más conversaciones
                  </button>
                )}
              </div>)}
        {toolPanel === "pantry" && <>
          <h2 className="chat-preview-title">Mi despensa <small>{pantry.length} alimentos</small></h2>
          {pantry.length ? <ul className="culinary-pantry-list">{pantry.slice(0, 3).map(id => {
            const item = byId.get(id);
            return item && <li key={id}><span className="culinary-food-emoji">{item.emoji}</span><div><strong>{item.name}</strong><small>{item.category}</small></div><Icon name="check" size={16} /></li>;
          })}</ul> : <p className="culinary-muted">Agrega tus primeros ingredientes para empezar a cocinar.</p>}
          <button className="btn secondary" onClick={() => { setToolPanel(null); onNavigate("pantry"); }}>Ver mi despensa<Icon name="arrow" size={16} /></button>
        </>}
        {toolPanel === "recipes" && <><h2 className="chat-preview-title">Recetas recientes</h2>{recent.length ? (
              <ul className="culinary-history">
                {recent.map((recipe) => (
                  <li key={recipe.id}>
                    <button onClick={() => { setToolPanel(null); onOpenRecipe(recipe); }}>
                      <i />
                      <span>
                        <strong>{recipe.title}</strong>
                        <small>
                          {recipe.time} min · {recipe.category}
                        </small>
                      </span>
                      <Icon name="chevron" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="culinary-muted">
                Tus recetas aparecerán aquí cuando prepares tu primera idea con
                NutriBot.
              </p>
            )}
            <button
              className="btn primary culinary-guide-button"
              onClick={guide}
            >
              <Icon name={lastRecipe ? "play" : "book"} size={18} />
              {lastRecipe ? "Cocinar paso a paso" : "Explorar mis recetas"}
            </button></>}
          </section>
        </aside>
      </div>
    </div>
  );
}
