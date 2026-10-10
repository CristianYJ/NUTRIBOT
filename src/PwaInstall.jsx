import { useState, useSyncExternalStore } from "react";
import { installStatus, promptInstall, subscribeInstall } from "./pwa.js";

export default function PwaInstall() {
  const status = useSyncExternalStore(subscribeInstall, installStatus, () => "unavailable");
  const [dismissed, setDismissed] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fromQr] = useState(() => new URLSearchParams(location.search).get("install") === "1");
  const [mobile] = useState(() => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  if (dismissed || status === "installed" || status === "unavailable"
      || (!mobile && !fromQr && status !== "prompt")) return null;

  async function install() {
    setMessage("");
    if (status !== "prompt") { setInstructions(!instructions); return; }
    setBusy(true);
    try {
      const outcome = await promptInstall();
      setMessage(outcome === "accepted"
        ? "Instalación solicitada. Busca el icono de NutriBot cuando termine."
        : "Puedes seguir usando NutriBot aquí e instalarlo más adelante.");
    } catch {
      setInstructions(true);
      setMessage("Usa el menú del navegador para instalar NutriBot.");
    } finally { setBusy(false); }
  }

  return <aside className="pwa-install" aria-label="Instalar NutriBot">
    <div className="pwa-install-inner">
      <img className="pwa-install-icon" src="/pwa/icon-192.png" alt="" width="52" height="52" />
      <div className="pwa-install-copy">
        <strong>Tu cocina, a un toque</strong>
        <p>Añade NutriBot a tu teléfono y ábrelo desde su icono. Necesita conexión.</p>
      </div>
      <button className="pwa-install-action" type="button" disabled={busy} onClick={install}
        aria-controls="pwa-install-help" aria-expanded={instructions}>
        {busy ? "Abriendo…" : "Instalar NutriBot"}
      </button>
      <button className="pwa-install-close" type="button" onClick={() => setDismissed(true)}
        aria-label="Cerrar aviso de instalación">×</button>
      {message && <p className="pwa-install-message" role="status">{message}</p>}
      <div id="pwa-install-help" className="pwa-install-help" hidden={!instructions}>
        <p><strong>Android:</strong> abre el menú de Chrome o Samsung Internet y busca «Instalar aplicación» o «Añadir a pantalla de inicio». Confirma la instalación.</p>
        <p><strong>iPhone:</strong> abre esta página en Safari, toca Compartir y «Añadir a pantalla de inicio».</p>
        <p>Si estás dentro del lector QR o de otra app, elige «Abrir en el navegador». En una computadora, busca la opción de instalar en el menú de Chrome o Edge.</p>
        <p>Puedes continuar usando la web sin instalarla.</p>
      </div>
    </div>
  </aside>;
}
