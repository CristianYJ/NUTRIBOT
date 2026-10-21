import {ageFromBirthDate} from './date-utils.js';
// Mifflin–St Jeor (1990), maintenance estimate; activity multipliers are approximate.
// https://pubmed.ncbi.nlm.nih.gov/2305711/
export const calorieActivities=[['low','Baja · mayormente sentado/a',1.4],['light','Ligera · caminatas y algo de ejercicio',1.6],['moderate','Moderada · movimiento y ejercicio frecuente',1.8],['high','Alta · trabajo físico o entrenamiento intenso',2]];
export function calorieEstimate(profile,today) {
  const age=ageFromBirthDate(profile.birthDate,today);
  const weight=Number(profile.weight),height=Number(profile.height);
  const factor=calorieActivities.find(([id])=>id===profile.calorieActivity)?.[2];
  if(!profile.calorieEstimateEligible || age===null || age<19 || age>78 || !['male','female'].includes(profile.calorieSex) || !factor || !Number.isFinite(weight) || weight<20 || weight>400 || !Number.isFinite(height) || height<80 || height>250)return null;
  const resting=10*weight+6.25*height-5*age+(profile.calorieSex==='male' ? 5 : -161);
  return resting>0 ? Math.round(resting*factor/50)*50 : null;
}
