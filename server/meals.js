import { AppError } from './recipes.js';

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
function validateId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new AppError('INVALID_MEAL','Registro de comida inválido.');
}
export function validateRating(rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new AppError('INVALID_RATING','Elige una valoración del 1 al 5.');
}
const publicMeal = row => ({id:row.id,recipeId:row.recipe_id,title:row.recipe_title,eatenAt:row.eaten_at,
  servings:1,rating:row.rating,nutrition:row.nutrition_snapshot.nutrition.perPerson});

export function mealStore({transaction,profileId,readRecipeNutrition}) {
  const lock = c => c.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE',[profileId()]);
  return {
    getTodayMeals() {
      return transaction(async c => {
        const date = (await c.query("SELECT to_char((now() AT TIME ZONE 'America/El_Salvador')::date,'YYYY-MM-DD') AS day")).rows[0].day;
        const meals = (await c.query('SELECT * FROM meal_log WHERE profile_id=$1 AND meal_date=$2 ORDER BY eaten_at DESC,id',[profileId(),date])).rows.map(publicMeal);
        return {date,timezone:'America/El_Salvador',meals,...summarizeMeals(meals)};
      },true);
    },
    recordMeal(id,body) {
      validateId(id);
      if (typeof body?.recipeId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.recipeId))
        throw new AppError('INVALID_RECIPE','Receta inválida.');
      return transaction(async c => {
        await lock(c);
        const existing = (await c.query('SELECT * FROM meal_log WHERE profile_id=$1 AND id=$2',[profileId(),id])).rows[0];
        if(existing) {
          if(existing.recipe_id !== body.recipeId) throw new AppError('MEAL_CONFLICT','Ese registro pertenece a otra receta.',409);
          return publicMeal(existing);
        }
        const recipe = (await c.query("SELECT title FROM recipes WHERE id=$1 AND (source='catalog' OR profile_id=$2)",[body.recipeId,profileId()])).rows[0];
        if(!recipe) throw new AppError('NOT_FOUND','Receta no encontrada.',404);
        // Snapshot trusted server-side USDA data for exactly one person. Client totals are ignored.
        const snapshot = await readRecipeNutrition(c,body.recipeId,1);
        const row = (await c.query('INSERT INTO meal_log(profile_id,id,recipe_id,recipe_title,nutrition_snapshot) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [profileId(),id,body.recipeId,recipe.title,JSON.stringify(snapshot)])).rows[0];
        return publicMeal(row);
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
        return {removed:true};
      });
    },
  };
}
