import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  validatePassword,
} from "../server/passwords.js";
import { createAuthentication, requestContext } from "../server/auth.js";
import { ageFromBirthDate } from "../src/date-utils.js";
import { validateChat } from "../server/chat.js";
import { localAddresses, isPrivateIpv4 } from "../server/network.js";
test("passwords use independent salts, a costly scrypt hash, and constant-time verification", async () => {
  const password = "Una frase larga de prueba 2026";
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.match(a, /^scrypt\$131072\$8\$1\$/);
  assert(!a.includes(password));
  assert(await verifyPassword(password, a));
  assert(!(await verifyPassword("equivocada", a)));
  assert(!(await verifyPassword(password, null)));
  assert.throws(() => validatePassword("12345678"), {
    code: "INVALID_PASSWORD",
  });
});
test("age follows birthdays and rejects future, invalid, and excessive dates", () => {
  assert.equal(ageFromBirthDate("2000-09-29", "2026-09-28"), 25);
  assert.equal(ageFromBirthDate("2000-09-29", "2026-09-29"), 26);
  assert.equal(ageFromBirthDate("2001-02-29", "2026-09-28"), null);
  assert.equal(ageFromBirthDate("2027-01-01", "2026-09-28"), null);
  assert.equal(ageFromBirthDate("1800-01-01", "2026-09-28"), null);
});
test("LAN origins are explicit; remote clients cannot spoof localhost through headers", () => {
  const req = {
    socket: { remoteAddress: "192.168.1.20" },
    headers: {
      host: "192.168.1.10:8787",
      origin: "http://192.168.1.10:8787",
      "x-nutribot-client": "127.0.0.1",
      "x-nutribot-proxy": "wrong",
    },
  };
  const config = { hosts: ["192.168.1.10"], proxySecret: "internal" };
  assert.equal(requestContext(req, config).local, false);
  assert.throws(
    () =>
      requestContext(
        { ...req, headers: { ...req.headers, host: "evil.test:8787" } },
        config,
      ),
    { code: "FORBIDDEN" },
  );
  assert.throws(
    () =>
      requestContext(
        { ...req, headers: { ...req.headers, origin: "http://evil.test" } },
        config,
      ),
    { code: "FORBIDDEN" },
  );
  const proxied = {
    ...req,
    socket: { remoteAddress: "127.0.0.1" },
    headers: {
      ...req.headers,
      "x-nutribot-proxy": "internal",
      "x-nutribot-client": "192.168.1.20",
    },
  };
  assert.equal(requestContext(proxied, config).local, false);
});
test("QR URLs use only private non-loopback IPv4 interfaces", () => {
  assert(!isPrivateIpv4("8.8.8.8"));
  assert(!isPrivateIpv4("192.168.1.999"));
  assert(isPrivateIpv4("172.31.2.3"));
  assert(!isPrivateIpv4("172.32.1.1"));
  assert.deepEqual(
    localAddresses({
      wifi: [{ family: "IPv4", internal: false, address: "192.168.1.10" }],
      public: [{ family: "IPv4", internal: false, address: "8.8.8.8" }],
      loop: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
    }),
    ["192.168.1.10"],
  );
});
test("persisted conversation excludes photos, credentials and unsupported metadata", () => {
  const chat = validateChat({
    revision: 0,
    messages: [
      {
        id: "one",
        role: "user",
        text: "Mis alimentos",
        photo: "private-image",
        password: "secret",
        recipeIds: [],
      },
    ],
    draft: "",
    maxTime: 30,
    busy: false,
  });
  assert(!JSON.stringify(chat).includes("private-image"));
  assert(!JSON.stringify(chat).includes("secret"));
  assert.throws(
    () =>
      validateChat({ ...chat, messages: [chat.messages[0], chat.messages[0]] }),
    { code: "INVALID_CHAT" },
  );
});

test("authentication bounds concurrent requests before reading bodies and sets Secure for HTTPS", async () => {
  const auth = createAuthentication({
    auth: { register: async () => 2, createSession: async () => {} },
  });
  const req = { method: "POST", headers: { "x-nutribot-request": "1" } };
  const context = { ip: "192.168.1.20", local: false, secure: true };
  const path = { pathname: "/api/auth/register" };
  const cookies = [];
  const res = {
    setHeader: (name, value) => {
      if (name === "Set-Cookie") cookies.push(value);
    },
  };
  const releases = [];
  const read = () => new Promise((resolve) => releases.push(resolve));
  const pending = [
    auth.route(req, res, path, context, read, () => {}),
    auth.route(req, res, path, context, read, () => {}),
  ];
  await Promise.resolve();
  await assert.rejects(
    auth.route(
      req,
      res,
      path,
      context,
      async () => ({}),
      () => {},
    ),
    { code: "AUTH_RATE_LIMIT" },
  );
  for (const release of releases) release({});
  await Promise.all(pending);
  assert.equal(cookies.length, 2);
  assert(cookies.every((value) => value.includes("; Secure")));
});
