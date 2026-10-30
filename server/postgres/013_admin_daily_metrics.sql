-- Daily totals contain no account identifiers or request content. Detailed events
-- retain their existing 30-day lifetime; these totals support five years of charts.
CREATE TABLE admin_daily_metrics (
  day date NOT NULL,
  source varchar(12) NOT NULL CHECK (source IN ('recipe','api','http')),
  category varchar(40) NOT NULL,
  outcome varchar(16) NOT NULL,
  total integer NOT NULL CHECK (total >= 0),
  under_2s integer NOT NULL CHECK (under_2s >= 0),
  PRIMARY KEY (day,source,category,outcome)
);

INSERT INTO admin_daily_metrics(day,source,category,outcome,total,under_2s)
SELECT (created_at AT TIME ZONE 'America/Guatemala')::date,'recipe','recipe',outcome,
  count(*)::integer,count(*) FILTER (WHERE duration_ms <= 2000)::integer
FROM admin_diagnostics GROUP BY 1,4;
INSERT INTO admin_daily_metrics(day,source,category,outcome,total,under_2s)
SELECT (created_at AT TIME ZONE 'America/Guatemala')::date,'api',provider,outcome,
  count(*)::integer,count(*) FILTER (WHERE duration_ms <= 2000)::integer
FROM admin_api_calls GROUP BY 1,3,4;
INSERT INTO admin_daily_metrics(day,source,category,outcome,total,under_2s)
SELECT (created_at AT TIME ZONE 'America/Guatemala')::date,'http',feature,
  CASE WHEN status_code < 400 THEN 'success' ELSE 'error' END,
  count(*)::integer,count(*) FILTER (WHERE duration_ms <= 2000)::integer
FROM admin_http_requests GROUP BY 1,3,4;
