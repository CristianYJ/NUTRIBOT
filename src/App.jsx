import {calorieActivities,calorieEstimate} from './calorie-estimate.js';
import { recipeContext } from "./recipe-context.js";
import { MAX_CHAT_MESSAGES } from "./conversation-limits.js";
import PantryWorkspace from "./PantryWorkspace.jsx";
import { authenticatedFetch } from "./auth-api.js";
import AuthPage from "./AuthPage.jsx";
import LandingPage from "./LandingPage.jsx";
import PrivacyPage from "./PrivacyPage.jsx";
import { publicPage } from "./public-navigation.js";
import PhoneConnection from "./PhoneConnection.jsx";
import { accountRequest, acceptSession } from "./auth-api.js";
import { useChatPersistence } from "./useChatPersistence.js";
import { todayDate, ageFromBirthDate } from "./date-utils.js";
import { newId } from "./ids.js";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import PantryImport from "./PantryImport.jsx";
import PlanUsage, { usePlanUsage } from './PlanUsage.jsx';
import RecipeCardCalories from "./RecipeCardCalories.jsx";
import CulinaryHeader from "./CulinaryHeader.jsx";
import {useMeals, MealFeedback, CalorieGoal} from './MealTracking.jsx';
import HomeDashboard from "./HomeDashboard.jsx";
import AssistantWorkspace from "./AssistantWorkspace.jsx";
import { EdamamBadge, EdamamFavorites } from './EdamamRecipeView.jsx';
import AdminPortal from './AdminPortal.jsx';
import NutritionPanel from "./NutritionPanel.jsx";
import { requestRecipe, stateRequest, pantryRequest } from "./api.js";
import { usePersistence } from "./usePersistence.js";
import { readNavigation, navigationUrl, openRecipeInHistory, closeRecipeInHistory } from "./navigation.js";
import { readChat } from "./chat-session.js";
import { profileRestrictions } from "./profile-rules.js";
import { allergyOptions } from "./data.js";
import { matchesProfile, requiresReview } from "./engine.js";

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

