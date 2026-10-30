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

export function EdamamRecipeCard({ initial, reference, pantry = [], ingredients = [], onFavoriteChanged, isFavorite = false, prefetch = false, compact = false, mealTracker }) {
  const [recipe, setRecipe] = useState(initial || null);
  const [saved, setSaved] = useState(isFavorite);
  const [shopping, setShopping] = useState(null);
  const [shoppingTranslations, setShoppingTranslations] = useState(null);
  const [presentation, setPresentation] = useState(null);
  const [presentationError, setPresentationError] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState('ingredients');
  const dialog = useRef(null);
  const uri = initial?.uri || reference?.uri;
  const detailPath = 'detail?uri=' + encodeURIComponent(uri) + (reference?.meal ? '&meal=' + encodeURIComponent(reference.meal) : '');
  const title = presentation?.titleEs || recipe?.titleEs || reference?.title || recipe?.title || 'Receta';
  const meal = recipe?.meal || reference?.meal || presentation?.meal || ({ Breakfast: 'Desayuno', Lunch: 'Almuerzo', Dinner: 'Cena' })[recipe?.mealTypes?.[0]] || null;
  const recipeServings = Number.isInteger(recipe?.servings) && recipe.servings > 0 ? recipe.servings : null;
  const translating = !presentation && !presentationError;
  useEffect(() => { setRecipe(initial || null); setShopping(null); setShoppingTranslations(null); setPresentation(null); setPresentationError(''); }, [initial, uri]);
  useEffect(() => { setSaved(isFavorite); }, [isFavorite]);
  useEffect(() => {
    if (!prefetch || initial || !uri) return;
    let active = true;
    request(detailPath).then(data => { if (active) { setRecipe(data.recipe); setPresentation(data.presentation); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [prefetch, initial, uri, reference?.meal]);

  async function open() {
    setWorking(true); setError('');
    try {
      const detail = recipe ? null : await request(detailPath);
      const current = recipe || detail.recipe;
      const readyPresentation = presentation || detail?.presentation;
      setRecipe(current);
      if (detail?.presentation) setPresentation(detail.presentation);
      setTab('ingredients');
      dialog.current?.showModal();
      if (!readyPresentation) {
        setPresentationError('');
        request('presentation', 'POST', { uri: current.uri, title: current.title, ingredientLines: current.ingredientLines, time: current.time, meal, mealTypes: current.mealTypes })
          .then(setPresentation).catch(e => setPresentationError(e.message));
      }
    } catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  async function favorite() {
    setWorking(true); setError('');
    try { await request('favorites', saved ? 'DELETE' : 'POST', { uri, title, meal }); setSaved(!saved); onFavoriteChanged?.(); }
    catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  async function makeShopping() {
    setWorking(true); setError('');
    try {
      const result = await request('shopping', 'POST', { uri, servings: recipeServings });
      setShopping(result); setShoppingTranslations(null);
      if (result.items.length) request('presentation', 'POST', { uri, kind: 'shopping', title: recipe?.title || title, ingredientLines: result.items.map(item => item.food), time: recipe?.time })
        .then(data => setShoppingTranslations(data.ingredientLinesEs)).catch(() => {});
    }
    catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  const present = recipe?.matched?.filter(id => pantry.includes(id)).map(id => ingredients.find(item => item.id === id)?.name || id) || [];
  return <>
    <article className={`recipe-card edamam-library-card${compact ? ' edamam-chat-card' : ''}`}>
      <button className="recipe-image edamam-card-image" onClick={open} disabled={working} aria-label={`Ver ${title}`}>
        {recipe?.image ? <img src={recipe.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="food-illustration">🍽️</span>}
        {meal && <span className="photo-label">{meal}</span>}
      </button>
      <button className={`save-btn${saved ? ' saved' : ''}`} onClick={favorite} disabled={working} title={saved ? 'Quitar de Mis Recetas' : 'Guardar receta'} aria-label={`${saved ? 'Quitar receta guardada' : 'Guardar receta'}: ${title}`} aria-pressed={saved}><Icon name="heart" size={19} /></button>
      <div className="recipe-copy">
        <div className="recipe-meta"><span><Icon name="clock" size={14} />{recipe?.time ? `${recipe.time} min` : 'Tiempo no indicado'}</span>{meal && <span>{meal}</span>}</div>
        <button className="title-link" onClick={open} disabled={working}><h3>{title}</h3></button>
        <p>{recipe?.caloriesPerServing != null ? `${number(recipe.caloriesPerServing)} kcal por porción` : 'Consulta los datos actualizados'}</p>
        <button className="availability recipe-view-button" type="button" onClick={open} disabled={working}><Icon name="arrow" size={15} />Ver receta</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </article>
    <dialog className="recipe-dialog edamam-dialog" ref={dialog} aria-label={title} onCancel={() => dialog.current?.close()} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      {recipe && <>
        <div className="detail-photo edamam-detail-photo">
          {recipe.image ? <img src={recipe.image} alt="" referrerPolicy="no-referrer" /> : <span>🍽️</span>}
          <button className="detail-close" onClick={() => dialog.current?.close()} aria-label="Cerrar receta"><Icon name="close" /></button>
        </div>
        <div className="detail-content">
          {meal && <span className="tag edamam-detail-meal">{meal}</span>}
          <div className="detail-title"><h2>{presentation?.titleEs || (translating ? 'Preparando receta…' : title)}</h2><button className={`icon-button${saved ? ' saved' : ''}`} onClick={favorite} disabled={working} title={saved ? 'Quitar de Mis Recetas' : 'Guardar receta'} aria-label={saved ? 'Quitar receta guardada' : 'Guardar receta'} aria-pressed={saved}><Icon name="heart" /></button></div>
          <GlycemicBar value={recipe.glycemicIndex} />
          <div className="detail-meta recipe-summary">
            <span><small>Tiempo</small><strong>{recipe.time ? `${recipe.time} min` : 'Sin dato'}</strong></span>
            <span><small>Dificultad</small><strong>{presentation?.difficulty || (presentationError ? 'Sin estimar' : 'Preparando…')}</strong></span>
            <span><small>Porciones</small><strong>{recipeServings ?? 'Sin dato'}</strong></span>
            <span><small>Calorías por persona</small><strong>{recipe.caloriesPerServing == null ? 'Sin dato' : `${number(recipe.caloriesPerServing)} kcal`}</strong></span>
          </div>
          <section className="recipe-method edamam-nutrition"><h3>Información nutricional</h3><p className="microcopy">Valores por porción.</p>
            <div className="edamam-nutrient-grid">{nutrients.map(([key, label, unit]) => <div key={key}><small>{label}</small><strong>{number(recipe.nutrientsPerServing?.[key])} <span>{unit}</span></strong></div>)}</div>
          </section>
          {present.length > 0 && <p className="microcopy">En tu despensa: {present.join(', ')}.</p>}
          {recipe.nutritionLimitsUnverified && <p className="microcopy">Algunos límites nutricionales de tu perfil no pudieron verificarse.</p>}
          <section className="recipe-method">
            <div className="recipe-method-tabs" role="tablist" aria-label="Preparación de la receta">
              <button role="tab" aria-selected={tab === 'ingredients'} onClick={() => setTab('ingredients')}>Ingredientes</button>
              <button role="tab" aria-selected={tab === 'steps'} onClick={() => setTab('steps')}>Pasos</button>
            </div>
            {tab === 'ingredients' ? <div role="tabpanel"><h3>Ingredientes</h3>
              {presentationError && <p className="microcopy" role="status">No se pudo traducir: {presentationError}. Se muestra el texto original.</p>}
              {translating ? <p className="microcopy" role="status">Preparando ingredientes en español…</p>
                : <ol className="detail-ingredients edamam-numbered-ingredients">{recipe.ingredientLines.map((line, i) => <li key={`${line}-${i}`}><span className="detail-ingredient-number" aria-hidden="true">{i + 1}</span><span>{presentation?.ingredientLinesEs?.[i] || line}</span></li>)}</ol>}
              <p className="microcopy">Verifica ingredientes y alérgenos antes de cocinar.</p>
            </div> : <div role="tabpanel"><h3 className="steps-heading">Paso a Paso</h3>
              {recipe.sourceUrl && <a className="btn primary edamam-source-link" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">Ver preparación en {recipe.source || 'el sitio original'} ↗</a>}
            </div>}
          </section>
          <p className="microcopy">La lista de compras incluye toda la receta. Revisa lo que ya tienes en tu despensa antes de comprar; todavía no conocemos tus cantidades disponibles.</p>
          <div className="culinary-recipe-actions"><button className="btn secondary" disabled={working || !recipeServings || recipeServings > 100} onClick={makeShopping}>Lista de compras completa</button></div>
          {shopping && <section className="recipe-method"><h3>Lista de compras para {recipeServings} porciones</h3><ul className="detail-ingredients">{shopping.items.map((item, i) => <li key={i}>{shoppingTranslations?.[i] || item.food}{item.quantities.map(q => ` · ${q.quantity} ${q.measure.split('#Measure_').at(-1).replaceAll('_', ' ')}`).join('')}{item.aisle ? ` · ${item.aisle}` : ''}</li>)}</ul>{shopping.cartUrl && <a href={shopping.cartUrl} target="_blank" rel="noopener noreferrer">Abrir carrito de compras ↗</a>}</section>}
          {mealTracker && <MealFeedback key={recipe.uri} recipe={recipe} tracker={mealTracker} />}
          {error && <p role="alert">{error}</p>}
        </div>
      </>}
    </dialog>
  </>;
}

export function EdamamFavorites({ meal = 'Todas', mealTracker, localCount = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = () => request('favorites').then(data => { setItems(data.items); setError(''); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { refresh(); }, []);
  const visible = items.filter(item => meal === 'Todas' || item.meal === meal);
  return <>{visible.map((item, index) => <EdamamRecipeCard key={item.uri} reference={item} isFavorite prefetch={index < 3} onFavoriteChanged={refresh} mealTracker={mealTracker} />)}
    {!loading && !error && !visible.length && !localCount && <p className="edamam-library-empty">No hay recetas en esta categoría. Guarda una receta con el corazón o prueba otra categoría.</p>}
    {error && <p role="alert">{error}</p>}</>;
}
