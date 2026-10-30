import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server/app.js';
import { diagnosticExcerpt } from '../server/admin-diagnostics.js';
import { AppError } from '../server/recipes.js';
import { ingredients } from '../src/data.js';

const start = async (t, options) => {
  const server = createAppServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
};
test('diagnostic excerpts hide contact information and stay bounded', () => {
  const excerpt = diagnosticExcerpt(`Escríbeme a lazaro@example.com y al +502 5555 1234. ${'receta '.repeat(70)}`);
  assert.equal(excerpt.includes('lazaro@example.com'), false);
  assert.equal(excerpt.includes('5555 1234'), false);
  assert.ok(excerpt.length <= 300);
});
test('admin endpoints require the signed-in allowlisted account', async t => {
  let permitted = false;
  const store = {
    auth: { findSession: async () => ({ profileId: 7 }) },
    forProfile: () => ({}),
    isAdmin: async (id, email) => { assert.equal(id, 7); assert.equal(email, 'admin@example.test'); return permitted; },
    adminSummary: async () => ({ total24h: 0 }),
    findAdminAccount: async query => ({ account: { id: 7, email: query }, recent: [] }),
  };
  const base = await start(t, { store, adminEmail: 'admin@example.test' });
  const headers = { Cookie: `nutribot_session=${'a'.repeat(64)}` };
  assert.equal((await fetch(base + '/api/admin/summary')).status, 401);
  assert.equal((await fetch(base + '/api/admin/summary', { headers })).status, 403);
  permitted = true;
  const response = await fetch(base + '/api/admin/summary', { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).total24h, 0);
  assert.equal((await fetch(base + '/api/admin/account?q=admin@example.test')).status, 401);
  assert.deepEqual((await (await fetch(base + '/api/admin/account?q=admin@example.test', { headers })).json()).account,
    { id: 7, email: 'admin@example.test' });
});
test('failed recipe request records safe validation reasons and returns a trace reference', async t => {
  const events = [];
  const store = { getState: async () => ({ revision: 0, pantry: ['arroz'], ingredients,
    profile: { diet: 'Sin preferencia', allergies: [], exclusions: '', needsReview: false }, generated: [] }),
    recordAdminEvent: async event => { events.push(event); } };
  const base = await start(t, { authentication: false, store, generate: async () => {
    const error = new AppError('INVALID_AI_OUTPUT', 'No pude completar una receta válida.', 502);
    error.validationIssues = [{ reason: 'UNDECLARED_SEASONING' }];
    throw error;
  } });
  const response = await fetch(base + '/api/recipes/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: 0, maxTime: 30, message: '2 personas', history: [{ role: 'user', text: 'Cena mexicana' }] }) });
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.match(result.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(events.length, 1);
  assert.equal(events[0].requestId, result.requestId);
  assert.equal(events[0].stage, 'gemini_recipe');
  assert.deepEqual(events[0].reasons, ['UNDECLARED_SEASONING']);
  assert.equal(events[0].message, '2 personas');
  assert.equal(events[0].previousMessage, 'Cena mexicana');
});
