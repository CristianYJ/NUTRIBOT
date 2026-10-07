import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { availability, matchesProfile, requiresReview } from "./engine.js";

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
      {message.role === "user"
        ? name
        : message.source === "gemini"
          ? "Generado por Nutribot"
          : "Nutribot"}
    </small>
  );
}

function ChatRecipe({ recipe, pantry, saved, onOpen, onSave, ingredients }) {
  const count = availability(recipe, pantry).available;
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
          <span className="culinary-kicker">UNA IDEA CON TU DESPENSA</span>
          <h2>{recipe.title}</h2>
          <div className="culinary-badges">
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
              {count} ingredientes
            </span>
          </div>
        </div>
      </div>
      <p className="culinary-recipe-subtitle">{recipe.subtitle}</p>
      <div className="culinary-recipe-preview">
        <Icon name="chef" size={19} />
        <div>
          <strong>Así empieza tu receta</strong>
          <p>{recipe.steps[0]}</p>
        </div>
      </div>
      <div className="culinary-recipe-actions">
        <button className="btn primary" onClick={() => onOpen(recipe)}>
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
  generate,
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
  endRef,
}) {
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  const usable = (recipe) =>
    matchesProfile(recipe, profile, ingredients) &&
    !availability(recipe, pantry).missing.length &&
    recipe.time <= maxTime;
  const recent = generated.filter(usable).slice(0, 3);
  const lastRecipe =
    [...messages]
      .reverse()
      .flatMap((m) => m.recipes || [])
      .find(usable) || recent[0];
  const used = lastRecipe?.ingredients.length || 0;
  const percent = pantry.length ? Math.round((used / pantry.length) * 100) : 0;
  const review = requiresReview(profile, ingredients);
  const guide = () =>
    lastRecipe ? onOpenRecipe(lastRecipe) : onNavigate("recipes");
  const [historyOpen, setHistoryOpen] = useState(false);
  const layout = useRef(null);
  const [pantryExpanded, setPantryExpanded] = useState(false);
  useEffect(() => {
    let compact;
    const observer = new ResizeObserver(([entry]) => {
      const nextCompact = entry.contentRect.width <= 1000;
      if (compact !== nextCompact) {
        compact = nextCompact;
        setPantryExpanded(!nextCompact);
      }
    });
    observer.observe(layout.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="page-enter culinary-assistant" ref={layout}>
      <h1 className="visually-hidden">Tu chat de cocina</h1>
      <div className="culinary-assistant-grid">
        <section
          className="culinary-chat"
          aria-label="Conversación con Nutribot"
        >
          <div
            className="culinary-conversation"
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
                      subir una foto de tu refri
                    </button>{" "}
                    para agregar ingredientes y encontrar una idea con lo que
                    tienes.
                  </p>
                </div>
                <small className="culinary-message-stamp">
                  NutriBot
                </small>
              </div>
            </div>
            {!messages.length && (
              <div className="culinary-starter">
                <div aria-hidden="true">
                </div>
                <h2>Elige una sugerencia o cuéntame qué te gustaría cocinar</h2>
                <p>
                  Nuestros Chefsitos están para ayudarte con tu próxima idea.
                  <br />
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div className={`culinary-message ${m.role}`} key={m.id}>
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
                        onClick={() => generate(m.retryText)}
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
                  {m.recipes?.filter(usable).map((recipe) => (
                    <ChatRecipe
                      key={recipe.id}
                      recipe={recipe}
                      pantry={pantry}
                      saved={saved}
                      onOpen={onOpenRecipe}
                      onSave={onSave}
                      ingredients={ingredients}
                    />
                  ))}
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
            <div ref={endRef} />
          </div>
          <div className="culinary-composer-area">
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
                  placeholder="Escribe lo que tienes en mente… ¿qué cocinamos hoy?"
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
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onImport("image")}
                  >
                    <Icon name="camera" size={17} />
                    Subir / tomar foto
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onImport("text")}
                  >
                    <Icon name="plus" size={17} />
                    Agregar alimentos
                  </button>
                  <button type="button" onClick={() => onNavigate("pantry")}>
                    <Icon name="pantry" size={17} />
                    Mi despensa ({pantry.length})
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
              Las consultas se envian a nuestros socios para generar recetas mas ricas y variadas para ti.
            </p>
          </div>
        </section>
        <aside className="culinary-context" aria-label="Tu cocina en contexto">
          <section
            className="culinary-context-card context-controls-card"
            aria-label="Despensa e historial"
          >
            <div
              className="culinary-modes context-modes"
              aria-label="Herramientas del chat"
            >
              <button
                className={!historyOpen ? "active" : ""}
                aria-pressed={!historyOpen}
                onClick={() => setHistoryOpen(false)}
              >
                <Icon name="chat" size={16} />
                <span>Conversación</span>
              </button>
              <button disabled={busy} onClick={() => onImport("image")}>
                <Icon name="camera" size={16} />
                <span>Visión Refri</span>
              </button>
              <button onClick={guide}>
                <Icon name="chef" size={16} />
                <span>Guía paso a paso</span>
              </button>
              <button
                className={historyOpen ? "active" : ""}
                aria-pressed={historyOpen}
                onClick={() => {
                  setHistoryOpen(true);
                  onRefreshHistory();
                }}
              >
                <Icon name="history" size={16} />
                <span>Historial de chats</span>
              </button>
            </div>
            <button
              className="context-new-chat btn secondary"
              disabled={busy}
              onClick={async () => {
                if (await onNewChat()) setHistoryOpen(false);
              }}
            >
              <Icon name="plus" size={17} />
              Nuevo chat
            </button>
            {historyOpen ? (
              <div className="conversation-history">
                <div className="culinary-card-title">
                  <h2>
                    <Icon name="history" />
                    Tus conversaciones
                  </h2>
                </div>
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
                  {chatHistory.map((chat) => (
                    <li key={chat.id}>
                      <button
                        aria-current={chat.id === chatId ? "true" : undefined}
                        disabled={busy}
                        onClick={async () => {
                          if (await onSelectChat(chat.id))
                            setHistoryOpen(false);
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
                {hasMoreHistory && (
                  <button
                    className="text-btn"
                    disabled={historyLoading}
                    onClick={onMoreHistory}
                  >
                    Ver más conversaciones
                  </button>
                )}
              </div>
            ) : (
              <details
                className="context-pantry-details"
                open={pantryExpanded}
                onToggle={(event) =>
                  setPantryExpanded(event.currentTarget.open)
                }
              >
                <summary>
                  <span>
                    <Icon name="pantry" size={20} />
                    Ingredientes en tu despensa
                  </span>
                  <span className="culinary-count">{pantry.length}</span>
                </summary>
                {pantry.length ? (
                  <ul className="culinary-pantry-list">
                    {pantry.slice(0, 6).map((id) => {
                      const item = byId.get(id);
                      return (
                        item && (
                          <li key={id}>
                            <span className="culinary-food-emoji">
                              {item.emoji}
                            </span>
                            <div>
                              <strong>{item.name}</strong>
                              <small>{item.category}</small>
                            </div>
                            <Icon name="check" size={16} />
                          </li>
                        )
                      );
                    })}
                  </ul>
                ) : (
                  <p className="culinary-muted">
                    Agrega tus primeros ingredientes para empezar a cocinar.
                  </p>
                )}
                <button
                  className="culinary-text-action"
                  onClick={() => onNavigate("pantry")}
                >
                  {pantry.length > 6
                    ? "Ver los " + pantry.length + " ingredientes"
                    : "Editar mi despensa"}
                  <Icon name="arrow" size={16} />
                </button>
              </details>
            )}
          </section>
          <section className="culinary-context-card culinary-impact">
            <div className="culinary-card-title">
              <h2>
                <Icon name="leaf" />
                Aprovecha lo que tienes
              </h2>
            </div>
            <div className="culinary-impact-summary">
              {lastRecipe ? (
                <div
                  className="culinary-ring"
                  style={{ "--progress": `${percent}%` }}
                >
                  <span>{percent}%</span>
                </div>
              ) : (
                <span className="culinary-impact-icon">
                  <Icon name="leaf" size={30} />
                </span>
              )}
              <div>
                <strong>
                  {lastRecipe
                    ? `${used} ingredientes en esta receta`
                    : "Tu despensa pone las ideas"}
                </strong>
                <p>
                  {lastRecipe
                    ? `De los ${pantry.length} alimentos que tienes, estos se usan en tu receta más reciente.`
                    : "Las recetas parten de los alimentos que ya agregaste a tu cocina."}
                </p>
              </div>
            </div>
            <button
              className="culinary-profile-summary"
              onClick={() => onNavigate("profile")}
            >
              <Icon name="shield" size={17} />
              <span>
                {review ? "Revisión de perfil pendiente" : profile.diet}
                <small>
                  {profile.allergies.length} filtros de alergias aplicados
                </small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          </section>
          <section className="culinary-context-card">
            <div className="culinary-card-title">
              <h2>
                <Icon name="history" />
                Recetas recientes
              </h2>
            </div>
            {recent.length ? (
              <ul className="culinary-history">
                {recent.map((recipe) => (
                  <li key={recipe.id}>
                    <button onClick={() => onOpenRecipe(recipe)}>
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
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
