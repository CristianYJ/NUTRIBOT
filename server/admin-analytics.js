import { planCatalog, staffPlan } from '../src/plan-catalog.js';
import { usageWindow } from './plan-usage.js';
import { AppError } from './recipes.js';
import { adminPeriodBuckets, bucketMetrics, planMixTrend } from '../src/admin-periods.js';

const iso = value => value instanceof Date ? value.toISOString() : value ? new Date(value).toISOString() : null;
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
const allowedProviders = new Set(['gemini', 'edamam', 'usda']);
const allowedOutcomes = new Set(['success', 'http_error', 'network_error']);
function bucketsFor(period, year) {
  try { return adminPeriodBuckets(period, new Date(), year); }
  catch { throw new AppError('INVALID_FILTER', 'Período inválido.'); }
}

export function createAdminAnalytics({ transaction }) {
  return {
    recordApiCall(event) {
      if (!allowedProviders.has(event.provider) || !allowedOutcomes.has(event.outcome) ||
          !/^[a-z_]{2,32}$/.test(event.operation || '')) return Promise.resolve();
      return transaction(async c => {
        await c.query("DELETE FROM admin_api_calls WHERE created_at < now() - interval '30 days'");
        await c.query(`INSERT INTO admin_api_calls(profile_id,provider,operation,model,outcome,status_code,duration_ms)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [
          Number.isSafeInteger(event.profileId) && event.profileId > 0 ? event.profileId : null,
          event.provider, event.operation, typeof event.model === 'string' ? event.model.slice(0, 80) : null,
          event.outcome, Number.isInteger(event.statusCode) ? event.statusCode : null,
          Math.max(0, Math.min(600000, Math.round(event.durationMs || 0))),
        ]);
        await c.query(`INSERT INTO admin_daily_metrics(day,source,category,outcome,total,under_2s)
          VALUES((now() AT TIME ZONE 'America/Guatemala')::date,'api',$1,$2,1,$3)
          ON CONFLICT(day,source,category,outcome) DO UPDATE SET total=admin_daily_metrics.total+1,
            under_2s=admin_daily_metrics.under_2s+EXCLUDED.under_2s`,
        [event.provider, event.outcome, event.durationMs <= 2000 ? 1 : 0]);
        await c.query("DELETE FROM admin_daily_metrics WHERE day < make_date(extract(year from (now() AT TIME ZONE 'America/Guatemala'))::integer - 5,1,1)");
      });
    },
    recordHttpRequest(event) {
      if (!Number.isSafeInteger(event.profileId) || event.profileId < 1 ||
          !/^[a-z_]{2,24}$/.test(event.feature || '') || !Number.isInteger(event.statusCode))
        return Promise.resolve();
      return transaction(async c => {
        await c.query("DELETE FROM admin_http_requests WHERE created_at < now() - interval '30 days'");
        await c.query(`INSERT INTO admin_http_requests(profile_id,feature,status_code,duration_ms)
          VALUES($1,$2,$3,$4)`, [event.profileId, event.feature, event.statusCode,
          Math.max(0, Math.min(600000, Math.round(event.durationMs || 0)))]);
        await c.query(`INSERT INTO admin_daily_metrics(day,source,category,outcome,total,under_2s)
          VALUES((now() AT TIME ZONE 'America/Guatemala')::date,'http',$1,$2,1,$3)
          ON CONFLICT(day,source,category,outcome) DO UPDATE SET total=admin_daily_metrics.total+1,
            under_2s=admin_daily_metrics.under_2s+EXCLUDED.under_2s`,
        [event.feature, event.statusCode < 400 ? 'success' : 'error', event.durationMs <= 2000 ? 1 : 0]);
        await c.query("DELETE FROM admin_daily_metrics WHERE day < make_date(extract(year from (now() AT TIME ZONE 'America/Guatemala'))::integer - 5,1,1)");
      });
    },
    adminApiSummary(period = 'week', year = null) {
      const buckets = bucketsFor(period, year);
      return transaction(async c => {
        const operations = (await c.query(`SELECT provider,operation,model,count(*)::integer AS total,
          count(*) FILTER (WHERE outcome='success')::integer AS success,
          count(*) FILTER (WHERE outcome<>'success')::integer AS failed,
          percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms)::integer AS p95_ms
          FROM admin_api_calls WHERE created_at >= now() - interval '30 days'
          GROUP BY provider,operation,model ORDER BY total DESC,provider,operation`)).rows;
        const raw = (await c.query(`SELECT day,category AS provider,outcome,total FROM admin_daily_metrics
          WHERE source='api' AND day >= $1::date ORDER BY day`, [buckets[0].startDay])).rows.map(row => ({
            ...row, day: day(row.day), success: row.outcome === 'success' ? row.total : 0,
            failed: row.outcome === 'success' ? 0 : row.total,
          }));
        const apiCoverage = (await c.query(`SELECT category AS provider,min(day) AS first_day
          FROM admin_daily_metrics WHERE source='api' GROUP BY category`)).rows;
        const firstApiDay = apiCoverage.length ? apiCoverage.map(row => day(row.first_day)).sort()[0] : null;
        const daily = ['gemini', 'edamam', 'usda'].flatMap(provider =>
          bucketMetrics(raw.filter(row => row.provider === provider), buckets, ['success', 'failed'],
            apiCoverage.find(row => row.provider === provider)?.first_day
              ? day(apiCoverage.find(row => row.provider === provider).first_day) : firstApiDay)
            .map(row => ({ ...row, provider })));
        const providers = ['gemini', 'edamam', 'usda'].map(provider => {
          const rows = daily.filter(row => row.provider === provider);
          const success = rows.reduce((sum, row) => sum + (row.success || 0), 0);
          const failed = rows.reduce((sum, row) => sum + (row.failed || 0), 0);
          return { provider, success, failed, total: success + failed };
        });
        const calls = (await c.query(`SELECT id,profile_id,provider,operation,model,outcome,status_code,duration_ms,created_at
          FROM admin_api_calls WHERE created_at >= now() - interval '30 days'
          ORDER BY created_at DESC,id DESC LIMIT 30`)).rows.map(row => ({
            id: Number(row.id), accountId: row.profile_id == null ? null : Number(row.profile_id),
            provider: row.provider, operation: row.operation, model: row.model, outcome: row.outcome,
            statusCode: row.status_code, durationMs: row.duration_ms, createdAt: iso(row.created_at),
          }));
        return { period, providers, daily, operations, calls };
      }, true);
    },
    adminUsersSummary(period = 'week', year = null) {
      const buckets = bucketsFor(period, year);
      return transaction(async c => {
        const stats = (await c.query(`WITH activity AS (
            SELECT profile_id,created_at AS at FROM auth_sessions
            UNION ALL SELECT profile_id,created_at FROM plan_usage
            UNION ALL SELECT profile_id,created_at FROM admin_diagnostics WHERE profile_id IS NOT NULL
            UNION ALL SELECT profile_id,created_at FROM admin_api_calls WHERE profile_id IS NOT NULL
            UNION ALL SELECT profile_id,created_at FROM admin_http_requests WHERE profile_id IS NOT NULL
          ), latest AS (SELECT profile_id,max(at) AS at FROM activity GROUP BY profile_id)
          SELECT count(*)::integer AS total,
            count(*) FILTER (WHERE greatest(p.created_at,coalesce(latest.at,p.created_at)) >= now() - interval '30 days')::integer AS active,
            count(*) FILTER (WHERE p.role_code='admin')::integer AS staff,
            count(*) FILTER (WHERE p.role_code<>'admin' AND p.plan_code='basico')::integer AS free,
            count(*) FILTER (WHERE p.role_code<>'admin' AND p.plan_code='nutripro')::integer AS nutripro,
            count(*) FILTER (WHERE p.role_code<>'admin' AND p.plan_code='nutripro_plus')::integer AS nutrimax
          FROM profiles p LEFT JOIN latest ON latest.profile_id=p.id WHERE p.email IS NOT NULL`)).rows[0];
        const latest = (await c.query(`SELECT p.id,p.name,p.email,p.plan_code,p.role_code,p.created_at,p.updated_at,
          greatest(p.created_at,coalesce((SELECT max(s.created_at) FROM auth_sessions s WHERE s.profile_id=p.id),p.created_at),
            coalesce((SELECT max(u.created_at) FROM plan_usage u WHERE u.profile_id=p.id),p.created_at),
            coalesce((SELECT max(d.created_at) FROM admin_diagnostics d WHERE d.profile_id=p.id),p.created_at),
            coalesce((SELECT max(a.created_at) FROM admin_api_calls a WHERE a.profile_id=p.id),p.created_at),
            coalesce((SELECT max(h.created_at) FROM admin_http_requests h WHERE h.profile_id=p.id),p.created_at)) AS last_active_at
          FROM profiles p WHERE p.email IS NOT NULL ORDER BY p.created_at DESC,p.id DESC LIMIT 10`)).rows.map(row => ({
            id: Number(row.id), name: row.name, email: row.email, plan: row.plan_code, role: row.role_code,
            createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), lastActiveAt: iso(row.last_active_at),
          }));
        const featureRaw = (await c.query(`SELECT day,category AS feature,total FROM admin_daily_metrics
          WHERE source='http' AND day >= $1::date ORDER BY day`, [buckets[0].startDay])).rows.map(row => ({
            ...row, day: day(row.day), total: Number(row.total),
          }));
        const firstFeatureDay = (await c.query(`SELECT min(day) AS day FROM admin_daily_metrics
          WHERE source='http'`)).rows[0].day;
        const featureNames = ['recipes', 'vision', 'recipe_detail', 'shopping', 'meals', 'nutrition', 'chat'];
        const features = buckets.map(bucket => ({ label: bucket.label, day: bucket.endDay,
          ...Object.fromEntries(featureNames.map(feature => [feature,
            firstFeatureDay && bucket.endDay < day(firstFeatureDay) ? null
              : featureRaw.filter(row => row.feature === feature && row.day >= bucket.startDay && row.day <= bucket.endDay)
                .reduce((sum, row) => sum + row.total, 0)])) }));
        const trendAccounts = (await c.query("SELECT id,created_at FROM profiles WHERE email IS NOT NULL AND role_code<>'admin'")).rows;
        const trendHistory = (await c.query(`SELECT h.profile_id,h.to_plan,h.changed_at FROM profile_plan_history h
          JOIN profiles p ON p.id=h.profile_id WHERE p.email IS NOT NULL
          ORDER BY h.profile_id,h.changed_at,h.id`)).rows;
        const planTrend = planMixTrend(trendAccounts, trendHistory, buckets);
        const performance = (await c.query(`SELECT
          (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM admin_http_requests WHERE created_at >= now() - interval '30 days') AS server_p95,
          (SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM admin_api_calls WHERE created_at >= now() - interval '30 days') AS api_p95`)).rows[0];
        const ratios = (await c.query(`SELECT source,sum(total)::integer AS total,sum(under_2s)::integer AS under_2s
          FROM admin_daily_metrics WHERE source IN ('http','api') AND day >= $1::date GROUP BY source`,
        [buckets[0].startDay])).rows;
        const within = source => { const row = ratios.find(item => item.source === source);
          return row?.total ? Math.round(row.under_2s / row.total * 100) : null; };
        return { total: stats.total, active: stats.active, inactive: stats.total - stats.active,
          free: stats.free, paid: stats.nutripro + stats.nutrimax, staff: stats.staff, nutripro: stats.nutripro,
          nutrimax: stats.nutrimax, estimatedMonthlyCents: stats.nutripro * 299 + stats.nutrimax * 999,
          latest, features, planTrend, performance: { serverP95Ms: performance.server_p95,
            serverUnder2s: within('http'), apiP95Ms: performance.api_p95,
            apiUnder2s: within('api') } };
      }, true);
    },
    adminAccountDetail(id) {
      if (!Number.isSafeInteger(id) || id < 1) throw new AppError('INVALID_FILTER', 'Cuenta inválida.');
      return transaction(async c => {
        const profile = (await c.query(`SELECT id,name,email,plan_code,role_code,created_at,updated_at FROM profiles
          WHERE id=$1 AND email IS NOT NULL`, [id])).rows[0];
        if (!profile) return null;
        const history = (await c.query(`SELECT from_plan,to_plan,changed_at FROM profile_plan_history
          WHERE profile_id=$1 ORDER BY changed_at,id`, [id])).rows;
        let paidSince = null, freeSinceAfterPaid = null, wasPaid = false;
        for (const change of history) {
          const paid = change.to_plan !== 'basico';
          if (paid && !wasPaid) { paidSince = iso(change.changed_at); freeSinceAfterPaid = null; }
          if (!paid && wasPaid) { paidSince = null; freeSinceAfterPaid = iso(change.changed_at); }
          wasPaid = paid;
        }
        const effective = profile.role_code === 'admin' ? staffPlan : planCatalog[profile.plan_code];
        const windows = { recipes: usageWindow('recipes'), vision: usageWindow('vision') };
        const usageRows = (await c.query(`SELECT feature,period_start,count(*) FILTER (WHERE succeeded)::integer AS used,
          count(*) FILTER (WHERE NOT succeeded AND expires_at>now())::integer AS pending
          FROM plan_usage WHERE profile_id=$1 AND ((feature='recipes' AND period_start=$2::date)
            OR (feature='vision' AND period_start=$3::date)) GROUP BY feature,period_start`,
        [id, windows.recipes.periodStart, windows.vision.periodStart])).rows;
        const usage = Object.fromEntries(['recipes', 'vision'].map(feature => {
          const row = usageRows.find(item => item.feature === feature);
          return [feature, { used: row?.used || 0, pending: row?.pending || 0, limit: effective[feature],
            resetsAt: windows[feature].resetsAt }];
        }));
        const calls = (await c.query(`SELECT provider,operation,model,outcome,status_code,duration_ms,created_at
          FROM admin_api_calls WHERE profile_id=$1 AND created_at >= now() - interval '30 days'
          ORDER BY created_at DESC,id DESC LIMIT 10`, [id])).rows.map(row => ({
            ...row, createdAt: iso(row.created_at), statusCode: row.status_code, durationMs: row.duration_ms,
          }));
        const lastActive = (await c.query(`SELECT max(at) AS at FROM (
          SELECT created_at AS at FROM auth_sessions WHERE profile_id=$1
          UNION ALL SELECT created_at FROM plan_usage WHERE profile_id=$1
          UNION ALL SELECT created_at FROM admin_diagnostics WHERE profile_id=$1
          UNION ALL SELECT created_at FROM admin_api_calls WHERE profile_id=$1
          UNION ALL SELECT created_at FROM admin_http_requests WHERE profile_id=$1
        ) activity`, [id])).rows[0].at || profile.created_at;
        return { updatedAt: iso(profile.updated_at), lastActiveAt: iso(lastActive), effectivePlan: effective.name,
          paidSince: profile.role_code === 'admin' ? null : paidSince,
          freeSinceAfterPaid: profile.role_code === 'admin' ? null : freeSinceAfterPaid, usage, calls };
      }, true);
    },
  };
}
