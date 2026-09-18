import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, parseInput, preflight } from "./recipes.js";
import { generateWithGemini } from "./gemini.js";
import { validateRevision } from "./state-validation.js";

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
};
export function createAppServer({
  apiKey,
  model = "gemini-3.5-flash-lite",
  generate = generateWithGemini,
  serveStatic = false,
  store,
} = {}) {
  const requests = new Map();
  let active = 0;
  return createServer(async (req, res) => {
    try {
      const host = req.headers.host || "";
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host))
        throw new AppError("FORBIDDEN", "Host no autorizado.", 403);
      const origin = req.headers.origin;
      if (
        origin &&
        ![
          "http://127.0.0.1:5173",
          "http://localhost:5173",
          `http://${host}`,
        ].includes(origin)
      )
        throw new AppError("FORBIDDEN", "Origen no autorizado.", 403);
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new AppError("FORBIDDEN", "Origen no autorizado.", 403);
      const url = new URL(req.url, `http://${host}`);
      if (req.method === "GET" && url.pathname === "/api/health") {
        if (store?.health) await store.health();
        return json(res, 200, {
          configured: Boolean(apiKey),
          provider: "gemini",
          model,
          database: store?.provider || (store ? "sqlite" : "disabled"),
        });
      }
      if (
        url.pathname === "/api/summary" &&
        req.method === "GET" &&
        store?.summary
      )
        return json(res, 200, await store.summary());
      if (url.pathname === "/api/plan" && store?.getPlan) {
        if (req.method === "GET") return json(res, 200, await store.getPlan());
        if (req.method === "POST")
          return json(res, 201, await store.addPlan(await readJson(req)));
        if (req.method === "DELETE")
          return json(
            res,
            200,
            await store.removePlan((await readJson(req)).id),
          );
        return json(res, 405, {
          error: "METHOD_NOT_ALLOWED",
          text: "Método no permitido.",
        });
      }
      if (url.pathname === "/api/state") {
        if (!store)
          throw new AppError(
            "DATABASE_UNAVAILABLE",
            "La base de datos no está disponible.",
            503,
          );
        if (req.method === "GET") return json(res, 200, await store.getState());
        if (!["PUT", "DELETE"].includes(req.method))
          return json(res, 405, {
            error: "METHOD_NOT_ALLOWED",
            text: "Método no permitido.",
          });
        const raw = await readJson(req);
        if (req.method === "PUT")
          return json(res, 200, await store.saveState(raw));
        return json(res, 200, await store.reset(raw.revision));
      }
      if (url.pathname === "/api/recipes/suggest") {
        if (req.method !== "POST")
          return json(res, 405, {
            error: "METHOD_NOT_ALLOWED",
            text: "Utiliza POST para solicitar recetas.",
          });
        let raw = await readJson(req, 12000);
        let state;
        if (store) {
          validateRevision(raw?.revision);
          state = await store.getState();
          if (state.revision !== raw.revision)
            throw new AppError(
              "STATE_CONFLICT",
              "Los datos cambiaron. Recarga la versión guardada antes de generar.",
              409,
            );
          raw = {
            ...raw,
            pantry: state.pantry,
            profile: {
              diet: state.profile.diet,
              allergies: state.profile.allergies,
              needsReview: Boolean(
                state.profile.exclusions.trim() ||
                  state.profile.medicalNotes.trim(),
              ),
            },
          };
        }
        const input = parseInput(raw);
        const stopped = preflight(input);
        if (stopped) return json(res, 200, stopped);
        const now = Date.now(),
          ip = req.socket.remoteAddress;
        for (const [key, times] of requests)
          if (!times.some((t) => now - t < 60000)) requests.delete(key);
        const recent = (requests.get(ip) || []).filter((t) => now - t < 60000);
        if (recent.length >= 6 || active >= 2)
          throw new AppError(
            "LOCAL_RATE_LIMIT",
            "Espera un momento antes de pedir otra receta.",
            429,
          );
        requests.set(ip, [...recent, now]);
        active++;
        const controller = new AbortController();
        const cancel = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on("close", cancel);
        try {
          const result = await generate(input, {
            apiKey,
            model,
            signal: controller.signal,
          });
          if (!res.destroyed) {
            // Only validated provider output enters history. An old response cannot
            // restore recipes after a reset or a change of profile in another tab.
            if (store) await store.saveGenerated(result, state.revision);
            json(res, 200, result);
          }
        } finally {
          active--;
          res.off("close", cancel);
        }
        return;
      }
      if (
        serveStatic &&
        req.method === "GET" &&
        !url.pathname.startsWith("/api/")
      ) {
        const pathname = decodeURIComponent(url.pathname);
        if (
          pathname.split("/").some((p) => p.startsWith(".")) ||
          pathname.includes("\\")
        )
          throw new AppError("NOT_FOUND", "No encontrado.", 404);
        const target = path.resolve(
          dist,
          "." + (pathname === "/" ? "/index.html" : pathname),
        );
        const relative = path.relative(dist, target);
        if (relative.startsWith("..") || path.isAbsolute(relative))
          throw new AppError("NOT_FOUND", "No encontrado.", 404);
        let content;
        try {
          content = await readFile(target);
        } catch {
          throw new AppError(
            "NOT_FOUND",
            "No encontrado. Ejecuta npm run build antes de iniciar.",
            404,
          );
        }
        res.writeHead(200, {
          "Content-Type":
            mime[path.extname(target)] || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(content);
        return;
      }
      json(res, 404, { error: "NOT_FOUND", text: "Ruta no encontrada." });
    } catch (error) {
      if (!(error instanceof AppError) && store?.provider === "postgresql") {
        const constraint = [
          "23502",
          "23503",
          "23505",
          "23514",
          "22001",
          "22P02",
        ].includes(error.code);
        error = new AppError(
          constraint ? "INVALID_DATA" : "DATABASE_UNAVAILABLE",
          constraint
            ? "Los datos no cumplen las reglas de la base. Revisa los campos y vuelve a intentar."
            : "No se pudo completar la operación. Comprueba que PostgreSQL esté disponible y vuelve a intentar.",
          constraint ? 400 : 503,
        );
      }
      if (!res.destroyed && !res.headersSent)
        json(res, error instanceof AppError ? error.status : 500, {
          error: error instanceof AppError ? error.code : "INTERNAL_ERROR",
          text:
            error instanceof AppError
              ? error.message
              : "No se pudo procesar la solicitud.",
        });
    }
  });
}

async function readJson(req, limit = 150000) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new AppError(
      "CONTENT_TYPE",
      "La solicitud debe tener formato JSON.",
      415,
    );
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new AppError(
        "BODY_TOO_LARGE",
        "La solicitud es demasiado grande.",
        413,
      );
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new AppError("INVALID_JSON", "La solicitud no es un JSON válido.");
  }
}
