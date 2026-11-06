import { useEffect, useState } from 'react';
import { billingRequest } from './billing-api.js';
import BillingTransactions from './BillingTransactions.jsx';
import './billing.css';

export default function BillingPanel() {
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState('');
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
  return <section id="profile-billing" className="billing-panel" aria-label="Historial de pagos">
    <h2>Mis Pagos</h2>
    {error && <p role="alert">{error}</p>}
    <BillingTransactions items={transactions} />
  </section>;
}
