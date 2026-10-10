import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const publicFile = (name) => new URL("../public/" + name, import.meta.url);
const source = await readFile(publicFile("sw.js"), "utf8");

function worker(fetcher = async () => new Response("current version")) {
  const handlers = {};
  const cached = [];
  const deleted = [];
  const cache = {
    addAll: async (files) => cached.push(...files),
    match: async (name) => name === "/offline.html" ? new Response("public offline notice") : undefined,
  };
  vm.runInNewContext(source, {
    URL, Response, fetch: fetcher,
    self: {
      location: { origin: "https://nutribot.example.com" },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => ["nutribot-offline-v1", "nutribot-offline-v2", "unrelated-cache"],
      delete: async (key) => deleted.push(key),
    },
  });
  return { handlers, cached, deleted };
}

function request(worker, pathname, options = {}) {
  let result;
  worker.handlers.fetch({
    request: { url: new URL(pathname, "https://nutribot.example.com").href,
      method: "GET", mode: "navigate", ...options },
    respondWith: (promise) => { result = promise; },
  });
  return result;
}

test("PWA does not intercept private API requests, writes or other origins", () => {
  const sw = worker(() => { throw Error("Unexpected fetch"); });
  for (const path of ["/api", "/api/auth/session", "/api/state", "/api/chats?offset=0", "/api/pantry/add"])
    assert.equal(request(sw, path), undefined);
  assert.equal(request(sw, "/", { method: "POST" }), undefined);
  assert.equal(request(sw, "https://other.example.com/"), undefined);
  assert.equal(request(sw, "/assets/app.js", { mode: "cors" }), undefined);
});

test("PWA navigation always uses the current server response and preserves rejection responses", async () => {
  let calls = 0;
  const sw = worker(async () => new Response(String(++calls)));
  assert.equal(await (await request(sw, "/")).text(), "1");
  assert.equal(await (await request(sw, "/?install=1")).text(), "2");
  assert.deepEqual(sw.cached, []);
  const blocked = worker(async () => new Response("Forbidden", { status: 403 }));
  assert.equal((await request(blocked, "/")).status, 403);
});

test("PWA shows only the public fallback on network/server failure", async () => {
  for (const fetcher of [async () => { throw new TypeError("offline"); }, async () => new Response("error", { status: 503 })]) {
    const sw = worker(fetcher);
    assert.equal(await (await request(sw, "/?install=1")).text(), "public offline notice");
  }
});

test("PWA installation caches only public fallback assets and leaves unrelated caches alone", async () => {
  const sw = worker();
  let pending;
  const event = { waitUntil: (promise) => { pending = promise; } };
  sw.handlers.install(event);
  await pending;
  assert.deepEqual(sw.cached, ["/offline.html", "/pwa/icon-192.png"]);
  sw.handlers.activate(event);
  await pending;
  assert.deepEqual(sw.deleted, ["nutribot-offline-v1"]);
});

test("install manifest points to actual correctly sized PNG icons within its scope", async () => {
  const manifest = JSON.parse(await readFile(publicFile("manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/?source=pwa#app");
  assert.equal(manifest.scope, "/");
  assert(manifest.icons.some((icon) => icon.purpose === "maskable"));
  for (const icon of manifest.icons) {
    const data = await readFile(publicFile(icon.src.slice(1)));
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
  }
});
