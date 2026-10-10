import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { requestContext } from "../server/auth.js";
import { publicDeployment, connectionInfo } from "../server/network.js";
import { createAppServer } from "../server/app.js";

const secret = "a".repeat(64);
const origin = "https://nutribot.example.com";
const deployment = publicDeployment({ PUBLIC_ORIGIN: origin, NUTRIBOT_PROXY_SECRET: secret });
const network = { public: true, secure: true, proxySecret: secret, hosts: ["nutribot.example.com"], origins: [origin], urls: [origin] };
const headers = {
  host: "nutribot.example.com",
  origin,
  "x-nutribot-proxy": secret,
  "x-nutribot-client": "198.51.100.20",
  "x-nutribot-protocol": "https",
};
const request = (patch = {}) => ({ socket: { remoteAddress: "127.0.0.1" }, headers: { ...headers, ...patch } });

test("public deployment fails closed for incomplete configuration and keeps the LAN default", async () => {
  assert.equal(publicDeployment({}), null);
  for (const env of [
    { PUBLIC_ORIGIN: origin },
    { NUTRIBOT_PROXY_SECRET: secret },
    { PUBLIC_ORIGIN: "http://nutribot.example.com", NUTRIBOT_PROXY_SECRET: secret },
    { PUBLIC_ORIGIN: origin + "/wrong", NUTRIBOT_PROXY_SECRET: secret },
    { PUBLIC_ORIGIN: "https://user@nutribot.example.com", NUTRIBOT_PROXY_SECRET: secret },
    { PUBLIC_ORIGIN: "https://127.0.0.1", NUTRIBOT_PROXY_SECRET: secret },
    { PUBLIC_ORIGIN: origin, NUTRIBOT_PROXY_SECRET: "weak" },
  ]) assert.throws(() => publicDeployment(env), { code: "INVALID_PUBLIC_CONFIG" });
  assert.throws(() => publicDeployment({ PUBLIC_ORIGIN: origin, NUTRIBOT_PROXY_SECRET: secret }, true), { code: "INVALID_PUBLIC_CONFIG" });
  const info = await connectionInfo(8787, deployment);
  assert.deepEqual(info.urls, [origin]);
  assert.equal(info.public, true);
  assert.equal(info.secure, true);
  assert.equal(info.qrCodes[0].url, origin);
  assert.match(info.qrCodes[0].image, /^data:image\/png;base64,/);
});

test("public requests require the local authenticated HTTPS proxy and the exact origin", () => {
  assert.equal(requestContext(request(), network).ip, "198.51.100.20");
  for (const patch of [
    { "x-nutribot-proxy": undefined },
    { "x-nutribot-proxy": "wrong" },
    { "x-nutribot-protocol": "http" },
    { "x-nutribot-client": "" },
    { "x-nutribot-client": "198.51.100.20,127.0.0.1" },
    { host: "localhost" },
    { host: "nutribot.example.com:8787" },
    { origin: "http://localhost:5173" },
    { origin: "https://other.example.com" },
    { "sec-fetch-site": "cross-site" },
  ]) assert.throws(() => requestContext(request(patch), network), { code: "FORBIDDEN" });
  assert.throws(() => requestContext({ ...request(), socket: { remoteAddress: "198.51.100.20" } }, network), { code: "FORBIDDEN" });
  assert.equal(requestContext(request({ "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "http" }), network).local, false);
  assert.equal(requestContext(request({ "x-nutribot-client": "127.0.0.1" }), network).local, false);
  assert.equal(requestContext(request({ "x-nutribot-client": "2001:db8::20" }), network).secure, true);
  const navigation = { ...request({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), method: "GET" };
  assert.equal(requestContext(navigation, network).origin, origin);
  assert.throws(() => requestContext({ ...navigation, method: "POST" }, network), { code: "FORBIDDEN" });
});

test("public HTTP authentication sets Secure cookies, disables legacy claiming and preserves CSRF", async () => {
  let calls = 0;
  const store = {
    auth: {
      findSession: async () => ({ profileId: 2 }),
      login: async () => 2,
      createSession: async () => {},
      hasLegacyProfile: async () => { throw Error("Public requests cannot claim local profiles"); },
    },
    forProfile: () => ({}),
  };
  const server = createAppServer({ network, store, apiKey: "test-only", analyze: async () => { calls++; return { ingredients: [] }; } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function send(path, patch = {}, body) {
    // Unlike browser-style fetch, this sends the exact Host that Caddy forwards.
    return new Promise((resolve, reject) => {
      const req = httpRequest(base + path, { headers: { ...headers, ...patch }, method: body ? "POST" : "GET" }, (res) => {
        let content = "";
        res.setEncoding("utf8");
        res.on("data", (part) => { content += part; });
        res.on("end", () => resolve({ status: res.statusCode, headers: new Headers(res.headers), json: async () => JSON.parse(content) }));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  try {
    assert.equal((await send("/api/health", { "x-nutribot-proxy": "forged" })).status, 403);
    const session = await send("/api/auth/session");
    assert.deepEqual(await session.json(), { authenticated: false, canClaimLegacy: false });
    assert.match(session.headers.get("content-security-policy"), /script-src 'self'/);
    const login = await send("/api/auth/login", { "x-nutribot-request": "1", "content-type": "application/json" }, { email: "test@example.com", password: "test-only" });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /; HttpOnly; SameSite=Strict; Secure/);
    const { csrfToken } = await login.json();
    const authenticated = { cookie: cookie.split(";")[0], "content-type": "application/json" };
    assert.equal((await send("/api/pantry/analyze", authenticated, { text: "arroz" })).status, 403);
    const connection = await send("/api/connection", authenticated);
    const data = await connection.json();
    assert.equal(data.public, true);
    assert.deepEqual(data.urls, [origin]);
    assert(!JSON.stringify(data).includes(secret));
    // Two people behind Caddy have separate limits; spoofed forwarding headers cannot reset them.
    for (const ip of ["198.51.100.20", "198.51.100.21"]) {
      for (let n = 0; n < 7; n++) {
        const response = await send("/api/pantry/analyze", { ...authenticated, "x-nutribot-csrf": csrfToken, "x-nutribot-client": ip, "x-forwarded-for": `203.0.113.${n}` }, { text: "arroz" });
        assert.equal(response.status, n < 6 ? 200 : 429);
      }
    }
    assert.equal(calls, 12);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
