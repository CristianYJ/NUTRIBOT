import { useEffect, useRef, useState } from 'react';
import { billingRequest } from './billing-api.js';
import './plan-limit-offer.css';

const plans = [
  { code: 'nutripro', name: 'NutriPro', price: '$2.99', recipes: 14, photos: 3,
    features: ['Todo lo incluido en Básico', 'Más cupo para pedir alternativas de recetas', 'Más fotos para actualizar tu despensa', 'El mismo seguimiento nutricional y de comidas'] },
  { code: 'nutripro_plus', name: 'NutriMax', price: '$9.99', recipes: 22, photos: 6,
    features: ['Todo lo incluido en NutriPro', 'El máximo cupo para explorar alternativas', 'Análisis de fotos para una despensa activa', 'Seguimiento nutricional personalizado'] },
];

export default function PlanLimitOffer({ open, currentPlan, reason = 'upgrade', onClose }) {
  const dialog = useRef(null);
  const [status, setStatus] = useState(null);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setStatus(null);
    setQuote(null);
    setError('');
    billingRequest('status').then(async result => {
      if (!active) return;
      setStatus(result);
      if (currentPlan === 'nutripro' && result.state === 'active' && result.plan === 'nutripro' && !result.upgrade) {
        try {
          const nextQuote = await billingRequest('upgrade-quote');
          if (active) setQuote(nextQuote);
        } catch (problem) { if (active) setError(problem.message); }
      }
    }).catch(problem => { if (active) setError(problem.message); });
    return () => { active = false; };
  }, [open, currentPlan]);

  async function choose(plan) {
    if (busy) return;
    setError('');
    if (!status) { setError('Espera mientras consultamos el estado de tu cuenta.'); return; }
    if (!status.configured) { setError('Los pagos de prueba aún no están habilitados en este servidor. Contacta a soporte@nutribot.online.'); return; }
    if (status.state === 'review' || status.upgrade?.state === 'review') {
      setError('Tu pago está en revisión. Espera la confirmación antes de iniciar otro.'); return;
    }
    if (status.state === 'pending') {
      if (status.plan === plan.code && status.linkUrl) { window.location.assign(status.linkUrl); return; }
      setError('Ya tienes una afiliación en proceso para otro plan. Complétala antes de elegir uno nuevo.'); return;
    }
    if (status.upgrade?.state === 'pending') {
      if (status.upgrade.linkUrl) window.location.assign(status.upgrade.linkUrl);
      else setError('Ya hay un cambio de plan en proceso.');
      return;
    }
    let path = 'subscribe';
    let body = { plan: plan.code };
    if (currentPlan === 'nutripro') {
      if (status.state === 'active' && status.plan === 'nutripro' && plan.code === 'nutripro_plus') {
        path = 'upgrade'; body = {};
      } else if (!(status.state === 'none' && status.upgrade?.state === 'active' && plan.code === 'nutripro_plus')) {
        setError('Este plan fue asignado manualmente. Escribe a soporte@nutribot.online para cambiarlo.'); return;
      }
    }
    setBusy(true);
    try {
      const result = await billingRequest(path, body);
      if (!result.url) throw new Error('Wompi no devolvió un enlace de pago.');
      window.location.assign(result.url);
    } catch (problem) {
      setError(problem.message);
      setBusy(false);
    }
  }

  const choices = currentPlan === 'nutripro' ? plans.slice(1) : plans;
  return <dialog ref={dialog} className="plan-limit-offer" aria-labelledby="plan-limit-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <button type="button" className="plan-limit-close" aria-label="Cerrar planes" onClick={onClose}>×</button>
    <h2 id="plan-limit-title">{reason === 'limit' ? 'Llegaste al límite' : 'Elige tu nuevo plan'}</h2>
    {status && !status.configured && <p className="plan-limit-error" role="status">Este servidor todavía no tiene habilitado el inicio de pagos. Puedes ver los planes, pero la afiliación estará disponible cuando se complete la configuración.</p>}
    <div className="plan-limit-options">
      {choices.map(plan => <article className={`plan-limit-card ${plan.code === 'nutripro' ? 'featured' : 'max'}`} key={plan.code}>
        {plan.code === 'nutripro' && <span className="plan-limit-badge">Recomendado</span>}
        <h3>{plan.name}</h3>
        <p className="plan-limit-price">{plan.price}<span> / mes</span></p>
        <ul>
          <li>{plan.recipes} generaciones de recetas por semana</li>
          <li>{plan.photos} fotos con Nutri-Vision por mes</li>
          {plan.features.map(feature => <li key={feature}>{feature}</li>)}
        </ul>
        {currentPlan === 'nutripro' && status?.state === 'active' && quote && <p className="plan-limit-quote">Pagarías ${(quote.amountCents / 100).toFixed(2)} por el tiempo restante de tu período actual.</p>}
        <button type="button" disabled={busy} onClick={() => choose(plan)}>{busy ? 'Preparando enlace…' : `Elegir ${plan.name}`}</button>
      </article>)}
    </div>
    {error && <p className="plan-limit-error" role="alert">{error}</p>}
    <p className="plan-limit-note">El plan se activa cuando Wompi confirma el pago. Para ayuda, escribe a <a href="mailto:soporte@nutribot.online">soporte@nutribot.online</a>.</p>
  </dialog>;
}
