let csrfToken = "";
let accountId = "";
export function acceptSession(session) {
  csrfToken = session?.csrfToken || "";
  accountId = session?.profileId ? String(session.profileId) : "";
}
export async function authenticatedFetch(url, options = {}) {
  const tokenAtStart = csrfToken;
  const method = options.method || "GET";
  const headers = new Headers(options.headers);
  if (accountId && !url.startsWith("/api/auth/"))
    headers.set("X-Nutribot-Account", accountId);
  if (!["GET", "HEAD"].includes(method)) {
    headers.set("X-Nutribot-Request", "1");
    if (csrfToken) headers.set("X-Nutribot-CSRF", csrfToken);
  }
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (
    response.status === 401 &&
    !url.startsWith("/api/auth/") &&
    csrfToken === tokenAtStart
  )
    window.dispatchEvent(new Event("nutribot:unauthorized"));
  return response;
}
export async function accountRequest(action, body, signal) {
  const response = await authenticatedFetch("/api/auth/" + action, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.text || "No se pudo completar el acceso.");
  if (Object.hasOwn(result, "authenticated")) acceptSession(result);
  return result;
}
