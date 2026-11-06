import { useEffect, useState } from 'react';
import { authenticatedFetch } from './auth-api.js';
import { billingRequest } from './billing-api.js';
import { confirmedPaymentPlan } from './payment-return-status.js';

function expectedPlan() {
  try {
    const value = sessionStorage.getItem('nutribot.paymentTarget');
    return ['nutripro', 'nutripro_plus'].includes(value) ? value : null;
  } catch { return null; }
}

export default function PaymentReturnPage({ authenticated, loading }) {
  const [target] = useState(expectedPlan);
  const [state, setState] = useState('checking');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    // Wompi may append transaction details to the redirect URL. They are not
    // proof of payment and need not remain in browser history.
    history.replaceState(null, '', '/pago');
  }, []);
  useEffect(() => {
    if (!authenticated) return undefined;
    let active = true;
    let count = 0;
    let timer;
    async function check() {
      try {
        const [status, response] = await Promise.all([
          billingRequest('status'), authenticatedFetch('/api/plan'),
        ]);
        const usage = await response.json();
        if (!response.ok) throw new Error(usage.text || 'No se pudo consultar tu plan.');
        if (!active) return;
        const confirmed = confirmedPaymentPlan(status, usage, target);
        if (confirmed) {
          setState('confirmed');
          try { sessionStorage.removeItem('nutribot.paymentTarget'); } catch { /* Storage can be disabled. */ }
          return;
        }
        if (count >= 14) { setState('waiting'); return; }
        setState('checking');
        count += 1;
        timer = setTimeout(check, 4000);
      } catch (problem) {
        if (!active) return;
        setError(problem.message);
        setState('error');
      }
    }
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [authenticated, retry, target]);

  return <main className="database-loading" aria-labelledby="payment-return-title">
    <h1 id="payment-return-title">{state === 'confirmed' ? '¡Tu plan está activo!' : 'Volviste de Wompi'}</h1>
    {loading ? <p role="status">Comprobando tu sesión…</p>
      : !authenticated ? <><p>Inicia sesión para consultar el estado de tu plan.</p><a className="btn primary" href="/#auth">Iniciar sesión</a></>
      : <>
        {state === 'confirmed' ? <p role="status">El pago de prueba fue confirmado y ya puedes usar tu nuevo plan.</p>
          : state === 'checking' ? <p role="status">Estamos esperando la confirmación de Wompi. Esta pantalla se actualizará automáticamente.</p>
            : state === 'waiting' ? <p role="status">Aún no recibimos la confirmación. Tu plan actual seguirá disponible mientras verificamos el pago.</p>
              : <p role="alert">{error}</p>}
        {state !== 'confirmed' && <button type="button" className="btn secondary" onClick={() => { setError(''); setState('checking'); setRetry(value => value + 1); }}>Comprobar de nuevo</button>}
        <a className="btn primary" href="/#profile">Ver mi perfil</a>
      </>}
  </main>;
}
