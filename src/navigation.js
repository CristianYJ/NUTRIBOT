export const pageIds = ["home", "pantry", "assistant", "recipes", "profile"];

export function readNavigation(url) {
  const page = url.hash.slice(1);
  return {
    page: pageIds.includes(page) ? page : "home",
  };
}

export function navigationUrl(url, state) {
  const next = new URL(url);
  next.hash = pageIds.includes(state.page) ? state.page : "home";
  return next;
}
