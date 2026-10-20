import { randomUUID } from 'node:crypto';
import { planCatalog } from '../src/plan-catalog.js';
import { AppError } from './recipes.js';

export const usageTimezone = 'America/El_Salvador';
const day = 86400000;
// El Salvador uses UTC-6 throughout the year. Periods use calendar boundaries.
export function usageWindow(feature, now = new Date()) {
  if (!['recipes', 'vision'].includes(feature)) throw new Error('Unknown usage feature');
  const local = new Date(now.getTime() - 6 * 3600000);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), feature === 'vision' ? 1 : local.getUTCDate()));
  if (feature === 'recipes') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = feature === 'recipes' ? new Date(start.getTime() + 7 * day) : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { periodStart: start.toISOString().slice(0, 10), resetsAt: new Date(end.getTime() + 6 * 3600000).toISOString() };
}

export function createPlanUsage({ transaction, profileId }) {
  async function account(c, lock = false) {
    const { rows } = await c.query(`SELECT plan_code FROM profiles WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [profileId()]);
    const plan = planCatalog[rows[0]?.plan_code];
    if (!plan) throw new AppError('PLAN_UNAVAILABLE', 'No se pudo comprobar el plan de tu cuenta.', 503);
    const now = (await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
    return { plan, now };
  }
  async function counter(c, feature, plan, now) {
    const window = usageWindow(feature, now);
    const { rows } = await c.query(`SELECT count(*) FILTER (WHERE succeeded)::integer AS used,
      count(*) FILTER (WHERE NOT succeeded AND expires_at > $4)::integer AS pending
      FROM plan_usage WHERE profile_id=$1 AND feature=$2 AND period_start=$3::date`,
    [profileId(), feature, window.periodStart, now]);
    const { used, pending } = rows[0];
    return { ...window, limit: plan[feature], used, pending, remaining: Math.max(0, plan[feature] - used - pending) };
  }
  async function complete(c, token, success) {
    if (!token) return;
    if (!success) {
      await c.query('DELETE FROM plan_usage WHERE id=$1 AND profile_id=$2 AND NOT succeeded', [token, profileId()]);
      return;
    }
    const saved = await c.query(`UPDATE plan_usage SET succeeded=true
      WHERE id=$1 AND profile_id=$2 AND NOT succeeded AND expires_at>clock_timestamp() RETURNING id`, [token, profileId()]);
    if (!saved.rowCount) throw new AppError('USAGE_EXPIRED', 'La solicitud caducó. Vuelve a intentarlo; no se descontó un uso.', 409);
  }
  return {
    complete,
    getUsage: () => transaction(async c => {
      const { plan, now } = await account(c);
      return { plan: { code: plan.code, name: plan.name }, timezone: usageTimezone,
        recipes: await counter(c, 'recipes', plan, now), vision: await counter(c, 'vision', plan, now) };
    }, true),
    reserveUsage: feature => transaction(async c => {
      const { plan, now } = await account(c, true);
      const status = await counter(c, feature, plan, now);
      if (status.remaining === 0) {
        const what = feature === 'recipes' ? 'generaciones semanales de recetas' : 'análisis mensuales de fotos con Nutri-Vision';
        const date = new Intl.DateTimeFormat('es-SV', { timeZone: usageTimezone, dateStyle: 'long' }).format(new Date(status.resetsAt));
        throw new AppError('PLAN_LIMIT', `Tu plan ${plan.name} permite ${status.limit} ${what}. Tu cupo está usado o reservado por solicitudes en curso. Se renueva el ${date}.`, 429);
      }
      await c.query('DELETE FROM plan_usage WHERE profile_id=$1 AND NOT succeeded AND expires_at <= $2', [profileId(), now]);
      const id = randomUUID();
      await c.query(`INSERT INTO plan_usage(id,profile_id,feature,period_start,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6)`, [id, profileId(), feature, status.periodStart, now, new Date(now.getTime() + 5 * 60000)]);
      return id;
    }),
    finishUsage: (token, success) => transaction(async c => { await account(c, true); await complete(c, token, success); }),
  };
}
