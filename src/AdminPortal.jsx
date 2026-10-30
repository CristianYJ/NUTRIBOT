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
const shortDate = value => new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
const pct = (part, total) => total ? `${Math.round(part / total * 100)}%` : '—';
const views = [['overview', 'Resumen'], ['incidents', 'Incidentes'], ['quality', 'Calidad de recetas'], ['usage', 'Uso de APIs'], ['users', 'Usuarios y soporte'], ['system', 'Sistema']];
const outcomes = { error: 'Error', success: 'Recetas', empty: 'Sin resultados', conversation: 'Conversación', review: 'Revisión' };
const empty = <p className="admin-empty">Aún no hay datos para este período.</p>;

function Stat({ label, value, hint, tone = '' }) {
  return <article className={`admin-stat ${tone}`}><span>{label}</span><strong>{value ?? '—'}</strong>{hint && <small>{hint}</small>}</article>;
}
function Trend({ daily = [] }) {
  const max = Math.max(1, ...daily.map(day => day.total));
  return <figure className="admin-panel admin-trend"><div className="admin-panel-heading"><div><h2>Consultas por día</h2><p>Últimos 7 días · registros del flujo de recetas</p></div></div>
    {daily.length ? <div className="admin-chart" role="img" aria-label={daily.map(day => `${shortDate(day.day)}: ${day.total} consultas, ${day.errors} errores`).join('; ')}>
      {daily.map(day => <div className="admin-chart-column" key={day.day} title={`${day.total} consultas · ${day.errors} errores`}>
        <div className="admin-chart-track" style={{ height: `${Math.max(8, day.total / max * 100)}%` }}>
          <span className="admin-chart-errors" style={{ height: `${day.total ? day.errors / day.total * 100 : 0}%` }} />
          <span className="admin-chart-empty" style={{ height: `${day.total ? day.empty / day.total * 100 : 0}%` }} />
        </div><small>{shortDate(day.day)}</small></div>)}
    </div> : empty}
    <figcaption className="admin-legend"><span><i className="success" />Resultados y conversaciones</span><span><i className="empty" />Sin resultados</span><span><i className="error" />Errores</span></figcaption>
  </figure>;
}
function EventList({ items, onSelect, compact = false }) {
  if (!items.length) return empty;
  return <div className={`admin-event-list${compact ? ' compact' : ''}`}>
    {items.map(item => <button className="admin-event-row" key={item.id} onClick={() => onSelect(item)}>
      <span className={`admin-status ${item.outcome}`}>{outcomes[item.outcome] || item.outcome}</span>
      <span className="admin-event-main"><strong>{item.errorCode || item.stage}</strong><small>{item.provider} · {item.stage}</small></span>
      <span className="admin-event-time">{date(item.createdAt)}</span><code>#{item.requestId.slice(0, 8)}</code>
    </button>)}
  </div>;
}

