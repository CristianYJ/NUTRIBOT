import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedPaymentPlan } from '../src/payment-return-status.js';

test('return page waits for provider confirmation and a matching account plan', () => {
  assert.equal(confirmedPaymentPlan({ state: 'pending', plan: 'nutripro' }, { plan: { code: 'basico' } }, 'nutripro'), false);
  assert.equal(confirmedPaymentPlan({ state: 'pending', plan: 'nutripro' }, { plan: { code: 'nutripro' } }, 'nutripro'), false);
  assert.equal(confirmedPaymentPlan({ state: 'active', plan: 'nutripro' }, { plan: { code: 'nutripro' } }, 'nutripro'), true);
  assert.equal(confirmedPaymentPlan({ state: 'active', plan: 'nutripro' }, { plan: { code: 'nutripro' } }, null), false);
  assert.equal(confirmedPaymentPlan({ state: 'none', upgrade: { state: 'active' } }, { plan: { code: 'nutripro_plus' } }, 'nutripro_plus'), true);
});
