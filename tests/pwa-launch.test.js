import test from "node:test";
import assert from "node:assert/strict";
import { launchDestination, shouldShowWelcome } from "../src/pwa-launch.js";

test("installed launch shows welcome while website and deep links keep their destination", () => {
  const url = (suffix = "") => new URL("https://nutribot.example.com/" + suffix);
  assert.equal(shouldShowWelcome(url("?source=pwa#app")), true);
  assert.equal(shouldShowWelcome(url(), true), true);
  for (const path of ["", "?install=1", "#auth", "#welcome", "?source=pwa#pantry"])
    assert.equal(shouldShowWelcome(url(path)), false);
  assert.equal(shouldShowWelcome(url("#welcome"), true), false);
  assert.equal(shouldShowWelcome(url("#assistant"), true), false);
  assert.equal(launchDestination(url("?source=pwa&install=1#app")).href,
    "https://nutribot.example.com/?source=pwa#auth");
});
