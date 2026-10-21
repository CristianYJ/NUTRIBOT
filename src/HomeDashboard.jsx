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
  const {foods,soon,past,suggestions,groups,fortnight,urgent} = kitchenOverview({pantry,dates,ingredients,recipes,profile,today});
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
        <div className="dashboard-section-heading"><div><span className="dashboard-kicker"></span><h2 id="dashboard-recipes-title">Recetas para hoy</h2></div>
          <button className="btn secondary dashboard-section-button" onClick={() => onNavigate('recipes')}>Ver todas<Icon name="chevron" size={16} /></button></div>
        <div className="dashboard-recipes">{suggestions.slice(0,3).map(recipe => <article key={recipe.id} className="dashboard-recipe">
          <button className={`dashboard-recipe-picture${recipe.photo ? '' : ' illustrated'}`} aria-label={`Ver ${recipe.title}`} onClick={() => onOpenRecipe(recipe)}>
            {recipe.photo ? <img src="/bowl-nutribot.png" alt={recipe.title} /> : <span aria-hidden="true">{recipe.emoji || '🍽️'}</span>}
            <small>En tu despensa</small>
          </button>
          <div className="dashboard-recipe-copy"><span className="dashboard-meal">{recipe.category}</span>
            <button className="title-link" onClick={() => onOpenRecipe(recipe)}><h3>{recipe.title}</h3></button><p>{recipe.subtitle}</p>
            <div className="dashboard-recipe-meta"><span><Icon name="clock" size={15} />{recipe.time} min</span><span>{recipe.ingredients.length} ingredientes</span>
              <button aria-label={`Abrir ${recipe.title}`} onClick={() => onOpenRecipe(recipe)}><Icon name="arrow" size={20} /></button></div>
          </div>
          <button className={`dashboard-save${saved.includes(recipe.id) ? ' saved' : ''}`} aria-label={`${saved.includes(recipe.id) ? 'Quitar de favoritas' : 'Guardar en favoritas'} ${recipe.title}`} aria-pressed={saved.includes(recipe.id)} onClick={() => onSave(recipe.id)}><Icon name="heart" size={20} /></button>
        </article>)}</div>
        {!suggestions.length && <div className="dashboard-empty"><Icon name="chef" size={36} /><h3>Tu próxima receta empieza aquí</h3>
          <p>{foods.length ? 'Todavía no hay recetas rápidas guardadas que coincidan con tu despensa y tus preferencias.' : 'Añade algunos ingredientes y busquemos qué cocinar.'}</p>
          <button className="btn primary" onClick={() => onNavigate(foods.length ? 'assistant' : 'pantry')}>{foods.length ? 'Buscar una idea en el chat' : 'Agregar ingredientes'}<Icon name="arrow" size={18} /></button></div>}
      </section>


    </div>
  </div>;
}
