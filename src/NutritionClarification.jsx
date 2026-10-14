import { useEffect, useState } from 'react';
import { nutritionRequest } from './api.js';

export default function NutritionClarification({ ingredientIds, onContinue, disabled = false }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [reload, setReload] = useState(0);
  const key = ingredientIds.join(',');
  useEffect(() => {
    const controller = new AbortController();
    setItems(null); setError('');
    Promise.all(ingredientIds.map(id => nutritionRequest('GET', `ingredients/${id}/options`, undefined, controller.signal)))
      .then(setItems).catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [key, reload]);
  const current = items?.find(item => !item.complete);
  useEffect(() => { setResults(null); setQuery(''); }, [current?.ingredientId]);
  async function choose(food) {
    setBusy(true); setError('');
    try {
      await nutritionRequest('PUT', `ingredients/${current.ingredientId}/usda`, {fdcId: food.fdcId, confirmed: true});
      setItems(values => values.map(item => item.ingredientId === current.ingredientId ? {...item, complete:true} : item));
      setResults(null);
    } catch(problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function search() {
    setBusy(true); setError('');
    try {
      const response = await nutritionRequest('GET', `ingredients/${current.ingredientId}/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
      setResults(response);
    } catch(problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  return <div className="nutrition-clarification" aria-live="polite">
    {error && <p role="alert">{error}</p>}
    {!items && !error && <p>Consultando tus alimentos…</p>}
    {!items && error && <button className="btn secondary" onClick={() => setReload(value => value + 1)}>Reintentar</button>}
    {current && <>
      <strong>{current.question}</strong>
      <div className="culinary-quick-replies">
        {current.options.map(option => <button key={option.fdcId} disabled={busy || disabled} onClick={() => choose(option)}>{option.label}</button>)}
      </div>
      <details>
        <summary>{current.options.length ? 'Es otro tipo / buscar mi alimento' : 'Buscar el alimento en USDA'}</summary>
        <p>Escribe el tipo, preparación o marca. Traduciremos la búsqueda; selecciona solo una ficha que corresponda a lo que usas.</p>
        <label>Alimento<input maxLength={100} value={query} placeholder={current.name} onChange={event => setQuery(event.target.value)} /></label>
        <button className="btn secondary" disabled={busy || disabled} onClick={search}>Buscar en USDA</button>
        {results && <>
          <small>Búsqueda: {results.query}</small>
          {!results.foods.length && <p>No encontré coincidencias. Prueba un nombre más específico.</p>}
          <ul className="nutrition-food-options">{results.foods.map(food => <li key={food.fdcId}>
            <strong>{food.description}</strong><small>{food.brandOwner || food.dataType} · FDC {food.fdcId}</small>
            <button className="btn secondary" disabled={busy || disabled} onClick={() => choose(food)}>Este es el que uso</button>
          </li>)}</ul>
        </>}
      </details>
      {busy && <p>Consultando la ficha USDA…</p>}
      <small>{items.filter(item => item.complete).length} de {items.length} alimentos identificados</small>
    </>}
    {items && !current && <>
      <p>Las referencias están guardadas. Ya podemos continuar con tu receta.</p>
      <button className="btn primary" disabled={disabled || busy} onClick={onContinue}>Continuar con mi receta</button>
    </>}
  </div>;
}
