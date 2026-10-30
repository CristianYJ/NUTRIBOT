import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from './auth-api.js';
import Icon from './Icons.jsx';
import { MealFeedback } from './MealTracking.jsx';

async function request(path, method = 'GET', body) {
  const response = await authenticatedFetch('/api/edamam/' + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.text || 'No se pudo consultar Edamam.');
  return data;
}

export function EdamamBadge({ compact = false }) {
  return <a className={`edamam-attribution${compact ? ' compact' : ''}`} href="https://developer.edamam.com/" target="_blank" rel="noopener noreferrer" aria-label="Powered by Edamam">
    <img src="https://developer.edamam.com/images/light.png" alt="Powered by Edamam" />
  </a>;
}

function GlycemicBar({ value }) {
  const valid = Number.isFinite(value) && value >= 0 && value <= 100;
  const level = !valid ? 'No disponible' : value < 55 ? 'Bajo' : value < 70 ? 'Moderado' : 'Alto';
  return <div className="edamam-glycemic" aria-label={`Índice glucémico: ${valid ? `${Math.round(value)}, ${level.toLowerCase()}` : 'no disponible'}`}>
    <div><span>Índice glucémico</span><strong>{valid ? `${Math.round(value)} · ${level}` : level}</strong></div>
    <div className={`edamam-glycemic-track${valid ? '' : ' unavailable'}`}>{valid && <span style={{ left: `${Math.max(2, Math.min(98, value))}%` }} />}</div>
  </div>;
}

const nutrients = [['carbohydratesG', 'Carbohidratos', 'g'], ['fiberG', 'Fibra', 'g'], ['proteinG', 'Proteína', 'g'], ['fatG', 'Grasas', 'g'], ['sugarG', 'Azúcares', 'g'], ['sodiumMg', 'Sodio', 'mg']];
const number = value => Number.isFinite(value) ? value.toLocaleString('es-SV', { maximumFractionDigits: 1 }) : '—';

