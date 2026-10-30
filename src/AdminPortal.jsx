import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from './auth-api.js';
import { adminPeriods, adminPeriodBuckets, adminPeriodYears } from './admin-periods.js';
import { adminAccountQuery, openAdminAccount, closeAdminAccount } from './admin-account-history.js';
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
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
const duration = value => value == null ? '—' : `${(value / 1000).toFixed(1)} s`;
const since = value => {
  if (!value) return '—';
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  return days >= 365 ? `${Math.floor(days / 365)} año(s)` : days >= 30 ? `${Math.floor(days / 30)} mes(es)` : `${days} día(s)`;
};
const views = [['overview', 'Dashboard'], ['incidents', 'Incidentes'], ['quality', 'Calidad de recetas'], ['usage', 'APIs'], ['users', 'Usuarios y soporte'], ['system', 'Sistema']];
const outcomes = { error: 'Error', success: 'Recetas', empty: 'Sin resultados', conversation: 'Conversación', review: 'Revisión' };
const empty = <p className="admin-empty">Aún no hay datos para este período.</p>;

function Stat({ label, value, hint, tone = '' }) {
  return <article className={`admin-stat ${tone}`}><span>{label}</span><strong>{value ?? '—'}</strong>{hint && <small>{hint}</small>}</article>;
}
function sevenDays(rows = []) {
  const today = new Date(Date.now() - 6 * 3600000);
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start - (6 - index) * 86400000).toISOString().slice(0, 10);
    return { day, ...(rows.find(row => row.day === day) || {}) };
  });
}
function LineChart({ rows, lines, label }) {
  const data = rows?.length ? rows : sevenDays([]);
  const maximum = Math.max(1, ...data.flatMap(row => lines.map(line => Number(row[line.key]) || 0)));
  const x = index => 32 + index * (576 / Math.max(1, data.length - 1));
  const y = value => 174 - (Number(value) || 0) / maximum * 145;
  return <div className="admin-line-chart" role="img" aria-label={`${label}. ${data.map(row => `${row.label || shortDate(row.day)}: ${lines.map(line => `${line.label} ${row[line.key] == null ? 'sin datos' : row[line.key]}`).join(', ')}`).join('; ')}`}>
    <svg viewBox="0 0 640 190" preserveAspectRatio="none" aria-hidden="true">
      {[0, .5, 1].map(mark => <line key={mark} x1="32" x2="608" y1={y(maximum * mark)} y2={y(maximum * mark)} className="admin-chart-grid" />)}
      {lines.map(line => <g key={line.key}><polyline points={data.map((row, index) => row[line.key] == null ? null : `${x(index)},${y(row[line.key])}`).filter(Boolean).join(' ')} fill="none" stroke={line.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {data.map((row, index) => row[line.key] == null ? null : <circle key={row.day} cx={x(index)} cy={y(row[line.key])} r="4" fill={line.color}><title>{row.label || shortDate(row.day)} · {line.label}: {row[line.key]}</title></circle>)}</g>)}
    </svg><div className={`admin-chart-labels${data.length > 8 ? ' long' : ''}`}>{data.map(row => <span key={row.day}>{row.label || shortDate(row.day)}</span>)}</div>
    <div className="admin-legend">{lines.map(line => <span key={line.key}><i style={{ background: line.color }} />{line.label}</span>)}</div>
  </div>;
}
function Trend({ daily = [], period }) {
  return <section className="admin-panel admin-trend"><div className="admin-panel-heading"><div><h2>Consultas de recetas</h2></div></div>
    <LineChart rows={daily} label="Consultas por día" lines={[{ key: 'total', label: 'Total', color: '#087253' }, { key: 'errors', label: 'Errores', color: '#da7958' }, { key: 'empty', label: 'Sin resultados', color: '#dcad45' }]} />
  </section>;
}
function PeriodPicker({ value, onChange, year, onYearChange }) {
  return <div className="admin-period-controls"><div className="admin-period-picker" role="group" aria-label="Período de las gráficas">{Object.entries(adminPeriods).map(([key, label]) =>
    <button key={key} type="button" className={value === key ? 'active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}</div>
    {value === 'year' && <label className="admin-year-select">Año <select value={year} onChange={event => onYearChange(Number(event.target.value))}>{adminPeriodYears().map(item => <option key={item} value={item}>{item}</option>)}</select></label>}</div>;
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
  const [period, setPeriod] = useState('week');
  const [year, setYear] = useState(() => adminPeriodYears()[0] || 2026);
  const changePeriod = value => { setSummary(null); setApiSummary(null); setPeriod(value); };
  const changeYear = value => { setSummary(null); setApiSummary(null); setYear(value); };
  const [summary, setSummary] = useState(null);
  const [apiSummary, setApiSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [recent, setRecent] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ days: 7, outcome: 'error', provider: 'all', search: '', accountId: '' });
  const [accountQuery, setAccountQuery] = useState('');
  const [accountResult, setAccountResult] = useState(null);
  const accountRequest = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const q = summary?.quality || {};
  const successes = (q.twoOptions || 0) + (q.oneOption || 0);
  const filterQuery = (offset = 0) => new URLSearchParams({ days: filters.days, outcome: filters.outcome,
    provider: filters.provider, search: filters.search.trim().replace(/^#/, ''), accountId: filters.accountId, offset }).toString();

  useEffect(() => {
    let active = true;
    Promise.all([readAdmin(`summary?period=${period}&year=${year}`), readAdmin('events?outcome=error&days=7&offset=0')])
      .then(([overview, list]) => { if (active) { setSummary(overview); setRecent(list.items.slice(0, 5)); setError(''); } })
      .catch(problem => { if (active) setError(problem.message); });
    return () => { active = false; };
  }, [refreshKey, period, year]);
  useEffect(() => {
    if (view !== 'usage') return;
    let active = true;
    readAdmin(`apis?period=${period}&year=${year}`).then(data => { if (active) { setApiSummary(data); setError(''); } })
      .catch(problem => { if (active) setError(problem.message); });
    return () => { active = false; };
  }, [view, refreshKey, period, year]);
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
  useEffect(() => {
    let active = true;
    const restoreAccount = () => {
      const request = ++accountRequest.current;
      const query = adminAccountQuery(window);
      if (!query) { setAccountResult(null); setAccountQuery(''); setBusy(false); return; }
      setAccountQuery(query);
      readAdmin(`account?q=${encodeURIComponent(query)}`)
        .then(result => { if (active && request === accountRequest.current) { setAccountResult(result); setError(''); } })
        .catch(problem => { if (active && request === accountRequest.current) setError(problem.message); });
    };
    if (adminAccountQuery(window)) restoreAccount();
    window.addEventListener('popstate', restoreAccount);
    return () => { active = false; window.removeEventListener('popstate', restoreAccount); };
  }, []);
  async function loadMore() {
    if (nextOffset == null) return;
    setBusy(true);
    try { const list = await readAdmin(`events?${filterQuery(nextOffset)}`); setEvents(previous => [...previous, ...list.items]); setNextOffset(list.nextOffset); }
    catch (problem) { setError(problem.message); } finally { setBusy(false); }
  }
  async function findAccount(event) { event.preventDefault(); await showAccount(accountQuery.trim()); }
  async function sendPasswordReset() {
    if (!accountResult?.account) return;
    setBusy(true); setError(''); setResetNotice('');
    try {
      const response = await authenticatedFetch('/api/admin/password-reset', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: accountResult.account.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.text || 'No se pudo enviar el enlace.');
      setResetNotice(`Enlace enviado a ${accountResult.account.email}. El usuario elegirá su nueva contraseña.`);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  function openAccountIncidents(id) { setFilters(previous => ({ ...previous, accountId: String(id), outcome: 'all' })); setView('incidents'); }
  async function showAccount(query) {
    const request = ++accountRequest.current;
    setBusy(true); setError('');
    try {
      const result = await readAdmin(`account?q=${encodeURIComponent(query)}`);
      if (request !== accountRequest.current) return;
      openAdminAccount(window, query);
      setAccountResult(result); setAccountQuery(String(query));
    }
    catch (problem) { if (request === accountRequest.current) setError(problem.message); }
    finally { if (request === accountRequest.current) setBusy(false); }
  }
  function backToUsers() {
    if (!closeAdminAccount(window)) { setAccountResult(null); setAccountQuery(''); }
  }
  const users = summary?.users;
  const dailyFeatures = users?.features || adminPeriodBuckets(period, new Date(), year).map(bucket => ({ day: bucket.endDay, label: bucket.label }));

  return <section className="admin-portal page-enter" aria-labelledby="admin-title">
    <header className="admin-heading"><div><span className="admin-eyebrow">PANEL ADMINISTRATIVO</span></div>
      <button className="btn secondary" onClick={() => setRefreshKey(value => value + 1)} disabled={busy}>Actualizar</button></header>
    <div className="admin-layout"><nav className="admin-nav" aria-label="Secciones administrativas">{views.map(([id, label]) =>
      <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setSelected(null); }}>{label}</button>)}</nav>
      <div className="admin-content">
        {error && <p className="admin-error" role="alert">{error}</p>}
        {view === 'overview' && <><div className="admin-section-heading admin-section-with-controls"><div><h2>Dashboard</h2></div><PeriodPicker value={period} onChange={changePeriod} year={year} onYearChange={changeYear} /></div>
          <div className="admin-stats"><Stat label="Usuarios registrados" value={users?.total} hint="Cuentas con correo" />
            <Stat label="Activos · 30 días" value={users?.active} hint={`${users?.inactive ?? '—'} inactivos`} />
            <Stat label="Consultas de recetas · 24 h" value={summary?.total24h} hint={`${summary?.errors24h ?? '—'} errores`} />
            <Stat label="Valor mensual estimado" value={users ? money(users.estimatedMonthlyCents) : null} hint="Según planes asignados; no son cobros" /></div>
          <div className="admin-stats admin-performance-stats"><Stat label="Servidor ≤ 2 s" value={users?.performance?.serverUnder2s == null ? '—' : `${users.performance.serverUnder2s}%`} hint={`p95 últimos 30 días: ${duration(users?.performance?.serverP95Ms)}`} />
            <Stat label="APIs externas ≤ 2 s" value={users?.performance?.apiUnder2s == null ? '—' : `${users.performance.apiUnder2s}%`} hint={`p95 últimos 30 días: ${duration(users?.performance?.apiP95Ms)}`} /></div>
          <div className="admin-two-col"><Trend daily={summary?.daily} period={period} /><section className="admin-panel"><div className="admin-panel-heading"><div><h2>Uso por función</h2><p>Solicitudes HTTP, incluidas las fallidas</p></div></div>
            <LineChart rows={dailyFeatures} label="Uso por función" lines={[{ key: 'recipes', label: 'Recetas', color: '#087253' }, { key: 'vision', label: 'Nutri-Vision', color: '#8665b8' }, { key: 'recipe_detail', label: 'Fichas', color: '#d6a140' }, { key: 'meals', label: 'Comidas', color: '#4c86b6' }]} /></section></div>
          <section className="admin-panel admin-plan-trend"><div className="admin-panel-heading"><div><h2>Evolución de planes</h2></div><span>{users?.paid ?? 0} de pago · {users?.free ?? 0} gratis hoy</span></div>
            <LineChart rows={users?.planTrend} label="Evolución de planes" lines={[{ key: 'paid', label: 'De pago', color: '#087253' }, { key: 'free', label: 'Gratis', color: '#a780cf' }]} /></section>
          <div className="admin-two-col admin-overview-bottom"><section className="admin-panel"><h2>Planes asignados</h2><div className="admin-revenue"><span>NutriPro · {users?.nutripro ?? '—'} × $2.99 <strong>{users ? money(users.nutripro * 299) : '—'}</strong></span><span>NutriMax · {users?.nutrimax ?? '—'} × $9.99 <strong>{users ? money(users.nutrimax * 999) : '—'}</strong></span><span>Total <strong>{users ? money(users.estimatedMonthlyCents) : '—'}</strong></span></div></section>
            <section className="admin-panel"><div className="admin-panel-heading"><h2>Incidentes recientes</h2><button className="admin-text-link" onClick={() => setView('incidents')}>Ver todos</button></div><EventList items={recent} compact onSelect={setSelected} /></section></div>
        </>}
        {view === 'incidents' && <><div className="admin-section-heading"><h2>Incidentes</h2></div>
          <div className="admin-filters"><label>Período<select value={filters.days} onChange={e => setFilters({ ...filters, days: Number(e.target.value) })}><option value={1}>24 horas</option><option value={7}>7 días</option><option value={30}>30 días</option></select></label>
            <label>Resultado<select value={filters.outcome} onChange={e => setFilters({ ...filters, outcome: e.target.value })}><option value="error">Errores</option><option value="all">Todos</option><option value="empty">Sin resultados</option><option value="success">Recetas</option><option value="conversation">Conversación</option></select></label>
            <label>Proveedor<select value={filters.provider} onChange={e => setFilters({ ...filters, provider: e.target.value })}><option value="all">Todos</option><option value="edamam">Edamam</option><option value="gemini">Gemini</option></select></label>
            <label className="admin-search">Referencia, código o etapa<input value={filters.search} maxLength={80} placeholder="Ej. #a1b2c3d4" onChange={e => setFilters({ ...filters, search: e.target.value })} /></label></div>
          {filters.accountId && <div className="admin-filter-chip">Cuenta #{filters.accountId}<button onClick={() => setFilters({ ...filters, accountId: '' })} aria-label="Quitar filtro de cuenta">×</button></div>}
          <section className="admin-panel admin-list-panel"><div className="admin-panel-heading"><h3>Resultados</h3><span>{events.length} visibles</span></div><EventList items={events} onSelect={setSelected} />
            {nextOffset != null && <button className="btn secondary admin-more" disabled={busy} onClick={loadMore}>Cargar más</button>}{busy && <p role="status">Cargando…</p>}</section>
        </>}
        {view === 'quality' && <><div className="admin-section-heading"><h2>Calidad de recetas</h2><p>últimos 7 días</p></div>
          <div className="admin-stats"><Stat label="Tasa de error de recetas" value={summary ? pct(summary.errors7d, summary.total7d) : null} hint={`${summary?.errors7d ?? 0} de ${summary?.total7d ?? 0}`} tone="warning" />
            <Stat label="Dos opciones" value={summary ? pct(q.twoOptions, successes) : null} hint="De búsquedas con recetas" />
            <Stat label="Búsquedas con dos opciones" value={q.twoOptions} hint="Búsquedas exitosas" /><Stat label="Una opción" value={q.oneOption} hint="Búsquedas exitosas" />
            <Stat label="Sin resultados" value={q.noResults} hint="Filtros sin coincidencias" /><Stat label="Más alternativas" value={q.moreRequests} hint={`${q.moreSuccess ?? 0} terminaron con recetas`} /></div>
          <section className="admin-panel admin-quality"><h3>Distribución de búsquedas</h3><div className="admin-quality-bar"><span style={{ width: pct(q.twoOptions, successes + (q.noResults || 0)) === '—' ? '0%' : pct(q.twoOptions, successes + (q.noResults || 0)) }} /><span style={{ width: pct(q.oneOption, successes + (q.noResults || 0)) === '—' ? '0%' : pct(q.oneOption, successes + (q.noResults || 0)) }} /></div>
            <p>{successes + (q.noResults || 0) ? `${pct(q.twoOptions, successes + q.noResults)} con dos opciones · ${pct(q.oneOption, successes + q.noResults)} con una · ${pct(q.noResults, successes + q.noResults)} sin resultados.` : 'Todavía no hay búsquedas de recetas registradas.'}</p>
            </section>
        </>}
        {view === 'usage' && <><div className="admin-section-heading admin-section-with-controls"><div><h2>Uso de APIs</h2><p>Llamadas reales a proveedores externos</p></div><PeriodPicker value={period} onChange={changePeriod} year={year} onYearChange={changeYear} /></div>
          <div className="admin-provider-grid">{[['gemini', 'Google AI Studio', summary?.model || 'Gemini'], ['edamam', 'Edamam', 'Recipe Search Enterprise Basic'], ['usda', 'USDA FoodData Central', 'FoodData Central API']].map(([provider, name, type]) => {
            const totals = apiSummary?.providers?.find(item => item.provider === provider) || { total: 0, success: 0, failed: 0 };
            const trend = apiSummary?.daily?.filter(item => item.provider === provider) || adminPeriodBuckets(period, new Date(), year).map(bucket => ({ day: bucket.endDay, label: bucket.label }));
            const rows = apiSummary?.operations?.filter(item => item.provider === provider) || [];
            return <article className="admin-panel admin-api-card" key={provider}><span className="admin-api-kicker">{name}</span><h3>{type}</h3><div className="admin-api-totals"><strong>{totals.total}</strong><span>llamadas · {totals.success} exitosas · {totals.failed} fallidas</span></div>
              <LineChart rows={trend} label={`Llamadas a ${name}`} lines={[{ key: 'success', label: 'HTTP OK', color: '#087253' }, { key: 'failed', label: 'HTTP / red', color: '#d46d52' }]} />
              {rows.length > 0 && <><small>Operaciones · últimos 30 días</small><ul className="admin-api-operations">{rows.map(row => <li key={`${row.operation}-${row.model || ''}`}><span>{row.operation.replaceAll('_', ' ')}{row.model ? ` · ${row.model}` : ''}</span><strong>{row.total}</strong></li>)}</ul></>}
            </article>;
          })}</div>
          <section className="admin-panel admin-api-log"><div className="admin-panel-heading"><div><h2>Últimas llamadas</h2><p>Hasta 30 registros recientes · éxito, HTTP o fallo de red</p></div></div>
            {apiSummary?.calls?.length ? <div className="admin-table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Operación</th><th>Cuenta</th><th>Estado</th><th>Tiempo</th></tr></thead><tbody>{apiSummary.calls.map(call => <tr key={call.id}><td>{date(call.createdAt)}</td><td>{call.provider}</td><td>{call.operation.replaceAll('_', ' ')}</td><td>{call.accountId ? `#${call.accountId}` : '—'}</td><td><span className={`admin-status ${call.outcome === 'success' ? 'success' : 'error'}`}>{call.outcome === 'success' ? 'OK' : call.statusCode || 'Red'}</span></td><td>{duration(call.durationMs)}</td></tr>)}</tbody></table></div> : empty}
          </section>
        </>}
        {view === 'users' && <><div className="admin-section-heading"><h2>Usuarios y soporte</h2><p>Actividad en los últimos 30 días</p></div>
          <form className="admin-account-search" onSubmit={findAccount}><label htmlFor="admin-account-query">Buscar por correo completo o ID de cuenta</label><div><input id="admin-account-query" value={accountQuery} onChange={e => setAccountQuery(e.target.value)} placeholder="usuario@ejemplo.com" required /><button className="btn primary" disabled={busy}>Buscar</button></div></form>
          {accountResult ? <button className="admin-back-button" type="button" onClick={backToUsers}>← Volver a usuarios</button> : <><div className="admin-stats"><Stat label="Cuentas Registradas" value={users?.total} /><Stat label="Cuentas Activas" value={users?.active} hint="Actividad en 30 días" /><Stat label="Inactivas" value={users?.inactive} hint="Sin actividad en 30 días" /><Stat label="Gratis / de pago" value={users ? `${users.free} / ${users.paid}` : null}/></div>
          <section className="admin-panel admin-users-list"><div className="admin-panel-heading"><div><h2>Últimas 10 cuentas</h2><p>Ordenadas de registro más reciente a más antiguo</p></div></div>
            {users?.latest?.length ? <div className="admin-table-wrap"><table><thead><tr><th>Cuenta</th><th>Plan</th><th>Registro</th><th>Última actividad</th><th></th></tr></thead><tbody>{users.latest.map(user => <tr key={user.id}><td><strong>{user.name}</strong><small>#{user.id} · {user.email}{user.role === 'admin' ? ' · Admin' : ''}</small></td><td>{user.plan === 'basico' ? 'Básico' : user.plan === 'nutripro' ? 'NutriPro' : 'NutriMax'}</td><td>{date(user.createdAt)}</td><td>{date(user.lastActiveAt)}</td><td><button className="admin-text-link" onClick={() => showAccount(user.id)}>Detalles</button></td></tr>)}</tbody></table></div> : empty}
          </section></>}
          {accountResult && (accountResult.account ? <section className="admin-panel admin-account"><div className="admin-panel-heading"><div><h3>{accountResult.account.name}</h3><p>{accountResult.account.email} · Cuenta #{accountResult.account.id}</p></div><button className="btn secondary" disabled={busy} onClick={sendPasswordReset}>Enviar enlace para cambiar contraseña</button></div>
            {resetNotice && <p role="status">{resetNotice}</p>}
            <dl><div><dt>ID</dt><dd>#{accountResult.account.id}</dd></div><div><dt>Nombre</dt><dd>{accountResult.account.name}</dd></div><div><dt>Rol</dt><dd>{accountResult.account.role === 'admin' ? 'Admin' : 'Usuario'}</dd></div><div><dt>Plan asignado</dt><dd>{accountResult.detail?.effectivePlan || accountResult.account.plan}</dd></div><div><dt>Registro</dt><dd>{date(accountResult.account.createdAt)}</dd></div>
              <div><dt>Último cambio de perfil</dt><dd>{date(accountResult.detail?.updatedAt || accountResult.account.createdAt)}</dd></div><div><dt>Última actividad</dt><dd>{date(accountResult.detail?.lastActiveAt || accountResult.account.createdAt)}</dd></div>
              <div><dt>Tiempo de pago continuo</dt><dd>{accountResult.detail?.paidSince ? `${since(accountResult.detail.paidSince)} · desde ${date(accountResult.detail.paidSince)}` : 'No está en un plan de pago'}</dd></div>
              <div><dt>Tiempo sin pago tras un plan de pago</dt><dd>{accountResult.detail?.freeSinceAfterPaid ? `${since(accountResult.detail.freeSinceAfterPaid)} · desde ${date(accountResult.detail.freeSinceAfterPaid)}` : 'No aplica'}</dd></div></dl>
            <h4>Uso del período actual</h4><div className="admin-account-usage"><span>Generaciones <strong>{accountResult.detail?.usage?.recipes?.used ?? '—'} / {accountResult.detail?.usage?.recipes?.limit ?? '—'}</strong><small>Esta semana</small></span><span>Fotos reconocidas <strong>{accountResult.detail?.usage?.vision?.used ?? '—'} / {accountResult.detail?.usage?.vision?.limit ?? '—'}</strong><small>Este mes</small></span></div>
            <div className="admin-account-actions"><button className="btn secondary" onClick={() => openAccountIncidents(accountResult.account.id)}>Ver diagnósticos de esta cuenta</button></div><h4>Logs de recetas</h4>
            {accountResult.recent.length ? <ul>{accountResult.recent.map(item => <li key={item.requestId}><code>#{item.requestId.slice(0, 8)}</code> · {outcomes[item.outcome] || item.outcome} · {date(item.createdAt)}</li>)}</ul> : <p>Sin eventos recientes.</p>}
            <h4>Llamadas externas recientes</h4>{accountResult.detail?.calls?.length ? <ul>{accountResult.detail.calls.map((call, index) => <li key={`${call.createdAt}-${index}`}>{date(call.createdAt)} · {call.provider} / {call.operation} · {call.outcome === 'success' ? 'OK' : call.statusCode || 'Red'} · {duration(call.durationMs)}</li>)}</ul> : <p>Sin llamadas medidas.</p>}
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
