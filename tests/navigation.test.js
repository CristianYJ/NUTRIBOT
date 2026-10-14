import test from "node:test";
import assert from "node:assert/strict";
import { readNavigation, navigationUrl, openRecipeInHistory, closeRecipeInHistory } from "../src/navigation.js";
import { readChat, writeChat } from "../src/chat-session.js";
import { validateChat } from "../server/chat.js";

test("long conversations retain early messages and enforce an explicit limit", () => {
  const messages = Array.from({ length: 200 }, (_, i) => ({
    id: String(i),
    role: "user",
    text: `Mensaje ${i}`,
  }));
  let raw;
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => {
      raw = value;
    },
  };
  writeChat(storage, { messages, draft: "", maxTime: 30, busy: false });
  const restored = readChat(storage, []);
  assert.equal(restored.messages.length, 200);
  assert.equal(restored.messages[0].text, "Mensaje 0");
  assert.equal(validateChat({ ...restored, revision: 0, busy: false }).messages.length, 200);
  assert.throws(() =>
    validateChat({
      ...restored,
      revision: 0,
      busy: false,
      messages: [...messages, { id: "201", role: "user", text: "Otro mensaje" }],
    }),
  );
});

test("navigation preserves the page and unrelated query parameters", () => {
  const current = new URL("http://localhost:5173/?test=yes#assistant");
  assert.deepEqual(readNavigation(current), {
    page: "assistant",
  });
  const wide = navigationUrl(current, { page: "assistant" });
  assert.deepEqual(readNavigation(wide), { page: "assistant" });
  assert.equal(wide.searchParams.get("test"), "yes");
  assert.equal(
    navigationUrl(wide, { page: "profile" }).hash,
    "#profile",
  );
  assert.deepEqual(
    readNavigation(new URL("http://localhost/#planner")),
    { page: "home" },
  );
});

function fakeBrowser(url) {
  const entries = [{url, state:null}];
  let index = 0;
  return {
    location: { get href() { return entries[index].url; } },
    history: {
      get state() { return entries[index].state; },
      get length() { return entries.length; },
      pushState(state, _, url) { entries.splice(++index); entries.push({url:String(url),state}); },
      replaceState(state, _, url) { entries[index] = {url:String(url),state}; },
      back() { if (index > 0) index--; },
      forward() { if (index < entries.length - 1) index++; },
    },
  };
}

test('Back closes a recipe on the same page; Forward reopens it and explicit closing consumes the entry', () => {
  const browser = fakeBrowser('https://nutribot.test/?launch=app#assistant');
  assert.deepEqual(openRecipeInHistory(browser,'ai-recipe',4),{page:'assistant',recipeId:'ai-recipe',servings:4});
  assert.equal(browser.history.length,2);
  browser.history.back(); // Mobile back gesture / browser back.
  assert.deepEqual(readNavigation(new URL(browser.location.href)),{page:'assistant'});
  assert.equal(new URL(browser.location.href).searchParams.get('launch'),'app');
  browser.history.forward();
  assert.equal(readNavigation(new URL(browser.location.href)).recipeId,'ai-recipe');
  assert.equal(closeRecipeInHistory(browser),null); // X / Escape uses the same entry.
  assert.deepEqual(readNavigation(new URL(browser.location.href)),{page:'assistant'});
  for (let i=0;i<3;i++) { openRecipeInHistory(browser,'ai-recipe',2); closeRecipeInHistory(browser); }
  assert.equal(browser.history.length,2); // No accumulation of closed overlays.
});

test('a directly opened recipe closes inside the app; changing its recipe does not claim a back entry', () => {
  const browser=fakeBrowser('https://nutribot.test/?recipe=first&servings=3#recipes');
  openRecipeInHistory(browser,'second',2);
  assert.equal(browser.history.length,1);
  assert.deepEqual(closeRecipeInHistory(browser),{page:'recipes'});
  assert.equal(new URL(browser.location.href).searchParams.has('recipe'),false);
  assert.deepEqual(readNavigation(new URL('https://nutribot.test/?recipe=ai-1&servings=999#assistant')),
    {page:'assistant',recipeId:'ai-1',servings:1});
  assert.deepEqual(readNavigation(new URL('https://nutribot.test/?recipe=%3Cscript%3E#assistant')),{page:'assistant'});
});

test("chat reload resolves recipes from the database and preserves the draft; removed recipes stay removed", () => {
  let raw;
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => {
      raw = value;
    },
  };
  writeChat(storage, {
    messages: [
      {
        id: "1",
        role: "bot",
        text: "Lista",
        recipes: [{ id: "recipe", title: "old" }],
      },
    ],
    draft: "Arroz",
    maxTime: 15,
    busy: false,
  });
  assert(!raw.includes('"title"'));
  const restored = readChat(storage, [
    { id: "recipe", title: "from database" },
  ]);
  assert.equal(restored.draft, "Arroz");
  assert.equal(restored.maxTime, 15);
  assert.equal(restored.messages[0].recipes[0].title, "from database");
  assert.deepEqual(readChat(storage, []).messages[0].recipes, []);
});

test("interrupted requests show a local notice and unavailable or corrupt session storage does not crash", () => {
  const interrupted = readChat(
    { getItem: () => JSON.stringify({ messages: [], busy: true }) },
    [],
  );
  assert.equal(interrupted.messages[0].source, "local");
  assert.match(interrupted.messages[0].text, /recargó/);
  assert.deepEqual(readChat({ getItem: () => "broken" }, []).messages, []);
  assert.equal(
    writeChat(
      {
        setItem: () => {
          throw Error("quota");
        },
      },
      { messages: [] },
    ),
    false,
  );
});

test("pantry photo stays in memory while ingredient confirmations survive a reload", () => {
  let raw;
  const storage = {
    getItem: () => raw,
    setItem: (_, value) => {
      raw = value;
    },
  };
  writeChat(storage, {
    messages: [
      {
        id: "photo",
        role: "user",
        text: "Agregué ingredientes",
        photo: "data:image/jpeg;base64,PRIVATE_PHOTO",
      },
      {
        id: "confirmation",
        role: "bot",
        text: "Despensa actualizada",
        ingredientNames: ["Tomate"],
      },
    ],
    draft: "",
    maxTime: 30,
    busy: false,
  });
  assert(!raw.includes("PRIVATE_PHOTO"));
  assert(!raw.includes('"photo":'));
  const restored = readChat(storage, []);
  assert.equal(restored.messages[0].photo, undefined);
  assert.deepEqual(restored.messages[1].ingredientNames, ["Tomate"]);
});
