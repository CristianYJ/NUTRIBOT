import { useEffect, useState } from 'react';
import Icon from './Icons.jsx';
import { kitchenOverview } from './home-dashboard.js';
import { todayDate } from './date-utils.js';
import './home-dashboard.css';
import {DailyNutrition} from './MealTracking.jsx';

export default function HomeDashboard({tracker,profile,pantry,dates,ingredients,recipes,saved,onNavigate,onOpenRecipe,onSave,onImport,onAsk,onFavorites}) {
  useEffect(()=>{tracker.refresh().catch(()=>{});},[tracker.refresh]);
  const [today,setToday] = useState(todayDate);
  useEffect(() => {
    const update = () => setToday(todayDate());
    const timer = setInterval(update,60000);
    document.addEventListener('visibilitychange',update);
    return () => {clearInterval(timer);document.removeEventListener('visibilitychange',update);};
  },[]);
  const {foods,soon,past,groups,fortnight,urgent} = kitchenOverview({pantry,dates,ingredients,recipes:[],profile,today});
  const expiryNames = list => list.slice(0,3).map(item => `${item.name} (${item.expiry.detail.toLowerCase()}${item.expiry.estimated ? ', estimado' : ''})`).join(', ');
  return <div className="page-enter home-dashboard">
    <DailyNutrition tracker={tracker} onProfile={()=>onNavigate('profile')} />
    <section aria-labelledby="dashboard-pantry-title">
      <div className="dashboard-section-heading"><h2 id="dashboard-pantry-title">Mi despensa</h2>
        <button className="btn secondary dashboard-section-button" onClick={() => onNavigate('pantry')}>Mi despensa<Icon name="chevron" size={16} /></button></div>
      <div className="dashboard-stats" aria-label="Resumen de tu cocina">
        <div><strong>{foods.length}</strong><span>Ingredientes</span></div>
        <div className="warm"><strong>{fortnight.length}</strong><span>Vencen esta semana o la próxima</span></div>
        <div className="urgent"><strong>{past.length}</strong><span>Productos vencidos</span></div>
      </div>
      <div className="dashboard-categories">{groups.map(group => <div key={group.name} className="dashboard-category">
        <span className={`dashboard-icon ${group.color}`}><Icon name={group.icon} size={24} /></span><div><strong>{group.count}</strong><span>{group.name}</span></div>
      </div>)}</div>
    </section>

    <div className="dashboard-content">
      <section aria-labelledby="dashboard-recipes-title">
        <div className="dashboard-section-heading"><div><span className="dashboard-kicker"></span><h2 id="dashboard-recipes-title">Ideas nuevas con tu despensa</h2></div></div>
        <div className="dashboard-empty"><Icon name="chef" size={36} /><h3>Encuentra dos opciones nuevas</h3>
          <p>{foods.length ? 'Cuéntale a Nutribot qué se te antoja. Buscará recetas de Edamam con tus ingredientes y preferencias.' : 'Añade algunos ingredientes y después buscaremos recetas con tu despensa.'}</p>
          <button className="btn primary" onClick={() => onNavigate(foods.length ? 'assistant' : 'pantry')}>{foods.length ? 'Buscar recetas en el chat' : 'Agregar ingredientes'}<Icon name="arrow" size={18} /></button></div>
      </section>


    </div>
  </div>;
}
