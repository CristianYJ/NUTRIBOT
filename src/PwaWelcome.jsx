import { useEffect, useState } from "react";
import { launchDestination, shouldShowWelcome } from "./pwa-launch.js";

export default function PwaWelcome({ children }) {
  const [welcoming, setWelcoming] = useState(() => shouldShowWelcome(
    new URL(location.href),
    window.matchMedia("(display-mode: standalone)").matches || Boolean(navigator.standalone),
  ));
  function continueToAccount() {
    history.replaceState(history.state, "", launchDestination(new URL(location.href)));
    setWelcoming(false);
  }
  useEffect(() => {
    if (!welcoming) return;
    const timer = window.setTimeout(continueToAccount, 1600);
    return () => window.clearTimeout(timer);
  }, [welcoming]);
  if (!welcoming) return children;
  return <main className="pwa-welcome" aria-labelledby="pwa-welcome-title">
    <div className="pwa-welcome-content">
      <div className="pwa-welcome-logo"><img src="/nutribot-logo.png" alt="" /></div>
      <p className="pwa-welcome-eyebrow">BIENVENIDO A TU COCINA</p>
      <h1 id="pwa-welcome-title">NutriBot<span>.</span></h1>
      <p>Más ideas con lo que tienes.</p>
      <span className="pwa-welcome-progress" aria-hidden="true" />
      <button type="button" onClick={continueToAccount}>Continuar</button>
    </div>
  </main>;
}
