import {calorieEstimate} from '../src/calorie-estimate.js';
import { AppError } from './recipes.js';
import { validateEdamamUri } from './edamam.js';

export const mealNutrients = ['kcal','carbs','fiber','protein','fat','saturatedFat','sugars','sodium','salt'];
export function summarizeMeals(meals) {
  const totals = {}, knownTotals = {}, missing = {};
  for (const key of mealNutrients) {
    const values = meals.map(meal => meal.nutrition?.[key]);
    const known = values.filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
    missing[key] = values.length - known.length;
    knownTotals[key] = Math.round(known.reduce((a,b) => a+b,0)*100)/100;
    totals[key] = missing[key] ? null : knownTotals[key];
  }
  return { totals, knownTotals, missing, complete: Object.values(missing).every(n => n === 0) };
}
export const mealTypes = ['Desayuno','Almuerzo','Cena'];
export function summarizeMealTypes(meals) {
  return [...mealTypes,'Sin clasificar'].map(type=>{
    const entries=meals.filter(meal=>(mealTypes.includes(meal.mealType) ? meal.mealType : 'Sin clasificar')===type);
    return {type,count:entries.length,...summarizeMeals(entries)};
  });
}
export function summarizeWeek(date, meals) {
  const monday = new Date(date+'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay()+6)%7);
  return Array.from({length:7},(_,i)=>{
    const day = new Date(monday); day.setUTCDate(day.getUTCDate()+i);
    const key=day.toISOString().slice(0,10);
    const entries=meals.filter(meal=>meal.date===key);
    return {date:key,count:entries.length,meals:entries,byMeal:summarizeMealTypes(entries),...summarizeMeals(entries)};
  });
}
export async function hydrateEdamamMeals(data, lookup, maxRecipes = 6, priorityDate = data.date) {
  const prioritized = (data.week || []).find(day => day.date === priorityDate)?.meals || [];
  const all = [...prioritized, ...(data.meals || []), ...(data.week || []).flatMap(day => day.meals || [])];
  const uris = [...new Set(all.map(meal => meal.externalUri).filter(Boolean))];
  const fetched = await Promise.allSettled(uris.slice(0,maxRecipes).map(uri => lookup(uri)));
  const byUri = new Map(fetched.map((result,index) => [uris[index], result.status === 'fulfilled' ? result.value : null]));
  const enrich = meal => {
    const recipe = byUri.get(meal.externalUri);
    if (!recipe) return meal;
    const n = recipe.nutrientsPerServing || {};
    const value = x => Number.isFinite(x) && x >= 0 ? x : null;
    return {...meal,nutrition:{kcal:value(recipe.caloriesPerServing),carbs:value(n.carbohydratesG),fiber:value(n.fiberG),
      protein:value(n.proteinG),fat:value(n.fatG),saturatedFat:value(n.saturatedFatG),sugars:value(n.sugarG),
      sodium:value(n.sodiumMg),salt:Number.isFinite(n.sodiumMg) ? n.sodiumMg*2.5/1000 : null}};
  };
  const meals = data.meals.map(enrich);
  const week = data.week?.map(day => { const entries = day.meals.map(enrich); return {...day,meals:entries,byMeal:summarizeMealTypes(entries),...summarizeMeals(entries)}; });
  return {...data,meals,week,byMeal:summarizeMealTypes(meals),...summarizeMeals(meals),
    externalNutritionPartial: uris.length > maxRecipes || fetched.some(result => result.status === 'rejected')};
}
function validateId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new AppError('INVALID_MEAL','Registro de comida inválido.');
}
export function validateRating(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new AppError('INVALID_RATING','Elige una valoración del 1 al 5.');
}
const publicMeal = row => ({id:row.id,recipeId:row.recipe_id,title:row.recipe_title,eatenAt:row.eaten_at,
  servings:1,rating:row.rating,mealType:row.nutrition_snapshot.mealType || row.category || null,classificationSource:row.nutrition_snapshot.mealType ? "recorded" : "recipe",nutrition:row.nutrition_snapshot.nutrition.perPerson});
const publicEdamamMeal = row => ({id:row.id,recipeId:null,externalUri:row.recipe_uri,title:row.recipe_title,eatenAt:row.eaten_at,
  servings:1,rating:null,mealType:row.meal_type,classificationSource:'recorded',nutrition:null});

