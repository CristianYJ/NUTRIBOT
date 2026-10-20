import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from './auth-api.js';
import './plan-usage.css';

export function usePlanUsage() {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(null);
  const refreshUsage = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await authenticatedFetch('/api/plan', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.text || 'No se pudo consultar tu cupo.');
      if (!controller.signal.aborted) { setUsage(data); setError(''); }
    } catch (e) { if (!controller.signal.aborted) { setUsage(null); setError(e.message); } }
  }, []);
  useEffect(() => {
    refreshUsage();
    const visible = () => { if (document.visibilityState === 'visible') refreshUsage(); };
    document.addEventListener('visibilitychange', visible);
    return () => { request.current?.abort(); document.removeEventListener('visibilitychange', visible); };
  }, [refreshUsage]);
  return { usage, usageError: error, refreshUsage };
}

export default function PlanUsage({ usage, error, onRefresh, compact = false }) {
  if (compact) return usage ? <p className="plan-usage-inline" role="status">{usage.plan.name}: {usage.recipes.used}/{usage.recipes.limit} generaciones esta semana{usage.recipes.pending ? ` · ${usage.recipes.pending} en curso` : ''}</p> : null;
  return <section className="plan-usage-panel" aria-label="Mi plan y consumo">
    <div className="plan-usage-heading"><h2>Mi plan{usage ? ` · ${usage.plan.name}` : ''}</h2><button type="button" className="text-btn" onClick={onRefresh}>Actualizar cupo</button></div>
    {error ? <p role="alert">{error}</p> : !usage ? <p role="status">Consultando tu plan…</p> : <>
      <div className="plan-usage-counters">{[['recipes', 'Generaciones de recetas', 'esta semana'], ['vision', 'Fotos con Nutri-Vision', 'este mes']].map(([key, label, period]) => <div key={key}>
        <strong>{label}</strong><p>{usage[key].used} de {usage[key].limit} usadas {period}</p>
        <progress aria-label={label} max={usage[key].limit} value={Math.min(usage[key].limit, usage[key].used + usage[key].pending)} />
        <small>{usage[key].pending ? `${usage[key].pending} en curso. ` : ''}Se renueva el {new Date(usage[key].resetsAt).toLocaleDateString('es-SV', { timeZone: usage.timezone })}.</small>
      </div>)}</div>
    </>}
  </section>;
}
