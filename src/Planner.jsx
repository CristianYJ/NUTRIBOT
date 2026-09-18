import { useEffect, useState } from "react";
import { matchesProfile } from "./engine.js";
import Icon from "./Icons.jsx";

const dateString = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dateString(d);
};
async function api(method = "GET", body, route = "/api/plan") {
  let response;
  try {
    response = await fetch(route, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "No se pudo conectar. Comprueba el servidor y actualiza el plan antes de volver a intentar.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("La respuesta del servidor no es válida.");
  }
  if (!response.ok)
    throw new Error(data.text || "No se pudo actualizar el plan.");
  return data;
}
export default function Planner({
  recipes,
  profile,
  pantry,
  ingredients,
  flush,
  onOpen,
}) {
  const today = dateString(new Date());
  const monday = addDays(
    today,
    -((new Date(today + "T12:00:00").getDay() + 6) % 7),
  );
  const [week, setWeek] = useState(monday),
    [date, setDate] = useState(today),
    [meal, setMeal] = useState("Almuerzo"),
    [recipeId, setRecipe] = useState(""),
    [servings, setServings] = useState(1);
  const [entries, setEntries] = useState([]),
    [summary, setSummary] = useState(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([api(), api("GET", undefined, "/api/summary")])
      .then(([list, stats]) => {
        if (alive) {
          setEntries(list);
          setSummary(stats);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);
  const allowed = recipes.filter((r) => matchesProfile(r, profile));
  const visible = entries.filter(
    (e) => e.date >= week && e.date <= addDays(week, 6),
  );
  const missing = [
    ...new Set(
      visible.flatMap(
        (e) => recipes.find((r) => r.id === e.recipeId)?.ingredients || [],
      ),
    ),
  ].filter((id) => !pantry.includes(id));
  async function add(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const revision = await flush();
      await api("POST", {
        revision,
        date,
        meal,
        recipeId,
        servings: Number(servings),
      });
      setNotice("Comida añadida a tu plan.");
      setWeek(
        addDays(date, -((new Date(date + "T12:00:00").getDay() + 6) % 7)),
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("DELETE", { id });
      setNotice("Comida retirada del plan. La receta se conserva.");
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-enter planner">
      <div className="page-title">
        <div className="eyebrow">UN POCO DE ORDEN, MÁS TIEMPO PARA TI</div>
        <h1>Tu semana organizada</h1>
        <p>Elige qué cocinar y revisa qué ingredientes te faltan.</p>
      </div>
      {summary && (
        <div className="planner-stats">
          {[
            [summary.generated, "Recetas de IA"],
            [summary.favorites, "Favoritas"],
            [summary.plannedMeals, "Comidas planificadas"],
          ].map(([n, label]) => (
            <div key={label}>
              <strong>{n}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="storage-status error" role="alert">
          {error}
          <button onClick={() => setRefresh((n) => n + 1)} disabled={busy}>
            Actualizar plan
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="microcopy">
          {notice}
        </p>
      )}
      <form className="panel planner-form" onSubmit={add}>
        <h2>Añadir una comida</h2>
        <div className="planner-fields">
          <label>
            Día
            <input
              type="date"
              value={date}
              min="2000-01-01"
              max="2100-12-31"
              required
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Comida
            <select value={meal} onChange={(e) => setMeal(e.target.value)}>
              {["Desayuno", "Almuerzo", "Cena"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="planner-recipe">
            Receta
            <select
              value={recipeId}
              required
              onChange={(e) => setRecipe(e.target.value)}
            >
              <option value="">Elige una receta</option>
              {allowed.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {r.source === "gemini" ? "Gemini" : "Ejemplo"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Porciones
            <select
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="btn primary"
          disabled={busy || loading || !allowed.some((r) => r.id === recipeId)}
        >
          {busy ? "Guardando…" : "Añadir al plan"}
          <Icon name="plus" size={18} />
        </button>
        {!allowed.length && (
          <p className="microcopy">
            Revisa tus filtros o genera una receta compatible antes de
            planificar.
          </p>
        )}
      </form>
      <div className="planner-week">
        <button
          className="btn secondary"
          aria-label="Semana anterior"
          onClick={() => setWeek(addDays(week, -7))}
        >
          ←
        </button>
        <strong>
          {new Date(week + "T12:00:00").toLocaleDateString("es", {
            day: "numeric",
            month: "short",
          })}{" "}
          —{" "}
          {new Date(addDays(week, 6) + "T12:00:00").toLocaleDateString("es", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </strong>
        <button
          className="btn secondary"
          aria-label="Semana siguiente"
          onClick={() => setWeek(addDays(week, 7))}
        >
          →
        </button>
      </div>
      {loading ? (
        <p role="status">Cargando tu plan…</p>
      ) : (
        <div className="planner-days">
          {Array.from({ length: 7 }, (_, n) => addDays(week, n)).map((day) => (
            <section className="panel planner-day" key={day}>
              <h3>
                {new Date(day + "T12:00:00").toLocaleDateString("es", {
                  weekday: "long",
                  day: "numeric",
                })}
              </h3>
              {visible.filter((e) => e.date === day).length === 0 ? (
                <p className="microcopy">Sin comidas planificadas.</p>
              ) : (
                visible
                  .filter((e) => e.date === day)
                  .sort(
                    (a, b) =>
                      ["Desayuno", "Almuerzo", "Cena"].indexOf(a.meal) -
                      ["Desayuno", "Almuerzo", "Cena"].indexOf(b.meal),
                  )
                  .map((entry) => {
                    const recipe = recipes.find((r) => r.id === entry.recipeId);
                    return (
                      <div className="planned-meal" key={entry.id}>
                        <span className="eyebrow">
                          {entry.meal} · {entry.servings}{" "}
                          {entry.servings === 1 ? "porción" : "porciones"}
                        </span>
                        <button
                          className="text-btn"
                          onClick={() => recipe && onOpen(recipe, entry.servings)}
                        >
                          {entry.title}
                        </button>
                        {recipe && !matchesProfile(recipe, profile) && (
                          <p className="review-note">
                            Requiere revisión: cambiaste tus filtros.
                          </p>
                        )}
                        <button
                          className="text-btn"
                          disabled={busy}
                          onClick={() => remove(entry.id)}
                          aria-label={`Retirar ${entry.title} del ${entry.date}`}
                        >
                          Retirar del plan
                        </button>
                      </div>
                    );
                  })
              )}
            </section>
          ))}
        </div>
      )}
      <section className="panel planner-shopping">
        <h2>Qué falta para esta semana</h2>
        <p className="microcopy">
          Lista orientativa según presencia en tu despensa. Comprueba cantidades
          y etiquetas; no calcula existencias ni valida una dieta médica.
        </p>
        {missing.length ? (
          <ul>
            {missing.map((id) => (
              <li key={id}>
                {ingredients.find((i) => i.id === id)?.name || id}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {visible.length
              ? "Tienes en tu despensa todos los tipos de ingredientes del plan."
              : "Añade comidas para preparar tu lista."}
          </p>
        )}
      </section>
    </div>
  );
}
