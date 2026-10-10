import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "./recipes.js";
import { isIP } from "node:net";
const cookieName = "nutribot_session";
const digest = (token) => createHash("sha256").update(token).digest("hex");
const csrf = (token) =>
  createHmac("sha256", token).update("nutribot-csrf-v1").digest("hex");
const equal = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export const isLoopback = (ip) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip);
export function requestContext(req, network = {}) {
  const proxied =
    isLoopback(req.socket.remoteAddress) &&
    network.proxySecret &&
    equal(req.headers["x-nutribot-proxy"], network.proxySecret);
  const ip = proxied
    ? req.headers["x-nutribot-client"]
    : req.socket.remoteAddress;
  const secure = Boolean(
    req.socket.encrypted ||
      (proxied && req.headers["x-nutribot-protocol"] === "https"),
  );
  if (network.public && (!proxied || !secure || typeof ip !== "string" || !isIP(ip)))
    throw new AppError("FORBIDDEN", "Proxy no autorizado.", 403);
  const host = req.headers.host || "";
  let parsed;
  try {
    parsed = new URL(`${secure ? "https" : "http"}://${host}`);
  } catch {
    /* rejected below */
  }
  if (
    !parsed ||
    parsed.host !== host ||
    parsed.username ||
    !(network.public ? network.hosts || [] : ["localhost", "127.0.0.1", "[::1]", ...(network.hosts || [])]).includes(
      parsed.hostname,
    ) ||
    (network.public && parsed.origin !== network.origins?.[0])
  )
    throw new AppError("FORBIDDEN", "Host no autorizado.", 403);
  const origins = network.public ? [network.origins[0]] : [
    parsed.origin,
    ...(network.origins || []),
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ];
  const publicNavigation = network.public && req.method === "GET" &&
    req.headers["sec-fetch-mode"] === "navigate" &&
    req.headers["sec-fetch-dest"] === "document";
  if (
    (req.headers.origin && !origins.includes(req.headers.origin)) ||
    (req.headers["sec-fetch-site"] === "cross-site" && !publicNavigation)
  )
    throw new AppError("FORBIDDEN", "Origen no autorizado.", 403);
  return {
    ip: ip || "unknown",
    secure,
    local: !network.public && isLoopback(ip),
    origin: parsed.origin,
  };
}
function tokenFrom(req) {
  const value = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(value || "") ? value : null;
}
function setCookie(res, token, secure, remember, clear = false) {
  const age = clear ? "; Max-Age=0" : remember ? "; Max-Age=2592000" : "";
  res.setHeader(
    "Set-Cookie",
    `${cookieName}=${clear ? "" : token}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}${age}`,
  );
}
export function createAuthentication(store) {
  const attempts = new Map();
  let running = 0;
  function throttle(ip) {
    const now = Date.now();
    for (const [key, times] of attempts) {
      const recent = times.filter((time) => now - time < 15 * 60 * 1000);
      if (recent.length) attempts.set(key, recent);
      else attempts.delete(key);
    }
    const recent = attempts.get(ip) || [];
    const total = [...attempts.values()].reduce(
      (sum, times) => sum + times.length,
      0,
    );
    if (recent.length >= 12 || total >= 100 || running >= 2)
      throw new AppError(
        "AUTH_RATE_LIMIT",
        "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
        429,
      );
    attempts.set(ip, [...recent, now]);
  }
  async function session(req) {
    const token = tokenFrom(req);
    if (!token) return null;
    const found = await store.auth.findSession(digest(token));
    return found ? { ...found, token, csrfToken: csrf(token) } : null;
  }
  function requireCsrf(req, current) {
    if (!equal(req.headers["x-nutribot-csrf"], current.csrfToken))
      throw new AppError(
        "CSRF_REJECTED",
        "Recarga la página antes de continuar.",
        403,
      );
  }
  return {
    session,
    requireCsrf,
    async route(req, res, url, context, readJson, json) {
      if (!url.pathname.startsWith("/api/auth/")) return false;
      const current = await session(req);
      if (url.pathname === "/api/auth/session" && req.method === "GET") {
        json(
          res,
          200,
          current
            ? {
                authenticated: true,
                profileId: current.profileId,
                csrfToken: current.csrfToken,
              }
            : {
                authenticated: false,
                canClaimLegacy:
                  context.local && (await store.auth.hasLegacyProfile()),
              },
        );
        return true;
      }
      if (req.method !== "POST")
        throw new AppError(
          "METHOD_NOT_ALLOWED",
          "Utiliza POST para esta acción.",
          405,
        );
      if (req.headers["x-nutribot-request"] !== "1")
        throw new AppError("CSRF_REJECTED", "Solicitud no autorizada.", 403);
      if (url.pathname === "/api/auth/logout") {
        if (current) {
          requireCsrf(req, current);
          await store.auth.deleteSession(digest(current.token));
        }
        setCookie(res, "", context.secure, false, true);
        json(res, 200, { authenticated: false });
        return true;
      }
      if (
        !["/api/auth/login", "/api/auth/register", "/api/auth/lookup"].includes(
          url.pathname,
        )
      )
        throw new AppError("NOT_FOUND", "Ruta no encontrada.", 404);
      throttle(context.ip);
      running++;
      try {
        const raw = await readJson(req, 4096);
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
          throw new AppError(
            "INVALID_REQUEST",
            "Revisa los datos del formulario.",
          );
        if (url.pathname === "/api/auth/lookup") {
          json(res, 200, {
            nextStep: (await store.auth.accountExists(raw.email))
              ? "login"
              : "register",
          });
          return true;
        }
        const id = url.pathname.endsWith("/register")
          ? await store.auth.register(raw, context.local)
          : await store.auth.login(raw);
        const token = randomBytes(32).toString("hex");
        const duration =
          raw.remember === true ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;
        await store.auth.createSession(
          id,
          digest(token),
          new Date(Date.now() + duration),
        );
        if (current) await store.auth.deleteSession(digest(current.token));
        setCookie(res, token, context.secure, raw.remember === true);
        json(res, 200, {
          authenticated: true,
          profileId: id,
          csrfToken: csrf(token),
        });
      } finally {
        running--;
      }
      return true;
    },
  };
}
