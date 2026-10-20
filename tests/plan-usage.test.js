import test from 'node:test';
import assert from 'node:assert/strict';
import { usageWindow } from '../server/plan-usage.js';

test('recipe quota resets Monday at midnight in El Salvador, not at UTC midnight', () => {
  assert.deepEqual(usageWindow('recipes', new Date('2026-10-19T05:59:59Z')), { periodStart: '2026-10-12', resetsAt: '2026-10-19T06:00:00.000Z' });
  assert.deepEqual(usageWindow('recipes', new Date('2026-10-19T06:00:00Z')), { periodStart: '2026-10-19', resetsAt: '2026-10-26T06:00:00.000Z' });
  assert.equal(usageWindow('recipes', new Date('2027-01-01T12:00:00Z')).periodStart, '2026-12-28');
});
test('photo quota uses calendar months including leap years and December rollover', () => {
  assert.deepEqual(usageWindow('vision', new Date('2028-03-01T05:59:59Z')), { periodStart: '2028-02-01', resetsAt: '2028-03-01T06:00:00.000Z' });
  assert.deepEqual(usageWindow('vision', new Date('2027-01-01T06:00:00Z')), { periodStart: '2027-01-01', resetsAt: '2027-02-01T06:00:00.000Z' });
});
