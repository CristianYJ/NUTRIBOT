-- Ejecutar conectado a nutribot_project. Consultas de solo lectura.
SELECT current_database() AS base_actual, current_user AS usuario_actual;
SELECT version, applied_at FROM nutribot.schema_migrations;
SELECT tablename FROM pg_tables WHERE schemaname='nutribot' ORDER BY tablename;
-- Esquema v3: 24 tablas y 3 vistas. No muestra datos personales.
SELECT table_type, count(*) AS cantidad
FROM information_schema.tables WHERE table_schema='nutribot' GROUP BY table_type;
SELECT table_name FROM information_schema.views
WHERE table_schema='nutribot' ORDER BY table_name;
SELECT table_name,column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='nutribot'
  AND table_name IN ('profiles','ingredients','auth_sessions','conversations','pantry_dates','profile_summary')
ORDER BY table_name,ordinal_position;
SELECT c.relname AS tabla,k.conname AS restriccion,pg_get_constraintdef(k.oid) AS definicion
FROM pg_constraint k
JOIN pg_class c ON c.oid=k.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='nutribot' AND k.contype IN ('p','f')
  AND c.relname IN ('auth_sessions','conversations','pantry_dates')
ORDER BY c.relname,k.conname;
SELECT source, count(*) AS total FROM nutribot.recipes GROUP BY source;
SELECT * FROM nutribot.recipe_summary ORDER BY created_at DESC;
SELECT r.title, i.name, ri.amount, ri.position
FROM nutribot.recipe_ingredients ri
JOIN nutribot.recipes r ON r.id=ri.recipe_id
JOIN nutribot.ingredients i ON i.id=ri.ingredient_id
ORDER BY r.title, ri.position;
SELECT r.title,s.position,s.instruction
FROM nutribot.recipe_steps s JOIN nutribot.recipes r ON r.id=s.recipe_id
ORDER BY r.title,s.position;
SELECT model,outcome,recipe_count,created_at FROM nutribot.generation_events ORDER BY created_at DESC;
-- Debe devolver cero; no lee notas médicas ni medidas personales.
SELECT count(*) AS recetas_sin_ingredientes_o_pasos
FROM nutribot.recipes r
WHERE NOT EXISTS(SELECT 1 FROM nutribot.recipe_ingredients i WHERE i.recipe_id=r.id)
OR NOT EXISTS(SELECT 1 FROM nutribot.recipe_steps s WHERE s.recipe_id=r.id);
SELECT c.conname,c.contype,c.convalidated
FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
WHERE n.nspname='nutribot' ORDER BY c.contype,c.conname;
