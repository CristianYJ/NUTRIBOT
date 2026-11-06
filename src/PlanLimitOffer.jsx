import { useEffect, useRef } from 'react';
import './plan-limit-offer.css';

const plans = [
  { code: 'nutripro', name: 'NutriPro', price: '$2.99', recipes: 14, photos: 3 },
  { code: 'nutripro_plus', name: 'NutriMax', price: '$9.99', recipes: 22, photos: 6 },
];

export default function PlanLimitOffer({ open, currentPlan, onClose, onChoose }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const choices = currentPlan === 'nutripro' ? plans.slice(1) : plans;
  return <dialog ref={dialog} className="plan-limit-offer" aria-labelledby="plan-limit-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="plan-limit-heading">
      <button type="button" className="plan-limit-close" aria-label="Cerrar planes" onClick={onClose}>×</button>
    </div>
    <h2 id="plan-limit-title">Llegaste al límite</h2>
    <p>Si quieres seguir disfrutando de NutriBot, conoce los planes disponibles que tenemos para ti.</p>
    <div className="plan-limit-options">
      {choices.map(plan => <div className="plan-limit-card" key={plan.code}>
        <h3>{plan.name}</h3>
        <p className="plan-limit-price">{plan.price}<span> / mes</span></p>
        <p>{plan.recipes} generaciones de recetas por semana</p>
        <p>{plan.photos} fotos con Nutri-Vision por mes</p>
        <button type="button" onClick={() => onChoose(plan.code)}>Ver {plan.name}</button>
      </div>)}
    </div>
  </dialog>;
}
