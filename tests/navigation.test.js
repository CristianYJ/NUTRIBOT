import test from "node:test";
import assert from "node:assert/strict";
import { readNavigation, navigationUrl } from "../src/navigation.js";
import { readChat, writeChat } from "../src/chat-session.js";

test("navigation survives reload and changing layout without dropping the page or other query parameters", () => {
  const current = new URL("http://localhost:5173/?mobile=1&test=yes#assistant");
  assert.deepEqual(readNavigation(current), { page: "assistant", mobile: true });
  const wide = navigationUrl(current, { page: "assistant", mobile: false });
  assert.deepEqual(readNavigation(wide), { page: "assistant", mobile: false });
  assert.equal(wide.searchParams.get("test"), "yes");
  assert.equal(navigationUrl(wide, { page: "profile", mobile: true }).hash, "#profile");
  assert.deepEqual(readNavigation(new URL("http://localhost/?mobile=0#planner")), { page: "home", mobile: false });
});

test("chat reload resolves recipes from the database and preserves the draft; removed recipes stay removed", () => {
  let raw;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  writeChat(storage, { messages: [{ id: "1", role: "bot", text: "Lista", recipes: [{ id: "recipe", title: "old" }] }], draft: "Arroz", maxTime: 15, busy: false });
  assert(!raw.includes('"title"'));
  const restored = readChat(storage, [{ id: "recipe", title: "from database" }]);
  assert.equal(restored.draft, "Arroz");
  assert.equal(restored.maxTime, 15);
  assert.equal(restored.messages[0].recipes[0].title, "from database");
  assert.deepEqual(readChat(storage, []).messages[0].recipes, []);
});

test("interrupted requests show a local notice and unavailable or corrupt session storage does not crash", () => {
  const interrupted = readChat({ getItem: () => JSON.stringify({ messages: [], busy: true }) }, []);
  assert.equal(interrupted.messages[0].source, "local");
  assert.match(interrupted.messages[0].text, /recargó/);
  assert.deepEqual(readChat({ getItem: () => "broken" }, []).messages, []);
  assert.equal(writeChat({ setItem: () => { throw Error("quota"); } }, { messages: [] }), false);
});
