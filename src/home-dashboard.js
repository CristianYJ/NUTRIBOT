import { availability, matchesProfile } from './engine.js';
import { expiryStatus } from './pantry-expiry.js';

export function kitchenOverview({ pantry, ingredients, dates, recipes, profile, today }) {
  const present = new Set(pantry);
  const foods = ingredients.filter(item => present.has(item.id)).map(item => ({ ...item, expiry: expiryStatus(dates[item.id], today) }));
  const soon = foods.filter(item => item.expiry.tone === 'soon').sort((a,b) => a.expiry.days - b.expiry.days);
  const past = foods.filter(item => item.expiry.tone === 'past');
  const pastIds = new Set(past.map(item => item.id));
  const soonIds = new Set(soon.map(item => item.id));
  const priority = recipe => recipe.ingredients.filter(id => soonIds.has(id)).length;
  const suggestions = recipes.filter(recipe => matchesProfile(recipe, profile, ingredients)
    && recipe.time <= 30 && !availability(recipe, pantry).missing.length && !recipe.ingredients.some(id => pastIds.has(id)))
    .sort((a,b) => priority(b) - priority(a) || a.time - b.time);
  const groups = [
    {name:'Verduras y frutas',categories:['Vegetales','Frutas'],icon:'leaf',color:'mint'},
    {name:'Proteínas',categories:['Proteínas'],icon:'chef',color:'lilac'},
    {name:'Lácteos',categories:['Lácteos'],icon:'pantry',color:'cream'},
    {name:'Granos y otros',categories:['Granos','Otros'],icon:'bag',color:'peach'},
  ].map(group => ({...group,count:foods.filter(item => group.categories.includes(item.category)).length}));
  return {foods,soon,past,suggestions,groups};
}