export function EdamamRecipeCard({ initial, reference, pantry = [], ingredients = [], servings, onFavoriteChanged, isFavorite = false, prefetch = false, mealTracker }) {
  const [recipe, setRecipe] = useState(initial || null);
  const [saved, setSaved] = useState(isFavorite);
  const [shopping, setShopping] = useState(null);
  const [shoppingTranslations, setShoppingTranslations] = useState(null);
  const [presentation, setPresentation] = useState(null);
  const [presentationError, setPresentationError] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState('ingredients');
  const [people, setPeople] = useState(servings || initial?.servings || 1);
  const dialog = useRef(null);
  const uri = initial?.uri || reference?.uri;
  const title = recipe?.title || reference?.title || 'Receta de Edamam';
  useEffect(() => { setRecipe(initial || null); setSaved(isFavorite); setShopping(null); setShoppingTranslations(null); setPresentation(null); setPresentationError(''); }, [initial, uri, isFavorite]);
  useEffect(() => {
    if (!prefetch || initial || !uri) return;
    let active = true;
    request('detail?uri=' + encodeURIComponent(uri)).then(data => { if (active) setRecipe(data.recipe); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [prefetch, initial, uri]);

  async function open() {
    setWorking(true); setError('');
    try {
      const current = recipe || (await request('detail?uri=' + encodeURIComponent(uri))).recipe;
      setRecipe(current);
      setPeople(servings || Math.max(1, Math.min(12, Math.round(current.servings || 1))));
      setTab('ingredients');
      dialog.current?.showModal();
      if (!presentation) {
        request('presentation', 'POST', { title: current.title, ingredientLines: current.ingredientLines, time: current.time })
          .then(setPresentation).catch(e => setPresentationError(e.message));
      }
    } catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  async function favorite() {
    setWorking(true); setError('');
    try { await request('favorites', saved ? 'DELETE' : 'POST', { uri, title }); setSaved(!saved); onFavoriteChanged?.(); }
    catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  async function makeShopping() {
    setWorking(true); setError('');
    try {
      const result = await request('shopping', 'POST', { uri, servings: people });
      setShopping(result); setShoppingTranslations(null);
      if (result.items.length) request('presentation', 'POST', { title, ingredientLines: result.items.map(item => item.food), time: recipe?.time })
        .then(data => setShoppingTranslations(data.ingredientLinesEs)).catch(() => {});
    }
    catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  const present = recipe?.matched?.filter(id => pantry.includes(id)).map(id => ingredients.find(item => item.id === id)?.name || id) || [];
  return <>
    <article className="recipe-card edamam-library-card">
      <button className="recipe-image edamam-card-image" onClick={open} disabled={working} aria-label={`Ver ${title}`}>
        {recipe?.image ? <img src={recipe.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="food-illustration">🍽️</span>}
        <span className="photo-label">Edamam</span>
      </button>
      <button className={`save-btn${saved ? ' saved' : ''}`} onClick={favorite} disabled={working} aria-label={`${saved ? 'Quitar de favoritas' : 'Guardar favorita'}: ${title}`} aria-pressed={saved}><Icon name="heart" size={19} /></button>
      <div className="recipe-copy">
        <div className="recipe-meta"><span><Icon name="clock" size={14} />{recipe?.time ? `${recipe.time} min` : 'Tiempo no indicado'}</span><span>Edamam</span></div>
        <button className="title-link" onClick={open} disabled={working}><h3>{title}</h3></button>
        <p>{recipe?.caloriesPerServing != null ? `${number(recipe.caloriesPerServing)} kcal por porción` : 'Consulta los datos actualizados'}</p>
        <div className="availability"><Icon name="arrow" size={15} />Ver receta</div>
        {error && <p role="alert">{error}</p>}
      </div>
    </article>
    <dialog className="recipe-dialog edamam-dialog" ref={dialog} aria-label={title} onCancel={() => dialog.current?.close()} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      {recipe && <>
        <div className="detail-photo edamam-detail-photo">
          {recipe.image ? <img src={recipe.image} alt="" referrerPolicy="no-referrer" /> : <span>🍽️</span>}
          <button className="detail-close" onClick={() => dialog.current?.close()} aria-label="Cerrar receta"><Icon name="close" /></button>
          <span className="tag">Edamam</span>
        </div>
        <div className="detail-content">
          <div className="detail-title"><h2>{title}</h2><button className={`icon-button${saved ? ' saved' : ''}`} onClick={favorite} disabled={working} aria-label={saved ? 'Quitar de favoritas' : 'Guardar favorita'} aria-pressed={saved}><Icon name="heart" /></button></div>
          <p>Receta de {recipe.source || 'Edamam'} · original para {number(recipe.servings)} porciones</p>
          <GlycemicBar value={recipe.glycemicIndex} />
          <div className="detail-meta recipe-summary">
            <span><small>Tiempo</small><strong>{recipe.time ? `${recipe.time} min` : 'Sin dato'}</strong></span>
            <span><small>Dificultad estimada por IA</small><strong>{presentation?.difficulty || (presentationError ? 'Sin estimar' : 'Calculando…')}</strong></span>
            <span><small>Personas</small><strong>{people}</strong></span>
            <span><small>Calorías por persona</small><strong>{recipe.caloriesPerServing == null ? 'Sin dato' : `${number(recipe.caloriesPerServing)} kcal`}</strong></span>
          </div>
          <section className="recipe-method edamam-nutrition"><h3>Información nutricional</h3><p className="microcopy">Valores por porción original.</p>
            <div className="edamam-nutrient-grid">{nutrients.map(([key, label, unit]) => <div key={key}><small>{label}</small><strong>{number(recipe.nutrientsPerServing?.[key])} <span>{unit}</span></strong></div>)}</div>
            {recipe.co2Class && <p className="microcopy">Huella de carbono: clase {recipe.co2Class}</p>}
          </section>
          {present.length > 0 && <p className="microcopy">En tu despensa: {present.join(', ')}.</p>}
          {recipe.nutritionLimitsUnverified && <p className="microcopy">Algunos límites nutricionales de tu perfil no pudieron verificarse.</p>}
          <section className="recipe-method">
            <div className="recipe-method-tabs" role="tablist" aria-label="Preparación de la receta">
              <button role="tab" aria-selected={tab === 'ingredients'} onClick={() => setTab('ingredients')}>Ingredientes</button>
              <button role="tab" aria-selected={tab === 'steps'} onClick={() => setTab('steps')}>Pasos</button>
            </div>
            {tab === 'ingredients' ? <div role="tabpanel"><div className="serving-row"><h3>Ingredientes</h3><label>Personas <select aria-label="Personas" value={people} onChange={event => { setPeople(Number(event.target.value)); setShopping(null); setShoppingTranslations(null); }}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>
              <p className="microcopy">Lista original para {number(recipe.servings)} porciones. La lista de compras ajusta las cantidades a {people} {people === 1 ? 'persona' : 'personas'}.</p>
              {presentationError && <p className="microcopy" role="status">No se pudo traducir: {presentationError}. Se muestra el texto original.</p>}
              <ul className="detail-ingredients">{recipe.ingredientLines.map((line, i) => <li key={`${line}-${i}`}><span className="detail-ingredient-emoji">🥬</span><span>{presentation?.ingredientLinesEs?.[i] || line}{presentation?.ingredientLinesEs?.[i] && <small className="edamam-original-line">Original: {line}</small>}</span></li>)}</ul>
              <p className="microcopy">Verifica ingredientes y alérgenos antes de cocinar.</p>
            </div> : <div role="tabpanel"><h3 className="steps-heading">Manos a la cocina</h3><p>Esta receta web no incluye pasos en la API de Edamam. Consulta la preparación en el sitio de origen.</p>
              {recipe.sourceUrl && <a className="btn primary edamam-source-link" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">Ver preparación en {recipe.source || 'el sitio original'} ↗</a>}
            </div>}
          </section>
          <p className="microcopy">La lista de compras incluye toda la receta. Revisa lo que ya tienes en tu despensa antes de comprar; todavía no conocemos tus cantidades disponibles.</p>
          <div className="culinary-recipe-actions"><button className="btn secondary" disabled={working} onClick={makeShopping}>Lista de compras completa</button></div>
          {shopping && <section className="recipe-method"><h3>Lista de compras para {people}</h3><ul className="detail-ingredients">{shopping.items.map((item, i) => <li key={i}>{shoppingTranslations?.[i] || item.food}{item.quantities.map(q => ` · ${q.quantity} ${q.measure.split('#Measure_').at(-1).replaceAll('_', ' ')}`).join('')}{item.aisle ? ` · ${item.aisle}` : ''}</li>)}</ul>{shopping.cartUrl && <a href={shopping.cartUrl} target="_blank" rel="noopener noreferrer">Abrir carrito de compras ↗</a>}</section>}
          {mealTracker && <MealFeedback key={recipe.uri} recipe={recipe} tracker={mealTracker} />}
          {error && <p role="alert">{error}</p>}
        </div>
      </>}
    </dialog>
  </>;
}

export function EdamamFavorites({ meal = 'Todas', mealTracker }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const refresh = () => request('favorites').then(data => setItems(data.items)).catch(e => setError(e.message));
  useEffect(() => { refresh(); }, []);
  if (!['Todas', 'Favoritas'].includes(meal)) return null;
  return <>{items.map((item, index) => <EdamamRecipeCard key={item.uri} reference={item} isFavorite prefetch={index < 3} onFavoriteChanged={refresh} mealTracker={mealTracker} />)}{error && <p role="alert">{error}</p>}</>;
}
