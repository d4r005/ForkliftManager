-- =====================================================
-- FIX: "new row violates row-level security policy for table audit_log"
-- Causa: audit_log_migration.sql crea la tabla (Supabase la deja con RLS
-- activo) y los triggers corren con los permisos del rol anon, que no
-- tiene política de INSERT. Las demás tablas del proyecto usan RLS
-- desactivado (ver migration.sql), así que alineamos audit_log y además
-- hacemos los triggers SECURITY DEFINER para que siempre puedan escribir.
-- Ejecutar en el SQL Editor de Supabase. Es idempotente.
-- =====================================================

-- 1) Triggers corren como el dueño de la función (no como anon)
ALTER FUNCTION audit_checklists() SECURITY DEFINER SET search_path = public;
ALTER FUNCTION audit_forklifts()  SECURITY DEFINER SET search_path = public;
ALTER FUNCTION audit_app_users()  SECURITY DEFINER SET search_path = public;

-- 2) Consistente con el resto del proyecto (auth propia, sin Supabase Auth)
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;
