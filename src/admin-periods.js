const dayMs = 86400000;
const guatemalaOffsetMs = 6 * 3600000;
const asDay = value => new Date(value).toISOString().slice(0, 10);
const localDate = now => new Date(now.getTime() - guatemalaOffsetMs);
const labelDate = (value, options) => new Intl.DateTimeFormat('es-GT', { timeZone: 'UTC', ...options }).format(value);

export const adminPeriods = Object.freeze({ week: 'Semanal', month: 'Mensual', quarter: 'Trimestral', year: 'Anual' });
export const adminPeriodYears = (now = new Date()) => {
  const current = localDate(now).getUTCFullYear();
  return Array.from({ length: Math.max(0, current - Math.max(2026, current - 5) + 1) }, (_, index) => current - index);
};

export function adminPeriodBuckets(period, now = new Date(), selectedYear = null) {
  if (!Object.hasOwn(adminPeriods, period)) throw new Error('Período administrativo inválido');
  const local = localDate(now);
  if (period === 'year' && selectedYear !== null && (!Number.isInteger(selectedYear) ||
      !adminPeriodYears(now).includes(selectedYear))) throw new Error('Año administrativo inválido');
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  if (period === 'week') return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(midnight - (6 - index) * dayMs);
    return { startDay: asDay(start), endDay: asDay(start), label: labelDate(start, { day: '2-digit', month: 'short' }) };
  });
  if (period === 'month') {
    const monday = midnight - ((local.getUTCDay() + 6) % 7) * dayMs;
    return Array.from({ length: 5 }, (_, index) => {
      const start = new Date(monday - (4 - index) * 7 * dayMs);
      return { startDay: asDay(start), endDay: asDay(new Date(start.getTime() + 6 * dayMs)),
        label: `Sem. ${labelDate(start, { day: '2-digit', month: 'short' })}` };
    });
  }
  const year = period === 'year' ? selectedYear ?? local.getUTCFullYear() : local.getUTCFullYear();
  const count = period === 'quarter' ? 3 : year === local.getUTCFullYear() ? local.getUTCMonth() + 1 : 12;
  return Array.from({ length: count }, (_, index) => {
    const start = period === 'year' ? new Date(Date.UTC(year, index, 1))
      : new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - (count - 1 - index), 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    return { startDay: asDay(start), endDay: asDay(end),
      label: labelDate(start, { month: 'short', year: period === 'year' ? undefined : 'numeric' }) };
  });
}

export function bucketMetrics(rows, buckets, keys, coverageStart = null) {
  return buckets.map(bucket => ({ label: bucket.label, day: bucket.endDay,
    ...Object.fromEntries(keys.map(key => [key, coverageStart && bucket.endDay < coverageStart ? null
      : rows.filter(row => row.day >= bucket.startDay && row.day <= bucket.endDay)
        .reduce((sum, row) => sum + (Number(row[key]) || 0), 0)])) }));
}

export function planMixTrend(accounts, history, buckets, now = new Date()) {
  const changes = new Map();
  for (const change of history) {
    const id = Number(change.profile_id);
    if (!changes.has(id)) changes.set(id, []);
    changes.get(id).push(change);
  }
  return buckets.map(bucket => {
    const end = Math.min(now.getTime(), new Date(`${bucket.endDay}T06:00:00.000Z`).getTime() + dayMs - 1);
    let free = 0, nutripro = 0, nutrimax = 0;
    for (const account of accounts) {
      if (new Date(account.created_at).getTime() > end) continue;
      const last = (changes.get(Number(account.id)) || []).filter(change => new Date(change.changed_at).getTime() <= end).at(-1);
      if (last?.to_plan === 'nutripro') nutripro++;
      else if (last?.to_plan === 'nutripro_plus') nutrimax++;
      else free++;
    }
    return { label: bucket.label, day: bucket.endDay, free, nutripro, nutrimax,
      paid: nutripro + nutrimax, total: free + nutripro + nutrimax };
  });
}
