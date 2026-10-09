-- =====================================================
-- MIGRACIÓN: registrar el actor real en la bitácora
-- Fecha: 2026-10-09
-- Antes: todos los registros de audit_log salían como
-- 'sistema'. Ahora la app envía el header 'x-app-user'
-- con el número de empleado logueado, y PostgREST lo
-- expone a PL/pgSQL como request.headers. Los triggers
-- ya llaman a audit_actor(), así que basta reemplazarla.
-- Ejecutar en el SQL Editor de Supabase. Es idempotente.
-- =====================================================

CREATE OR REPLACE FUNCTION audit_actor()
RETURNS TEXT AS $$
  SELECT COALESCE(
    -- Fallback por si algún proceso externo setea app.current_user
    NULLIF(current_setting('app.current_user', true), ''),
    -- Número de empleado logueado (header x-app-user de la app)
    NULLIF(current_setting('request.headers', true)::jsonb ->> 'x-app-user', ''),
    'sistema'
  );
$$ LANGUAGE sql;
