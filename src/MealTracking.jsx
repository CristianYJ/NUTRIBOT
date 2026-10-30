import {useCallback,useEffect,useRef,useState} from 'react';
import {authenticatedFetch} from './auth-api.js';
import {newId} from './ids.js';
import './meal-tracking.css';

async function mealRequest(path,method='GET',body) {
  const response = await authenticatedFetch(`/api/meals/${path}`,{
    method,headers:body ? {'Content-Type':'application/json'} : undefined,
    body:body ? JSON.stringify(body) : undefined,signal:AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if(!response.ok) throw new Error(data.text || 'No se pudo guardar la comida.');
  return data;
}
export function useMeals(includeEdamam = false) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef(false),sequence=useRef(0);
  const refresh=useCallback(async(priorityDate)=>{
    const seq=++sequence.current;
    try {const next=await mealRequest(`today${includeEdamam ? `?includeEdamam=1${priorityDate ? `&priorityDate=${encodeURIComponent(priorityDate)}` : ''}` : ''}`);if(seq===sequence.current){setData(next);setError('');}}
    catch(e){if(seq===sequence.current)setError('No se pudo consultar tu registro de comidas.');throw e;}
  },[includeEdamam]);
  useEffect(()=>{
    const update=()=>{if(document.visibilityState==='visible' && !pending.current)refresh().catch(()=>{});};
    update();document.addEventListener('visibilitychange',update);
    return()=>{++sequence.current;document.removeEventListener('visibilitychange',update);};
  },[refresh]);
  const change=async(path,method,body)=>{
    if(pending.current)throw new Error('Espera a que termine el guardado.');
    pending.current=true;setBusy(true);setError('');++sequence.current;
    try {await mealRequest(path,method,body);await refresh();}
    catch(e){setError(e.message || 'No se pudo confirmar el guardado. Reintenta para comprobarlo.');throw e;}
    finally{pending.current=false;setBusy(false);}
  };
  return {data,error,busy,refresh,change};
}

export function MealFeedback({recipe,tracker}) {
  const [adding,setAdding]=useState(false),[notice,setNotice]=useState('');
  const [mealType,setMealType]=useState(['Desayuno','Almuerzo','Cena'].includes(recipe.category) ? recipe.category : 'Almuerzo');
  const requestId=useRef(newId());
  const external=Boolean(recipe.uri);
  const entry=tracker.data?.meals.find(m=>external ? m.externalUri===recipe.uri : m.recipeId===recipe.id);
  const run=async(action)=>{setNotice('');try{await action();}catch{/* Shared error is displayed below. */}};
  return <section className="meal-feedback" aria-label="Registrar esta comida">
    {!entry || adding ? <>
      <div><h3>{adding ? '¿Comiste otra porción de esta receta hoy?' : '¿Ya comiste esta receta hoy?'}</h3>
        <p>Se registrará una porción para ti, aunque la receta sea para más personas.</p></div>
      <label className="meal-type-label">¿En qué comida?<select value={mealType} disabled={tracker.busy} onChange={event=>setMealType(event.target.value)}>{['Desayuno','Almuerzo','Cena'].map(type=><option key={type}>{type}</option>)}</select></label>
      <div className="meal-actions"><button className="btn primary" disabled={tracker.busy || !tracker.data || Boolean(tracker.error)} onClick={()=>run(async()=>{
        await tracker.change(external ? `edamam/${requestId.current}` : requestId.current,'PUT',external ? {uri:recipe.uri,mealType} : {recipeId:recipe.id,mealType});setAdding(false);requestId.current=newId();
      })}>{tracker.busy ? 'Guardando…' : 'Sí, ya la comí'}</button>
      <button className="btn secondary" disabled={tracker.busy} onClick={()=>{setAdding(false);setNotice('Cuando la comas, puedes registrarla aquí.');}}>Aún no</button></div>
    </> : <>
      <div role="status"><h3>Comida registrada</h3><p>Una porción añadida a tu consumo de hoy. {external ? 'Los nutrientes de Edamam se consultarán al abrir Inicio.' : 'Los nutrientes disponibles ya se incluyen en Inicio.'}</p></div>
      <div className="meal-actions"><button className="text-btn" disabled={tracker.busy} onClick={()=>{requestId.current=newId();setAdding(true);}}>Registrar otra porción</button>
        <button className="text-btn" disabled={tracker.busy} onClick={()=>run(()=>tracker.change(entry.id,'DELETE'))}>Deshacer este registro</button></div>
    </>}
    {notice && <p role="status">{notice}</p>}
    {tracker.error && <p className="review-note" role="alert">{tracker.error} <button className="text-btn" disabled={tracker.busy} onClick={()=>tracker.refresh().catch(()=>{})}>Volver a consultar</button></p>}
    {!tracker.data && !tracker.error && <p role="status">Consultando tus comidas…</p>}
  </section>;
}

const metrics=[['carbs','Carbohidratos','g'],['protein','Proteína','g'],['fat','Grasa','g'],['fiber','Fibra','g'],['sugars','Azúcares','g'],['sodium','Sodio','mg']];
const number=value=>value.toLocaleString('es-SV',{maximumFractionDigits:2});
function EnergyRing({data,goal}) {
  const ratio=goal ? data.knownTotals.kcal/goal : 0;
  const percent=Math.round(ratio*100);
  return <figure className="energy-ring" aria-label={goal ? `${percent}% de tu meta actual${data.missing.kcal ? ', datos parciales' : ''}` : 'Sin meta de calorías'}>
    <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="49" fill="none" stroke="#dfeae3" strokeWidth="9" />
      <circle cx="60" cy="60" r="49" fill="none" stroke="#008264" strokeWidth="9" pathLength="100" strokeDasharray={`${Math.min(100,percent)} 100`} strokeLinecap={percent ? 'round' : 'butt'} />
    </svg><figcaption><b>{goal ? `${percent}%` : 'Sin meta'}</b><span>{goal ? data.missing.kcal ? 'Parcial' : ratio>1 ? 'Meta superada' : 'de tu meta' : 'Añade tu meta'}</span></figcaption>
  </figure>;
}
export function CalorieGoal({tracker,suggestedKcal}) {
  const input=useRef(null);
  const [draft,setDraft]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>setDraft(tracker.data?.goalKcal?.toString() || ''),[tracker.data?.goalKcal]);
  const save=async()=>{
    if(!input.current.reportValidity())return;
    setNotice('');
    try {await tracker.change('goal','PUT',{kcal:draft.trim()==='' ? null : Number(draft)});setNotice(draft.trim() ? 'Meta guardada' : 'Meta eliminada');}catch{}
  };
  return <div className="calorie-goal"><label htmlFor="daily-kcal-goal">Tu meta diaria <span>(kcal)</span></label>
    <div><input ref={input} id="daily-kcal-goal" type="number" min="1" max="20000" step="1" inputMode="numeric" placeholder={suggestedKcal ? `Sugerencia: ${suggestedKcal} kcal` : "Escribe tu meta"} value={draft} onChange={e=>setDraft(e.target.value)} disabled={tracker.busy || !tracker.data} aria-describedby="goal-help" />
      <button type="button" onClick={save} className="btn secondary" disabled={tracker.busy || !tracker.data}>{tracker.busy ? 'Guardando…' : 'Guardar'}</button></div>
    <small id="goal-help">Meta elegida por ti. Déjala vacía para quitarla.</small>
    {suggestedKcal ? <small>Estimación de mantenimiento: {number(suggestedKcal)} kcal/día. <button type="button" className="text-btn" onClick={()=>setDraft(String(suggestedKcal))}>Usar sugerencia</button> Luego pulsa Guardar.</small> : <small>Para una sugerencia orientativa, completa los datos personales y de estimación de calorías de arriba.</small>}{notice && <small role="status">{notice}</small>}
    {tracker.error && <small role="alert">{tracker.error} <button type="button" className="text-btn" onClick={()=>tracker.refresh().catch(()=>{})}>Reintentar</button></small>}
  </div>;
}
export function DailyNutrition({tracker,onProfile}) {
  const {data:current,error,busy}=tracker;
  const [selectedDate,setSelectedDate]=useState(null);
  const data=current?.week?.find(day=>day.date===selectedDate) || current;
  const isToday=data?.date===current?.date;
  const selectedDay=data ? new Date(data.date+'T12:00:00Z') : null;
  const capitalize=text=>text.charAt(0).toUpperCase()+text.slice(1);
  const dateTitle=isToday || !selectedDay ? 'Hoy' : `${capitalize(selectedDay.toLocaleDateString('es-SV',{weekday:'long',timeZone:'UTC'}))} ${selectedDay.getUTCDate()} ${capitalize(selectedDay.toLocaleDateString('es-SV',{month:'short',timeZone:'UTC'}).replace(/\.$/,''))}.`;
  const [page,setPage]=useState(0);
  const slider=useRef(null);
  const amount=key=>data.missing[key]===data.meals.length && data.meals.length ? '—' : number(data.knownTotals[key]);
  return <section className="dashboard-plan daily-nutrition" aria-label="Nutrición del día seleccionado">
    <div className="dashboard-section-heading"><div><h2>{dateTitle}</h2></div></div>
    {error && <p className="review-note" role="alert">{error} <button className="text-btn" disabled={busy} onClick={()=>tracker.refresh().catch(()=>{})}>Actualizar</button></p>}
    {!data && !error && <p role="status">Consultando tus comidas…</p>}
    {data && <>
      {current.week && <div className="nutrition-week" aria-label="Calorías registradas de lunes a domingo">{current.week.map(day=>{
        const future=day.date>current.date;
        const unknown=day.count>0 && day.missing.kcal===day.count;
        const label=new Date(day.date+'T12:00:00Z').toLocaleDateString('es-SV',{weekday:'short',timeZone:'UTC'});
        return <button type="button" key={day.date} disabled={future} onClick={()=>{setSelectedDate(day.date);if(day.date!==current.date)tracker.refresh(day.date).catch(()=>{});}} aria-pressed={day.date===data.date} aria-label={`Consultar nutrición del ${day.date.split('-').reverse().join('/')}`} className={`nutrition-day${day.date===data.date ? ' is-today' : ''}${future ? ' is-future' : ''}`} aria-current={day.date===current.date ? 'date' : undefined}>
          <span>{label}</span><strong>{Number(day.date.slice(-2))}</strong><b>{future || !day.count || unknown ? '—' : number(day.knownTotals.kcal)}</b>
        </button>;
      })}</div>}
      <div className="daily-energy energy-layout">
        <div className="energy-meals">{data.byMeal?.filter(group=>group.type!=='Sin clasificar' || group.count).map((group,index)=><div key={group.type}>
          <span><i className={`meal-color meal-color-${index}`} />{group.type}</span><b>{group.count && group.missing.kcal===group.count ? '—' : number(group.knownTotals.kcal)} <small>kcal{group.missing.kcal ? ' · parcial' : ''}</small></b>
        </div>)}</div>
        <div className="energy-total"><strong>{amount('kcal')} Kcal</strong></div>
        <EnergyRing data={data} goal={current.goalKcal} />
      </div>
      <div className="nutrient-carousel" ref={slider} tabIndex={0} role="region" aria-label="Nutrientes del día seleccionado" onScroll={event=>setPage(Math.round(event.currentTarget.scrollLeft/event.currentTarget.clientWidth))}>
        {[metrics.slice(0,3),metrics.slice(3)].map((group,index)=><div className="daily-metrics" key={index}>{group.map(([key,label,unit])=><div key={key}>
          <span>{label}</span><strong>{amount(key)} <small>{unit}</small></strong>
          {data.missing[key]>0 && <small>Datos incompletos</small>}
        </div>)}</div>)}
      </div>
      <div className="nutrient-pagination">{[0,1].map(index=><button key={index} aria-label={index===0 ? 'Ver carbohidratos, proteína y grasa' : 'Ver fibra, azúcares y sodio'} aria-pressed={page===index} onClick={()=>slider.current?.scrollTo({left:slider.current.clientWidth*index,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'})}><span /></button>)}</div>
      {!data.complete && <p className="review-note">Faltan datos nutricionales en algunas comidas.</p>}
      {data.externalNutritionPartial && <p className="review-note">Algunas recetas de Edamam no pudieron consultarse ahora. <button className="text-btn" onClick={()=>tracker.refresh(data.date).catch(()=>{})}>Actualizar este día</button></p>}
      {data.meals.length>0 && <details key={data.date} className="daily-meal-list"><summary>Comidas registradas ({data.meals.length})</summary>{data.meals.map(meal=><div key={meal.id}><span><strong>{meal.title}</strong><small>1 porción{meal.rating ? ` · ${meal.rating}/5 estrellas` : ''}</small></span><button className="btn secondary" aria-label={`Quitar registro de ${meal.title}`} disabled={busy} onClick={()=>tracker.change(meal.id,'DELETE').catch(()=>{})}>Quitar</button></div>)}</details>}
    </>}
  </section>;
}
