export function adminAccountQuery(browser) {
  const state = browser.history.state;
  return state?.adminAccountOverlay && typeof state.adminAccountQuery === 'string'
    ? state.adminAccountQuery : null;
}

export function openAdminAccount(browser, query) {
  const current = browser.history.state;
  const method = adminAccountQuery(browser) ? 'replaceState' : 'pushState';
  browser.history[method]({ ...current, adminAccountOverlay: true,
    adminAccountQuery: String(query) }, '', browser.location.href);
}

export function closeAdminAccount(browser) {
  if (!adminAccountQuery(browser)) return false;
  browser.history.back();
  return true;
}
