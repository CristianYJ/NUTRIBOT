import test from "node:test";
import assert from "node:assert/strict";

test("install prompt is consumed once, supports retry and hides after installation", async () => {
  const originalWindow = globalThis.window;
  const handlers = {};
  globalThis.window = {
    isSecureContext: true,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (name, listener) => { handlers[name] = listener; },
  };
  try {
    const pwa = await import("../src/pwa.js?test=install");
    pwa.initializePwa();
    assert.equal(pwa.installStatus(), "manual");
    assert.equal(await pwa.promptInstall(), "manual");
    let prompted = 0;
    let prevented = 0;
    let updates = 0;
    const unsubscribe = pwa.subscribeInstall(() => { updates++; });
    const event = {
      preventDefault() { prevented++; },
      async prompt() { prompted++; },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    };
    handlers.beforeinstallprompt(event);
    assert.equal(prevented, 1);
    assert.equal(pwa.installStatus(), "prompt");
    assert.equal(await pwa.promptInstall(), "dismissed");
    assert.equal(pwa.installStatus(), "manual");
    assert.equal(await pwa.promptInstall(), "manual");
    assert.equal(prompted, 1);
    handlers.beforeinstallprompt({ ...event, userChoice: Promise.resolve({ outcome: "accepted" }) });
    assert.equal(await pwa.promptInstall(), "accepted");
    handlers.appinstalled();
    assert.equal(pwa.installStatus(), "installed");
    assert(updates >= 4);
    unsubscribe();
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("standalone launches suppress the install offer and plain HTTP has no offer", async () => {
  const originalWindow = globalThis.window;
  try {
    for (const [label, secure, standalone, expected] of [
      ["standalone", true, true, "installed"], ["http", false, false, "unavailable"],
    ]) {
      globalThis.window = {
        isSecureContext: secure,
        matchMedia: (query) => ({ matches: standalone && query.includes("standalone"), addEventListener() {} }),
        addEventListener() {},
      };
      const pwa = await import(`../src/pwa.js?test=${label}`);
      pwa.initializePwa();
      assert.equal(pwa.installStatus(), expected);
    }
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
