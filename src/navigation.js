export const pageIds = ["home", "pantry", "assistant", "recipes", "profile", "admin"];

export function readNavigation(url) {
  const page = url.hash.slice(1);
  const recipeId = url.searchParams.get("recipe");
  const portions = Number(url.searchParams.get("servings"));
  return {
    page: pageIds.includes(page) ? page : "home",
    ...(/^[a-zA-Z0-9_-]{1,100}$/.test(recipeId || "") ? {
      recipeId,
      servings: Number.isInteger(portions) && portions >= 1 && portions <= 12 ? portions : 1,
    } : {}),
  };
}

export function navigationUrl(url, state) {
  const next = new URL(url);
  next.hash = pageIds.includes(state.page) ? state.page : "home";
  if (state.recipeId) {
    next.searchParams.set("recipe", state.recipeId);
    next.searchParams.set("servings", state.servings || 1);
  } else {
    next.searchParams.delete("recipe");
    next.searchParams.delete("servings");
  }
  return next;
}

export function openRecipeInHistory(browser, recipeId, servings = 1) {
  const current = readNavigation(new URL(browser.location.href));
  const replacing = Boolean(current.recipeId);
  const next = navigationUrl(browser.location.href, { ...current, recipeId, servings });
  // A direct recipe link has no underlying entry owned by the dialog.
  const entry = !replacing || browser.history.state?.recipeOverlay ? { recipeOverlay: true } : null;
  browser.history[replacing ? "replaceState" : "pushState"](entry, "", next);
  return readNavigation(next);
}

export function closeRecipeInHistory(browser) {
  if (browser.history.state?.recipeOverlay) {
    browser.history.back();
    return null; // popstate restores navigation, including the original chat page.
  }
  const next = navigationUrl(browser.location.href, { page: readNavigation(new URL(browser.location.href)).page });
  browser.history.replaceState(null, "", next);
  return readNavigation(next);
}
