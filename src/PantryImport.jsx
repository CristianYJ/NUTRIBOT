import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { allergyOptions } from "./data.js";
import { ingredientCategories, findIngredient } from "./ingredient-utils.js";
import { ingredientRule } from "./profile-rules.js";
import { pantryRequest } from "./api.js";
import Icon from "./Icons.jsx";
import { preparePhoto, prefersCamera } from "./nutri-vision.js";
import "./pantry-import.css";

const blank = () => ({ name: "", category: "Otros", animal: false, meat: false, allergens: [] });
export default function PantryImport({ ref, catalog, onSave, usage, onUsageChange, hideIntro = false }) {
  const dialog = useRef(null), request = useRef(null), photoVersion = useRef(0);
  const [mode, setMode] = useState("text");
  const [photo, setPhoto] = useState(null), [items, setItems] = useState([]);
  const [status, setStatus] = useState(""), [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false), [resultReady, setResultReady] = useState(false);
  const gallery = useRef(null), camera = useRef(null);
  const [dragging, setDragging] = useState(false);
  const busy = Boolean(status);
  useImperativeHandle(ref, () => ({ open }));
  useEffect(() => () => { request.current?.abort(); photoVersion.current++; }, []);
  function close() {
    if (status === "saving") return;
    request.current?.abort(); request.current = null; photoVersion.current++;
    setStatus(""); setPhoto(null); dialog.current.close();
  }
  function pickPhoto(input) {
    try { input.current.click(); }
    catch { setError("No se pudo abrir la cámara. Puedes elegir una foto de la galería."); }
  }
  function open(next) {
    if (status === "saving") return;
    request.current?.abort(); request.current = null; photoVersion.current++;
    setStatus(""); setDragging(false);
    setMode(next); setItems(next === 'text' ? [blank()] : []); setPhoto(null); setError(""); setConfirmed(false); setResultReady(next === 'text');
    onUsageChange?.();
    dialog.current.showModal();
    // This must stay in the click handler, not an effect or timer.
    if (next === "image" && prefersCamera()) pickPhoto(camera);
  }
  function selectPhoto(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (file && !busy) loadPhoto(file);
  }
  async function loadPhoto(file) {
    const version = ++photoVersion.current;
    setStatus("photo"); setError(""); setPhoto(null); setItems([]); setConfirmed(false); setResultReady(false);
    try { const value = await preparePhoto(file); if (version === photoVersion.current) setPhoto(value); }
    catch (e) { if (version === photoVersion.current) setError(e.message); }
    finally { if (version === photoVersion.current) setStatus(""); }
  }
  function update(index, patch) {
    setItems(list => list.map((item, n) => n === index ? { ...item, ...patch } : item));
    setConfirmed(false);
  }
  async function analyze() {
    if (mode !== 'image' || !photo) return;
    const controller = new AbortController(); request.current = controller;
    setStatus("analyzing"); setError(""); setItems([]); setConfirmed(false); setResultReady(false);
    try {
      const result = await pantryRequest("analyze", { image: photo.image }, controller.signal);
      if (controller.signal.aborted) return;
      setItems(result.items.map(item => {
        const existing = findIngredient(item.name, catalog);
        return existing ? { ...item, name: existing.name, category: existing.category, ...ingredientRule(existing) } : item;
      }));
      setResultReady(true);
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { onUsageChange?.(); if (request.current === controller) { request.current = null; setStatus(""); } }
  }
  async function save(event) {
    event.preventDefault(); setStatus("saving"); setError("");
    try {
      await onSave(items, { mode, preview: photo?.preview }); setItems([]); setPhoto(null); dialog.current.close();
    } catch (e) { setError(e.message); }
    finally { setStatus(""); }
  }
  return <>
    {!hideIntro && <section className="panel pantry-import-intro">
      <div><h2>Agrega lo que tienes</h2><p>Agrega alimentos manualmente o usa Nutri-Vision. Revisa los ingredientes antes de guardarlos.</p></div>
      <div className="pantry-import-actions">
        <button className="btn primary" onClick={() => open("text")}>Agregar manualmente</button>
        <button className="btn secondary" onClick={() => open("image")}>Usar Nutri-Vision</button>
      </div>
    </section>}
    <dialog ref={dialog} className="pantry-import-dialog" aria-labelledby="pantry-import-title" onCancel={e => { e.preventDefault(); close(); }}>
      <input ref={gallery} className="nutri-vision-file" type="file" hidden accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label="Elegir foto para Nutri-Vision" onChange={selectPhoto} disabled={busy} />
      <input ref={camera} className="nutri-vision-file" type="file" hidden accept="image/jpeg,image/png,image/webp" capture="environment" tabIndex={-1} aria-label="Cámara de Nutri-Vision" onChange={selectPhoto} disabled={busy} />
      <div className="pantry-import-heading">
        <h2 id="pantry-import-title">{mode === "text" ? "Agrega tus alimentos" : "Nutri-Vision"}</h2>
        <button type="button" className="nutri-vision-close" aria-label="Cerrar" disabled={status === "saving"} onClick={close}><Icon name="close" size={22} /></button>
      </div>
      <fieldset disabled={busy} className="pantry-import-source">
        {mode === "text" ? <p> </p> : <>
          <button type="button" className={`nutri-vision-dropzone ${dragging ? "is-dragging" : ""}`} onClick={() => pickPhoto(gallery)}
            aria-label={photo ? "Cambiar la foto de Nutri-Vision" : "Elegir una foto para Nutri-Vision"}
            onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault(); setDragging(false);
              if (busy) return;
              if (e.dataTransfer.files.length !== 1) { setError("Selecciona una sola foto a la vez."); return; }
              loadPhoto(e.dataTransfer.files[0]);
            }}>
            {photo ? <><img className="pantry-photo-preview" src={photo.preview} alt="Foto seleccionada para Nutri-Vision" /><span className="nutri-vision-change">Haz clic para cambiar la foto</span></> : <>
              <span className="nutri-vision-camera"><Icon name="camera" size={34} /><span>+</span></span>
              <span className="nutri-vision-drop-copy">Arrastra tu foto aquí o <strong>haz clic para explorar</strong></span>
              <small>JPG, PNG, WEBP hasta 15 MB</small>
            </>}
          </button>
          <div className="nutri-vision-mobile-actions">
            <button type="button" className="btn secondary" onClick={() => pickPhoto(camera)}><Icon name="camera" size={18} />Tomar foto</button>
            <button type="button" className="text-btn" onClick={() => pickPhoto(gallery)}>Elegir de galería</button>
          </div>
        </>}
        {mode === 'image' && <>
          {usage && <p className="microcopy" role="status">Nutri-Vision: {usage.vision.used} de {usage.vision.limit} análisis usados este mes.{usage.vision.pending > 0 ? ` ${usage.vision.pending} en curso.` : ''}</p>}
          <button className="btn primary nutri-vision-identify" type="button" onClick={analyze} disabled={!photo || usage?.vision.remaining === 0}>Identificar ingredientes</button>
          {usage?.vision.remaining === 0 && <p className="microcopy">Tu cupo se renueva el {new Date(usage.vision.resetsAt).toLocaleDateString('es-SV', { timeZone: usage.timezone })}. Puedes agregar los alimentos manualmente.</p>}
        </>}
        {mode === "image" ? <button className="text-btn nutri-vision-manual" type="button" onClick={() => open("text")}>¿Prefieres escribir? <strong>Agregar manualmente</strong></button> :
          <button className="text-btn nutri-vision-manual" type="button" onClick={() => { setItems(list => [...list, blank()]); setResultReady(true); setConfirmed(false); }} disabled={items.length >= 20}>Agregar otro alimento</button>}
        {mode === 'image' && <p className="microcopy nutri-vision-privacy">Al identificar ingredientes mediante fotos, estas se comparten con nuestros socios únicamente con el propósito descrito.</p>}
      </fieldset>
      {status && <p role="status">{status === "saving" ? "Guardando en tu despensa…" : status === "photo" ? "Preparando la foto…" : "Identificando ingredientes…"}</p>}
      {error && <p className="pantry-import-error" role="alert">{error}</p>}
      {resultReady && !items.length && <p>No hay ingredientes para agregar. Agrega uno manualmente{mode === 'image' ? ' o prueba una foto más clara' : ''}.</p>}
      {!!items.length && <form onSubmit={save}>
        <h3>Revisa lo que vas a agregar</h3>
        <p className="microcopy">Puedes corregir nombres o quitar alimentos. Verifica el tipo y los alérgenos con las etiquetas.</p>
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
