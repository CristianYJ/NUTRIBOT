import { requireRecipeNutrition, nutritionQuestion, hasCompleteNutrients, referenceChoices } from './nutrition-readiness.js';
import { createServer } from "node:http";
import { randomUUID } from 'node:crypto';
import { createAuthentication, requestContext } from "./auth.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, parseInput, preflight, eligibleIngredients } from "./recipes.js";
import { generateWithGemini, generateStructured } from "./gemini.js";
import { analyzePantry, pantryParts } from "./pantry.js";
import { profileRestrictions } from "../src/profile-rules.js";
import { validateRevision } from "./state-validation.js";
import { getUsdaFood, searchUsdaFoods, translateFoodQuery } from "./nutrition.js";
import { resolveAutomaticUsdaLinks, nutritionReferenceNotes } from './auto-nutrition.js';
import { createEdamam, edamamFilters, planEdamam, validateEdamamUri } from './edamam.js';
import { presentEdamamRecipe } from './edamam-presentation.js';
import { hydrateEdamamMeals } from './meals.js';

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
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
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
  usdaApiKey,
  edamamAppId,
  edamamAppKey,
  edamamFetch = fetch,
  edamamPlan = planEdamam,
  edamamPresent = presentEdamamRecipe,
  adminEmail,
  usdaFetch = fetch,
  model = "gemini-3.5-flash-lite",
  generate = generateWithGemini,
  requireCompleteNutrition = true,
  analyze = analyzePantry,
  serveStatic = false,
  store: rootStore,
  authentication = true,
  network = {},
} = {}) {
  if (authentication && (!rootStore?.auth || !rootStore?.forProfile))
    throw new Error("La autenticación requiere PostgreSQL actualizado.");
  const auth = authentication ? createAuthentication(rootStore) : null;
  const requests = new Map();
  const edamam = createEdamam({ appId: edamamAppId, appKey: edamamAppKey, fetchImpl: edamamFetch });
  let active = 0;
  const handler = async (req, res) => {
    let store = rootStore;
    let session = null;
    let recipeTrace = null;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    if (network.public) {
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
    }
    try {
      const context = requestContext(req, network);
      const url = new URL(req.url, context.origin);
      if (auth && (await auth.route(req, res, url, context, readJson, json)))
        return;
      if (
        auth &&
        url.pathname.startsWith("/api/") &&
        url.pathname !== "/api/health"
      ) {
        session = await auth.session(req);
        if (!session)
          throw new AppError(
            "UNAUTHORIZED",
            "Tu sesión terminó. Inicia sesión para continuar.",
            401,
          );
        if (
          req.headers["x-nutribot-account"] &&
          req.headers["x-nutribot-account"] !== String(session.profileId)
        )
          throw new AppError(
            "ACCOUNT_CHANGED",
            "La cuenta cambió en otra pestaña. Inicia sesión de nuevo.",
            401,
          );
        if (!["GET", "HEAD"].includes(req.method))
          auth.requireCsrf(req, session);
        store = rootStore.forProfile(session.profileId);
      }
      if (url.pathname.startsWith('/api/admin/')) {
        if (!session || !await rootStore?.isAdmin?.(session.profileId, adminEmail))
          throw new AppError('FORBIDDEN', 'Acceso administrativo no autorizado.', 403);
        if (req.method !== 'GET') throw new AppError('METHOD_NOT_ALLOWED', 'Utiliza GET.', 405);
        if (url.pathname === '/api/admin/access') return json(res, 200, { allowed: true });
        if (url.pathname === '/api/admin/summary') return json(res, 200, {
          ...await rootStore.adminSummary(),
          providers: { gemini: Boolean(apiKey), edamam: Boolean(edamamAppId && edamamAppKey), usda: Boolean(usdaApiKey) },
          model,
        });
        if (url.pathname === '/api/admin/events') return json(res, 200,
          await rootStore.listAdminEvents({ outcome: url.searchParams.get('outcome') || 'error', offset: Number(url.searchParams.get('offset') || 0) }));
        throw new AppError('NOT_FOUND', 'Ruta no encontrada.', 404);
      }
      const reserveUsage = async feature => {
        if (store?.reserveUsage) return store.reserveUsage(feature);
        if (authentication) throw new AppError('PLAN_UNAVAILABLE', 'No se pudo comprobar el cupo de tu plan.', 503);
        return null; // Explicit unauthenticated test fixtures only.
      };
      if (url.pathname === '/api/plan' && req.method === 'GET') {
        if (!store?.getUsage) throw new AppError('PLAN_UNAVAILABLE', 'No se pudo consultar tu plan.', 503);
        return json(res, 200, await store.getUsage());
      }
      if (url.pathname === '/api/meals/today' && req.method === 'GET') {
        const data = await store.getTodayMeals();
        const priorityDate = url.searchParams.get('priorityDate');
        return json(res,200,url.searchParams.get('includeEdamam') === '1' ? await hydrateEdamamMeals(data, uri => edamam.detail(uri), 6,
          /^\d{4}-\d{2}-\d{2}$/.test(priorityDate || '') ? priorityDate : data.date) : data);
      }
      if (url.pathname === '/api/meals/goal') {
        if(req.method!=='PUT') throw new AppError('METHOD_NOT_ALLOWED','Utiliza PUT.',405);
        return json(res,200,await store.setNutritionGoal((await readJson(req)).kcal));
      }
      const edamamMealRoute = url.pathname.match(/^\/api\/meals\/edamam\/([0-9a-f-]{36})$/i);
      if (edamamMealRoute && req.method === 'PUT') {
        const body = await readJson(req, 1000);
        const recipe = await edamam.detail(validateEdamamUri(body.uri));
        return json(res,200,await store.recordEdamamMeal(edamamMealRoute[1],{uri:recipe.uri,title:recipe.title,mealType:body.mealType}));
      }
      const mealRoute = url.pathname.match(/^\/api\/meals\/([^/]+)$/);
      if (mealRoute) {
        if (req.method === 'PUT') return json(res,200,await store.recordMeal(mealRoute[1],await readJson(req)));
        if (req.method === 'PATCH') return json(res,200,await store.rateMeal(mealRoute[1],(await readJson(req)).rating));
        if (req.method === 'DELETE') return json(res,200,await store.removeMeal(mealRoute[1]));
        throw new AppError('METHOD_NOT_ALLOWED','Método no permitido.',405);
      }
      if (url.pathname === "/api/connection" && req.method === "GET")
        return json(res, 200, {
          urls: network.urls || [],
          qrCodes: network.qrCodes || [],
          secure: Boolean(network.secure),
          public: Boolean(network.public),
        });
      if(url.pathname==='/api/chats'&&req.method==='GET')return json(res,200,await store.listChats(Number(url.searchParams.get('offset')||0)));
      const chatRoute=url.pathname.match(/^\/api\/chats\/([^/]+)$/);
      if(chatRoute){
        if(req.method==='GET')return json(res,200,await store.getChat(chatRoute[1]));
        if(req.method==='PUT')return json(res,200,await store.saveChat({...await readJson(req,6000000),id:chatRoute[1]}));
        throw new AppError('METHOD_NOT_ALLOWED','Utiliza GET o PUT para el chat.',405);
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        if (store?.health) await store.health();
        return json(res, 200, {
          configured: Boolean(apiKey),
          usdaConfigured: Boolean(usdaApiKey),
          edamamConfigured: Boolean(edamamAppId && edamamAppKey),
          provider: edamamAppId && edamamAppKey ? "edamam" : "gemini",
          model,
          database: store?.provider || (store ? "sqlite" : "disabled"),
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
      if (url.pathname === '/api/nutrition/search' && req.method === 'GET') {
        const key = 'usda:' + context.ip;
        const now = Date.now();
        const recent = (requests.get(key) || []).filter((time) => now - time < 60000);
        if (recent.length >= 20) throw new AppError('LOCAL_RATE_LIMIT', 'Espera un momento antes de volver a buscar alimentos.', 429);
        requests.set(key, [...recent, now]);
        return json(res, 200, { foods: await searchUsdaFoods(url.searchParams.get('q'), usdaApiKey, usdaFetch) });
      }
      if (url.pathname === '/api/edamam/favorites') {
        if (req.method === 'GET') return json(res, 200, { items: await store.listEdamamFavorites() });
        if (req.method === 'POST') { const body = await readJson(req, 1000); return json(res, 200, await store.saveEdamamFavorite(validateEdamamUri(body.uri), body.title)); }
        if (req.method === 'DELETE') { const body = await readJson(req, 1000); return json(res, 200, await store.removeEdamamFavorite(validateEdamamUri(body.uri))); }
        throw new AppError('METHOD_NOT_ALLOWED', 'Método no permitido.', 405);
      }
      if (url.pathname === '/api/edamam/detail' && req.method === 'GET') {
        let recipe = await edamam.detail(validateEdamamUri(url.searchParams.get('uri')));
        if (store?.getState) {
          const state = await store.getState();
          const required = edamamFilters({ profile: state.profile }).health;
          if (required.some(label => !recipe.healthLabels.some(actual => actual.toLowerCase() === label)))
            throw new AppError('PROFILE_RESTRICTION', 'Esta receta ya no coincide con las restricciones de tu perfil.', 409);
          const limits = Object.entries({ saturatedFatG: state.profile.maxSaturatedFatG,
            sodiumMg: state.profile.maxSodiumMg, sugarG: state.profile.maxSugarG }).filter(([, limit]) => Boolean(limit));
          if (limits.some(([name, limit]) => recipe.nutrientsPerServing[name] != null && recipe.nutrientsPerServing[name] > Number(limit)))
            throw new AppError('PROFILE_RESTRICTION', 'Esta receta supera un límite nutricional de tu perfil.', 409);
          recipe = { ...recipe, nutritionLimitsUnverified: limits.some(([name]) => recipe.nutrientsPerServing[name] == null) };
        }
        return json(res, 200, { recipe });
      }
      if (url.pathname === '/api/edamam/shopping' && req.method === 'POST') { const body = await readJson(req, 1000); return json(res, 200, await edamam.shopping(body.uri, body.servings)); }
      if (url.pathname === '/api/edamam/presentation' && req.method === 'POST') {
        const key = 'edamam-presentation:' + (session?.profileId || context.ip);
        const now = Date.now();
        const recent = (requests.get(key) || []).filter(time => now - time < 60000);
        if (recent.length >= 8) throw new AppError('LOCAL_RATE_LIMIT', 'Espera un momento antes de traducir más recetas.', 429);
        requests.set(key, [...recent, now]);
        const body = await readJson(req, 12000);
        return json(res, 200, await edamamPresent(body, { apiKey, model }));
      }
      const nutritionOptions = url.pathname.match(/^\/api\/nutrition\/ingredients\/([a-zA-Z0-9_-]+)\/options$/);
      if (nutritionOptions && req.method === 'GET') {
        const [item] = await store.getIngredientNutritionItems([nutritionOptions[1]]);
        if (!item) throw new AppError('NOT_FOUND', 'Ingrediente no encontrado.', 404);
        const state = await store.getState();
        return json(res, 200, nutritionQuestion(item, state.profile.allergies));
      }
      const nutritionSearch = url.pathname.match(/^\/api\/nutrition\/ingredients\/([a-zA-Z0-9_-]+)\/search$/);
      if (nutritionSearch && req.method === 'GET') {
        const key = 'usda:' + context.ip;
        const now = Date.now();
        const recent = (requests.get(key) || []).filter(time => now - time < 60000);
        if (recent.length >= 20) throw new AppError('LOCAL_RATE_LIMIT', 'Espera un momento antes de volver a buscar.', 429);
        requests.set(key, [...recent, now]);
        const [item] = await store.getIngredientNutritionItems([nutritionSearch[1]]);
        if (!item) throw new AppError('NOT_FOUND', 'Ingrediente no encontrado.', 404);
        const text = url.searchParams.get('q') || item.name;
        if (text.length > 100) throw new AppError('INVALID_QUERY', 'Usa un nombre de alimento más corto.');
        const query = nutritionQuestion(item).query && !url.searchParams.get('q')
          ? nutritionQuestion(item).query : await translateFoodQuery(text, { apiKey, model }, generateStructured);
        return json(res, 200, { query, foods: await searchUsdaFoods(query, usdaApiKey, usdaFetch) });
      }
      const nutritionRecipe = url.pathname.match(/^\/api\/nutrition\/recipes\/([a-zA-Z0-9_-]+)$/);
      if (nutritionRecipe && req.method === 'GET') {
        const servings = Number(url.searchParams.get('servings') || 1);
        const before = await store.getRecipeNutrition(nutritionRecipe[1], servings);
        const needsLookup = before.ingredients.some((item) => !item.usda || !Object.hasOwn(item.usda.nutrients || {}, 'fiber'));
        const lookup = await resolveAutomaticUsdaLinks(store, before.ingredients, usdaApiKey, usdaFetch);
        const current = needsLookup ? await store.getRecipeNutrition(nutritionRecipe[1], servings) : before;
        return json(res, 200, { ...current, lookup, referenceNotes: nutritionReferenceNotes(current.ingredients) });
      }
      const nutritionGrams = url.pathname.match(/^\/api\/nutrition\/recipes\/([a-zA-Z0-9_-]+)\/ingredients\/([a-zA-Z0-9_-]+)$/);
      if (nutritionGrams && req.method === 'PUT') {
        const body = await readJson(req, 1000);
        return json(res, 200, await store.setRecipeGrams(nutritionGrams[1], nutritionGrams[2], body.gramsPerPerson));
      }
      const nutritionLink = url.pathname.match(/^\/api\/nutrition\/ingredients\/([a-zA-Z0-9_-]+)\/usda$/);
      if (nutritionLink && req.method === 'PUT') {
        const body = await readJson(req, 1000);
        const key = 'usda:' + context.ip;
        const now = Date.now();
        const recent = (requests.get(key) || []).filter((time) => now - time < 60000);
        if (recent.length >= 20) throw new AppError('LOCAL_RATE_LIMIT', 'Espera un momento antes de consultar USDA otra vez.', 429);
        requests.set(key, [...recent, now]);
        if (body.confirmed !== true) throw new AppError('REVIEW_REQUIRED', 'Confirma que la ficha corresponde al alimento que utilizas.');
        const [item] = await store.getIngredientNutritionItems([nutritionLink[1]]);
        if (!item) throw new AppError('NOT_FOUND', 'Ingrediente no encontrado.', 404);
        const state = await store.getState();
        const option = referenceChoices(item.name).find(option => option.fdcId === body.fdcId);
        if (option?.allergen && state.profile.allergies.includes(option.allergen))
          throw new AppError('PROFILE_RESTRICTION', 'Esta opción no coincide con las alergias de tu perfil.');
        const food = await getUsdaFood(body.fdcId, usdaApiKey, usdaFetch);
        if (!hasCompleteNutrients(food)) throw new AppError('INCOMPLETE_NUTRIENTS', 'Esta ficha no trae todos los nutrientes necesarios. Elige otra ficha del mismo alimento o deja la preparación pendiente.');
        return json(res, 200, await store.setIngredientUsda(nutritionLink[1], food));
      }
      if (["/api/pantry/analyze", "/api/pantry/add"].includes(url.pathname)) {
        if (req.method !== "POST")
          throw new AppError(
            "METHOD_NOT_ALLOWED",
            "Utiliza POST para agregar ingredientes.",
            405,
          );
        if (url.pathname.endsWith("/add")) {
          if (!store?.addPantry)
            throw new AppError(
              "DATABASE_UNAVAILABLE",
              "Reinicia Nutribot para habilitar la nueva despensa.",
              503,
            );
          return json(
            res,
            200,
            await store.addPantry(await readJson(req, 30000)),
          );
        }
        const raw = await readJson(req, 4300000);
        pantryParts(raw); // Reject text and invalid photos before quota/provider calls.
        const now = Date.now(),
          key = "pantry:" + context.ip;
        for (const [key, times] of requests)
          if (!times.some((t) => now - t < 60000)) requests.delete(key);
        const recent = (requests.get(key) || []).filter((t) => now - t < 60000);
        if (recent.length >= 6 || active >= 2)
          throw new AppError(
            "LOCAL_RATE_LIMIT",
            "Espera un momento antes de analizar otra foto.",
            429,
          );
        requests.set(key, [...recent, now]);
        active++;
        let usageToken;
        const controller = new AbortController();
        const cancel = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on("close", cancel);
        try {
          usageToken = await reserveUsage('vision');
          if (res.destroyed) return;
          const result = await analyze(raw, {
            apiKey,
            model,
            signal: controller.signal,
          });
          if (!res.destroyed) {
            if (usageToken) await store.finishUsage(usageToken, result.items.length > 0);
            json(res, 200, result);
          }
        } finally {
          active--;
          res.off("close", cancel);
          if (usageToken) await store.finishUsage(usageToken, false);
        }
        return;
      }
      if (url.pathname === "/api/recipes/suggest") {
        if (req.method !== "POST")
          return json(res, 405, {
            error: "METHOD_NOT_ALLOWED",
            text: "Utiliza POST para solicitar recetas.",
          });
        recipeTrace = { requestId: randomUUID(), startedAt: Date.now(), stage: 'input', provider: edamamAppId && edamamAppKey ? 'edamam' : 'gemini' };
        if (authentication && (!edamamAppId || !edamamAppKey))
          throw new AppError('EDAMAM_UNCONFIGURED', 'Edamam aún no está configurado en este servidor. Pide al administrador que revise las claves.', 503);
        let raw = await readJson(req, 24000);
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
            previous: raw.mode === "more" ? state.generated : [],
            profile: {
              diet: state.profile.diet,
              allergies: state.profile.allergies,
              exclusions: state.profile.exclusions,
              medicalNotes: state.profile.medicalNotes,
              needsReview: profileRestrictions(state.profile, state.ingredients)
                .needsReview,
            },
          };
        }
        const input = parseInput(raw, state?.ingredients);
        Object.assign(recipeTrace, { message: input.message,
          previousMessage: [...input.history].reverse().find(item => item.role === 'user')?.text || null,
          mode: input.mode, maxTime: input.maxTime, pantryCount: input.pantry.length });
        if (state) input.nutritionLimits = {
          maxSaturatedFatG: state.profile.maxSaturatedFatG,
          maxSodiumMg: state.profile.maxSodiumMg,
          maxSugarG: state.profile.maxSugarG,
        };
        // Resolve recipe references against this account, never client-supplied recipe text.
        const contextIds = new Set(input.history.flatMap(message => message.recipeIds));
        const eligible = new Set(eligibleIngredients(input));
        input.discussedRecipes = (state?.generated || []).filter(recipe => contextIds.has(recipe.id) && recipe.ingredients.every(id => eligible.has(id))).slice(0, 3)
          .map(({ title, ingredients, amounts, steps }) => ({ title, ingredients, amounts, steps }));
        if (store?.getIngredientNutritionItems) {
          const items = [];
          for (let offset = 0; offset < input.pantry.length; offset += 28)
            items.push(...await store.getIngredientNutritionItems(input.pantry.slice(offset, offset + 28)));
          input.nutritionReferences = items.filter(item => hasCompleteNutrients(item.usda)).map(item => ({
            id: item.ingredientId, description: item.usda.description,
          }));
        }
        const stopped = preflight(input);
        if (stopped) {
          if (store?.recordAdminEvent) await store.recordAdminEvent({ ...recipeTrace, outcome: stopped.type, stage: 'preflight', recipeCount: 0, durationMs: Date.now() - recipeTrace.startedAt }).catch(() => {});
          recipeTrace = null;
          return json(res, 200, stopped);
        }
        const now = Date.now(),
          ip = context.ip;
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
        let usageToken;
        const controller = new AbortController();
        const cancel = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on("close", cancel);
        try {
          recipeTrace.stage = 'plan_limit';
          usageToken = await reserveUsage('recipes');
          if (res.destroyed) return;
          let result;
          if (edamamAppId && edamamAppKey) {
            recipeTrace.stage = 'gemini_intent';
            const plan = await edamamPlan(input, { apiKey, model, signal: controller.signal });
            if (plan.intent === 'recipe' && !plan.servings) {
              result = { type: 'conversation', source: 'gemini', recipes: [],
                text: '¿Para cuántas personas quieres cocinar? Puedes responder, por ejemplo, “2 personas”.' };
            } else if (plan.intent === 'recipe') {
              recipeTrace.stage = 'edamam_search';
              const found = await edamam.search(input, plan, controller.signal);
              result = { type: found.recipes.length ? 'success' : 'empty', source: 'edamam', recipes: [], externalRecipes: found.recipes, servings: plan.servings,
                text: found.recipes.length ? `Encontré ${found.recipes.length === 2 ? 'dos opciones distintas' : 'una opción'} para ${plan.servings} ${plan.servings === 1 ? 'persona' : 'personas'} en Edamam. Revisa los ingredientes y el enlace de preparación.` : 'No encontré recetas que cumplan los filtros. Prueba con otros ingredientes o más tiempo.' };
            } else result = { type: plan.intent === 'needs_review' ? 'review' : 'conversation', source: 'gemini', recipes: [], text: plan.reply || 'Cuéntame qué te gustaría cocinar.' };
          } else { recipeTrace.stage = 'gemini_recipe'; result = await generate(input, { apiKey, model, signal: controller.signal }); }
          if (!res.destroyed) {
            recipeTrace.stage = 'nutrition';
            if (!(edamamAppId && edamamAppKey) && requireCompleteNutrition && store?.getIngredientNutritionItems) {
              result = await requireRecipeNutrition(result, store, usdaApiKey, usdaFetch, state.profile, input.message, input.mode);
            }
            if (!(edamamAppId && edamamAppKey) && store?.screenGeneratedNutrition) result = await store.screenGeneratedNutrition(result, state.profile);
            // Only validated provider output enters history. An old response cannot
            // restore recipes after a reset or a change of profile in another tab.
            recipeTrace.stage = 'save';
            if (edamamAppId && edamamAppKey) {
              if (usageToken) await store.finishUsage(usageToken, Boolean(result.externalRecipes?.length));
              usageToken = null;
            } else if (store) await store.saveGenerated(result, state.revision, usageToken);
            if (store?.recordAdminEvent) await store.recordAdminEvent({ ...recipeTrace, provider: result.source, outcome: result.type,
              stage: 'complete', recipeCount: result.externalRecipes?.length || result.recipes?.length || 0,
              durationMs: Date.now() - recipeTrace.startedAt }).catch(() => {});
            recipeTrace = null;
            json(res, 200, result);
          }
        } finally {
          active--;
          res.off("close", cancel);
          if (usageToken) await store.finishUsage(usageToken, false);
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
        if (relative.startsWith("..") || path.isAbsolute(relative) || !mime[path.extname(target)])
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
          "Cache-Control": /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2|ttf|svg|png|jpe?g)$/.test(pathname)
            ? "public, max-age=31536000, immutable"
            : /^\/images\/landing\/[^/]+\.(?:svg|png|jpe?g)$/i.test(pathname)
              ? "public, max-age=3600"
              : "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(content);
        return;
      }
      json(res, 404, { error: "NOT_FOUND", text: "Ruta no encontrada." });
    } catch (error) {
      if (recipeTrace && store?.recordAdminEvent) {
        await store.recordAdminEvent({ ...recipeTrace, outcome: 'error', errorCode: error.code || 'INTERNAL_ERROR',
          reasons: error.validationIssues?.map(issue => issue.reason) || [],
          durationMs: Date.now() - recipeTrace.startedAt }).catch(() => {});
      }
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
          ...(recipeTrace ? { requestId: recipeTrace.requestId } : {}),
          text:
            error instanceof AppError
              ? error.message
              : "No se pudo procesar la solicitud.",
        });
    }
  };
  return createServer({ headersTimeout: 15000, requestTimeout: 30000, maxHeaderSize: 16384 }, handler);
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
