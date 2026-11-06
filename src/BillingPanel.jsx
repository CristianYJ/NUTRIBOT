import { useEffect, useState } from 'react';
import { authenticatedFetch } from './auth-api.js';
import BillingTransactions from './BillingTransactions.jsx';
import './billing.css';

async function billingRequest(path, body) {
  const response = await authenticatedFetch(`/api/billing/${path}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.text || 'No se pudo consultar Wompi.');
  return result;
}

export default function BillingPanel({ plan, preferredPlan = null }) {
  const [status, setStatus] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const [current, history] = await Promise.all([billingRequest('status'), billingRequest('transactions')]);
      setStatus(current); setTransactions(history.items); setError('');
      if (current.state === 'active' && current.plan === 'nutripro' && !current.upgrade) {
        try { setQuote(await billingRequest('upgrade-quote')); } catch { setQuote(null); }
      } else setQuote(null);
    }
    catch (problem) { setError(problem.message); }
  }
  useEffect(() => {
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, []);
  async function subscribe(code) {
    setBusy(true); setError('');
    try {
      const result = await billingRequest('subscribe', { plan: code });
      await refresh();
      window.location.assign(result.url);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function upgrade() {
    setBusy(true); setError('');
    try {
      const result = await billingRequest('upgrade', {});
      await refresh();
      window.location.assign(result.url);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  const teamPlan = plan?.code === 'goat' || plan?.code === 'staff';
  return <section id="profile-billing" className="billing-panel" aria-label="Suscripciones de prueba">
    <h2>Mis Pagos</h2>
    {error && <p role="alert">{error}</p>}
    {!status ? <p>Consultando pagos…</p> : teamPlan ? null : <>
      {status.state === 'active' && <p>{new Date(status.paidUntil) > new Date() ? 'Plan de prueba' : 'Último período de prueba de'} {status.plan === 'nutripro' ? 'NutriPro' : 'NutriMax'} {new Date(status.paidUntil) > new Date() ? 'activo' : 'vencido'} hasta el {new Date(status.paidUntil).toLocaleDateString('es-SV')}. Wompi simula los cargos mensuales sin cobrar dinero real.</p>}
      {status.state === 'review' && <p>Estamos revisando el estado de tu suscripción. Escribe a <a href="mailto:soporte@nutribot.online">soporte@nutribot.online</a>.</p>}
      {status.upgrade?.state === 'pending' && <p>El ajuste NutriMax de prueba por ${(status.upgrade.amountCents / 100).toFixed(2)} está pendiente. NutriPro sigue activo hasta que Wompi confirme el pago. <a href={status.upgrade.linkUrl} rel="noreferrer">Continuar el pago en Wompi</a></p>}
      {status.state === 'active' && status.plan === 'nutripro' && quote && !status.upgrade && <div className="billing-upgrade">
        <p>Pasar a NutriMax hasta el {new Date(quote.paidUntil).toLocaleDateString('es-SV')}: ajuste proporcional de prueba de <strong>${(quote.amountCents / 100).toFixed(2)}</strong>. Al confirmarse el pago, se cancela la afiliación NutriPro. Antes del vencimiento podrás afiliar el cobro mensual NutriMax de $9.99.</p>
        <button type="button" disabled={busy || !status.configured} onClick={upgrade}>Pagar diferencia y cambiar a NutriMax</button>
      </div>}
      {status.upgrade?.state === 'active' && <div className="billing-upgrade">
        <p>NutriMax de prueba activo hasta el {new Date(status.upgrade.paidUntil).toLocaleDateString('es-SV')}. La suscripcion NutriPro fue cancelada.</p>
        {new Date(status.upgrade.reminderAt) <= new Date() ? <><p>Tu período está por terminar. Suscribete a NutriMax para continuar con la renovación mensual de prueba de $9.99. Wompi te mostrará las condiciones antes de aceptarlas.</p>
          {status.state === 'pending' && status.plan === 'nutripro_plus' ? <a href={status.linkUrl} rel="noreferrer">Continuar suscripción NutriMax</a> :
            <button type="button" disabled={busy || !status.configured} onClick={() => subscribe('nutripro_plus')}>Suscribete NutriMax</button>}</> :
          <p>Tu suscripción actual finaliza el {new Date(status.upgrade.reminderAt).toLocaleDateString('es-SV')}.</p>}
      </div>}
      {status.state === 'none' && !status.upgrade && <>
        {preferredPlan && <p role="status">Seleccionaste {preferredPlan === 'nutripro' ? 'NutriPro' : 'NutriMax'}</p>}
        <div className="billing-options">
          <div className={`billing-option${preferredPlan === 'nutripro' ? ' preferred' : ''}`}>
            <h3>NutriPro</h3><p><strong>$2.99</strong> / mes</p>
            <p>14 generaciones de recetas por semana · 3 fotos con Nutri-Vision por mes</p>
            <button type="button" disabled={busy || !status.configured} onClick={() => subscribe('nutripro')}>Elegir NutriPro</button>
          </div>
          <div className={`billing-option${preferredPlan === 'nutripro_plus' ? ' preferred' : ''}`}>
            <h3>NutriMax</h3><p><strong>$9.99</strong> / mes</p>
            <p>22 generaciones de recetas por semana · 6 fotos con Nutri-Vision por mes</p>
            <button type="button" disabled={busy || !status.configured} onClick={() => subscribe('nutripro_plus')}>Elegir NutriMax</button>
          </div>
        </div>
      </>}
      <p className="billing-note">¿Necesitas ayuda con tu cancelacion? Escribenos a <a href="mailto:soporte@nutribot.online">soporte@nutribot.online</a>.</p>
    </>}
    {status && <BillingTransactions items={transactions} />}
  </section>;
}
