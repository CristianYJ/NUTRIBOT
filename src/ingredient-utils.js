export const ingredientCategories = ["Vegetales", "Frutas", "Granos", "Proteínas", "Lácteos", "Otros"];
export const normalizeName = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const aliases = { huevos: "huevo", tomates: "tomate", papas: "papa", patatas: "papa", cebollas: "cebolla", zanahorias: "zanahoria", bananas: "banano", banana: "banano", palta: "aguacate", "queso fresco": "queso", "frijoles cocidos": "frijoles", "tortilla de maiz": "tortilla", "limones": "limon" };
export const foodKey = (name) => aliases[normalizeName(name)] || normalizeName(name);
export const findIngredient = (name, catalog) => catalog.find((item) => foodKey(item.name) === foodKey(name));
