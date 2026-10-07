import test from "node:test";
import assert from "node:assert/strict";
import { landingSections, publicPage } from "../src/public-navigation.js";
import {
  acceptSession,
  accountRequest,
  authenticatedFetch,
} from "../src/auth-api.js";

test("public sections stay on landing while account and protected routes require access", () => {
  for (const hash of ["", "#", ...landingSections.map((id) => "#" + id)])
    assert.equal(publicPage(hash), "landing");
  for (const hash of ["#auth", "#pantry", "#assistant", "#profile", "#recipes"])
    assert.equal(publicPage(hash), "auth");
});

test("checking an email does not replace an existing session or its CSRF token", async (t) => {
  const originalFetch = globalThis.fetch,
    requests = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    acceptSession(null);
  });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(
      JSON.stringify(url.endsWith("/lookup") ? { nextStep: "login" } : {}),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  acceptSession({ profileId: 123, csrfToken: "test-csrf-token" });
  assert.deepEqual(
    await accountRequest("lookup", { email: "test@example.test" }),
    { nextStep: "login" },
  );
  await authenticatedFetch("/api/state", { method: "PUT" });
  assert.equal(requests[1].options.headers.get("X-Nutribot-Account"), "123");
  assert.equal(
    requests[1].options.headers.get("X-Nutribot-CSRF"),
    "test-csrf-token",
  );
});
