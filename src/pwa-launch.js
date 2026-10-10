export function shouldShowWelcome(url, standalone = false) {
  const entry = !url.hash || url.hash === "#app";
  return entry && (standalone || url.searchParams.get("source") === "pwa");
}

export function launchDestination(url) {
  const next = new URL(url);
  next.searchParams.delete("install");
  next.hash = "auth";
  return next;
}
