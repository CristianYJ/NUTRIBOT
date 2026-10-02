import AccountMenu from "./AccountMenu.jsx";
import { useState } from "react";
import Icon from "./Icons.jsx";
import { normalizeName } from "./ingredient-utils.js";

export default function CulinaryHeader({
  brand,
  page,
  profile,
  ingredients,
  recipes,
  onNavigate,
  onSearchIngredient,
  onOpenRecipe,
  onFavorites,
  mobile,
  onToggleMobile,
  onLogout,
  loggingOut,
  onConnect,
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const normalized = normalizeName(query);
  const foods = normalized
    ? ingredients
        .filter((i) => normalizeName(i.name).includes(normalized))
        .slice(0, 4)
    : [];
  const dishes = normalized
    ? recipes
        .filter((r) => normalizeName(r.title).includes(normalized))
        .slice(0, 3)
    : [];
  function choose(action) {
    setQuery("");
    setFocused(false);
    action();
  }
  return (
    <header className="culinary-header">
      <button
        className="brand-link"
        aria-label="Nutribot, ir al inicio"
        onClick={() => onNavigate("home")}
      >
        {brand}
      </button>
      <form
        className="culinary-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim()) choose(() => onSearchIngredient(query.trim()));
        }}
      >
        <Icon name="search" size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setFocused(false);
          }}
          placeholder="Ingredientes o recetas…"
          aria-label="Buscar ingredientes o recetas"
          aria-expanded={Boolean(focused && normalized)}
          aria-controls="kitchen-search-results"
        />
        {focused && normalized && (
          <div id="kitchen-search-results" className="kitchen-search-results">
            <div className="search-result-heading">
              En tu cocina
              <button
                type="button"
                aria-label="Cerrar resultados"
                onClick={() => setFocused(false)}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            {foods.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => choose(() => onSearchIngredient(food.name))}
              >
                <span>{food.emoji}</span>
                <span>
                  {food.name}
                  <small>Ingrediente · {food.category}</small>
                </span>
                <Icon name="arrow" size={15} />
              </button>
            ))}
            {dishes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => choose(() => onOpenRecipe(recipe))}
              >
                <Icon name="book" size={18} />
                <span>
                  {recipe.title}
                  <small>Receta · {recipe.time} min</small>
                </span>
                <Icon name="arrow" size={15} />
              </button>
            ))}
            {!foods.length && !dishes.length && (
              <p>No hay coincidencias. Puedes agregarlo en Mi despensa.</p>
            )}
          </div>
        )}
      </form>
      <nav className="culinary-navigation" aria-label="Navegación principal">
        {[
          ["home", "Inicio"],
          ["pantry", "Mi despensa"],
          ["assistant", "NutriBot IA"],
          ["recipes", "Mis recetas"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            aria-current={page === id ? "page" : undefined}
            onClick={() => choose(() => onNavigate(id))}
          >
            {label}
          </button>
        ))}
        <button onClick={() => choose(onFavorites)}>
          <Icon name="heart" size={16} />
          <span>Favoritos</span>
        </button>
      </nav>
      <div className="culinary-header-actions">
        <button
          className="layout-toggle"
          onClick={onToggleMobile}
          title={mobile ? "Vista amplia" : "Vista móvil"}
          aria-label={mobile ? "Vista amplia" : "Vista móvil"}
        >
          <Icon name={mobile ? "monitor" : "phone"} size={19} />
        </button>
        <AccountMenu
          profile={profile}
          onProfile={() => onNavigate("profile")}
          onLogout={onLogout}
          loggingOut={loggingOut}
          onConnect={onConnect}
        />
      </div>
    </header>
  );
}
