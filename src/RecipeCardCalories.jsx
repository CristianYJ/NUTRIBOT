import { useEffect, useRef, useState } from 'react';
import { nutritionRequest } from './api.js';

export default function RecipeCardCalories({ recipeId }) {
  const marker = useRef(null);
  const [visible, setVisible] = useState(false);
  const [calories, setCalories] = useState(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '240px' });
    observer.observe(marker.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    setCalories(null);
    setFinished(false);
    nutritionRequest('GET', `recipes/${recipeId}?servings=1`, undefined, controller.signal)
      .then(data => {
        const kcal = data.nutrition?.perPerson?.kcal;
        if (!controller.signal.aborted) setCalories(Number.isFinite(kcal) ? kcal : null);
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setFinished(true); });
    return () => controller.abort();
  }, [recipeId, visible]);

  return <p ref={marker}>{calories == null
    ? (finished ? 'Kcal por porción: sin verificar' : 'Consultando kcal por porción…')
    : `${calories.toLocaleString('es-SV', { maximumFractionDigits: 1 })} kcal por porción`}</p>;
}
