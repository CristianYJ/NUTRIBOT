import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { requestRecipe, stateRequest } from "./api.js";
import { usePersistence } from "./usePersistence.js";
import { ingredients, allergyOptions } from "./data.js";
import {
  availability,
  matchesProfile,
  recommend,
  requiresReview,
} from "./engine.js";

const pages = [
  { id: "home", label: "Inicio", icon: "home" },
  { id: "pantry", label: "Mi despensa", icon: "pantry" },
  { id: "assistant", label: "Nutribot IA", icon: "spark" },
  { id: "recipes", label: "Mis recetas", icon: "book" },
  { id: "profile", label: "Mi perfil", icon: "user" },
];
const ingredientById = Object.fromEntries(ingredients.map((i) => [i.id, i]));
function Brand({ small = false }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <img src="/icon.svg" alt="" />
      <span>
        nutribot<span className="brand-dot">.</span>
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
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    stateRequest("GET", undefined, controller.signal)
      .then((state) => {
        if (!controller.signal.aborted) setInitial(state);
      })
      .catch((problem) => {
        if (!controller.signal.aborted) setError(problem.message);
      });
    return () => controller.abort();
  }, [attempt]);
  if (!initial)
    return (
      <main className="database-loading">
        <Brand />
        <h1>{error ? "No pudimos cargar tu cocina" : "Abriendo tu cocina…"}</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Cargando tu perfil y tus recetas guardadas."}
        </p>
        {error && (
          <button
            className="btn primary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Volver a intentar
          </button>
        )}
      </main>
    );
  return <Workspace initial={initial} />;
}