export default function AdminPortal() {
  const [view, setView] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [recent, setRecent] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ days: 7, outcome: 'error', provider: 'all', search: '', accountId: '' });
  const [accountQuery, setAccountQuery] = useState('');
  const [accountResult, setAccountResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const q = summary?.quality || {};
  const successes = (q.twoOptions || 0) + (q.oneOption || 0);
  const filterQuery = (offset = 0) => new URLSearchParams({ days: filters.days, outcome: filters.outcome,
    provider: filters.provider, search: filters.search.trim().replace(/^#/, ''), accountId: filters.accountId, offset }).toString();

  useEffect(() => {
    let active = true;
    Promise.all([readAdmin('summary'), readAdmin('events?outcome=error&days=7&offset=0')])
      .then(([overview, list]) => { if (active) { setSummary(overview); setRecent(list.items.slice(0, 5)); setError(''); } })
      .catch(problem => { if (active) setError(problem.message); });
    return () => { active = false; };
  }, [refreshKey]);
  useEffect(() => {
    if (view !== 'incidents') return;
    let active = true;
    const timer = setTimeout(() => {
      setBusy(true);
      readAdmin(`events?${filterQuery()}`).then(list => { if (active) { setEvents(list.items); setNextOffset(list.nextOffset); setError(''); } })
        .catch(problem => { if (active) setError(problem.message); })
        .finally(() => { if (active) setBusy(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [view, filters, refreshKey]);
  async function loadMore() {
    if (nextOffset == null) return;
    setBusy(true);
    try { const list = await readAdmin(`events?${filterQuery(nextOffset)}`); setEvents(previous => [...previous, ...list.items]); setNextOffset(list.nextOffset); }
    catch (problem) { setError(problem.message); } finally { setBusy(false); }
  }
  async function findAccount(event) {
    event.preventDefault(); setBusy(true); setError(''); setAccountResult(null);
    try { setAccountResult(await readAdmin(`account?q=${encodeURIComponent(accountQuery.trim())}`)); }
    catch (problem) { setError(problem.message); } finally { setBusy(false); }
  }
  function openAccountIncidents(id) { setFilters(previous => ({ ...previous, accountId: String(id), outcome: 'all' })); setView('incidents'); }

  return <section className="admin-portal page-enter" aria-labelledby="admin-title">
    <header className="admin-heading"><div><span className="admin-eyebrow">NUTRIBOT · ADMIN</span><h1 id="admin-title">Centro de operaciones</h1>
      <p>Diagnósticos de los últimos 30 días. Los extractos están limitados y ocultan correos y teléfonos.</p></div>
      <button className="btn secondary" onClick={() => setRefreshKey(value => value + 1)} disabled={busy}>Actualizar datos</button></header>
    <div className="admin-layout"><nav className="admin-nav" aria-label="Secciones administrativas">{views.map(([id, label]) =>
      <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setSelected(null); }}>{label}</button>)}</nav>
      <div className="admin-content">
        {error && <p className="admin-error" role="alert">{error}</p>}
        {view === 'overview' && <><div className="admin-section-heading"><h2>Resumen</h2><p>Salud del flujo de recetas en los últimos 7 días</p></div>
          <div className="admin-stats"><Stat label="Consultas · 24 h" value={summary?.total24h} hint="Solicitudes registradas" />
            <Stat label="Tasa de error · 7 días" value={summary ? pct(summary.errors7d, summary.total7d) : null} hint={`${summary?.errors7d ?? 0} errores de ${summary?.total7d ?? 0}`} tone="warning" />
            <Stat label="Dos opciones" value={summary ? pct(q.twoOptions, successes) : null} hint="De búsquedas con recetas" />
            <Stat label="Tiempo p95" value={q.p95Ms == null ? '—' : `${(q.p95Ms / 1000).toFixed(1)} s`} hint="95 % de solicitudes más rápidas" /></div>
          <div className="admin-two-col"><Trend daily={summary?.daily} /><section className="admin-panel"><div className="admin-panel-heading"><h2>Incidentes recientes</h2><button className="admin-text-link" onClick={() => setView('incidents')}>Ver todos</button></div><EventList items={recent} compact onSelect={setSelected} /></section></div>
        </>}
        {view === 'incidents' && <><div className="admin-section-heading"><h2>Incidentes</h2><p>Busca una referencia del chat o filtra los resultados registrados.</p></div>
          <div className="admin-filters"><label>Período<select value={filters.days} onChange={e => setFilters({ ...filters, days: Number(e.target.value) })}><option value={1}>24 horas</option><option value={7}>7 días</option><option value={30}>30 días</option></select></label>
            <label>Resultado<select value={filters.outcome} onChange={e => setFilters({ ...filters, outcome: e.target.value })}><option value="error">Errores</option><option value="all">Todos</option><option value="empty">Sin resultados</option><option value="success">Recetas</option><option value="conversation">Conversación</option></select></label>
            <label>Proveedor<select value={filters.provider} onChange={e => setFilters({ ...filters, provider: e.target.value })}><option value="all">Todos</option><option value="edamam">Edamam</option><option value="gemini">Gemini</option></select></label>
            <label className="admin-search">Referencia, código o etapa<input value={filters.search} maxLength={80} placeholder="Ej. #a1b2c3d4" onChange={e => setFilters({ ...filters, search: e.target.value })} /></label></div>
          {filters.accountId && <div className="admin-filter-chip">Cuenta #{filters.accountId}<button onClick={() => setFilters({ ...filters, accountId: '' })} aria-label="Quitar filtro de cuenta">×</button></div>}
          <section className="admin-panel admin-list-panel"><div className="admin-panel-heading"><h3>Resultados</h3><span>{events.length} visibles</span></div><EventList items={events} onSelect={setSelected} />
            {nextOffset != null && <button className="btn secondary admin-more" disabled={busy} onClick={loadMore}>Cargar más</button>}{busy && <p role="status">Cargando…</p>}</section>
        </>}
        {view === 'quality' && <><div className="admin-section-heading"><h2>Calidad de recetas</h2><p>Qué ocurre después de que la persona pide una receta · últimos 7 días</p></div>
          <div className="admin-stats"><Stat label="Dos opciones" value={q.twoOptions} hint="Búsquedas exitosas" /><Stat label="Una opción" value={q.oneOption} hint="Búsquedas exitosas" /><Stat label="Sin resultados" value={q.noResults} hint="Filtros sin coincidencias" /><Stat label="Más alternativas" value={q.moreRequests} hint={`${q.moreSuccess ?? 0} terminaron con recetas`} /></div>
          <section className="admin-panel admin-quality"><h3>Distribución de búsquedas</h3><div className="admin-quality-bar"><span style={{ width: pct(q.twoOptions, successes + (q.noResults || 0)) === '—' ? '0%' : pct(q.twoOptions, successes + (q.noResults || 0)) }} /><span style={{ width: pct(q.oneOption, successes + (q.noResults || 0)) === '—' ? '0%' : pct(q.oneOption, successes + (q.noResults || 0)) }} /></div>
            <p>{successes + (q.noResults || 0) ? `${pct(q.twoOptions, successes + q.noResults)} con dos opciones · ${pct(q.oneOption, successes + q.noResults)} con una · ${pct(q.noResults, successes + q.noResults)} sin resultados.` : 'Todavía no hay búsquedas de recetas registradas.'}</p>
            <small>Las conversaciones y solicitudes bloqueadas antes de la búsqueda no entran en esta distribución.</small></section>
        </>}
        {view === 'usage' && <><div className="admin-section-heading"><h2>Uso de APIs</h2><p>Solicitudes de recetas atribuidas al proveedor final · últimos 7 días</p></div>
          <p className="admin-note">Estos son eventos del flujo de recetas, no llamadas reales ni importes de facturación. Una búsqueda puede usar Gemini y Edamam en la misma solicitud.</p>
          <div className="admin-provider-grid">{summary?.byProvider?.length ? summary.byProvider.map(item => <article className="admin-panel" key={item.provider}><h3>{item.provider}</h3><strong>{item.total}</strong><span>solicitudes registradas</span><p>{item.success} con recetas · {item.errors} errores</p></article>) : empty}</div>
          <div className="admin-stats"><Stat label="Cuentas activas" value={q.activeAccounts} hint="Con solicitudes registradas" /><Stat label="Tiempo p50" value={q.p50Ms == null ? '—' : `${(q.p50Ms / 1000).toFixed(1)} s`} hint="Mediana del flujo" /><Stat label="Tiempo p95" value={q.p95Ms == null ? '—' : `${(q.p95Ms / 1000).toFixed(1)} s`} hint="Flujo completo" /></div>
        </>}
        {view === 'users' && <><div className="admin-section-heading"><h2>Usuarios y soporte</h2><p>Busca una cuenta exacta para revisar su plan y referencias recientes.</p></div>
          <form className="admin-account-search" onSubmit={findAccount}><label htmlFor="admin-account-query">Correo completo o ID de cuenta</label><div><input id="admin-account-query" value={accountQuery} onChange={e => setAccountQuery(e.target.value)} placeholder="usuario@ejemplo.com" required /><button className="btn primary" disabled={busy}>Buscar</button></div></form>
          {accountResult && (accountResult.account ? <section className="admin-panel admin-account"><h3>{accountResult.account.name}</h3><p>{accountResult.account.email} · Cuenta #{accountResult.account.id}</p><dl><div><dt>Plan</dt><dd>{accountResult.account.plan}</dd></div><div><dt>Registro</dt><dd>{date(accountResult.account.createdAt)}</dd></div></dl>
            <button className="btn secondary" onClick={() => openAccountIncidents(accountResult.account.id)}>Ver actividad de esta cuenta</button><h4>Referencias recientes</h4>
            {accountResult.recent.length ? <ul>{accountResult.recent.map(item => <li key={item.requestId}><code>#{item.requestId.slice(0, 8)}</code> · {outcomes[item.outcome] || item.outcome} · {date(item.createdAt)}</li>)}</ul> : <p>Sin eventos recientes.</p>}
          </section> : <p className="admin-empty">No se encontró esa cuenta.</p>)}
        </>}
        {view === 'system' && <><div className="admin-section-heading"><h2>Sistema</h2><p>Configuración observada por este servidor. “Configurado” no prueba disponibilidad externa.</p></div>
          <div className="admin-system-grid"><section className="admin-panel"><h3>Servicios</h3><dl>{[['Base de datos', Boolean(summary)], ['Gemini', summary?.providers?.gemini], ['Edamam', summary?.providers?.edamam], ['USDA', summary?.providers?.usda]].map(([name, ready]) => <div key={name}><dt>{name}</dt><dd className={ready ? 'ready' : 'missing'}>{ready ? name === 'Base de datos' ? 'Conectada' : 'Configurado' : 'Sin configurar'}</dd></div>)}</dl><p>Modelo Gemini: <strong>{summary?.model || '—'}</strong></p><p>Servidor activo: <strong>{summary?.uptimeSeconds == null ? '—' : `${Math.floor(summary.uptimeSeconds / 60)} min`}</strong></p></section>
            <section className="admin-panel"><h3>Códigos de error · 7 días</h3>{summary?.codes?.length ? <ul className="admin-codes">{summary.codes.map(item => <li key={item.code}><span>{item.code || 'INTERNAL_ERROR'}</span><strong>{item.count}</strong></li>)}</ul> : empty}</section></div>
          <p className="admin-note">Los diagnósticos se conservan 30 días. Los eventos anteriores a la instalación de este portal no tienen causas detalladas recuperables.</p>
        </>}
      </div></div>
    {selected && <div className="admin-drawer-backdrop" onClick={() => setSelected(null)}><aside className="admin-drawer" role="dialog" aria-modal="true" aria-label={`Detalle del evento ${selected.requestId}`} onClick={event => event.stopPropagation()}>
      <div className="admin-drawer-heading"><div><span className={`admin-status ${selected.outcome}`}>{outcomes[selected.outcome] || selected.outcome}</span><h2>{selected.errorCode || selected.stage}</h2></div><button onClick={() => setSelected(null)} aria-label="Cerrar detalle">×</button></div>
      <p>{date(selected.createdAt)} · {selected.provider}</p><label>Referencia completa</label><div className="admin-reference"><code>{selected.requestId}</code><button onClick={() => navigator.clipboard?.writeText(selected.requestId)}>Copiar</button></div>
      <dl><div><dt>Etapa</dt><dd>{selected.stage}</dd></div><div><dt>Cuenta</dt><dd>#{selected.accountId ?? '—'}</dd></div><div><dt>Duración</dt><dd>{selected.durationMs} ms</dd></div><div><dt>Recetas</dt><dd>{selected.context?.recipeCount ?? 0}</dd></div><div><dt>Modo</dt><dd>{selected.context?.mode || '—'}</dd></div><div><dt>Despensa</dt><dd>{selected.context?.pantryCount ?? '—'} ingredientes</dd></div></dl>
      {selected.reasons?.length > 0 && <section><h3>Motivos de validación</h3><p>{selected.reasons.join(', ')}</p></section>}
      {selected.previousExcerpt && <section><h3>Consulta anterior</h3><p>{selected.previousExcerpt}</p></section>}
      {selected.requestExcerpt && <section><h3>Consulta afectada</h3><p>{selected.requestExcerpt}</p></section>}
      {!selected.reasons?.length && selected.outcome === 'error' && <p className="admin-note">El fallo ocurrió antes de que hubiera motivos de validación. Usa el código y la etapa para investigar.</p>}
    </aside></div>}
  </section>;
}
