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
export function useMeals() {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef(false),sequence=useRef(0);
  const refresh=useCallback(async()=>{
    const seq=++sequence.current;
    try {const next=await mealRequest('today');if(seq===sequence.current){setData(next);setError('');}}
    catch(e){if(seq===sequence.current)setError('No se pudo consultar tu registro de comidas.');throw e;}
  },[]);
  useEffect(()=>{
    const update=()=>{if(document.visibilityState==='visible' && !pending.current)refresh().catch(()=>{});};
    update();const interval=setInterval(update,60000);
    document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);
    return()=>{++sequence.current;clearInterval(interval);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);};
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
  const requestId=useRef(newId());
  const entry=tracker.data?.meals.find(m=>m.recipeId===recipe.id);
  const run=async(action)=>{setNotice('');try{await action();}catch{/* Shared error is displayed below. */}};
  return <section className="meal-feedback" aria-label="Registrar y valorar esta comida">
    {!entry || adding ? <>
      <div><h3>{adding ? '¿Comiste otra porción de esta receta hoy?' : '¿Ya comiste esta receta hoy?'}</h3>
        <p>Se registrará una porción para ti, aunque la receta sea para más personas.</p></div>
      <div className="meal-actions"><button className="btn primary" disabled={tracker.busy || !tracker.data || Boolean(tracker.error)} onClick={()=>run(async()=>{
        await tracker.change(requestId.current,'PUT',{recipeId:recipe.id});setAdding(false);requestId.current=newId();
      })}>{tracker.busy ? 'Guardando…' : 'Sí, ya la comí'}</button>
      <button className="btn secondary" disabled={tracker.busy} onClick={()=>{setAdding(false);setNotice('Cuando la comas, puedes registrarla aquí.');}}>Aún no</button></div>
    </> : <>
      <div><h3>¿Qué te pareció la comida?</h3><p>Una porción registrada hoy. Valora de 1 (no me gustó) a 5 (me encantó).</p></div>
      <div className="meal-stars" role="group" aria-label="Valoración de la comida">
        {[1,2,3,4,5].map(n=><button key={n} aria-pressed={entry.rating===n} aria-label={`${n} ${n===1 ? 'estrella' : 'estrellas'}`} disabled={tracker.busy}
          className={n<=entry.rating ? 'filled' : ''} onClick={()=>run(()=>tracker.change(entry.id,'PATCH',{rating:n}))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z"/></svg>
        </button>)}
      </div>
      <p className="meal-rating-status" role="status">{entry.rating ? `${entry.rating} de 5 estrellas · Valoración guardada` : 'La valoración es opcional.'}</p>
      <div className="meal-actions"><button className="text-btn" disabled={tracker.busy} onClick={()=>{requestId.current=newId();setAdding(true);}}>Registrar otra porción</button>
        <button className="text-btn" disabled={tracker.busy} onClick={()=>run(()=>tracker.change(entry.id,'DELETE'))}>Deshacer este registro</button></div>
    </>}
    {notice && <p role="status">{notice}</p>}
    {tracker.error && <p className="review-note" role="alert">{tracker.error} <button className="text-btn" disabled={tracker.busy} onClick={()=>tracker.refresh().catch(()=>{})}>Volver a consultar</button></p>}
    {!tracker.data && !tracker.error && <p role="status">Consultando tus comidas…</p>}
  </section>;
}

const metrics=[['carbs','Carbohidratos','g'],['protein','Proteína','g'],['fat','Grasa','g'],['saturatedFat','Grasa saturada','g'],['sugars','Azúcares','g'],['fiber','Fibra','g'],['sodium','Sodio','mg'],['salt','Sal equivalente','g']];
const number=value=>value.toLocaleString('es-SV',{maximumFractionDigits:2});
export function DailyNutrition({tracker}) {
  const {data,error,busy}=tracker;
  const amount=key=>data.missing[key]===data.meals.length && data.meals.length ? '—' : number(data.knownTotals[key]);
  return <section className="dashboard-plan daily-nutrition" aria-label="Nutrición registrada hoy">
    <div className="dashboard-section-heading"><h2>Tu nutrición de hoy</h2></div>
    {error && <p className="review-note" role="alert">{error} <button className="text-btn" disabled={busy} onClick={()=>tracker.refresh().catch(()=>{})}>Actualizar</button></p>}
    {!data && !error && <p role="status">Consultando tus comidas…</p>}
    {data && <>
      <div className="daily-energy"><strong>{amount('kcal')}</strong><span>kcal registradas{data.missing.kcal ? ' · parcial' : ''}</span></div>
      <p className="dashboard-caption">{data.meals.length} {data.meals.length===1 ? 'porción registrada' : 'porciones registradas'} · {data.date.split('-').reverse().join('/')} · El Salvador</p>
      <div className="daily-metrics">{metrics.map(([key,label,unit])=><div key={key}><span>{label}</span><strong>{amount(key)} <small>{unit}</small></strong>{data.missing[key]>0 && <small>Datos incompletos</small>}</div>)}</div>
      {!data.complete && <p className="review-note">Faltan datos nutricionales en algunas comidas.</p>}
      {data.meals.length>0 && <details className="daily-meal-list"><summary>Comidas registradas ({data.meals.length})</summary>{data.meals.map(meal=><div key={meal.id}><span><strong>{meal.title}</strong><small>1 porción{meal.rating ? ` · ${meal.rating}/5 estrellas` : ''}</small></span><button className="btn secondary" aria-label={`Quitar registro de ${meal.title}`} disabled={busy} onClick={()=>tracker.change(meal.id,'DELETE').catch(()=>{})}>Quitar</button></div>)}</details>}
    </>}
  </section>;
}
