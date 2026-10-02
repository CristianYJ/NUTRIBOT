import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { todayDate } from "./date-utils.js";
import {
  expiryDate,
  expiryRules,
  expirySource,
  expiryStatus,
} from "./pantry-expiry.js";
const formatDate = (date) =>
  new Date(date + "T12:00:00").toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function ExpiryEditor({ item, value, onSave, onClose }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(
    value || {
      startDate: todayDate(),
      rule: "",
      customDays: null,
      labelDate: "",
    },
  );
  const [error, setError] = useState("");
  const field = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  const estimate = expiryDate(draft);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  return (
    <dialog
      className="expiry-dialog"
      ref={dialog}
      aria-labelledby="expiry-title"
      onCancel={onClose}
    >
      <button
        className="expiry-close"
        aria-label="Cerrar vencimiento"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <span className="expiry-mark">
        <Icon name="calendar" size={26} />
      </span>
      <h2 id="expiry-title">Vencimiento de {item.name}</h2>
      <p>
        Usa la fecha del envase o calcula una estimación según cómo lo
        conservas.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!estimate) {
            setError("Indica una fecha del envase o completa la estimación.");
            return;
          }
          onSave(
            draft.labelDate
              ? {
                  labelDate: draft.labelDate,
                  startDate: "",
                  rule: "",
                  customDays: null,
                }
              : draft,
          );
        }}
      >
        <label>
          Fecha indicada en el envase
          <input
            type="date"
            value={draft.labelDate}
            min="1900-01-01"
            max="2200-12-31"
            onChange={(event) => field("labelDate", event.target.value)}
          />
        </label>
        <fieldset disabled={Boolean(draft.labelDate)}>
          <legend>Calcular una estimación</legend>
          <label>
            Alimento y conservación
            <select
              value={draft.rule}
              onChange={(event) => field("rule", event.target.value)}
            >
              <option value="">Selecciona cómo lo conservas</option>
              {expiryRules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha de compra o preparación
            <input
              type="date"
              value={draft.startDate}
              max={todayDate()}
              min="1900-01-01"
              onChange={(event) => field("startDate", event.target.value)}
            />
          </label>
          {draft.rule === "custom" && (
            <label>
              Días de duración que estimas
              <input
                type="number"
                min="1"
                max="3650"
                value={draft.customDays ?? ""}
                onChange={(event) =>
                  field(
                    "customDays",
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
              />
            </label>
          )}
        </fieldset>
        {estimate && (
          <div className="expiry-preview">
            <Icon name="clock" size={18} />
            <span>
              {estimate.estimated ? "Vencimiento estimado" : "Fecha del envase"}
              : <strong>{formatDate(estimate.date)}</strong>
            </span>
          </div>
        )}
        <p className="expiry-help">
          La fecha del envase tiene prioridad. Una estimación no garantiza que
          el alimento esté en buen estado; depende de su conservación. Las
          referencias para refrigerados usan el plazo más corto de{" "}
          <a href={expirySource} target="_blank" rel="noreferrer">
            FoodSafety.gov
          </a>
          .
        </p>
        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}
        <div className="expiry-actions">
          {value && (
            <button
              type="button"
              className="text-btn"
              onClick={() => onSave(null)}
            >
              Quitar fecha
            </button>
          )}
          <button className="btn primary" type="submit">
            Guardar fecha
            <Icon name="check" size={17} />
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function PantryWorkspace({
  pantry,
  dates,
  ingredients,
  search,
  setSearch,
  category,
  setCategory,
  onToggle,
  onRemove,
  onDate,
  onImport,
  onGenerate,
}) {
  const [view, setView] = useState("pantry"),
    [selecting, setSelecting] = useState(false),
    [selection, setSelection] = useState([]),
    [editing, setEditing] = useState(null);
  useEffect(
    () => setSelection((old) => old.filter((id) => pantry.includes(id))),
    [pantry],
  );
  const visible = ingredients.filter(
    (item) =>
      (view === "catalog" || pantry.includes(item.id)) &&
      (category === "Todos" || item.category === category) &&
      item.name
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  const selectedIds = selection.filter((id) => pantry.includes(id));
  const selectable = visible
    .filter((item) => pantry.includes(item.id))
    .map((item) => item.id);
  function toggle(id) {
    if (selecting)
      setSelection((old) =>
        old.includes(id) ? old.filter((item) => item !== id) : [...old, id],
      );
    else onToggle(id);
  }
  return (
    <div className="page-enter pantry-workspace">
      <div className="pantry-heading">
        <div className="page-title">
          <h1>¿Qué hay en tu cocina?</h1>
          <p>Añade los ingredientes que tienes. Nosotros ponemos las ideas.</p>
        </div>
        <section
          className="pantry-compact-banner"
          aria-label="Resumen de despensa"
        >
          <div>
            <Icon name="pantry" size={21} />
            <strong>{pantry.length} ingredientes</strong>
            <button className="text-btn" onClick={onGenerate}>
              Buscar recetas
              <Icon name="arrow" size={15} />
            </button>
          </div>
          <div>
            <button className="btn primary" onClick={() => onImport("text")}>
              <Icon name="plus" size={16} />
              Agregar por texto
            </button>
            <button className="btn secondary" onClick={() => onImport("image")}>
              <Icon name="camera" size={16} />
              Por foto
            </button>
          </div>
        </section>
      </div>
      <div className="search-box">
        <Icon name="search" />
        <input
          aria-label="Buscar ingrediente"
          placeholder="Busca un ingrediente: tomate, arroz, frijoles…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search && (
          <button aria-label="Limpiar búsqueda" onClick={() => setSearch("")}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <div className="pantry-management">
        <div className="pantry-view-tabs" aria-label="Vista de ingredientes">
          <button
            aria-pressed={view === "pantry"}
            onClick={() => setView("pantry")}
          >
            En mi despensa
          </button>
          <button
            aria-pressed={view === "catalog"}
            onClick={() => {
              setView("catalog");
              setSelecting(false);
              setSelection([]);
            }}
          >
            Catálogo de alimentos
          </button>
        </div>
        <button
          className="text-btn"
          disabled={!pantry.length}
          onClick={() => {
            setSelecting(!selecting);
            setSelection([]);
            setView("pantry");
          }}
        >
          <Icon name={selecting ? "close" : "check"} size={17} />
          {selecting ? "Cancelar selección" : "Seleccionar varios"}
        </button>
      </div>
      <div className="filter-row">
        {[
          "Todos",
          "Vegetales",
          "Frutas",
          "Granos",
          "Proteínas",
          "Lácteos",
          "Otros",
        ].map((value) => (
          <button
            className={category === value ? "selected" : ""}
            key={value}
            onClick={() => setCategory(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {selecting && (
        <div
          className="pantry-bulk"
          role="region"
          aria-label="Eliminar varios ingredientes"
        >
          <strong>{selectedIds.length} seleccionados</strong>
          <button
            className="text-btn"
            disabled={!selectable.length}
            onClick={() =>
              setSelection((old) => [...new Set([...old, ...selectable])])
            }
          >
            Seleccionar visibles
          </button>
          <button
            className="text-btn"
            disabled={!selectedIds.length}
            onClick={() => setSelection([])}
          >
            Desmarcar
          </button>
          <button
            className="btn pantry-remove"
            disabled={!selectedIds.length}
            onClick={() => {
              onRemove(selectedIds);
              setSelection([]);
              setSelecting(false);
            }}
          >
            Quitar {selectedIds.length} de la despensa
          </button>
        </div>
      )}
      <div className="ingredient-grid">
        {visible.map((item) => {
          const present = pantry.includes(item.id),
            status = expiryStatus(dates[item.id]);
          return (
            <article
              className={`pantry-food-card ${present ? "in-pantry" : ""} ${selectedIds.includes(item.id) ? "bulk-selected" : ""}`}
              key={item.id}
            >
              <button
                className="pantry-food-toggle"
                aria-label={`${selecting ? "Seleccionar" : present ? "Quitar" : "Añadir"} ${item.name}`}
                aria-pressed={
                  selecting ? selectedIds.includes(item.id) : present
                }
                onClick={() => toggle(item.id)}
                disabled={selecting && !present}
              >
                <span className="ingredient-toggle">
                  <Icon
                    name={
                      (selecting ? selectedIds.includes(item.id) : present)
                        ? "check"
                        : "plus"
                    }
                    size={17}
                  />
                </span>
                <span className="ingredient-emoji">{item.emoji}</span>
                <strong>{item.name}</strong>
                <small>{item.category}</small>
              </button>
              {present && (
                <button
                  className={`pantry-expiry ${status.tone}`}
                  aria-label={`Vencimiento de ${item.name}`}
                  onClick={() => setEditing(item)}
                >
                  <Icon name="calendar" size={16} />
                  <span>
                    <strong>{status.text}</strong>
                    <small>
                      {status.date
                        ? `${formatDate(status.date)} · ${status.detail}`
                        : status.detail}
                    </small>
                  </span>
                  <Icon name="chevron" size={13} />
                </button>
              )}
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className="empty">
          <Icon name="pantry" size={32} />
          <h2>
            {view === "pantry"
              ? "No hay ingredientes en esta vista"
              : "No encontramos ese alimento"}
          </h2>
          <p>
            {search || category !== "Todos"
              ? "Prueba otra búsqueda o categoría."
              : "Agrega alimentos por texto, foto o desde el catálogo."}
          </p>
        </div>
      )}
      {pantry.length > 0 && (
        <p className="pantry-expiry-note">
          <Icon name="info" size={16} />
          Las fechas son editables. Los ingredientes sin datos de compra o
          conservación quedan sin estimación.
        </p>
      )}
      {editing && (
        <ExpiryEditor
          key={editing.id}
          item={editing}
          value={dates[editing.id]}
          onClose={() => setEditing(null)}
          onSave={(value) => {
            onDate(editing.id, value);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