export function mealStore({transaction,profileId,readRecipeNutrition}) {
  const lock = c => c.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[profileId()]);
  return {
    setNutritionGoal(kcal) {
      if(kcal!==null && (!Number.isInteger(kcal) || kcal<1 || kcal>20000)) throw new AppError('INVALID_GOAL','Escribe una meta entera entre 1 y 20000 kcal.');
      return transaction(async c=>{
        await lock(c);
        if(kcal===null) await c.query('DELETE FROM nutrition_goals WHERE profile_id=$1',[profileId()]);
        else await c.query('INSERT INTO nutrition_goals(profile_id,kcal) VALUES($1,$2) ON CONFLICT(profile_id) DO UPDATE SET kcal=EXCLUDED.kcal,updated_at=now()',[profileId(),kcal]);
        return {goalKcal:kcal};
      });
    },
    getTodayMeals() {
      return transaction(async c => {
        const date = (await c.query("SELECT to_char((now() AT TIME ZONE 'America/El_Salvador')::date,'YYYY-MM-DD') AS day")).rows[0].day;
        const meals = (await c.query('SELECT m.*,r.category FROM meal_log m JOIN recipes r ON r.id=m.recipe_id WHERE m.profile_id=$1 AND m.meal_date=$2 ORDER BY m.eaten_at DESC,m.id',[profileId(),date])).rows.map(publicMeal);
        const edamamMeals = (await c.query('SELECT * FROM edamam_meal_log WHERE profile_id=$1 AND meal_date=$2 ORDER BY eaten_at DESC,id',[profileId(),date])).rows.map(publicEdamamMeal);
        const weekMeals = (await c.query(`SELECT m.*,r.category,to_char(m.meal_date,'YYYY-MM-DD') AS day FROM meal_log m JOIN recipes r ON r.id=m.recipe_id
          WHERE m.profile_id=$1 AND m.meal_date >= date_trunc('week',$2::date)::date
          AND m.meal_date < date_trunc('week',$2::date)::date + 7`,[profileId(),date])).rows.map(row=>({...publicMeal(row),date:row.day}));
        const edamamWeek = (await c.query(`SELECT *,to_char(meal_date,'YYYY-MM-DD') AS day FROM edamam_meal_log
          WHERE profile_id=$1 AND meal_date >= date_trunc('week',$2::date)::date
          AND meal_date < date_trunc('week',$2::date)::date + 7`,[profileId(),date])).rows.map(row=>({...publicEdamamMeal(row),date:row.day}));
        const goalKcal=(await c.query('SELECT kcal FROM nutrition_goals WHERE profile_id=$1',[profileId()])).rows[0]?.kcal ?? null;
        const p=(await c.query("SELECT weight_kg,height_cm,to_char(birth_date,'YYYY-MM-DD') AS birth_date,calorie_sex,calorie_activity,calorie_estimate_eligible FROM profiles WHERE id=$1",[profileId()])).rows[0];
        const suggestedKcal=calorieEstimate({birthDate:p.birth_date,weight:p.weight_kg,height:p.height_cm,calorieSex:p.calorie_sex,calorieActivity:p.calorie_activity,calorieEstimateEligible:p.calorie_estimate_eligible},date);
        const today = [...meals,...edamamMeals].sort((a,b)=>new Date(b.eatenAt)-new Date(a.eatenAt));
        return {date,goalKcal,suggestedKcal,timezone:'America/El_Salvador',meals:today,byMeal:summarizeMealTypes(today),week:summarizeWeek(date,[...weekMeals,...edamamWeek]),...summarizeMeals(today)};
      },true);
    },
    recordMeal(id,body) {
      validateId(id);
      if (body?.mealType !== undefined && !mealTypes.includes(body.mealType)) throw new AppError('INVALID_MEAL_TYPE','Selecciona desayuno, almuerzo o cena.');
      if (typeof body?.recipeId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.recipeId))
        throw new AppError('INVALID_RECIPE','Receta inválida.');
      return transaction(async c => {
        await lock(c);
        const existing = (await c.query('SELECT * FROM meal_log WHERE profile_id=$1 AND id=$2',[profileId(),id])).rows[0];
        if(existing) {
          if(existing.recipe_id !== body.recipeId) throw new AppError('MEAL_CONFLICT','Ese registro pertenece a otra receta.',409);
          return publicMeal(existing);
        }
        const recipe = (await c.query("SELECT title,category FROM recipes WHERE id=$1 AND (source='catalog' OR profile_id=$2)",[body.recipeId,profileId()])).rows[0];
        if(!recipe) throw new AppError('NOT_FOUND','Receta no encontrada.',404);
        // Snapshot trusted server-side USDA data for exactly one person. Client totals are ignored.
        const snapshot = await readRecipeNutrition(c,body.recipeId,1);
        snapshot.mealType = body.mealType || (mealTypes.includes(recipe.category) ? recipe.category : null);
        const row = (await c.query('INSERT INTO meal_log(profile_id,id,recipe_id,recipe_title,nutrition_snapshot) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [profileId(),id,body.recipeId,recipe.title,JSON.stringify(snapshot)])).rows[0];
        return publicMeal(row);
      });
    },
    recordEdamamMeal(id,body) {
      validateId(id);
      const uri = validateEdamamUri(body?.uri);
      if (typeof body?.title !== 'string' || !body.title.trim() || body.title.length > 150)
        throw new AppError('INVALID_RECIPE','Receta inválida.');
      if (!mealTypes.includes(body?.mealType)) throw new AppError('INVALID_MEAL_TYPE','Selecciona desayuno, almuerzo o cena.');
      return transaction(async c => {
        await lock(c);
        const existing = (await c.query('SELECT * FROM edamam_meal_log WHERE profile_id=$1 AND id=$2',[profileId(),id])).rows[0];
        if (existing) {
          if (existing.recipe_uri !== uri) throw new AppError('MEAL_CONFLICT','Ese registro pertenece a otra receta.',409);
          return publicEdamamMeal(existing);
        }
        const row = (await c.query('INSERT INTO edamam_meal_log(profile_id,id,recipe_uri,recipe_title,meal_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [profileId(),id,uri,body.title.trim(),body.mealType])).rows[0];
        return publicEdamamMeal(row);
      });
    },
    rateMeal(id,rating) {
      validateId(id); validateRating(rating);
      return transaction(async c => {
        await lock(c);
        const row = (await c.query('UPDATE meal_log SET rating=$3 WHERE profile_id=$1 AND id=$2 RETURNING *',[profileId(),id,rating])).rows[0];
        if(!row) throw new AppError('NOT_FOUND','Comida registrada no encontrada.',404);
        return publicMeal(row);
      });
    },
    removeMeal(id) {
      validateId(id);
      return transaction(async c => {
        await lock(c);
        await c.query('DELETE FROM meal_log WHERE profile_id=$1 AND id=$2',[profileId(),id]);
        await c.query('DELETE FROM edamam_meal_log WHERE profile_id=$1 AND id=$2',[profileId(),id]);
        return {removed:true};
      });
    },
  };
}
