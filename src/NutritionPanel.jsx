import NutritionClarification from './NutritionClarification.jsx';
import { useEffect, useState } from 'react';
import { nutritionRequest } from './api.js';

const metrics = [
  ['kcal', 'Kcal', 'kcal'],
  ['carbs', 'Carbohidratos', 'g'],
  ['fiber', 'Fibra', 'g'],
  ['protein', 'Proteína', 'g'],
  ['fat', 'Grasa', 'g'],
  ['saturatedFat', 'Grasa saturada', 'g'],
  ['sugars', 'Azúcares', 'g'],
  ['salt', 'Sal equivalente', 'g'],
];
const checks = {
  maxSaturatedFatG: 'Grasa saturada',
  maxSodiumMg: 'Sodio',
  maxSugarG: 'Azúcares totales',
};

export default function NutritionPanel({ recipe, servings, onValidation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('total');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    onValidation(false);
    nutritionRequest('GET', `recipes/${recipe.id}?servings=${servings}`, undefined, controller.signal)
      .then((value) => {
        setData(value);
        onValidation(Object.values(value.nutrition.checks).every((check) => check === 'within'));
      })
      .catch((problem) => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [recipe.id, servings, onValidation, retry]);

  const values = mode === 'total' ? data?.nutrition.total : data?.nutrition.perPerson;
  const gaps = data?.ingredients?.filter(item => !item.usda || !Number.isFinite(item.gramsPerPerson) || item.gramsPerPerson <= 0 ||
    metrics.some(([field]) => item.usda.nutrients?.[field === 'salt' ? 'sodium' : field] == null)).map(item => item.name) || [];


  return <section className="usda-panel" aria-label="Información nutricional de la receta">
    <h3>Información nutricional</h3>
    {error && <p className="review-note" role="alert">{error}</p>}
    {!data && !error && <p className="microcopy">Calculando los nutrientes de la receta…</p>}
    {data && <>
      <div className="usda-mode" role="group" aria-label="Vista nutricional">
        <button type="button" className={mode === 'total' ? 'active' : ''} aria-label={`Receta entera para ${servings} ${servings === 1 ? 'persona' : 'personas'}`} aria-pressed={mode === 'total'} onClick={() => setMode('total')}>Receta entera</button>
        <button type="button" className={mode === 'person' ? 'active' : ''} aria-pressed={mode === 'person'} onClick={() => setMode('person')}>Por persona</button>
      </div>
      <div className="usda-cards">
        {metrics.map(([key, label, unit]) => <div className="usda-card" key={key}>
          <span>{label}</span>
          <strong>{values[key] == null ? '—' : values[key]}</strong>
          <small>{values[key] == null ? 'Sin verificar' : unit}</small>
        </div>)}
      </div>
      <p className="microcopy">Estimación con datos USDA y las cantidades de la receta. Los valores pueden variar según el alimento utilizado.</p>
      {!data.nutrition.complete && <div className="review-note">
        <p>{gaps.length ? `Faltan datos completos de: ${gaps.join(', ')}.` : 'Faltan datos para completar el cálculo.'} Los totales incompletos aparecen como «Sin verificar»; no se cuentan los datos faltantes como cero.</p>
      </div>}
      {data.referenceNotes?.length > 0 && <details className="usda-references">
        <summary>Alimentos usados para la estimación</summary>
        <ul>{data.referenceNotes.map(note => <li key={note}>{note}</li>)}</ul>
      </details>}
      {!data.nutrition.complete && data.ingredients?.some(item => !item.usda || Object.values(item.usda.nutrients).some(value => value === null)) &&
        <NutritionClarification ingredientIds={data.ingredients.filter(item => !item.usda || Object.values(item.usda.nutrients).some(value => value === null)).map(item => item.ingredientId)} onContinue={() => setRetry(value => value + 1)} />}
      <details className="usda-references">
        <summary>Fuentes USDA de esta receta</summary>
        <ul>{data.ingredients?.filter(item => item.usda).map(item => <li key={item.ingredientId}>
          <strong>{item.name}</strong>: {item.usda.description} · <a href={`https://fdc.nal.usda.gov/food-details/${item.usda.fdcId}/nutrients`} target="_blank" rel="noreferrer">FDC {item.usda.fdcId}</a>
        </li>)}</ul>
      </details>
      {data.lookup?.unavailable && <p className="microcopy">No se pudieron consultar todos los alimentos USDA en este momento.</p>}
      {Object.entries(data.nutrition.checks).filter(([, status]) => status !== 'within').map(([key, status]) => <p className="review-note" key={key}>
        {checks[key]}: {status === 'exceeds' ? 'supera el límite indicado' : 'no verificable con los datos actuales'}.
      </p>)}
    </>}
    {(error || data?.lookup?.unavailable) && <button type="button" className="btn secondary" onClick={() => setRetry(value => value + 1)}>Volver a consultar nutrientes</button>}
  </section>;
}
