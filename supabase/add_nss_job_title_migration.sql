-- =====================================================
-- MIGRACIÓN: Agregar NSS y Puesto a app_users
-- Fecha: 2026-08-07
-- =====================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'nss') THEN
    ALTER TABLE app_users ADD COLUMN nss TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'job_title') THEN
    ALTER TABLE app_users ADD COLUMN job_title TEXT;
  END IF;
END $$;
