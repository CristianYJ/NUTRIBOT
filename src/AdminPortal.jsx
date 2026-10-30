import { useEffect, useState } from 'react';
import { authenticatedFetch } from './auth-api.js';
import './admin-portal.css';

async function readAdmin(path) {
  const response = await authenticatedFetch('/api/admin/' + path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.text || 'No se pudo consultar el portal.');
  return data;
}
const date = value => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const labels = { error: 'Error', success: 'Recetas encontradas', empty: 'Sin resultados', conversation: 'Conversación', review: 'Revisión' };

export default function AdminPortal() {
  const [tab, setTab] = useState('errors');
  const [events, setEvents] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const outcome = tab === 'errors' ? 'error' : 'all';
  async function refresh(offset = 0, append = false) {
    setBusy(true); setError('');
    try {
      const [list, overview] = await Promise.all([
        readAdmin(`events?outcome=${outcome}&offset=${offset}`), readAdmin('summary'),
      ]);
      setEvents(previous => append ? [...previous, ...list.items] : list.items);
      setNextOffset(list.nextOffset);
      setSummary(overview);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { refresh(); }, [tab]);
  return <section className="admin-portal page-enter" aria-labelledby="admin-title">
    <div className="admin-heading"><div><span className="culinary-kicker">ADMINISTRACIÓN</span><h1 id="admin-title">Diagnóstico de Nutribot</h1>
      <p>Consulta resultados y motivos de fallos de los últimos 30 días. Los textos se recortan y se ocultan correos y teléfonos.</p></div>
      <button className="btn secondary" onClick={() => refresh()} disabled={busy}>Actualizar</button></div>
    <div className="admin-stats">
      <article><span>Consultas · 24 h</span><strong>{summary?.total24h ?? '—'}</strong></article>
      <article><span>Errores · 24 h</span><strong>{summary?.errors24h ?? '—'}</strong></article>
      <article><span>Consultas · 7 días</span><strong>{summary?.total7d ?? '—'}</strong></article>
      <article><span>Errores · 7 días</span><strong>{summary?.errors7d ?? '—'}</strong></article>
    </div>
    <div className="admin-tabs" role="tablist" aria-label="Vistas administrativas">
      {[['errors', 'Incidentes'], ['activity', 'Actividad'], ['system', 'Sistema']].map(([id, label]) =>
        <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {tab === 'system' ? <div className="admin-system">
      <article><h2>Servicios</h2><dl>
        <div><dt>Gemini</dt><dd>{summary?.providers?.gemini ? 'Configurado' : 'Sin configurar'}</dd></div>
        <div><dt>Edamam</dt><dd>{summary?.providers?.edamam ? 'Configurado' : 'Sin configurar'}</dd></div>
        <div><dt>USDA</dt><dd>{summary?.providers?.usda ? 'Configurado' : 'Sin configurar'}</dd></div>
        <div><dt>Modelo Gemini</dt><dd>{summary?.model || '—'}</dd></div>
      </dl></article>
      <article><h2>Códigos de error más frecuentes · 7 días</h2>
        {summary?.codes?.length ? <ul>{summary.codes.map(item => <li key={item.code}>{item.code || 'INTERNAL_ERROR'} <strong>{item.count}</strong></li>)}</ul> : <p>Sin errores registrados.</p>}
      </article>
    </div> : <div className="admin-events" role="tabpanel">
      {!events.length && !busy && !error && <p className="admin-empty">Aún no hay {tab === 'errors' ? 'incidentes' : 'consultas'} registrados.</p>}
      {events.map(item => <details className={`admin-event ${item.outcome}`} key={item.id}>
        <summary><span className={`admin-status ${item.outcome}`}>{labels[item.outcome] || item.outcome}</span>
          <strong>{item.errorCode || item.stage}</strong><span>{item.provider}</span><time dateTime={item.createdAt}>{date(item.createdAt)}</time>
          <code title={item.requestId}>#{item.requestId.slice(0, 8)}</code></summary>
        <div className="admin-event-detail">
          <dl><div><dt>Etapa</dt><dd>{item.stage}</dd></div><div><dt>Cuenta</dt><dd>#{item.accountId ?? '—'}</dd></div>
            <div><dt>Duración</dt><dd>{item.durationMs} ms</dd></div><div><dt>Recetas</dt><dd>{item.context.recipeCount}</dd></div>
            <div><dt>Tiempo pedido</dt><dd>{item.context.maxTime ?? '—'} min</dd></div><div><dt>Ingredientes en despensa</dt><dd>{item.context.pantryCount ?? '—'}</dd></div>
            <div><dt>Modo</dt><dd>{item.context.mode || '—'}</dd></div></dl>
          {item.reasons?.length > 0 && <p><strong>Validación:</strong> {item.reasons.join(', ')}</p>}
          {item.previousExcerpt && <p><strong>Consulta anterior:</strong> {item.previousExcerpt}</p>}
          {item.requestExcerpt && <p><strong>Consulta que falló:</strong> {item.requestExcerpt}</p>}
          {item.outcome === 'error' && !item.reasons?.length && <p>El proveedor o una etapa del servidor falló antes de validar una receta. Usa el código y la etapa para investigar.</p>}
        </div>
      </details>)}
      {nextOffset != null && <button className="btn secondary" onClick={() => refresh(nextOffset, true)} disabled={busy}>Cargar más</button>}
      {busy && <p role="status">Cargando diagnósticos…</p>}
    </div>}
  </section>;
}
