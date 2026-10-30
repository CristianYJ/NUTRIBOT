import test from 'node:test';
import assert from 'node:assert/strict';
import { adminAccountQuery, openAdminAccount, closeAdminAccount } from '../src/admin-account-history.js';

test('account detail owns one browser entry and Back restores the user list', () => {
  const entries = [null];
  let index = 0;
  const browser = { location: { href: 'https://nutribot.online/#admin' }, history: {
    get state() { return entries[index]; },
    pushState(state) { entries.splice(++index); entries[index] = state; },
    replaceState(state) { entries[index] = state; },
    back() { index = Math.max(0, index - 1); },
  } };
  assert.equal(adminAccountQuery(browser), null);
  openAdminAccount(browser, 3);
  assert.equal(adminAccountQuery(browser), '3');
  openAdminAccount(browser, 2);
  assert.equal(entries.length, 2);
  assert.equal(adminAccountQuery(browser), '2');
  assert.equal(closeAdminAccount(browser), true);
  assert.equal(adminAccountQuery(browser), null);
});
