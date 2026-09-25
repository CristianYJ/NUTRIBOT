import { useEffect, useRef, useState } from "react";
import { allergyOptions } from "./data.js";
import { ingredientCategories, findIngredient } from "./ingredient-utils.js";
import { ingredientRule } from "./profile-rules.js";
import { pantryRequest } from "./api.js";
import "./pantry-import.css";

const blank = () => ({ name: "", category: "Otros", animal: false, meat: false, allergens: [] });
export async function preparePhoto(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Selecciona una foto JPG, PNG o WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("La foto debe pesar menos de 12 MB.");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("No pude abrir esa foto. Prueba con otra imagen."); }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.82);
    const data = preview.split(",")[1];
    if (!data || data.length > 4194304) throw new Error("La foto es demasiado grande. Usa una imagen más pequeña.");
    return { preview, image: { mimeType: "image/jpeg", data } };
  } finally { bitmap.close(); }
}

export default function PantryImport({ catalog, onSave }) {
  const dialog = useRef(null), request = useRef(null), photoVersion = useRef(0);
  const [mode, setMode] = useState("text"), [text, setText] = useState("");
  const [photo, setPhoto] = useState(null), [items, setItems] = useState([]);
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false), [resultReady, setResultReady] = useState(false);
  const busy = Boolean(status);
  useEffect(() => () => { request.current?.abort(); photoVersion.current++; }, []);
  function close() {
    if (status === "saving") return;
    request.current?.abort(); request.current = null; photoVersion.current++;
    setStatus(""); setPhoto(null); dialog.current.close();
  }
  function open(next) {
    setMode(next); setItems([]); setText(""); setPhoto(null); setError(""); setConfirmed(false); setResultReady(false);
    dialog.current.showModal();
  }
  async function selectPhoto(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const version = ++photoVersion.current;
    setStatus("photo"); setError(""); setPhoto(null); setItems([]); setResultReady(false);
    try { const value = await preparePhoto(file); if (version === photoVersion.current) setPhoto(value); }
    catch (e) { if (version === photoVersion.current) setError(e.message); }
    finally { if (version === photoVersion.current) setStatus(""); }
  }
  function update(index, patch) {
    setItems(list => list.map((item, n) => n === index ? { ...item, ...patch } : item));
    setConfirmed(false);
  }
  async function analyze() {
    const controller = new AbortController(); request.current = controller;
    setStatus("analyzing"); setError(""); setItems([]); setConfirmed(false); setResultReady(false);
    try {
      const result = await pantryRequest("analyze", mode === "text" ? { text } : { image: photo.image }, controller.signal);
      if (controller.signal.aborted) return;
      setItems(result.items.map(item => {
        const existing = findIngredient(item.name, catalog);
        return existing ? { ...item, name: existing.name, category: existing.category, ...ingredientRule(existing) } : item;
      }));
      setResultReady(true);
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (request.current === controller) { request.current = null; setStatus(""); } }
  }
  async function save(event) {
    event.preventDefault(); setStatus("saving"); setError("");
    try {
      await onSave(items); setItems([]); setPhoto(null); setText(""); dialog.current.close();
    } catch (e) { setError(e.message); }
    finally { setStatus(""); }
  }
  return <>
    <section className="panel pantry-import-intro">
      <div><h2>Agrega lo que tienes</h2><p>Escribe tu lista o toma una foto. Revisa los ingredientes antes de guardarlos.</p></div>
      <div className="pantry-import-actions">
        <button className="btn primary" onClick={() => open("text")}>Agregar por texto</button>
        <button className="btn secondary" onClick={() => open("image")}>Agregar por foto</button>
      </div>
    </section>
    <dialog ref={dialog} className="pantry-import-dialog" aria-labelledby="pantry-import-title" onCancel={e => { e.preventDefault(); close(); }}>
      <div className="pantry-import-heading"><h2 id="pantry-import-title">{mode === "text" ? "Escribe tu despensa" : "Una foto de tu despensa"}</h2><button type="button" className="text-btn" disabled={status === "saving"} onClick={close}>Cerrar</button></div>
      <fieldset disabled={busy} className="pantry-import-source">
        {mode === "text" ? <label>¿Qué ingredientes tienes?<textarea rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Tengo papas, zanahorias, dos huevos y aceite de oliva…" /></label> : <>
          <p>Fotografía los alimentos o sus etiquetas con buena luz.</p>
          <label>Seleccionar una imagen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} /></label>
          <label className="pantry-camera">Tomar foto con el móvil<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={selectPhoto} /></label>
          {photo && <img className="pantry-photo-preview" src={photo.preview} alt="Foto seleccionada para identificar ingredientes" />}
        </>}
        <p className="microcopy">Al pulsar “Identificar ingredientes”, se enviará {mode === "text" ? "este texto" : "esta foto"} a Gemini (Google). La foto no se guarda en la base de datos de Nutribot.</p>
        <button className="btn primary" type="button" onClick={analyze} disabled={mode === "text" ? !text.trim() : !photo}>Identificar ingredientes</button>
        <button className="text-btn" type="button" onClick={() => { setItems(list => [...list, blank()]); setResultReady(true); setConfirmed(false); }} disabled={items.length >= 20}>Agregar uno manualmente</button>
      </fieldset>
      {status && <p role="status">{status === "saving" ? "Guardando en tu despensa…" : status === "photo" ? "Preparando la foto…" : "Identificando ingredientes…"}</p>}
      {error && <p className="pantry-import-error" role="alert">{error}</p>}
      {resultReady && !items.length && <p>No hay ingredientes para agregar. Prueba otra lista, una foto más clara o agrega uno manualmente.</p>}
      {!!items.length && <form onSubmit={save}>
        <h3>Revisa lo que vas a agregar</h3>
        <p className="microcopy">Puedes corregir nombres o quitar alimentos. Verifica el tipo y los alérgenos con las etiquetas; una foto puede no mostrar todos los ingredientes.</p>
        <fieldset disabled={busy} className="pantry-review">
          {items.map((item, index) => {
            const existing = findIngredient(item.name, catalog);
            return <div className="pantry-review-item" key={index}>
              <div className="pantry-import-heading"><label>Ingrediente {index + 1}<input required maxLength={80} value={item.name} onChange={e => update(index, { name: e.target.value })} /></label><button type="button" className="text-btn" onClick={() => { setItems(list => list.filter((_,n) => n !== index)); setConfirmed(false); }}>Quitar</button></div>
              {existing ? <p className="microcopy">Ya está en tu catálogo. Se agregará a la despensa sin duplicarlo.</p> : <>
                <div className="pantry-review-fields">
                  <label>Categoría<select value={item.category} onChange={e => update(index, { category: e.target.value })}>{ingredientCategories.map(c => <option key={c}>{c}</option>)}</select></label>
                  <label>Tipo de alimento<select value={item.meat ? "meat" : item.animal ? "animal" : "plant"} onChange={e => update(index, { animal: e.target.value !== "plant", meat: e.target.value === "meat" })}><option value="plant">Origen vegetal</option><option value="animal">Animal: huevo, lácteos, miel…</option><option value="meat">Carne, pescado o marisco</option></select></label>
                </div>
                <span>Contiene o puede contener:</span>
                <div className="pantry-allergen-options">{allergyOptions.map(a => <label key={a}><input type="checkbox" checked={item.allergens.includes(a)} onChange={e => update(index, { allergens: e.target.checked ? [...item.allergens, a] : item.allergens.filter(x => x !== a) })} />{a}</label>)}</div>
              </>}
            </div>;
          })}
          <label className="pantry-confirm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Revisé los nombres, tipos de alimento y alérgenos.</label>
          <button className="btn primary" type="submit" disabled={!confirmed}>Agregar a mi despensa</button>
        </fieldset>
      </form>}
    </dialog>
  </>;
}
