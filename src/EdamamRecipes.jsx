import { useEffect, useState } from 'react';
import { authenticatedFetch } from './auth-api.js';

async function edamamRequest(path, method = 'GET', body) {
  const response = await authenticatedFetch('/api/edamam/' + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.text || 'No se pudo consultar Edamam.');
  return data;
}
export function EdamamBadge() {
  return <a className="edamam-attribution" href="https://www.edamam.com/" target="_blank" rel="noreferrer" aria-label="Powered by Edamam">
    <img src="https://developer.edamam.com/images/light.png" alt="Powered by Edamam" />
  </a>;
}
export function EdamamRecipeCard({ initial, reference, pantry = [], ingredients = [], onFavoriteChanged, isFavorite = false }) {
  const [recipe, setRecipe] = useState(initial || null);
  const [shopping, setShopping] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [saved, setSaved] = useState(isFavorite);
  const uri = initial?.uri || reference?.uri;
  const title = recipe?.title || reference?.title || 'Receta de Edamam';
  useEffect(() => { setRecipe(initial || null); setShopping(null); }, [initial, uri]);
  async function load() {
    setWorking(true); setError('');
    try { setRecipe((await edamamRequest('detail?uri=' + encodeURIComponent(uri))).recipe); }
    catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  async function favorite() {
    setWorking(true); setError('');
    try { await edamamRequest('favorites', saved ? 'DELETE' : 'POST', { uri, title }); setSaved(!saved); onFavoriteChanged?.(); }
    catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  async function makeShopping() {
    setWorking(true); setError('');
    try { setShopping(await edamamRequest('shopping', 'POST', { uri, servings: Math.max(1, Math.min(12, Math.round(recipe.servings))) })); }
    catch (e) { setError(e.message); } finally { setWorking(false); }
  }
  const nameFor = id => ingredients.find(item => item.id === id)?.name || id;
  const present = recipe?.matched?.filter(id => pantry.includes(id)) || [];
  return <article className="edamam-recipe-card">
    {recipe?.image && <img className="edamam-recipe-photo" src={recipe.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
    <div className="edamam-recipe-content">
      <span className="culinary-kicker">RECETA DE EDAMAM</span>
      <h3>{title}</h3>
      {recipe ? <>
        <div className="edamam-recipe-facts">
          {recipe.time != null && <span>{recipe.time} min</span>}
          {recipe.caloriesPerServing != null && <span>{recipe.caloriesPerServing} kcal/porción</span>}
          <span>Índice glucémico: {recipe.glycemicIndex == null ? 'no disponible' : recipe.glycemicIndex}</span>
          {recipe.co2Class && <span>Huella de carbono: clase {recipe.co2Class}</span>}
        </div>
        <div className="edamam-recipe-facts" aria-label="Nutrientes por porción">
          {Object.entries({ proteinG: 'Proteína', carbohydratesG: 'Carbohidratos', fatG: 'Grasas', fiberG: 'Fibra', sugarG: 'Azúcares', sodiumMg: 'Sodio' })
            .filter(([key]) => recipe.nutrientsPerServing?.[key] != null)
            .map(([key, label]) => <span key={key}>{label}: {Math.round(recipe.nutrientsPerServing[key] * 10) / 10} {key === 'sodiumMg' ? 'mg' : 'g'}</span>)}
        </div>
        {recipe.matched?.length > 0 && <p>En tu despensa: {present.map(nameFor).join(', ')}.</p>}
        {recipe.missing?.length > 0 && <p>Ingredientes buscados que no están en tu despensa: {recipe.missing.map(nameFor).join(', ')}.</p>}
        <p className="culinary-privacy">Revisa la lista completa: puede haber otros ingredientes que necesites comprar. No conocemos las cantidades disponibles en tu despensa.</p>
        {recipe.nutritionLimitsUnverified && <p className="culinary-privacy">Algunos límites nutricionales de tu perfil no se pudieron verificar con los datos disponibles.</p>}
        <details><summary>Ingredientes y cantidades</summary><ul>{recipe.ingredientLines.map((line, i) => <li key={i}>{line}</li>)}</ul></details>
        {recipe.sourceUrl && <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">Preparación en {recipe.source || 'el sitio de origen'} ↗</a>}
        <p className="culinary-privacy">Las instrucciones pertenecen al sitio de origen. Verifica ingredientes y alérgenos antes de cocinar.</p>
      </> : <p>Abre la ficha para consultar los datos actualizados de Edamam.</p>}
      <div className="culinary-recipe-actions">
        {!recipe && <button className="btn primary" disabled={working} onClick={load}>Ver receta</button>}
        {recipe && <button className="btn secondary" disabled={working} onClick={makeShopping}>Lista de compras</button>}
        <button className="btn secondary" disabled={working} onClick={favorite}>{saved ? 'Quitar de favoritas' : 'Guardar favorita'}</button>
      </div>
      {shopping && <details open><summary>Lista de compras de Edamam</summary><ul>{shopping.items.map((item, i) => <li key={i}>{item.food}{item.quantities.map(q => ` · ${q.quantity} ${q.measure.split('#Measure_').at(-1).replaceAll('_', ' ')}${q.qualifiers?.length ? ` (${q.qualifiers.join(', ')})` : ''}`).join('')}{item.aisle ? ` · ${item.aisle}` : ''}</li>)}</ul>
        {shopping.cartUrl && <a href={shopping.cartUrl} target="_blank" rel="noopener noreferrer">Abrir carrito de compras ↗</a>}
      </details>}
      {error && <p role="alert">{error}</p>}
    </div>
  </article>;
}
export function EdamamFavorites() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const refresh = () => edamamRequest('favorites').then(data => setItems(data.items)).catch(e => setError(e.message));
  useEffect(() => { refresh(); }, []);
  if (!items.length && !error) return null;
  return <section className="edamam-favorites"><h2>Favoritas de Edamam</h2>
    {error && <p role="alert">{error}</p>}
    <div className="recipe-grid library">{items.map(item => <EdamamRecipeCard key={item.uri} reference={item} isFavorite onFavoriteChanged={refresh} />)}</div>
    <EdamamBadge />
  </section>;
}
