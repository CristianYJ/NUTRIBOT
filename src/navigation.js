export const pageIds = ["home", "pantry", "assistant", "recipes", "profile"];

export function readNavigation(url) {
  const page = url.hash.slice(1);
  return {
    page: pageIds.includes(page) ? page : "home",
    mobile: url.searchParams.get("mobile") === "1",
  };
}

export function navigationUrl(url, state) {
  const next = new URL(url);
  next.hash = pageIds.includes(state.page) ? state.page : "home";
  if (state.mobile) next.searchParams.set("mobile", "1");
  else next.searchParams.delete("mobile");
  return next;
}
