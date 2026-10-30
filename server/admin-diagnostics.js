import { AppError } from './recipes.js';

// Diagnostic excerpts are intentionally short and remove common contact details.
export function diagnosticExcerpt(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[teléfono]')
    .replace(/\s+/g, ' ').trim().slice(0, 300) || null;
}
export function createAdminDiagnostics({ transaction, profileId, pool }) {
  return {
    async isAdmin(id, adminEmail) {
      if (!adminEmail || !Number.isSafeInteger(id)) return false;
      const result = await pool.query('SELECT 1 FROM profiles WHERE id=$1 AND lower(email)=$2', [id, adminEmail]);
      return result.rowCount === 1;
    },
    recordAdminEvent(event) {
      const reasons = (Array.isArray(event.reasons) ? event.reasons : []).filter(x => typeof x === 'string' && /^[A-Z_]{2,50}$/.test(x)).slice(0, 8);
      const context = {
        mode: ['initial', 'more'].includes(event.mode) ? event.mode : null,
        maxTime: [15, 30, 60].includes(event.maxTime) ? event.maxTime : null,
        pantryCount: Number.isInteger(event.pantryCount) ? Math.min(200, Math.max(0, event.pantryCount)) : null,
        recipeCount: Number.isInteger(event.recipeCount) ? Math.min(100, Math.max(0, event.recipeCount)) : 0,
      };
      return transaction(async c => {
        await c.query("DELETE FROM admin_diagnostics WHERE created_at < now() - interval '30 days'");
        await c.query(`INSERT INTO admin_diagnostics(request_id,profile_id,feature,provider,outcome,stage,error_code,reasons,request_excerpt,previous_excerpt,context,duration_ms)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
          event.requestId, profileId(), 'recipe', String(event.provider || 'unknown').slice(0, 24),
          ['nutrition_setup', 'out_of_scope'].includes(event.outcome) ? 'conversation'
            : ['success', 'empty', 'conversation', 'review'].includes(event.outcome) ? event.outcome : 'error',
          String(event.stage || 'unknown').slice(0, 40), event.errorCode ? String(event.errorCode).slice(0, 80) : null,
          JSON.stringify(reasons), event.outcome === 'error' ? diagnosticExcerpt(event.message) : null,
          event.outcome === 'error' ? diagnosticExcerpt(event.previousMessage) : null,
          JSON.stringify(context), Math.min(600000, Math.max(0, Math.round(event.durationMs || 0))),
        ]);
      });
    },
    listAdminEvents({ outcome = 'error', offset = 0, days = 30, provider = 'all', search = '', accountId = null } = {}) {
      if (!['error', 'all', 'success', 'empty', 'conversation', 'review'].includes(outcome) ||
          !Number.isInteger(offset) || offset < 0 || offset > 10000 || ![1, 7, 30].includes(days) ||
          !['all', 'edamam', 'gemini'].includes(provider) || typeof search !== 'string' ||
          search.length > 80 || !/^[a-zA-Z0-9_-]*$/.test(search) ||
          (accountId !== null && (!Number.isSafeInteger(accountId) || accountId < 1)))
        throw new AppError('INVALID_FILTER', 'Filtro de incidentes inválido.');
      return transaction(async c => {
        const rows = (await c.query(`SELECT id,request_id,profile_id,feature,provider,outcome,stage,error_code,reasons,
          request_excerpt,previous_excerpt,context,duration_ms,created_at FROM admin_diagnostics
          WHERE created_at >= now() - make_interval(days => $3) AND ($1='all' OR outcome=$1)
            AND ($4='all' OR provider=$4)
            AND ($5='' OR request_id::text ILIKE $5 || '%' OR error_code ILIKE '%' || $5 || '%' OR stage ILIKE '%' || $5 || '%')
            AND ($6::bigint IS NULL OR profile_id=$6)
          ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $2`, [outcome, offset, days, provider, search, accountId])).rows;
        return { items: rows.slice(0, 50).map(row => ({
          id: Number(row.id), requestId: row.request_id, accountId: row.profile_id == null ? null : Number(row.profile_id),
          feature: row.feature, provider: row.provider, outcome: row.outcome, stage: row.stage,
          errorCode: row.error_code, reasons: row.reasons, requestExcerpt: row.request_excerpt,
          previousExcerpt: row.previous_excerpt, context: row.context, durationMs: row.duration_ms,
          createdAt: row.created_at.toISOString(),
        })), nextOffset: rows.length > 50 ? offset + 50 : null };
      }, true);
    },
    adminSummary() {
      return transaction(async c => {
        const totals = (await c.query(`SELECT count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::integer AS total_24h,
          count(*) FILTER (WHERE created_at >= now() - interval '24 hours' AND outcome='error')::integer AS errors_24h,
          count(*) FILTER (WHERE created_at >= now() - interval '7 days')::integer AS total_7d,
          count(*) FILTER (WHERE created_at >= now() - interval '7 days' AND outcome='error')::integer AS errors_7d
          FROM admin_diagnostics WHERE created_at >= now() - interval '7 days'`)).rows[0];
        const codes = (await c.query(`SELECT error_code AS code,count(*)::integer AS count FROM admin_diagnostics
          WHERE created_at >= now() - interval '7 days' AND outcome='error'
          GROUP BY error_code ORDER BY count DESC,error_code LIMIT 8`)).rows;
        const daily = (await c.query(`SELECT (created_at AT TIME ZONE 'America/Guatemala')::date AS day,
          count(*)::integer AS total, count(*) FILTER (WHERE outcome='error')::integer AS errors,
          count(*) FILTER (WHERE outcome='success')::integer AS success,
          count(*) FILTER (WHERE outcome='empty')::integer AS empty
          FROM admin_diagnostics WHERE created_at >= now() - interval '7 days' GROUP BY 1 ORDER BY 1`)).rows.map(row => ({
            day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day),
            total: row.total, errors: row.errors, success: row.success, empty: row.empty,
          }));
        const byProvider = (await c.query(`SELECT provider,count(*)::integer AS total,
          count(*) FILTER (WHERE outcome='error')::integer AS errors,
          count(*) FILTER (WHERE outcome='success')::integer AS success
          FROM admin_diagnostics WHERE created_at >= now() - interval '7 days' GROUP BY provider ORDER BY total DESC`)).rows;
        const quality = (await c.query(`SELECT
          count(*) FILTER (WHERE outcome='success' AND (context->>'recipeCount')::integer >= 2)::integer AS two_options,
          count(*) FILTER (WHERE outcome='success' AND (context->>'recipeCount')::integer = 1)::integer AS one_option,
          count(*) FILTER (WHERE outcome='empty')::integer AS no_results,
          count(*) FILTER (WHERE context->>'mode'='more')::integer AS more_requests,
          count(*) FILTER (WHERE context->>'mode'='more' AND outcome='success')::integer AS more_success,
          count(DISTINCT profile_id)::integer AS active_accounts,
          percentile_disc(0.5) WITHIN GROUP (ORDER BY duration_ms)::integer AS p50_ms,
          percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms)::integer AS p95_ms
          FROM admin_diagnostics WHERE created_at >= now() - interval '7 days'`)).rows[0];
        return { total24h: totals.total_24h, errors24h: totals.errors_24h,
          total7d: totals.total_7d, errors7d: totals.errors_7d, codes, daily, byProvider,
          quality: { twoOptions: quality.two_options, oneOption: quality.one_option, noResults: quality.no_results,
            moreRequests: quality.more_requests, moreSuccess: quality.more_success, activeAccounts: quality.active_accounts,
            p50Ms: quality.p50_ms, p95Ms: quality.p95_ms } };
      }, true);
    },
    findAdminAccount(query) {
      const value = typeof query === 'string' ? query.trim().toLowerCase() : '';
      if (!value || value.length > 254 || (!/^\d{1,15}$/.test(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
        throw new AppError('INVALID_FILTER', 'Busca por correo completo o ID de cuenta.');
      return transaction(async c => {
        const row = (await c.query(`SELECT id,name,email,plan_code,created_at FROM profiles
          WHERE ${/^\d{1,15}$/.test(value) ? 'id=$1' : 'email=$1'} LIMIT 1`, [value])).rows[0];
        if (!row) return { account: null, recent: [] };
        const recent = (await c.query(`SELECT request_id,outcome,error_code,stage,created_at FROM admin_diagnostics
          WHERE profile_id=$1 AND created_at >= now() - interval '30 days' ORDER BY created_at DESC LIMIT 8`, [row.id])).rows;
        return { account: { id: Number(row.id), name: row.name, email: row.email, plan: row.plan_code,
          createdAt: row.created_at.toISOString() }, recent: recent.map(item => ({ requestId: item.request_id,
          outcome: item.outcome, errorCode: item.error_code, stage: item.stage, createdAt: item.created_at.toISOString() })) };
      }, true);
    },
  };
}
