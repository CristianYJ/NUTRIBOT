import { AppError } from './recipes.js';
import { planCatalog } from '../src/plan-catalog.js';

// All privileges are checked against the database for every request. The UI is only a convenience.
export function createAdminAccountManagement({ transaction, pool }) {
  return {
    async adminRole(id) {
      if (!Number.isSafeInteger(id) || id < 1) return null;
      const row = (await pool.query('SELECT role_code FROM profiles WHERE id=$1 AND email IS NOT NULL', [id])).rows[0];
      return ['admin', 'goat'].includes(row?.role_code) ? row.role_code : null;
    },
    async manageAdminAccount({ actorId, accountId, role, plan }) {
      if (!Number.isSafeInteger(actorId) || !Number.isSafeInteger(accountId) || accountId < 1)
        throw new AppError('INVALID_REQUEST', 'Cuenta inválida.');
      if ((role === undefined) === (plan === undefined))
        throw new AppError('INVALID_REQUEST', 'Indica un solo cambio.');
      if (role !== undefined && !['user', 'admin'].includes(role))
        throw new AppError('INVALID_ROLE', 'Rol inválido.');
      if (plan !== undefined && !Object.hasOwn(planCatalog, plan))
        throw new AppError('INVALID_PLAN', 'Plan inválido.');
      return transaction(async c => {
        const actor = (await c.query('SELECT role_code FROM profiles WHERE id=$1 AND email IS NOT NULL FOR UPDATE', [actorId])).rows[0];
        if (actor?.role_code !== 'goat') throw new AppError('FORBIDDEN', 'Solo GOAT Mode puede modificar roles y planes.', 403);
        if (actorId === accountId) throw new AppError('FORBIDDEN', 'No puedes cambiar tu propio rol ni plan desde el portal.', 403);
        const target = (await c.query('SELECT role_code,plan_code FROM profiles WHERE id=$1 AND email IS NOT NULL FOR UPDATE', [accountId])).rows[0];
        if (!target) throw new AppError('ACCOUNT_NOT_FOUND', 'No se encontró la cuenta.', 404);
        if (target.role_code === 'goat') throw new AppError('FORBIDDEN', 'GOAT Mode se administra fuera del portal.', 403);
        await c.query("SELECT set_config('nutribot.actor_id',$1,true)", [String(actorId)]);
        if (role !== undefined && target.role_code !== role)
          await c.query('UPDATE profiles SET role_code=$1 WHERE id=$2', [role, accountId]);
        if (plan !== undefined && target.plan_code !== plan) {
          await c.query("SELECT set_config('nutribot.plan_change_reason',$1,true)", ['Cambio desde el portal administrativo']);
          await c.query('UPDATE profiles SET plan_code=$1,revision=revision+1,updated_at=now() WHERE id=$2', [plan, accountId]);
        }
        return { changed: role !== undefined ? target.role_code !== role : target.plan_code !== plan };
      });
    },
  };
}
