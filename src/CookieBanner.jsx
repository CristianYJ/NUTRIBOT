import { useEffect, useState } from "react";
import "./cookie-banner.css";

const preferenceKey = "nutribot.cookies.v1";

function storedChoice() {
  try {
    const value = localStorage.getItem(preferenceKey);
    return value === "all" || value === "necessary" ? value : null;
  } catch {
    return null;
  }
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !storedChoice());

  useEffect(() => {
    const reopen = () => setVisible(true);
    window.addEventListener("nutribot:cookies-open", reopen);
    return () => window.removeEventListener("nutribot:cookies-open", reopen);
  }, []);

  function choose(value) {
    try { localStorage.setItem(preferenceKey, value); } catch { /* Keep this visit usable when storage is disabled. */ }
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <aside className="cookie-banner" aria-label="Preferencias de cookies">
      <div className="cookie-banner-copy">
        <strong>Cookies en NutriBot</strong>
        <p>Usamos una cookie necesaria para mantener tu sesión cuando ingresas. No usamos cookies de publicidad ni análisis. Puedes rechazar las opcionales; por ahora no hay ninguna. <a href="#politica-privacidad">Ver política de privacidad</a></p>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" className="cookie-reject" onClick={() => choose("necessary")}>Rechazar opcionales</button>
        <button type="button" className="cookie-accept" onClick={() => choose("all")}>Aceptar todas</button>
      </div>
    </aside>
  );
}