function Workspace({ initial }) {
  const ingredients = initial.ingredients;
  const recipes = initial.recipes;
  const [page, setPage] = useState("home");
  const [pantry, setPantry] = useState(initial.pantry);
  const [profile, setProfile] = useState(initial.profile);
  const [saved, setSaved] = useState(initial.saved);
  const [generated, setGenerated] = useState(initial.generated);
  const [connection, setConnection] = useState("checking");
  const allRecipes = [...generated, ...recipes];
  const [feedback, setFeedback] = useState(initial?.feedback || {});
  const [mobile, setMobile] = useState(
    new URLSearchParams(location.search).has("mobile"),
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [recipeTab, setRecipeTab] = useState("Explorar");
  const [meal, setMeal] = useState("Todas");
  const [selected, setSelected] = useState(null);
  const [servings, setServings] = useState(1);
  const [checked, setChecked] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [maxTime, setMaxTime] = useState(30);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const request = useRef(null);
  const dialog = useRef(null);
  const resetDialog = useRef(null);
  const pending = useRef(null);
  const end = useRef(null);
  const ready = recommend(pantry, profile, 60, recipes);
  const persistence = usePersistence(initial, {
    pantry,
    profile,
    saved,
    feedback,
  });
  const [resetting, setResetting] = useState(false);
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
    if (messages.length)
      end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    setPage(id);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function openRecipe(r) {
    setSelected(r);
    setServings(1);
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
    setPantry((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  async function generate(text = "¿Qué puedo cocinar con lo que tengo?") {
    if (request.current) return;
    go("assistant");
    setMessage("");
    setBusy(true);
    const id = crypto.randomUUID();
    const controller = new AbortController();
    request.current = controller;
    pending.current = id;
    setMessages((m) => [...m, { role: "user", text, id }]);
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
        { role: "bot", ...result, id: crypto.randomUUID() },
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
          id: crypto.randomUUID(),
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
      const state = await stateRequest("DELETE", { revision });
      persistence.acceptReset(state);
      setPantry(state.pantry);
      setProfile(state.profile);
      setSaved(state.saved);
      setGenerated(state.generated);
      setFeedback(state.feedback);
      setMessages([]);
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
  function SectionHead({ eyebrow, title, action }) {
    return (
      <div className="section-heading">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
    );
  }
  const filteredIngredients = ingredients.filter(
    (i) =>
      (category === "Todos" || i.category === category) &&
      i.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
  );
  return (
    <>
      <div className="preview-bar">
        <span>
          <span className="status-dot" /> PROTOTIPO INTERACTIVO{" "}
          <span className="preview-version">/ 01 · De la idea a tu mesa</span>
        </span>
        <button onClick={() => setMobile((m) => !m)}>
          <Icon name={mobile ? "monitor" : "phone"} size={15} />
          {mobile ? "Vista amplia" : "Vista móvil"}
        </button>
      </div>
      <div className={`app-shell ${mobile ? "mobile-preview" : ""}`}>
        <aside className="sidebar">
          <Brand />
          <div className="nav-eyebrow">TU COCINA, MÁS SIMPLE</div>
          <nav aria-label="Navegación principal">
            {pages.map((p) => (
              <button
                key={p.id}
                className={page === p.id ? "active" : ""}
                aria-current={page === p.id ? "page" : undefined}
                onClick={() => go(p.id)}
              >
                <Icon name={p.icon} />
                <span>{p.label}</span>
                {p.id === "assistant" && <span className="tiny-ai">IA</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="leaf-badge">
              <Icon name="leaf" size={25} />
            </span>
            <h3>
              Pequeños ingredientes.
              <br />
              Grandes posibilidades.
            </h3>
            <p>Lo que tienes en casa puede ser tu próxima comida favorita.</p>
            <span>HECHO PARA TU DÍA A DÍA</span>
          </div>
          <button className="sidebar-user" onClick={() => go("profile")}>
            <span className="avatar">{profile.name.charAt(0) || "T"}</span>
            <span>
              <strong>{profile.name || "Tu perfil"}</strong>
              <small>Mi espacio personal</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </aside>
        <div className="main-area">
          <header className="topbar">
            <div className="desktop-breadcrumb">
              Mi espacio <span>/</span>{" "}
              <strong>{pages.find((p) => p.id === page).label}</strong>
            </div>
            <div className="mobile-brand">
              <Brand small />
            </div>
            <div className="topbar-right">
              <span className="demo-pill">
                <span />
                {connection === "configured"
                  ? "IA habilitada"
                  : connection === "checking"
                    ? "Comprobando IA"
                    : "IA sin conexión"}
              </span>
              <button
                className="avatar"
                aria-label="Abrir mi perfil"
                onClick={() => go("profile")}
              >
                {profile.name.charAt(0) || "T"}
              </button>
            </div>
          </header>
          <div
            className={`storage-status ${persistence.status}`}
            role={persistence.error ? "alert" : "status"}
          >
            <span>
              {persistence.error
                ? persistence.error.message
                : persistence.status === "saving"
                  ? "Guardando cambios…"
                  : "Cambios guardados en esta PC"}
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
          <main>
            {page === "home" && (
              <div className="page-enter">
                <div className="welcome-row">
                  <div>
                    <div className="eyebrow greeting">
                      <Icon name="sun" size={15} /> UN BUEN DÍA EMPIEZA EN TU
                      COCINA
                    </div>
                    <h1>
                      ¡Hola, {profile.name || "qué gusto verte"}!{" "}
                      <span className="wave">✺</span>
                    </h1>
                    <p>Hoy, algo rico empieza con lo que ya tienes.</p>
                  </div>
                  <div className="date-chip">
                    <Icon name="leaf" size={17} /> A tu ritmo. A tu gusto.
                  </div>
                </div>
                <section className="hero">
                  <div className="hero-copy">
                    <Tag tone="hero-tag">
                      <Icon name="spark" size={14} /> TU ASISTENTE DE COCINA CON
                      IA
                    </Tag>
                    <h2>
                      De lo que tienes,
                      <br />a lo que <em>te encanta.</em>
                    </h2>
                    <p>
                      Tus ingredientes, tus preferencias y una nueva idea para
                      llevar a la mesa.
                    </p>
                    {button("Vamos a cocinar", () => generate(), "spark")}
                    <span className="hero-footnote">
                      Sin complicarte. Sin comprar de más.
                    </span>
                  </div>
                  <div className="hero-visual">
                    <img
                      src="/bowl-nutribot.png"
                      alt="Bowl de arroz, frijoles, aguacate y tomate, ejemplo de una receta casera"
                    />
                    <div className="hero-sticker">
                      <span className="sticker-icon">
                        <Icon name="leaf" size={20} />
                      </span>
                      <div>
                        <strong>Con lo que hay en casa</strong>
                        <span>Ingredientes sencillos, nuevas ideas</span>
                      </div>
                    </div>
                    <span className="image-credit">
                      Imagen ilustrativa · creada con IA
                    </span>
                  </div>
                </section>
                <div className="home-grid">
                  <section className="pantry-summary panel">
                    <SectionHead
                      title="Tu despensa tiene potencial"
                      action={
                        <button
                          className="text-btn"
                          onClick={() => go("pantry")}
                        >
                          Editar
                          <Icon name="arrow" size={16} />
                        </button>
                      }
                    />
                    <p className="section-description">
                      {pantry.length} ingredientes listos para inspirarte.
                    </p>
                    <div className="ingredient-strip">
                      {pantry.slice(0, 5).map((id) => (
                        <button key={id} onClick={() => go("pantry")}>
                          <span>{ingredientById[id].emoji}</span>
                          <small>{ingredientById[id].name.split(" ")[0]}</small>
                        </button>
                      ))}
                      <button
                        className="add-ingredient"
                        onClick={() => go("pantry")}
                        aria-label="Añadir ingredientes"
                      >
                        <span>
                          <Icon name="plus" />
                        </span>
                        <small>Añadir</small>
                      </button>
                    </div>
                    <div className="pantry-summary-footer">
                      <Icon name="leaf" size={15} />
                      <span>Aprovecha primero lo que ya tienes.</span>
                    </div>
                  </section>
                  <section className="profile-summary panel">
                    <div className="profile-summary-top">
                      <span className="soft-icon">
                        <Icon name="shield" />
                      </span>
                      <span className="eyebrow">PENSADO PARA TI</span>
                    </div>
                    <h3>Tu cocina, tus preferencias</h3>
                    <p>
                      {profile.goal}. Personaliza las ideas desde tu perfil.
                    </p>
                    <div className="tags">
                      <Tag>
                        {profile.diet === "Sin preferencia"
                          ? "Cocina variada"
                          : profile.diet}
                      </Tag>
                      {profile.allergies.length > 0 && (
                        <Tag>{profile.allergies.length} filtro(s)</Tag>
                      )}
                    </div>
                    <button className="text-btn" onClick={() => go("profile")}>
                      Completar mi perfil
                      <Icon name="arrow" size={16} />
                    </button>
                  </section>
                </div>
                <section className="ideas-section">
                  <SectionHead
                    eyebrow="UN POCO DE INSPIRACIÓN"
                    title="De tu despensa a tu plato"
                    action={
                      <button
                        className="text-btn"
                        onClick={() => go("recipes")}
                      >
                        Ver recetas
                        <Icon name="arrow" size={16} />
                      </button>
                    }
                  />
                  {ready.length ? (
                    <div className="recipe-grid">
                      {ready.slice(0, 3).map((r) => (
                        <RecipeCard key={r.id} recipe={r} />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon="chef"
                      title={
                        requiresReview(profile)
                          ? "Tus indicaciones necesitan revisión"
                          : "Tu próxima idea empieza en la despensa"
                      }
                      action={button("Ir a mi despensa", () => go("pantry"))}
                    >
                      No hay sugerencias disponibles con tu configuración
                      actual.
                    </Empty>
                  )}
                </section>
                <div className="quiet-note">
                  <Icon name="info" size={15} />
                  <span>
                    Estas tarjetas son ejemplos del catálogo. Pulsa «Vamos a
                    cocinar» para generar recetas nuevas con Gemini.
                  </span>
                </div>
              </div>
            )}
            {page === "pantry" && (
              <div className="page-enter">
                <div className="page-title">
                  <div className="eyebrow">EL PUNTO DE PARTIDA</div>
                  <h1>¿Qué hay en tu cocina?</h1>
                  <p>
                    Añade los ingredientes que tienes. Nosotros ponemos las
                    ideas.
                  </p>
                </div>
                <div className="inventory-banner">
                  <span className="soft-icon">
                    <Icon name="pantry" size={27} />
                  </span>
                  <div>
                    <strong>{pantry.length} ingredientes en tu despensa</strong>
                    <p>
                      Selecciona para añadir o quitar. Comprueba las cantidades
                      al abrir una receta.
                    </p>
                  </div>
                  {button("Buscar recetas", () => generate(), "spark")}
                </div>
                <div className="search-box">
                  <Icon name="search" />
                  <input
                    aria-label="Buscar ingrediente"
                    placeholder="Busca un ingrediente: tomate, arroz, frijoles…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Limpiar búsqueda"
                      onClick={() => setSearch("")}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </div>
                <div className="filter-row">
                  {[
                    "Todos",
                    "Vegetales",
                    "Frutas",
                    "Granos",
                    "Proteínas",
                    "Lácteos",
                  ].map((c) => (
                    <button
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                      key={c}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="ingredient-grid">
                  {filteredIngredients.map((i) => (
                    <button
                      key={i.id}
                      aria-pressed={pantry.includes(i.id)}
                      className={`ingredient-tile ${pantry.includes(i.id) ? "in-pantry" : ""}`}
                      onClick={() => toggleIngredient(i.id)}
                    >
                      <span className="ingredient-emoji">{i.emoji}</span>
                      <strong>{i.name}</strong>
                      <small>{i.category}</small>
                      <span className="ingredient-toggle">
                        <Icon
                          name={pantry.includes(i.id) ? "check" : "plus"}
                          size={17}
                        />
                      </span>
                    </button>
                  ))}
                </div>
                {!filteredIngredients.length && (
                  <Empty
                    icon="search"
                    title="Ese ingrediente aún no está en el catálogo"
                  >
                    La demostración incluye 14 ingredientes. Prueba con arroz,
                    tomate o aguacate.
                  </Empty>
                )}
                <div className="tip-card">
                  <Icon name="leaf" size={24} />
                  <div>
                    <strong>Una despensa más consciente</strong>
                    <p>
                      Antes de elegir, revisa qué alimentos necesitas aprovechar
                      primero.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {page === "assistant" && (
              <div className="page-enter assistant-page">
                <div className="assistant-heading">
                  <span className="bot-logo">
                    <Icon name="spark" size={29} />
                  </span>
                  <div>
                    <h1>Tu compañero de cocina</h1>
                    <p>
                      Nutribot · Asistente IA{" "}
                      <span className="inline-demo">Gemini · Google</span>
                    </p>
                  </div>
                </div>
                <div className="context-bar">
                  <button onClick={() => go("pantry")}>
                    <Icon name="pantry" size={17} />
                    {pantry.length} ingredientes
                    <Icon name="chevron" size={14} />
                  </button>
                  <button onClick={() => go("profile")}>
                    <Icon name="shield" size={17} />
                    {requiresReview(profile)
                      ? "Revisión pendiente"
                      : profile.allergies.length + " filtros de alergias"}
                  </button>
                  <label>
                    <Icon name="clock" size={17} />
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
                <div className="conversation" aria-live="polite">
                  {messages.length === 0 ? (
                    <div className="chat-welcome">
                      <div className="chat-welcome-art">
                        <Icon name="chef" size={60} />
                        <span>✦</span>
                      </div>
                      <Tag>UN POCO DE AYUDA. MUCHAS IDEAS.</Tag>
                      <h2>¿Qué cocinamos hoy?</h2>
                      <p>
                        Comencemos con tu despensa y las preferencias de tu
                        perfil. Elige una idea para probar el recorrido.
                      </p>
                      <div className="suggestion-grid">
                        {[
                          "¿Qué puedo cocinar con lo que tengo?",
                          "Busquemos algo rápido",
                          "Quiero aprovechar mis vegetales",
                        ].map((t, i) => (
                          <button onClick={() => generate(t)} key={t}>
                            <Icon name={["pantry", "clock", "leaf"][i]} />
                            <span>{t}</span>
                            <Icon name="arrow" size={17} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div className={`message ${m.role}`} key={m.id}>
                        {m.role === "bot" && (
                          <span className="message-avatar">
                            <Icon name="spark" size={18} />
                          </span>
                        )}
                        <div className="message-content">
                          {m.role === "bot" && (
                            <strong className="message-author">
                              Nutribot{" "}
                              <span>
                                {m.source === "gemini"
                                  ? "· Generado con Gemini"
                                  : "· Aviso de Nutribot"}
                              </span>
                            </strong>
                          )}
                          <p>{m.text}</p>
                          {m.recipes?.length > 0 && (
                            <div className="chat-recipes">
                              {m.recipes
                                .filter(
                                  (r) =>
                                    matchesProfile(r, profile) &&
                                    !availability(r, pantry).missing.length &&
                                    r.time <= maxTime,
                                )
                                .map((r) => (
                                  <button
                                    onClick={() => openRecipe(r)}
                                    className="chat-recipe"
                                    key={r.id}
                                  >
                                    <span className="chat-recipe-art">
                                      {r.emoji}
                                    </span>
                                    <span>
                                      <strong>{r.title}</strong>
                                      <small>
                                        {r.time} min · Ver cantidades y
                                        preparación
                                      </small>
                                    </span>
                                    <Icon name="arrow" size={18} />
                                  </button>
                                ))}
                            </div>
                          )}
                          {m.type === "review" &&
                            button(
                              "Revisar mi perfil",
                              () => go("profile"),
                              "arrow",
                              "secondary",
                            )}
                          {m.type === "error" &&
                            button(
                              "Reintentar",
                              () => generate(m.retryText),
                              "reset",
                              "secondary",
                            )}
                          {m.type === "empty" &&
                            button(
                              "Actualizar despensa",
                              () => go("pantry"),
                              "plus",
                              "secondary",
                            )}
                        </div>
                      </div>
                    ))
                  )}
                  {busy && (
                    <div className="message bot">
                      <span className="message-avatar">
                        <Icon name="spark" size={18} />
                      </span>
                      <div className="typing">
                        <span />
                        <span />
                        <span />
                        <small>Gemini está preparando tu receta…</small>
                      </div>
                    </div>
                  )}
                  <div ref={end} />
                </div>
                <form
                  className="chat-compose"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (message.trim()) generate(message.trim());
                  }}
                >
                  <input
                    aria-label="Mensaje para Nutribot"
                    placeholder="Cuéntame qué te gustaría cocinar…"
                    value={message}
                    maxLength={500}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    type="submit"
                    aria-label="Enviar mensaje"
                    disabled={!message.trim() || busy}
                  >
                    <Icon name="send" size={20} />
                  </button>
                </form>
                <p className="chat-disclaimer">
                  Al generar, se envían a Google tu mensaje, los ingredientes y
                  los filtros alimentarios. No incluyas datos personales en el
                  mensaje. Registra las restricciones en tu perfil.
                </p>
              </div>
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
                {requiresReview(profile) ? (
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
                            matchesProfile(r, profile) &&
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
                        matchesProfile(r, profile) &&
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
                      ingredientes y los filtros alimentarios. Nombre, peso,
                      estatura e indicaciones escritas no se envían a Google.
                      Usa datos ficticios en las pruebas.
                    </p>
                    <button
                      className="text-btn"
                      onClick={() => setConfirmReset(true)}
                    >
                      <Icon name="reset" size={16} />
                      Borrar datos locales y restaurar
                    </button>
                  </div>
                </section>
              </div>
            )}
          </main>
          <footer className="app-footer">
            <Brand small />
            <span>Menos dudas. Más cocina.</span>
            <span>Prototipo 0.1 · El Salvador</span>
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
              {!matchesProfile(selected, profile) && (
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
                    disabled={!matchesProfile(selected, profile)}
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
          Se borrarán el perfil, las recetas guardadas, el chat y los cambios de
          esta instalación, también para otras pestañas de esta PC. Las copias
          de seguridad no se borran.
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

function ProfileForm({ profile, onSave }) {
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
            Selecciona las que correspondan. Si necesitas indicar algo más,
            escríbelo abajo para revisión.
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
              placeholder="Escribe aquí una restricción adicional…"
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
              Las indicaciones escritas ponen las sugerencias en pausa: el
              asistente no interpreta recetas médicas ni valida restricciones
              clínicas.
            </p>
          </div>
        </section>
      </div>
      <div className="form-actions">
        <span>
          <Icon name="shield" size={16} />
          Se conserva en esta PC al cerrar el navegador
        </span>
        <button type="submit" className="btn primary">
          Guardar mi perfil
          <Icon name="check" size={18} />
        </button>
      </div>
    </form>
  );
}
