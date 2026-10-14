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
  }, [recipe.id, servings, onValidation]);

  const values = mode === 'total' ? data?.nutrition.total : data?.nutrition.perPerson;

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
          <strong>{values[key] === null ? '—' : values[key]}</strong>
          <small>{values[key] === null ? 'Sin verificar' : unit}</small>
        </div>)}
      </div>
      {!data.nutrition.complete && <p className="review-note">El cálculo está incompleto. Los valores sin datos suficientes aparecen como «Sin verificar».</p>}
      {data.lookup?.unavailable && <p className="microcopy">No se pudieron consultar todos los alimentos USDA en este momento.</p>}
      {Object.entries(data.nutrition.checks).filter(([, status]) => status !== 'within').map(([key, status]) => <p className="review-note" key={key}>
        {checks[key]}: {status === 'exceeds' ? 'supera el límite indicado' : 'no verificable con los datos actuales'}.
      </p>)}
    </>}
  </section>;
}