function RecipeCard({ recipe: r, saved, onOpen, onSave }) {
  const isSaved = saved.includes(r.id);
  return <article className="recipe-card">
    <button className={`recipe-image ${r.photo ? "" : "illustrated " + r.id}`} onClick={() => onOpen(r)} aria-label={`Ver ${r.title}`}>
      {r.photo ? <img src="/bowl-nutribot.png" alt="Bowl de arroz, frijoles, aguacate y tomate" />
        : <><span className="food-illustration">{r.emoji}</span><span className="food-ring" /></>}
      <span className="photo-label">{r.category}</span>
    </button>
    <button className={`save-btn ${isSaved ? "saved" : ""}`} onClick={() => onSave(r.id)}
      aria-label={`${isSaved ? "Quitar" : "Guardar"} ${r.title}`} aria-pressed={isSaved}>
      <Icon name="heart" size={19} />
    </button>
    <div className="recipe-copy">
      <div className="recipe-meta"><span><Icon name="clock" size={14} />{r.time} min</span><span>{r.category}</span></div>
      <button className="title-link" onClick={() => onOpen(r)}><h3>{r.title}</h3></button>
      <RecipeCardCalories recipeId={r.id} />
      <button className="availability recipe-view-button" type="button" onClick={() => onOpen(r)}>
        <Icon name="arrow" size={15} />Ver receta
      </button>
    </div>
  </article>;
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
  if (entryPage === "privacy") return <PrivacyPage />;
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
  const [adminAccess, setAdminAccess] = useState(false);
  useEffect(() => {
    let active = true;
    authenticatedFetch('/api/admin/access').then(response => { if (active && response.ok) setAdminAccess(true); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const { usage, usageError, refreshUsage } = usePlanUsage();
  const [loggingOut, setLoggingOut] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [ingredients, setIngredients] = useState(initial.ingredients);
  const ingredientById = Object.fromEntries(ingredients.map((i) => [i.id, i]));
  const recipes = initial.recipes;
  const [navigation, setNavigation] = useState(() =>
    readNavigation(new URL(location.href)),
  );
  const { page } = navigation;
  const meals = useMeals(page === 'home');
  const [focusPrivacy, setFocusPrivacy] = useState(false);
  const privacyPanel = useRef(null);
  useEffect(() => {
    if (page !== "profile" || !focusPrivacy) return;
    privacyPanel.current?.focus({ preventScroll: true });
    privacyPanel.current?.scrollIntoView({ block: "center", behavior: "auto" });
    setFocusPrivacy(false);
  }, [page, focusPrivacy]);
  useEffect(() => {
    const restore = () => setNavigation(readNavigation(new URL(location.href)));
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);
  function navigate(next, replace = false, entryState = null) {
    const url = navigationUrl(location.href, next);
    if (url.href !== location.href)
      history[replace ? "replaceState" : "pushState"](entryState, "", url);
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
  const [meal, setMeal] = useState("Todas");
  const selected = allRecipes.find(recipe => recipe.id === navigation.recipeId) || null;
  const [servings, setServings] = useState(1);
  const [recipeTab, setRecipeTab] = useState("ingredients");
  const [recipeCalories, setRecipeCalories] = useState(null);
  const [nutritionWithinLimits, setNutritionWithinLimits] = useState(false);
  const recipeClosing = useRef(false);
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
  const pantryImport = useRef(null);
  const openPantryImport = (mode) => pantryImport.current?.open(mode);
  const [confirmReset, setConfirmReset] = useState(false);
  const request = useRef(null);
  const dialog = useRef(null);
  const resetDialog = useRef(null);
  const pending = useRef(null);

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
    recipeClosing.current = false;
    if (selected) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [selected]);
  useEffect(() => {
    setServings(navigation.servings || 1);
    setNutritionWithinLimits(false);
    setChecked([]);
    setRecipeTab("ingredients");
    setRecipeCalories(null);
  }, [navigation.recipeId, navigation.servings]);
  useEffect(() => {
    if (confirmReset) resetDialog.current?.showModal();
    else resetDialog.current?.close();
  }, [confirmReset]);
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
    navigate({ page: id });
    setSearch("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openRecipe(r, portions = 1) {
    // One history entry per open dialog. Back restores the page beneath it.
    setNavigation(openRecipeInHistory(window, r.id, portions));
  }
  function closeRecipe() {
    if (recipeClosing.current) return;
    recipeClosing.current = true;
    const next = closeRecipeInHistory(window);
    if (next) setNavigation(next);
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
            ? "Agregué ingredientes con Nutri-Vision."
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
  async function generate(text = "¿Qué puedo cocinar con lo que tengo?", mode = "initial", timeOverride = null) {
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
        maxTime: timeOverride || maxTime,
        message: text,
        history: recipeContext(messages),
        mode,
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
          text: error.requestId ? `${error.message} Referencia: ${error.requestId.slice(0, 8)}.` : error.message,
          recipes: [],
          retryText: text,
          retryMode: mode,
          id: newId(),
        },
      ]);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
      refreshUsage();
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
      meals.refresh().catch(() => {});
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
  return (
    <>
      <div className={`app-shell culinary-shell ${page === "assistant" ? "assistant-shell" : ""}`}>
        <CulinaryHeader
          brand={<Brand />}
          page={page}
          profile={adminAccess ? { ...profile, plan: { code: 'goat', name: 'GOAT Mode' } } : profile}
          ingredients={ingredients}
          recipes={allRecipes.filter((recipe) =>
            matchesProfile(recipe, profile, ingredients),
          )}
          onNavigate={go}
          onOpenRecipe={openRecipe}
          onLogout={logout}
          loggingOut={loggingOut}
          onConnect={() => setPhoneOpen(true)}
          onAdmin={adminAccess ? () => go('admin') : null}
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
                    <button onClick={() => persistence.flush().catch(() => { })}>
                      Reintentar guardado
                    </button>
                  ))}
              </div>
            )}
          {chatPersistence.error && (
            <div className="chat-save-error" role="alert">
              <span>{chatPersistence.error.message}</span>
              <button onClick={() => chatPersistence.flush().catch(() => { })}>
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
            {page === 'admin' && (adminAccess ? <AdminPortal /> : <div className="database-loading"><h1>Acceso administrativo</h1><p>Esta cuenta no tiene acceso al portal.</p></div>)}
            {page === "home" && (
              <HomeDashboard tracker={meals} profile={profile} pantry={pantry} dates={pantryDates}
                ingredients={ingredients} recipes={allRecipes} saved={saved}
                usage={usage} usageError={usageError} onNavigate={go}
                onOpenRecipe={openRecipe} onSave={toggleSave} onImport={openPantryImport}
                onAsk={(text) => { setMessage(text); go("assistant"); }}
                onFavorites={() => { go("recipes"); setMeal("Todas"); }} />
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
                mealTracker={meals}
                usage={usage}
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
              />
            )}
            {page === "recipes" && (
              <div className="page-enter">
                <div className="page-title">
                  <h1>Mis Recetas</h1>
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
                    Hay alimentos en “Otros alimentos que evito” que no se pudieron reconocer.
                  </Empty>
                ) : (
                  <>
                    <div className="recipe-grid library">
                      <EdamamFavorites meal={meal} mealTracker={meals} localCount={allRecipes.filter(r => matchesProfile(r, profile, ingredients) && (meal === "Todas" || r.category === meal)).length} />
                      {allRecipes
                        .filter(
                          (r) =>
                            matchesProfile(r, profile, ingredients) &&
                            (meal === "Todas" || r.category === meal),
                        )
                        .map((r) => (
                          <RecipeCard key={r.id} recipe={r} saved={saved} onOpen={openRecipe} onSave={toggleSave} />
                        ))}
                    </div>
                  </>
                )}
                <div className="quiet-note">
                  <Icon name="info" size={15} />
                  <span>
                    {profile.medicalNotes?.trim() && " Las indicaciones escritas de tu profesional no se verifican automáticamente."}
                  </span>
                </div>
              </div>
            )}
            {page === "profile" && (
              <div className="page-enter">
                <div className="page-title">
                  <h1>Mi Perfil</h1>
                </div>
                <PlanUsage usage={usage} error={usageError} onRefresh={refreshUsage} />
                <ProfileForm
                  tracker={meals}
                  catalog={ingredients}
                  profile={profile}
                  onSave={(p) => {
                    setProfile(p);
                    setToast("Perfil actualizado; comprobando guardado…");
                  }}
                />
                <section className="privacy-panel" ref={privacyPanel} tabIndex={-1}
                  aria-labelledby="profile-privacy-title">
                  <Icon name="shield" size={24} />
                  <div>
                    <h3 id="profile-privacy-title">Privacidad de tus datos</h3>
                    <p>
                      Tu perfil, despensa y recetas se guardan en nuestros servidores.
                      Al generar tus recetas algunos datos se comparten con nuestros colaboradores.
                      Para más información revisa nuestra <a href="#politica-privacidad">política de privacidad</a>
                    </p>
                  </div>
                  <button
                    className="privacy-reset"
                    onClick={() => setConfirmReset(true)}
                  >
                    <Icon name="reset" size={16} />
                    Restaurar mis datos
                  </button>
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
          <footer className={`app-footer${page === 'assistant' || page === 'recipes' ? ' edamam-footer' : ''}`}>
            <Brand small />
            <span>2026</span>
            <div className="footer-actions">
              {(page === 'assistant' || page === 'recipes') && <EdamamBadge compact />}
              <a className="footer-privacy" href="#politica-privacidad">Política de privacidad</a>
            </div>
          </footer>
        </div>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {(adminAccess ? [{ id: 'admin', label: 'Admin', icon: 'shield' }, ...pages] : pages).map((p) => (
            <button
              key={p.id}
              data-page={p.id}
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
        usage={usage}
        onUsageChange={refreshUsage}
        catalog={ingredients}
        onSave={addPantry}
        ref={pantryImport}
        hideIntro
      />
      <dialog
        className="recipe-dialog"
        aria-labelledby="recipe-title"
        ref={dialog}
        onCancel={(event) => { event.preventDefault(); closeRecipe(); }}
        onClick={(e) => {
          if (e.target === dialog.current) closeRecipe();
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
                onClick={closeRecipe}
              >
                <Icon name="close" />
              </button>
              <Tag>{selected.category}</Tag>
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
              <div className="detail-meta recipe-summary">
                <span><small>Tiempo</small><strong>{selected.time} min</strong></span>
                <span><small>Dificultad</small><strong>{selected.difficulty || 'Fácil'}</strong></span>
                <span><small>Personas</small><strong>{servings}</strong></span>
                <span><small>Calorías por persona</small><strong>{recipeCalories == null ? 'Sin verificar' : `${recipeCalories.toLocaleString('es-SV',{maximumFractionDigits:2})} kcal`}</strong></span>
              </div>
              {!matchesProfile(selected, profile, ingredients) && (
                <div className="review-note">
                  Esta receta ya no coincide con tu perfil actual. La
                  preparación está deshabilitada.
                </div>
              )}
              <NutritionPanel key={selected.id} recipe={selected} servings={servings} onValidation={setNutritionWithinLimits} onCalories={setRecipeCalories} />
              {(profile.maxSaturatedFatG || profile.maxSodiumMg || profile.maxSugarG) && !nutritionWithinLimits && (
                <div className="review-note">Hay límites nutricionales en tu perfil. Esta receta aún no se pudo verificar o supera un límite; revisa el resultado antes de prepararla.</div>
              )}
              <section className="recipe-method">
                <div className="recipe-method-tabs" role="tablist" aria-label="Preparación de la receta">
                  <button id="recipe-ingredients-tab" role="tab" aria-selected={recipeTab==='ingredients'} aria-controls="recipe-ingredients-panel" onClick={()=>setRecipeTab('ingredients')}>Ingredientes</button>
                  <button id="recipe-steps-tab" role="tab" aria-selected={recipeTab==='steps'} aria-controls="recipe-steps-panel" onClick={()=>setRecipeTab('steps')}>Pasos</button>
                </div>
                <div id="recipe-ingredients-panel" role="tabpanel" aria-labelledby="recipe-ingredients-tab" hidden={recipeTab!=='ingredients'}>
              <div className="serving-row">
                <h3>Ingredientes</h3>
                <label>
                  Personas{" "}
                  <select
                    aria-label="Personas"
                    value={servings}
                    onChange={(e) => setServings(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="microcopy">
                Cantidades para {servings} {servings === 1 ? "persona" : "personas"}.{" "}
                La despensa comprueba presencia, no cantidades.
              </p>
              <ul className="detail-ingredients">
                {selected.ingredients.map((id, i) => (
                  <li key={id}>
                    <span className="detail-ingredient-emoji">
                      {ingredientById[id].emoji}
                    </span>
                    <span>
                      {Number.isFinite(selected.grams?.[i]) && selected.grams[i] > 0
                        ? <>{Number((selected.grams[i] * servings).toFixed(2)).toLocaleString("es")} g de {ingredientById[id].name.toLowerCase()}
                          <small className="ingredient-base-amount">Por persona: {selected.amounts[i]}</small></>
                        : <>{selected.amounts[i]}{servings > 1 && <strong className="multiplier"> × {servings}</strong>}</>}

                    </span>
                    <span className={pantry.includes(id) ? "have" : "need"}>
                      {pantry.includes(id) ? "En despensa" : "Te falta"}
                    </span>
                  </li>
                ))}
              </ul>
                </div>
                <div id="recipe-steps-panel" role="tabpanel" aria-labelledby="recipe-steps-tab" hidden={recipeTab!=='steps'}>
              <h3 className="steps-heading">Manos a la cocina</h3>
              <div className="recipe-steps">
                {selected.steps.map((step, i) => (
                  <button
                    key={step}
                    className={checked.includes(i) ? "done" : ""}
                    aria-pressed={checked.includes(i)}
                    disabled={!matchesProfile(selected, profile, ingredients) || (Boolean(profile.maxSaturatedFatG || profile.maxSodiumMg || profile.maxSugarG) && !nutritionWithinLimits)}
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
                </div>
              </section>
              <MealFeedback key={`meal-${selected.id}`} recipe={selected} tracker={meals} />
              <p className="microcopy">
                Recuerda siempre revisar las etiquetas de los productos y las posibles trazas de
                alérgenos.
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
          borrarán sus recetas guardadas y el chat.
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

function ProfileForm({ profile, onSave, catalog, tracker }) {
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
            <h2>Datos Personales</h2>
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
          <details className="profile-optional">
            <summary>Datos personales y estimación de calorías</summary>
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
            <label>Sexo utilizado por la fórmula <span className="optional">opcional</span>
              <select value={draft.calorieSex || ''} onChange={e=>field('calorieSex',e.target.value)}><option value="">Sin indicar</option><option value="female">Femenino</option><option value="male">Masculino</option></select>
            </label>
            <label>Nivel de actividad <span className="optional">opcional</span>
              <select value={draft.calorieActivity || ''} onChange={e=>field('calorieActivity',e.target.value)}><option value="">Selecciona tu actividad</option>{calorieActivities.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
            </label>
            <label className="calorie-consent"><input type="checkbox" checked={draft.calorieEstimateEligible || false} onChange={e=>field('calorieEstimateEligible',e.target.checked)} />Quiero una estimación de mantenimiento. No estoy en embarazo ni lactancia y no necesito una pauta clínica específica.</label>
            <p className="microcopy">Para adultos de 19 a 78 años. Estimación orientativa con Mifflin–St Jeor y actividad; no prescribe dietas ni cambia tu meta automáticamente. La sugerencia aparece abajo al completar estos datos. Guarda tu perfil para conservarlos.</p>
          </details>
          <CalorieGoal tracker={tracker} suggestedKcal={calorieEstimate(draft,todayDate())} />
        </section>
        <section className="panel form-panel">
          <div className="form-section-title">
            <h2>Restricciones</h2>
          </div>
          <label>Alergias y restricciones</label>
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
          <details className="profile-optional">
            <summary>Indicaciones y límites opcionales{(draft.maxSaturatedFatG || draft.maxSodiumMg || draft.maxSugarG) ? " · Hay límites activos" : ""}</summary>
            <p className="microcopy">Solo si tu profesional te dio indicaciones. Puedes dejarlo vacío para cocinar con tus preferencias y alergias.</p>
            <div className="review-note">
              <Icon name="info" size={18} />
              <p>
                {profileRestrictions(draft, catalog).reason ||
                  "Las recetas respetan las alergias y los alimentos que evitas. Escribe nombres separados por comas; te avisaremos si alguno necesita aclaración."}
              </p>
            </div>
            <label>
              Indicaciones de mi profesional{" "}
              <span className="optional">opcional</span>
              <textarea
                rows={3}
                maxLength={1000}
                placeholder="Anota aquí las indicaciones de tu profesional. No incluyas datos identificativos."
                value={draft.medicalNotes}
                onChange={(e) => field("medicalNotes", e.target.value)}
              />
            </label>
            <p className="microcopy">Límites opcionales por persona y por comida. Úsalos solo si ya te indicaron una cifra concreta.</p>
            <div className="field-row">
              <label>Grasa saturada máxima (g)
                <input type="number" min="0.01" max="100" step="0.01" value={draft.maxSaturatedFatG || ""} onChange={(e) => field("maxSaturatedFatG", e.target.value)} placeholder="Sin límite" />
              </label>
              <label>Sodio máximo (mg)
                <input type="number" min="0.01" max="10000" step="0.01" value={draft.maxSodiumMg || ""} onChange={(e) => field("maxSodiumMg", e.target.value)} placeholder="Sin límite" />
              </label>
            </div>
            <label>Azúcares totales máximos (g)
              <input type="number" min="0.01" max="200" step="0.01" value={draft.maxSugarG || ""} onChange={(e) => field("maxSugarG", e.target.value)} placeholder="Sin límite" />
            </label>
          </details>
        </section>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn primary">
          Guarda
          <Icon name="check" size={18} />
        </button>
      </div>
    </form>
  );
}
