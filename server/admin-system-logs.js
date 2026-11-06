import { AppError } from './recipes.js';

const categories = new Set(['all', 'server', 'roles', 'plans', 'http', 'api', 'recipes']);
const kinds = new Set(['server_started', 'server_stopped', 'request_error']);

export function createAdminSystemLogs({ transaction }) {
  return {
    recordSystemEvent(kind, severity = 'info', code = null) {
      if (!kinds.has(kind) || !['info', 'warning', 'error'].includes(severity) ||
          (code !== null && !/^[A-Z_]{2,80}$/.test(code))) return Promise.resolve();
      return transaction(async client => {
        await client.query("DELETE FROM admin_system_events WHERE created_at < now() - interval '30 days'");
        await client.query('INSERT INTO admin_system_events(kind,severity,code) VALUES($1,$2,$3)',
          [kind, severity, code]);
      });
    },
    listSystemLogs({ days = 7, category = 'all', offset = 0, limit = 50 } = {}) {
      if (![1, 7, 30].includes(days) || !categories.has(category) ||
          !Number.isInteger(offset) || offset < 0 || offset > 10000 ||
          !Number.isInteger(limit) || limit < 1 || limit > 500)
        throw new AppError('INVALID_FILTER', 'Filtro de registros inválido.');
      return transaction(async client => {
        const rows = (await client.query(`SELECT * FROM (
          SELECT 'server' AS category,id::text AS reference,kind AS action,severity,
            NULL::text AS actor,NULL::bigint AS account_id,code AS detail,created_at
          FROM admin_system_events WHERE created_at >= now() - make_interval(days => $1)
          UNION ALL
          SELECT 'roles',id::text,'role_change','info',changed_by,profile_id,
            from_role || ' → ' || to_role,changed_at
          FROM profile_role_history WHERE changed_at >= now() - make_interval(days => $1)
          UNION ALL
          SELECT 'plans',id::text,'plan_change','info',changed_by,profile_id,
            COALESCE(from_plan,'—') || ' → ' || to_plan,changed_at
          FROM profile_plan_history WHERE changed_at >= now() - make_interval(days => $1)
            AND from_plan IS NOT NULL
          UNION ALL
          SELECT 'http',id::text,'request_failed','error',NULL::text,profile_id,
            feature || ' · HTTP ' || status_code,created_at
          FROM admin_http_requests WHERE created_at >= now() - make_interval(days => $1)
            AND status_code >= 500
          UNION ALL
          SELECT 'api',id::text,'provider_failed','warning',NULL::text,profile_id,
            provider || ' · ' || operation || ' · ' || COALESCE(status_code::text,outcome),created_at
          FROM admin_api_calls WHERE created_at >= now() - make_interval(days => $1)
            AND outcome <> 'success'
          UNION ALL
          SELECT 'recipes',id::text,'recipe_failed','warning',NULL::text,profile_id,
            COALESCE(error_code,stage),created_at
          FROM admin_diagnostics WHERE created_at >= now() - make_interval(days => $1)
            AND outcome = 'error'
        ) events WHERE ($2 = 'all' OR category = $2)
        ORDER BY created_at DESC,category,reference DESC LIMIT $3 OFFSET $4`,
        [days, category, limit + 1, offset])).rows;
        return { items: rows.slice(0, limit).map(row => ({
          ...row, accountId: row.account_id == null ? null : Number(row.account_id),
          createdAt: row.created_at.toISOString(), account_id: undefined, created_at: undefined,
        })), nextOffset: rows.length > limit ? offset + limit : null };
      }, true);
    },
  };
}
