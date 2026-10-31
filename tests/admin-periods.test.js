import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPeriodBuckets, adminPeriodYears, bucketMetrics, planMixTrend } from '../src/admin-periods.js';

test('admin periods use Guatemala calendar boundaries and annual year selection', () => {
  const now = new Date('2026-10-29T22:00:00Z');
  assert.equal(adminPeriodBuckets('week', now).length, 7);
  assert.equal(adminPeriodBuckets('month', now).length, 5);
  assert.equal(adminPeriodBuckets('quarter', now).length, 3);
  assert.equal(adminPeriodBuckets('year', now, 2026).length, 10);
  assert.deepEqual(adminPeriodYears(now), [2026]);
  assert.equal(adminPeriodBuckets('year', new Date('2027-02-01T12:00:00Z'), 2026).length, 12);
  assert.throws(() => adminPeriodBuckets('year', now, 2027));
});

test('plan mix is a snapshot at each month end, including free-to-paid changes', () => {
  const now = new Date('2026-10-29T22:00:00Z');
  const accounts = [{ id: 1, created_at: new Date('2026-08-05T14:00:00Z') },
    { id: 2, created_at: new Date('2026-09-10T14:00:00Z') }];
  const history = [{ profile_id: 1, to_plan: 'basico', changed_at: new Date('2026-08-05T14:00:00Z') },
    { profile_id: 1, to_plan: 'nutripro', changed_at: new Date('2026-10-15T14:00:00Z') },
    { profile_id: 2, to_plan: 'basico', changed_at: new Date('2026-09-10T14:00:00Z') }];
  const trend = planMixTrend(accounts, history, adminPeriodBuckets('quarter', now), now);
  assert.deepEqual(trend.map(point => [point.free, point.paid]), [[1, 0], [2, 0], [1, 1]]);
  const rolled = bucketMetrics([{ day: '2026-10-01', total: 2 }, { day: '2026-10-29', total: 3 }],
    adminPeriodBuckets('quarter', now), ['total']);
  assert.equal(rolled.at(-1).total, 5);
  const covered = bucketMetrics([{ day: '2026-10-29', total: 3 }], adminPeriodBuckets('quarter', now),
    ['total'], '2026-10-29');
  assert.equal(covered[0].total, null);
  assert.equal(covered.at(-1).total, 3);
});

test('plan trend separates NutriPro and NutriMax through plan changes', () => {
  const now = new Date('2026-10-29T22:00:00Z');
  const accounts = [1, 2, 3].map(id => ({ id, created_at: new Date('2026-08-05T14:00:00Z') }));
  const history = [
    { profile_id: 1, to_plan: 'nutripro', changed_at: new Date('2026-09-10T14:00:00Z') },
    { profile_id: 1, to_plan: 'nutripro_plus', changed_at: new Date('2026-10-15T14:00:00Z') },
    { profile_id: 2, to_plan: 'nutripro', changed_at: new Date('2026-10-10T14:00:00Z') },
  ];
  const trend = planMixTrend(accounts, history, adminPeriodBuckets('quarter', now), now);
  assert.deepEqual(trend.map(({ free, nutripro, nutrimax, paid }) => [free, nutripro, nutrimax, paid]),
    [[3, 0, 0, 0], [2, 1, 0, 1], [1, 1, 1, 2]]);
});
