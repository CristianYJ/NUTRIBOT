import { MAX_CHAT_MESSAGES } from "./conversation-limits.js";
import PantryWorkspace from "./PantryWorkspace.jsx";
import { authenticatedFetch } from "./auth-api.js";
import AuthPage from "./AuthPage.jsx";
import LandingPage from "./LandingPage.jsx";
import { publicPage } from "./public-navigation.js";
import PhoneConnection from "./PhoneConnection.jsx";
import { accountRequest, acceptSession } from "./auth-api.js";
import { useChatPersistence } from "./useChatPersistence.js";
import { todayDate, ageFromBirthDate } from "./date-utils.js";
import { newId } from "./ids.js";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import PantryImport from "./PantryImport.jsx";
import CulinaryHeader from "./CulinaryHeader.jsx";
import AssistantWorkspace from "./AssistantWorkspace.jsx";
import { requestRecipe, stateRequest, pantryRequest } from "./api.js";
import { usePersistence } from "./usePersistence.js";
import { readNavigation, navigationUrl } from "./navigation.js";
import { readChat } from "./chat-session.js";
import { profileRestrictions } from "./profile-rules.js";
import { allergyOptions } from "./data.js";
import { availability, matchesProfile, requiresReview } from "./engine.js";

const pages = [
  { id: "home", label: "Inicio", icon: "home" },
  { id: "pantry", label: "Mi despensa", icon: "pantry" },
  { id: "assistant", label: "Nutribot IA", icon: "spark" },
  { id: "recipes", label: "Mis recetas", icon: "book" },
  { id: "profile", label: "Mi perfil", icon: "user" },
];
function Brand({ small = false }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <img src="/nutribot-logo.png" alt="" />
      <span>
        NutriBot<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function Tag({ children, tone = "" }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function Empty({ icon = "book", title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={32} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export default function App() {
  const [entryPage, setEntryPage] = useState(() => publicPage(location.hash));
  useEffect(() => {
    const restore = () => setEntryPage(publicPage(location.hash));
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("hashchange", restore);
      window.removeEventListener("popstate", restore);
    };
  }, []);
  const [initial, setInitial] = useState(null),
    [auth, setAuth] = useState(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    (async () => {
      try {
        const session = await accountRequest(
          "session",
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setAuth(session);
        if (session.authenticated) {
          const state = await stateRequest("GET", undefined, controller.signal);
          if (!controller.signal.aborted) setInitial(state);
        } else setInitial(null);
      } catch (problem) {
        if (!controller.signal.aborted) setError(problem.message);
      }
    })();
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const expired = () => {
      acceptSession(null);
      setInitial(null);
      setAuth({ authenticated: false });
    };
    window.addEventListener("nutribot:unauthorized", expired);
    return () => window.removeEventListener("nutribot:unauthorized", expired);
  }, []);
  function signedOut() {
    location.hash = "auth";
    acceptSession(null);
    setInitial(null);
    setAuth({ authenticated: false });
    try {
      sessionStorage.removeItem("nutribot.chat.v1");
    } catch {
      /* storage can be disabled */
    }
  }
  if (entryPage === "landing" && !auth?.authenticated)
    return <LandingPage brand={<Brand />} />;
  if (auth && !auth.authenticated)
    return (
      <AuthPage
        brand={<Brand />}
        canClaimLegacy={auth.canClaimLegacy}
        onAuthenticated={(session) => {
          if (
            publicPage(location.hash) === "landing" ||
            location.hash === "#auth"
          )
            history.replaceState(null, "", "#home");
          setAuth(session);
          setInitial(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  if (!initial)
    return (
      <main className="database-loading">
        <Brand />
        <h1>{error ? "No pudimos abrir tu cocina" : "Abriendo tu cocina…"}</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Comprobando tu sesión y cargando tus datos."}
        </p>
        {error && (
          <button
            className="btn primary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Volver a intentar
          </button>
        )}
      </main>
    );
  return (
    <Workspace
      key={initial.profile.id}
      initial={initial}
      onSignedOut={signedOut}
    />
  );
}

function Workspace({ initial, onSignedOut }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [ingredients, setIngredients] = useState(initial.ingredients);
  const ingredientById = Object.fromEntries(ingredients.map((i) => [i.id, i]));
  const recipes = initial.recipes;
  const [navigation, setNavigation] = useState(() =>
    readNavigation(new URL(location.href)),
  );
  const { page } = navigation;
  useEffect(() => {
    const restore = () => setNavigation(readNavigation(new URL(location.href)));
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);
  function navigate(next, replace = false) {
    const url = navigationUrl(location.href, next);
    if (url.href !== location.href)
      history[replace ? "replaceState" : "pushState"](null, "", url);
    setNavigation(next);
  }
  const [pantry, setPantry] = useState(initial.pantry);
  const [pantryDates, setPantryDates] = useState(initial.pantryDates || {});
  const [profile, setProfile] = useState(initial.profile);
  const [saved, setSaved] = useState(initial.saved);
  const [generated, setGenerated] = useState(initial.generated);
  const [connection, setConnection] = useState("checking");
  const allRecipes = [...generated, ...recipes];
  const [feedback, setFeedback] = useState(initial?.feedback || {});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [recipeTab, setRecipeTab] = useState("Explorar");
  const [meal, setMeal] = useState("Todas");
  const [selected, setSelected] = useState(null);
  const [servings, setServings] = useState(1);
  const [checked, setChecked] = useState([]);
  const [chat] = useState(() => ({
    id: newId(),
    revision: 0,
    messages: [],
    draft: "",
    maxTime: 30,
    busy: false,
  }));
  const [chatHistory, setChatHistory] = useState([]),
    [historyOffset, setHistoryOffset] = useState(null),
    [historyError, setHistoryError] = useState(""),
    [historyLoading, setHistoryLoading] = useState(false),
    [switchingChat, setSwitchingChat] = useState(false);
  const [messages, setMessages] = useState(chat.messages);
  const [message, setMessage] = useState(chat.draft);
  const [maxTime, setMaxTime] = useState(chat.maxTime);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [pantryImportRequest, setPantryImportRequest] = useState(null);
  const openPantryImport = (mode) =>
    setPantryImportRequest({ mode, id: newId() });
  const [confirmReset, setConfirmReset] = useState(false);
  const request = useRef(null);
  const dialog = useRef(null);
  const resetDialog = useRef(null);
  const pending = useRef(null);
  const end = useRef(null);

  const persistence = usePersistence(initial, {
    pantry,
    pantryDates,
    profile,
    saved,
    feedback,
  });
  const [resetting, setResetting] = useState(false);
  const chatPersistence = useChatPersistence(chat, {
    messages,
    draft: message,
    maxTime,
    busy,
  });
  async function readConversation(path, signal) {
    const response = await authenticatedFetch("/api/chats" + path, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
        : AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.text || "No se pudo abrir el historial.");
    return result;
  }
  async function loadHistory(offset = 0, signal) {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await readConversation("?offset=" + offset, signal);
      if (signal?.aborted) return;
      setChatHistory((previous) =>
        offset
          ? [
              ...previous,
              ...result.items.filter(
                (item) => !previous.some((existing) => existing.id === item.id),
              ),
            ]
          : result.items,
      );
      setHistoryOffset(result.nextOffset);
    } catch (problem) {
      if (!signal?.aborted) setHistoryError(problem.message);
    } finally {
      if (!signal?.aborted) setHistoryLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    loadHistory(0, controller.signal);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const savedChat = chatPersistence.lastSaved;
    if (savedChat)
      setChatHistory((previous) => [
        savedChat,
        ...previous.filter((item) => item.id !== savedChat.id),
      ]);
  }, [chatPersistence.lastSaved]);
  function showConversation(next) {
    const restored = readChat(
      { getItem: () => JSON.stringify(next) },
      allRecipes,
    );
    chatPersistence.acceptConversation(next, { ...restored, busy: false });
    setMessages(restored.messages);
    setMessage(restored.draft);
    setMaxTime(restored.maxTime);
  }
  async function switchChat(id) {
    if (busy || switchingChat) return false;
    setSwitchingChat(true);
    try {
      await chatPersistence.flush();
      showConversation(
        id
          ? await readConversation("/" + id)
          : {
              id: newId(),
              revision: 0,
              messages: [],
              draft: "",
              maxTime: 30,
              busy: false,
            },
      );
      return true;
    } catch (problem) {
      setToast(problem.message);
      return false;
    } finally {
      setSwitchingChat(false);
    }
  }
  function removeIngredients(ids) {
    setPantry((previous) => previous.filter((id) => !ids.includes(id)));
    setPantryDates((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([id]) => !ids.includes(id)),
      ),
    );
    setToast(ids.length + " ingredientes quitados de la despensa");
  }
  function setIngredientDate(id, value) {
    setPantryDates((previous) => {
      const next = { ...previous };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  }
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    request.current?.abort();
    request.current = null;
    setBusy(false);
    try {
      await persistence.flush();
      await chatPersistence.flush();
      await accountRequest("logout", {});
      onSignedOut();
    } catch (problem) {
      setToast(problem.message);
      setLoggingOut(false);
    }
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s) => setConnection(s.configured ? "configured" : "missing"))
      .catch(() => {
        if (!controller.signal.aborted) setConnection("offline");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (selected) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [selected]);
  useEffect(() => {
    if (confirmReset) resetDialog.current?.showModal();
    else resetDialog.current?.close();
  }, [confirmReset]);
  useEffect(() => {
    if (messages.length && end.current?.parentElement) {
      const conversation = end.current.parentElement;
      conversation.scrollTo({
        top: conversation.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, busy]);
  useEffect(() => {
    if (request.current) {
      request.current.abort();
      request.current = null;
      setBusy(false);
      setMessages((m) => m.filter((x) => x.id !== pending.current));
      setToast(
        "Actualizaste tus datos. Vuelve a buscar con los nuevos filtros.",
      );
    }
  }, [pantry, profile, maxTime]);
  function go(id) {
    navigate({ ...navigation, page: id });
    setSearch("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openRecipe(r, portions = 1) {
    setSelected(r);
    setServings(portions);
    setChecked([]);
  }
  function toggleSave(id) {
    setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setToast(
      saved.includes(id)
        ? "Receta quitada; comprobando guardado…"
        : "Receta seleccionada; comprobando guardado…",
    );
  }
  function toggleIngredient(id) {
    if (pantry.includes(id)) removeIngredients([id]);
    else setPantry((previous) => [...previous, id]);
  }
  async function addPantry(items, context = {}) {
    const revision = await persistence.flush();
    const state = await pantryRequest("add", {
      revision,
      confirmed: true,
      items,
    });
    persistence.acceptReset(state);
    setIngredients(state.ingredients);
    setPantry(state.pantry);
    setPantryDates(state.pantryDates || {});
    setToast("Ingredientes guardados en tu despensa");
    if (page === "assistant" && messages.length <= MAX_CHAT_MESSAGES - 2) {
      const createdAt = new Date().toISOString();
      setMessages((previous) => [
        ...previous,
        {
          id: newId(),
          role: "user",
          createdAt,
          text: context.preview
            ? "Agregué ingredientes desde una foto."
            : "Agregué ingredientes a mi despensa.",
          photo: context.preview,
        },
        {
          id: newId(),
          role: "bot",
          createdAt,
          source: "local",
          type: "notice",
          text: "Tu despensa está actualizada. Ya puedes pedirme una receta con estos ingredientes.",
          ingredientNames: items.map((item) => item.name),
          recipes: [],
        },
      ]);
    }
  }
  async function generate(text = "¿Qué puedo cocinar con lo que tengo?") {
    if (request.current || switchingChat) return;
    if (messages.length > MAX_CHAT_MESSAGES - 2) {
      setToast(
        "Este chat llegó a 200 mensajes. Abre un nuevo chat para continuar sin perder el historial.",
      );
      return;
    }
    go("assistant");
    setMessage("");
    setBusy(true);
    const id = newId();
    const controller = new AbortController();
    request.current = controller;
    pending.current = id;
    setMessages((m) => [
      ...m,
      { role: "user", text, id, createdAt: new Date().toISOString() },
    ]);
    try {
      const revision = await persistence.flush();
      if (controller.signal.aborted) return;
      const result = await requestRecipe({
        revision,
        maxTime,
        message: text,
        signal: controller.signal,
      });
      if (controller.signal.aborted || request.current !== controller) return;
      if (result.source === "gemini") setConnection("configured");
      if (result.recipes.length) setGenerated((g) => [...result.recipes, ...g]);
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          ...result,
          id: newId(),
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      if (controller.signal.aborted || request.current !== controller) return;
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          type: "error",
          source: "local",
          text: error.message,
          recipes: [],
          retryText: text,
          id: newId(),
        },
      ]);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  async function reset() {
    if (resetting) return;
    setResetting(true);
    request.current?.abort();
    request.current = null;
    setBusy(false);
    try {
      const revision = await persistence.flush();
      await chatPersistence.flush();
      const state = await stateRequest("DELETE", { revision });
      persistence.acceptReset(state);
      showConversation({
        id: newId(),
        revision: 0,
        messages: [],
        draft: "",
        maxTime: 30,
        busy: false,
      });
      setChatHistory([]);
      setHistoryOffset(null);
      setIngredients(state.ingredients);
      setPantry(state.pantry);
      setPantryDates(state.pantryDates || {});
      setProfile(state.profile);
      setSaved(state.saved);
      setGenerated(state.generated);
      setFeedback(state.feedback);
      setMessages([]);
      setMessage("");
      setMaxTime(30);
      setConfirmReset(false);
      go("home");
      setToast("Datos locales borrados y cocina restaurada");
    } catch (problem) {
      setToast(problem.message);
    } finally {
      setResetting(false);
    }
  }
  const button = (text, fn, icon = "arrow", kind = "primary") => (
    <button className={`btn ${kind}`} onClick={fn}>
      {text}
      <Icon name={icon} size={18} />
    </button>
  );
  function RecipeCard({ recipe: r }) {
    const a = availability(r, pantry);
    return (
      <article className="recipe-card">
        <button
          className={`recipe-image ${r.photo ? "" : "illustrated " + r.id}`}
          onClick={() => openRecipe(r)}
          aria-label={`Ver ${r.title}`}
        >
          {r.photo ? (
            <img
              src="/bowl-nutribot.png"
              alt="Bowl de arroz, frijoles, aguacate y tomate"
            />
          ) : (
            <>
              <span className="food-illustration">{r.emoji}</span>
              <span className="food-ring" />
            </>
          )}
          <span className="photo-label">
            {r.source === "gemini" ? "Gemini · " : "Ejemplo · "}
            {r.category}
          </span>
        </button>
        <button
          className={`save-btn ${saved.includes(r.id) ? "saved" : ""}`}
          onClick={() => toggleSave(r.id)}
          aria-label={`${saved.includes(r.id) ? "Quitar" : "Guardar"} ${r.title}`}
          aria-pressed={saved.includes(r.id)}
        >
          <Icon name="heart" size={19} />
        </button>
        <div className="recipe-copy">
          <div className="recipe-meta">
            <span>
              <Icon name="clock" size={14} />
              {r.time} min
            </span>
            <span>{r.vegan ? "Vegetal" : "Casera"}</span>
          </div>
          <button className="title-link" onClick={() => openRecipe(r)}>
            <h3>{r.title}</h3>
          </button>
          <p>{r.subtitle}</p>
          <div className={`availability ${a.missing.length ? "missing" : ""}`}>
            <Icon name={a.missing.length ? "bag" : "check"} size={15} />
            {a.missing.length
              ? `Te falta${a.missing.length > 1 ? "n" : ""} ${a.missing.length} ingrediente${a.missing.length > 1 ? "s" : ""}`
              : "Tienes todos los ingredientes"}
          </div>
        </div>
      </article>
    );
  }
  return (
    <>
      <div className="app-shell culinary-shell">
        <CulinaryHeader
          brand={<Brand />}
          page={page}
          profile={profile}
          ingredients={ingredients}
          recipes={allRecipes.filter((recipe) =>
            matchesProfile(recipe, profile, ingredients),
          )}
          onNavigate={go}
          onOpenRecipe={openRecipe}
          onLogout={logout}
          loggingOut={loggingOut}
          onConnect={() => setPhoneOpen(true)}
          onFavorites={() => {
            go("recipes");
            setRecipeTab("Guardadas");
            setMeal("Todas");
          }}
          onSearchIngredient={(query) => {
            go("pantry");
            setCategory("Todos");
            setSearch(query);
          }}
        />
        <div className="main-area">
          {(persistence.error ||
            persistence.status === "saving" ||
            chatPersistence.saving) && (
            <div
              className={`storage-status ${persistence.status}`}
              role={persistence.error ? "alert" : "status"}
            >
              <span>
                {persistence.error
                  ? persistence.error.message
                  : persistence.status === "saving"
                    ? "Guardando cambios…"
                    : chatPersistence.saving
                      ? "Guardando conversación…"
                      : ""}
              </span>
              {persistence.error &&
                (persistence.error.code === "STATE_CONFLICT" ? (
                  <button onClick={persistence.discardAndReload}>
                    Descartar cambios pendientes y recargar
                  </button>
                ) : (
                  <button onClick={() => persistence.flush().catch(() => {})}>
                    Reintentar guardado
                  </button>
                ))}
            </div>
          )}
          {chatPersistence.error && (
            <div className="chat-save-error" role="alert">
              <span>{chatPersistence.error.message}</span>
              <button onClick={() => chatPersistence.flush().catch(() => {})}>
                Reintentar guardar chat
              </button>
              <button
                onClick={() => {
                  chatPersistence.discardPending();
                  persistence.discardAndReload();
                }}
              >
                Descartar cambios pendientes y recargar
              </button>
            </div>
          )}
          <main>
            {page === "home" && (
              <div className="page-enter simple-home">
                <div className="page-title">
                  <h1>¿Qué cocinamos hoy?</h1>
                  <p>
                    Genera recetas con los ingredientes que tienes y los filtros
                    de tu perfil.
                  </p>
                </div>
                <section className="panel start-cooking">
                  <Icon name="chef" size={38} />
                  <h2>Tu cocina, en tres pasos</h2>
                  <ol className="start-steps">
                    <li>
                      <button className="text-btn" onClick={() => go("pantry")}>
                        Elige tus ingredientes
                      </button>
                      <span>{pantry.length} en tu despensa</span>
                    </li>
                    <li>
                      <button
                        className="text-btn"
                        onClick={() => go("profile")}
                      >
                        Revisa tus preferencias y alergias
                      </button>
                      <span>{profile.diet}</span>
                    </li>
                    <li>
                      <span>Pide una receta a Nutribot</span>
                      <span>La IA usa tu despensa y tus filtros.</span>
                    </li>
                  </ol>
                  {button("Pedir una receta", () => go("assistant"), "spark")}
                </section>
                <button
                  className="text-btn saved-shortcut"
                  onClick={() => go("recipes")}
                >
                  <Icon name="book" size={18} /> Ver mis recetas ·{" "}
                  {generated.length} generadas
                </button>
              </div>
            )}
            {page === "pantry" && (
              <PantryWorkspace
                pantry={pantry}
                dates={pantryDates}
                ingredients={ingredients}
                search={search}
                setSearch={setSearch}
                category={category}
                setCategory={setCategory}
                onToggle={toggleIngredient}
                onRemove={removeIngredients}
                onDate={setIngredientDate}
                onImport={openPantryImport}
                onGenerate={() => generate()}
              />
            )}
            {page === "assistant" && (
              <AssistantWorkspace
                profile={profile}
                pantry={pantry}
                ingredients={ingredients}
                messages={messages}
                message={message}
                setMessage={setMessage}
                maxTime={maxTime}
                setMaxTime={setMaxTime}
                busy={busy || switchingChat}
                saved={saved}
                generated={generated}
                generate={generate}
                onNewChat={() => switchChat(null)}
                chatId={chatPersistence.id}
                chatHistory={chatHistory}
                onSelectChat={switchChat}
                historyLoading={historyLoading}
                historyError={historyError}
                onRefreshHistory={() => loadHistory()}
                hasMoreHistory={historyOffset !== null}
                onMoreHistory={() => loadHistory(historyOffset)}
                onNavigate={go}
                onImport={openPantryImport}
                onOpenRecipe={openRecipe}
                onSave={toggleSave}
                endRef={end}
              />
            )}
            {page === "recipes" && (
              <div className="page-enter">
                <div className="page-title">
                  <div className="eyebrow">IDEAS QUE DAN GUSTO</div>
                  <h1>Tu pequeño recetario</h1>
                  <p>
                    Encuentra inspiración y guarda lo que te gustaría volver a
                    cocinar.
                  </p>
                </div>
                <div className="tabs">
                  {["Explorar", "Guardadas"].map((t) => (
                    <button
                      key={t}
                      className={recipeTab === t ? "active" : ""}
                      onClick={() => setRecipeTab(t)}
                    >
                      {t}
                      {t === "Guardadas" && <span>{saved.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="filter-row">
                  {["Todas", "Desayuno", "Almuerzo", "Cena"].map((c) => (
                    <button
                      key={c}
                      className={meal === c ? "selected" : ""}
                      onClick={() => setMeal(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {requiresReview(profile, ingredients) ? (
                  <Empty
                    icon="shield"
                    title="Sugerencias en pausa"
                    action={button("Revisar perfil", () => go("profile"))}
                  >
                    Tus indicaciones escritas necesitan revisión. Tus recetas
                    guardadas se conservan.
                  </Empty>
                ) : (
                  <>
                    <div className="recipe-grid library">
                      {allRecipes
                        .filter(
                          (r) =>
                            matchesProfile(r, profile, ingredients) &&
                            (recipeTab !== "Guardadas" ||
                              saved.includes(r.id)) &&
                            (meal === "Todas" || r.category === meal),
                        )
                        .map((r) => (
                          <RecipeCard key={r.id} recipe={r} />
                        ))}
                    </div>
                    {!allRecipes.some(
                      (r) =>
                        matchesProfile(r, profile, ingredients) &&
                        (recipeTab !== "Guardadas" || saved.includes(r.id)) &&
                        (meal === "Todas" || r.category === meal),
                    ) && (
                      <Empty
                        icon="heart"
                        title={
                          recipeTab === "Guardadas"
                            ? "Aquí van tus próximas favoritas"
                            : "No hay coincidencias"
                        }
                      >
                        Guarda una receta con el corazón o prueba otra
                        categoría. Tus filtros de perfil siguen aplicándose.
                      </Empty>
                    )}
                  </>
                )}
                <div className="quiet-note">
                  <Icon name="info" size={15} />
                  <span>
                    Las recetas de Gemini se distinguen de los ejemplos del
                    catálogo. Verifica etiquetas y posibles trazas de alérgenos;
                    los filtros no certifican seguridad alimentaria.
                  </span>
                </div>
              </div>
            )}
            {page === "profile" && (
              <div className="page-enter">
                <div className="page-title">
                  <div className="eyebrow">CADA PERSONA, UNA COCINA</div>
                  <h1>Hagámoslo a tu manera</h1>
                  <p>
                    Cuéntanos tus preferencias para dar forma a tus próximas
                    recetas.
                  </p>
                </div>
                <ProfileForm
                  catalog={ingredients}
                  profile={profile}
                  onSave={(p) => {
                    setProfile(p);
                    setToast("Perfil actualizado; comprobando guardado…");
                  }}
                />
                <section className="privacy-panel">
                  <Icon name="shield" size={24} />
                  <div>
                    <h3>Tú decides qué compartir</h3>
                    <p>
                      El perfil, la despensa y las recetas se guardan en la base
                      de datos de esta PC y permanecen al cerrar el navegador.
                      Al generar, se envían a Google tu mensaje, los
                      ingredientes y los filtros alimentarios. Correo,
                      contraseña, nombre, fecha de nacimiento, peso, estatura e
                      indicaciones del perfil no se envían a Google. Usa datos
                      ficticios en las pruebas.
                    </p>
                    <button
                      className="text-btn"
                      onClick={() => setConfirmReset(true)}
                    >
                      <Icon name="reset" size={16} />
                      Restaurar los datos de mi cuenta
                    </button>
                  </div>
                </section>
                <section className="profile-account-actions">
                  <div>
                    <Icon name="lock" size={21} />
                    <div>
                      <h3>Seguridad de tu cuenta</h3>
                      <p>{profile.email}</p>
                    </div>
                  </div>
                  <button
                    className="btn secondary"
                    disabled
                    title="Disponible próximamente"
                  >
                    Cambiar contraseña · Próximamente
                  </button>
                </section>
                <button
                  className="profile-logout"
                  disabled={loggingOut}
                  onClick={logout}
                >
                  <Icon name="logout" size={19} />
                  {loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
                </button>
              </div>
            )}
          </main>
          <footer className="app-footer">
            <Brand small />
            <span>Menos dudas. Más cocina.</span>
            <span>Recetas con IA</span>
          </footer>
        </div>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {pages.map((p) => (
            <button
              key={p.id}
              className={page === p.id ? "active" : ""}
              aria-current={page === p.id ? "page" : undefined}
              onClick={() => go(p.id)}
            >
              <Icon name={p.icon} size={21} />
              <span>
                {p.id === "pantry"
                  ? "Despensa"
                  : p.id === "assistant"
                    ? "Nutribot"
                    : p.id === "recipes"
                      ? "Recetas"
                      : p.id === "profile"
                        ? "Perfil"
                        : "Inicio"}
              </span>
            </button>
          ))}
        </nav>
      </div>
      <PhoneConnection open={phoneOpen} onClose={() => setPhoneOpen(false)} />
      <PantryImport
        catalog={ingredients}
        onSave={addPantry}
        openRequest={pantryImportRequest}
        hideIntro
      />
      <dialog
        className="recipe-dialog"
        aria-labelledby="recipe-title"
        ref={dialog}
        onCancel={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setSelected(null);
        }}
      >
        {selected && (
          <>
            <div
              className={`detail-photo ${selected.photo ? "" : "illustrated " + selected.id}`}
            >
              {selected.photo ? (
                <img src="/bowl-nutribot.png" alt="Bowl de la casa" />
              ) : (
                <span>{selected.emoji}</span>
              )}
              <button
                className="detail-close"
                aria-label="Cerrar receta"
                onClick={() => setSelected(null)}
              >
                <Icon name="close" />
              </button>
              <Tag>
                {selected.category} ·{" "}
                {selected.source === "gemini" ? "Gemini" : "Ejemplo"}
              </Tag>
            </div>
            <div className="detail-content">
              <div className="detail-title">
                <h2 id="recipe-title">{selected.title}</h2>
                <button
                  className={`icon-button ${saved.includes(selected.id) ? "saved" : ""}`}
                  aria-label="Guardar receta"
                  aria-pressed={saved.includes(selected.id)}
                  onClick={() => toggleSave(selected.id)}
                >
                  <Icon name="heart" />
                </button>
              </div>
              <p>{selected.subtitle}</p>
              <div className="detail-meta">
                <span>
                  <Icon name="clock" size={17} />
                  {selected.time} minutos
                </span>
                <span>
                  <Icon name="chef" size={17} />
                  Fácil
                </span>
                <span>
                  <Icon name="leaf" size={17} />
                  {selected.vegan ? "Vegetal" : "Casera"}
                </span>
              </div>
              {!matchesProfile(selected, profile, ingredients) && (
                <div className="review-note">
                  Esta receta ya no coincide con tu perfil actual. La
                  preparación está deshabilitada.
                </div>
              )}
              <div className="serving-row">
                <h3>Ingredientes</h3>
                <label>
                  Porciones{" "}
                  <select
                    aria-label="Porciones"
                    value={servings}
                    onChange={(e) => setServings(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="microcopy">
                {servings > 1
                  ? `Prepara ${servings} veces cada cantidad base indicada abajo.`
                  : "Cantidades base para 1 porción."}{" "}
                La despensa comprueba presencia, no cantidades.
              </p>
              <ul className="detail-ingredients">
                {selected.ingredients.map((id, i) => (
                  <li key={id}>
                    <span className="detail-ingredient-emoji">
                      {ingredientById[id].emoji}
                    </span>
                    <span>
                      {selected.amounts[i]}
                      {servings > 1 && (
                        <strong className="multiplier"> × {servings}</strong>
                      )}
                    </span>
                    <span className={pantry.includes(id) ? "have" : "need"}>
                      {pantry.includes(id) ? "En despensa" : "Te falta"}
                    </span>
                  </li>
                ))}
              </ul>
              {selected.nutrition ? (
                <>
                  <h3 className="nutrition-heading">
                    Una mirada al plato <Tag>Datos de ejemplo</Tag>
                  </h3>
                  <div className="nutrition-grid">
                    {["kcal", "g proteína", "g carbohidratos", "g grasas"].map(
                      (label, i) => (
                        <div key={label}>
                          <strong>{selected.nutrition[i]}</strong>
                          <span>{label}</span>
                        </div>
                      ),
                    )}
                  </div>
                  <p className="microcopy">
                    Valores ilustrativos por porción, sin cálculo nutricional
                    verificado. No cambian según peso, estatura ni objetivos.
                  </p>
                </>
              ) : (
                <div className="review-note">
                  Receta generada por IA, sin revisión profesional. No mostramos
                  calorías ni macronutrientes hasta integrar una fuente
                  nutricional verificable.
                </div>
              )}
              <h3 className="steps-heading">Manos a la cocina</h3>
              <div className="recipe-steps">
                {selected.steps.map((step, i) => (
                  <button
                    key={step}
                    className={checked.includes(i) ? "done" : ""}
                    aria-pressed={checked.includes(i)}
                    disabled={!matchesProfile(selected, profile, ingredients)}
                    onClick={() =>
                      setChecked((c) =>
                        c.includes(i) ? c.filter((n) => n !== i) : [...c, i],
                      )
                    }
                  >
                    <span>
                      {checked.includes(i) ? (
                        <Icon name="check" size={16} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <p>{step}</p>
                  </button>
                ))}
              </div>
              <div className="feedback">
                <div>
                  <strong>¿Te gustaría prepararla?</strong>
                  <p>Tu opinión ayuda a mejorar el proyecto.</p>
                </div>
                <button
                  className={`btn ${feedback[selected.id] ? "primary" : "secondary"}`}
                  onClick={() => {
                    setFeedback((f) => ({
                      ...f,
                      [selected.id]: !f[selected.id],
                    }));
                    setToast("Opinión actualizada; comprobando guardado…");
                  }}
                >
                  <Icon name="thumbs" size={17} />
                  {feedback[selected.id] ? "¡Sí, me gusta!" : "Me gusta"}
                </button>
              </div>
              <p className="microcopy">
                Revisa las etiquetas de los productos y las posibles trazas de
                alérgenos. Esta receta no ha sido validada por un profesional.
              </p>
            </div>
          </>
        )}
      </dialog>
      <dialog
        className="reset-dialog"
        aria-labelledby="reset-title"
        ref={resetDialog}
        onCancel={() => setConfirmReset(false)}
      >
        <Icon name="reset" size={30} />
        <h2 id="reset-title">¿Volvemos al inicio?</h2>
        <p>
          Se restaurarán las preferencias y la despensa de tu cuenta, y se
          borrarán sus recetas guardadas y su chat. El cambio también se verá en
          tus otros dispositivos. Conservarás tu acceso, nombre y fecha de
          nacimiento.
        </p>
        <div className="actions">
          <button
            className="btn secondary"
            onClick={() => setConfirmReset(false)}
          >
            Conservar cambios
          </button>
          <button className="btn primary" onClick={reset} disabled={resetting}>
            {resetting ? "Borrando…" : "Borrar y restaurar"}
          </button>
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {toast}
        </div>
      )}
    </>
  );
}

function ProfileForm({ profile, onSave, catalog }) {
  const [draft, setDraft] = useState(profile);
  function field(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function toggleAllergy(a) {
    field(
      "allergies",
      draft.allergies.includes(a)
        ? draft.allergies.filter((x) => x !== a)
        : [...draft.allergies, a],
    );
  }
  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...draft,
          name: draft.name.trim(),
          medicalNotes: draft.medicalNotes.trim(),
          exclusions: draft.exclusions.trim(),
        });
      }}
    >
      <div className="profile-form-grid">
        <section className="panel form-panel">
          <div className="form-section-title">
            <span>01</span>
            <h2>Un poco sobre ti</h2>
          </div>
          <label>
            ¿Cómo te llamas?
            <input
              required
              pattern=".*[^ ].*"
              title="Escribe un nombre con al menos un carácter visible"
              maxLength={35}
              value={draft.name}
              onChange={(e) => field("name", e.target.value)}
              placeholder="Tu nombre"
            />
          </label>
          <label>
            Fecha de nacimiento <span className="optional">opcional</span>
            <input
              type="date"
              autoComplete="bday"
              max={todayDate()}
              min="1900-01-01"
              value={draft.birthDate || ""}
              onChange={(event) => field("birthDate", event.target.value)}
            />
          </label>
          {ageFromBirthDate(draft.birthDate) !== null && (
            <p className="profile-age">
              Edad: {ageFromBirthDate(draft.birthDate)} años
            </p>
          )}
          <div className="field-row">
            <label>
              Peso <span className="optional">opcional</span>
              <div className="input-unit">
                <input
                  type="number"
                  min="20"
                  max="400"
                  step="0.1"
                  value={draft.weight}
                  onChange={(e) => field("weight", e.target.value)}
                  placeholder="70"
                  aria-label="Peso en kilogramos"
                />
                <span>kg</span>
              </div>
            </label>
            <label>
              Estatura <span className="optional">opcional</span>
              <div className="input-unit">
                <input
                  type="number"
                  min="100"
                  max="250"
                  step="1"
                  value={draft.height}
                  onChange={(e) => field("height", e.target.value)}
                  placeholder="170"
                  aria-label="Estatura en centímetros"
                />
                <span>cm</span>
              </div>
            </label>
          </div>
          <p className="microcopy">
            Estos datos se guardan en tu perfil local. Nutribot no calcula
            necesidades calóricas ni prescribe dietas.
          </p>
          <label>
            Mi objetivo
            <select
              value={draft.goal}
              onChange={(e) => field("goal", e.target.value)}
            >
              {[
                "Comer más variado",
                "Aprovechar mis ingredientes",
                "Mantener mi peso",
                "Bajar de peso",
                "Aumentar de peso",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Preferencia alimentaria
            <select
              value={draft.diet}
              onChange={(e) => field("diet", e.target.value)}
            >
              {["Sin preferencia", "Vegetariana", "Vegana"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </section>
        <section className="panel form-panel">
          <div className="form-section-title">
            <span>02</span>
            <h2>Lo que debemos considerar</h2>
          </div>
          <label>Alergias y restricciones</label>
          <p className="microcopy">
            Selecciona las que correspondan. También puedes excluir alimentos
            por nombre en el campo de abajo.
          </p>
          <div className="allergy-options">
            {allergyOptions.map((a) => (
              <button
                type="button"
                key={a}
                aria-pressed={draft.allergies.includes(a)}
                className={draft.allergies.includes(a) ? "selected" : ""}
                onClick={() => toggleAllergy(a)}
              >
                <Icon
                  name={draft.allergies.includes(a) ? "check" : "plus"}
                  size={14}
                />
                {a}
              </button>
            ))}
          </div>
          <label>
            Otros alimentos que evito
            <textarea
              rows={2}
              maxLength={400}
              placeholder="Por ejemplo: huevo, queso, pan blanco"
              value={draft.exclusions}
              onChange={(e) => field("exclusions", e.target.value)}
            />
          </label>
          <label>
            Indicaciones de mi profesional{" "}
            <span className="optional">opcional</span>
            <textarea
              rows={3}
              maxLength={1000}
              placeholder="Transcribe una indicación alimentaria para revisión. No incluyas documentos ni datos identificativos."
              value={draft.medicalNotes}
              onChange={(e) => field("medicalNotes", e.target.value)}
            />
          </label>
          <div className="review-note">
            <Icon name="info" size={18} />
            <p>
              {profileRestrictions(draft, catalog).reason ||
                "Los alimentos reconocidos se excluyen de las recetas. Separa sus nombres con comas. Las indicaciones médicas o los alimentos que no podamos reconocer ponen las sugerencias en pausa."}
            </p>
          </div>
        </section>
      </div>
      <div className="form-actions">
        <span>
          <Icon name="shield" size={16} />
          Se conserva en la PC de Nutribot al cerrar el navegador
        </span>
        <button type="submit" className="btn primary">
          Guardar mi perfil
          <Icon name="check" size={18} />
        </button>
      </div>
    </form>
  );
}
