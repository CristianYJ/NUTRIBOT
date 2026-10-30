import test from "node:test";
import assert from "node:assert/strict";
import { landingSections, privacySectionIds, publicPage } from "../src/public-navigation.js";
import { jumpToPrivacySection } from "../src/privacy-navigation.js";
import {
  acceptSession,
  accountRequest,
  authenticatedFetch,
} from "../src/auth-api.js";

test("public sections stay on landing while account and protected routes require access", () => {
  for (const hash of ["", "#", ...landingSections.map((id) => "#" + id)])
    assert.equal(publicPage(hash), "landing");
  assert.equal(publicPage("#politica-privacidad"), "privacy");
  for (const id of privacySectionIds) assert.equal(publicPage("#" + id), "privacy");
  for (const hash of ["#auth", "#pantry", "#assistant", "#profile", "#recipes"])
    assert.equal(publicPage(hash), "auth");
});

test("privacy contents scroll to the section without leaving the privacy route", () => {
  const actions = [];
  const section = {
    scrollIntoView: options => actions.push(["scroll", options.block]),
    focus: options => actions.push(["focus", options.preventScroll]),
  };
  const context = {
    doc: { getElementById: id => id === "datos" ? section : null },
    navigation: { replaceState: (_state, _title, hash) => actions.push(["route", hash]) },
  };
  assert.equal(jumpToPrivacySection("datos", context), true);
  assert.deepEqual(actions, [["route", "#politica-privacidad"], ["scroll", "start"], ["focus", true]]);
  assert.equal(jumpToPrivacySection("pantry", context), false);
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
