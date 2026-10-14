import Icon from "./Icons.jsx";
import "./recipe-pantry-impact.css";

export default function RecipePantryImpact({ recipe, pantry }) {
  const available = new Set(pantry);
  const used = [...new Set(recipe.ingredients)].filter(id => available.has(id)).length;
  if (!used) return null;
  return <div className="recipe-pantry-impact">
    <span className="recipe-pantry-impact-icon"><Icon name="leaf" size={19} /></span>
    <div><strong>Aprovecha lo que tienes</strong><span>Usa {used} de los {available.size} alimentos de tu despensa.</span></div>
  </div>;
}
