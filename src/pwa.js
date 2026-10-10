let installEvent = null;
let status = "unavailable";
let initialized = false;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());
export function subscribeInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const installStatus = () => status;

export async function promptInstall() {
  const event = installEvent;
  if (!event) return "manual";
  installEvent = null;
  status = "manual";
  notify();
  await event.prompt();
  return (await event.userChoice).outcome;
}

export function initializePwa() {
  if (initialized) return;
  initialized = true;
  const standalone = window.matchMedia("(display-mode: standalone)");
  const fullscreen = window.matchMedia("(display-mode: fullscreen)");
  const updateDisplay = () => {
    status = standalone.matches || fullscreen.matches || navigator.standalone
      ? "installed"
      : window.isSecureContext ? (installEvent ? "prompt" : "manual") : "unavailable";
    notify();
  };
  updateDisplay();
  standalone.addEventListener("change", updateDisplay);
  fullscreen.addEventListener("change", updateDisplay);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event;
    updateDisplay();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    status = "installed";
    notify();
  });
  // Keep development unaffected. Only the public offline notice is cached.
  if (import.meta.env?.PROD && window.isSecureContext && "serviceWorker" in navigator) {
    const register = () => navigator.serviceWorker.register("/sw.js", {
      scope: "/", updateViaCache: "none",
    }).catch(() => console.warn("No se pudo preparar el aviso sin conexión de Nutribot."));
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}
