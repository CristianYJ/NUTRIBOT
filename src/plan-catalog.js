// Stable codes also identify existing accounts and their plan history.
export const planCatalog = Object.freeze({
  basico: Object.freeze({ code: 'basico', name: 'Básico', recipes: 4, vision: 1 }),
  nutripro: Object.freeze({ code: 'nutripro', name: 'NutriPro', recipes: 14, vision: 3 }),
  nutripro_plus: Object.freeze({ code: 'nutripro_plus', name: 'NutriMax', recipes: 22, vision: 6 }),
});

export const staffPlan = Object.freeze({ code: 'staff', name: 'Staff',
  recipes: planCatalog.nutripro_plus.recipes, vision: planCatalog.nutripro_plus.vision });
