import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createWompi, verifyWompiWebhook } from '../server/wompi.js';
import { createAppServer } from '../server/app.js';

test('Wompi webhook signature covers the exact raw body', () => {
  const raw = Buffer.from('{"IdTransaccion":"x"}');
  const signature = createHmac('sha256', 'private-key').update(raw).digest('hex');
  assert.equal(verifyWompiWebhook(raw, signature, 'private-key'), true);
  assert.equal(verifyWompiWebhook(Buffer.from('{ "IdTransaccion":"x"}'), signature, 'private-key'), false);
  assert.equal(verifyWompiWebhook(raw, signature.slice(1), 'private-key'), false);
});

test('recurring checkout uses server prices and OAuth credentials', async () => {
  const calls = [];
  const api = createWompi({ appId: 'app-id', secret: 'private-key', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.includes('/connect/token')
      ? Response.json({ access_token: 'token', expires_in: 3600 })
      : url.endsWith('/Aplicativo') ? Response.json({ idAplicativo: 'app-id', estaProductivo: false })
      : Response.json({ idEnlace: 'link-id', urlEnlace: 'https://lk.wompi.sv/abc', estaProductivo: false });
  } });
  const link = await api.createRecurringLink({ plan: 'nutripro_plus', day: 12 });
  assert.equal(link.id, 'link-id');
  assert.equal(new URLSearchParams(calls[0].options.body).get('audience'), 'wompi_api');
  assert.equal(calls[1].url, 'https://api.wompi.sv/Aplicativo');
  assert.equal(JSON.parse(calls[2].options.body).monto, 9.99);
  assert.equal(JSON.parse(calls[2].options.body).diaDePago, 12);
  assert.equal(calls[2].options.headers.Authorization, 'Bearer token');
});

test('a productive business cannot create a recurring prototype link', async () => {
  const calls = [];
  const api = createWompi({ appId: 'app-id', secret: 'private-key', fetchImpl: async (url) => {
    calls.push(url);
    return url.includes('/connect/token') ? Response.json({ access_token: 'token', expires_in: 3600 })
      : Response.json({ idAplicativo: 'app-id', estaProductivo: true });
  } });
  await assert.rejects(api.createRecurringLink({ plan: 'nutripro', day: 5 }), { code: 'PAYMENTS_UNAVAILABLE' });
  assert.equal(calls.some(url => url.endsWith('/EnlacePagoRecurrente')), false);
});

test('one-time upgrade link fixes amount, single use and webhook; old link is disabled', async () => {
  const calls = [];
  const api = createWompi({ appId: 'app-id', secret: 'private-key', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/connect/token')) return Response.json({ access_token: 'token', expires_in: 3600 });
    if (url.endsWith('/Aplicativo')) return Response.json({ idAplicativo: 'app-id', estaProductivo: false });
    if (url.endsWith('/EnlacePago')) return Response.json({ idEnlace: 42, urlEnlace: 'https://lk.wompi.sv/adjust', estaProductivo: false });
    return Response.json({ estaActivo: false });
  } });
  const expiry = new Date(Date.now() + 600_000);
  const link = await api.createOneTimeLink({ reference: 'nutribot-upgrade:12345678-1234-1234-1234-123456789abc',
    amountCents: 350, expiresAt: expiry, webhookUrl: 'https://nutribot.online/api/billing/wompi/webhook' });
  assert.equal(link.id, '42');
  const body = JSON.parse(calls.find(call => call.url.endsWith('/EnlacePago')).options.body);
  assert.equal(body.monto, 3.5);
  assert.equal(body.limitesDeUso.cantidadMaximaPagosExitosos, 1);
  assert.equal(body.configuracion.urlWebhook, 'https://nutribot.online/api/billing/wompi/webhook');
  assert.equal(body.vigencia.fechaFin, expiry.toISOString());
  await api.disableRecurringLink('old-link');
  assert.equal(calls.at(-1).url, 'https://api.wompi.sv/EnlacePagoRecurrente/old-link');
  assert.equal(calls.at(-1).options.method, 'POST');
});

test('local HTTPS tunnel host accepts only a signed Wompi webhook', async t => {
  const recorded = [];
  const welcomed = [];
  const server = createAppServer({ authentication: false, store: {
    recordWompiPayment: async event => { recorded.push(event.IdTransaccion); return { applied: true,
      welcome: { to: 'customer@example.test', name: 'Customer', plan: 'nutripro' } }; },
  }, network: {}, wompiAppId: 'app-id', wompiApiSecret: 'private-key', wompiRecurringEnabled: true,
  wompiWebhookUrl: 'https://test-tunnel.example/api/billing/wompi/webhook',
  sendPlanWelcomeEmail: async message => { welcomed.push(message); },
  wompiFetch: async url => url.includes('/connect/token')
    ? Response.json({ access_token: 'token', expires_in: 3600 })
    : Response.json({ idTransaccion: '12345678-1234-1234-1234-123456789abc', esAprobada: true, esReal: false, monto: 2.99 }),
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const send = (path, signature) => new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ Aplicativo: { Id: 'app-id' }, Cantidad: 1,
      IdTransaccion: '12345678-1234-1234-1234-123456789abc' }));
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method: 'POST',
      headers: { Host: 'test-tunnel.example', 'Content-Type': 'application/json',
        ...(signature ? { Wompi_Hash: createHmac('sha256', 'private-key').update(body).digest('hex') } : {}) } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end(body);
  });
  assert.equal(await send('/api/billing/wompi/webhook', false), 401);
  assert.equal(await send('/api/billing/wompi/webhook', true), 200);
  assert.equal(await send('/api/billing/status', true), 403);
  assert.deepEqual(recorded, ['12345678-1234-1234-1234-123456789abc']);
  assert.deepEqual(welcomed, [{ to: 'customer@example.test', name: 'Customer', plan: 'nutripro' }]);
});
