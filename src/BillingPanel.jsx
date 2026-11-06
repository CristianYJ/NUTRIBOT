import { useEffect, useState } from 'react';
import { billingRequest } from './billing-api.js';
import BillingTransactions from './BillingTransactions.jsx';
import './billing.css';

export default function BillingPanel() {
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
  const [continuingId, setContinuingId] = useState(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const result = await billingRequest('transactions');
        if (active) { setTransactions(result.items); setError(''); }
      } catch (problem) { if (active) setError(problem.message); }
    }
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; document.removeEventListener('visibilitychange', visible); };
  }, []);
  async function continuePayment(item) {
    if (continuingId) return;
    setContinuingId(item.recordId);
    setError('');
    try {
      const current = await billingRequest('status');
      const pending = item.kind === 'upgrade' ? current.upgrade : current;
      if (pending?.state !== 'pending' || pending.linkId !== item.referenceId ||
          (item.kind === 'subscription' && pending.plan !== item.plan) || !pending.linkUrl ||
          (item.kind === 'upgrade' && new Date(pending.linkExpiresAt).getTime() <= Date.now())) {
        throw new Error('Este enlace ya no está pendiente. Actualiza la página para consultar su estado.');
      }
      try { sessionStorage.setItem('nutribot.paymentTarget', item.plan); } catch { /* Storage can be disabled. */ }
      window.location.assign(pending.linkUrl);
    } catch (problem) {
      setError(problem.message);
      setContinuingId(null);
    }
  }
  return <section id="profile-billing" className="billing-panel" aria-label="Historial de pagos">
    <h2>Mis Pagos</h2>
    {error && <p role="alert">{error}</p>}
    <BillingTransactions items={transactions} onContinue={continuePayment} continuingId={continuingId} />
  </section>;
}
