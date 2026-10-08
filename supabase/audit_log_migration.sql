-- =====================================================
-- MIGRACIÓN: Bitácora de auditoría (audit log)
-- Fecha: 2026-10-08
-- Registra INSERT/UPDATE/DELETE en checklists, forklifts y
-- app_users. La app usa auth personalizada (no Supabase Auth),
-- por lo que el actor se toma de la setting 'app.current_user'
-- (fallback 'sistema'). En app_users se redactan contraseñas.
-- Ejecutar DESPUÉS de las migraciones base (migration.sql).
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_by TEXT,
  details jsonb,
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON audit_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log (table_name);

-- Helper: actor actual (seteado por la app si está disponible)
CREATE OR REPLACE FUNCTION audit_actor()
RETURNS TEXT AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_user', true), ''), 'sistema');
$$ LANGUAGE sql;

-- ===== Trigger: checklists =====
CREATE OR REPLACE FUNCTION audit_checklists()
RETURNS trigger AS $$
DECLARE v_record TEXT; v_actor TEXT; v_details jsonb;
BEGIN
  v_actor := audit_actor();
  IF TG_OP = 'DELETE' THEN
    v_record := OLD.id::text;
    v_details := jsonb_build_object('old', to_jsonb(OLD) - 'id',
                'employee_number', OLD.employee_number);
    INSERT INTO audit_log (table_name, record_id, action, changed_by, details)
    VALUES ('checklists', v_record, 'DELETE', v_actor, v_details);
  ELSE
    v_record := COALESCE(NEW.id, OLD.id)::text;
    v_details := CASE TG_OP
      WHEN 'INSERT' THEN jsonb_build_object('new', to_jsonb(NEW) - 'id',
                   'employee_number', NEW.employee_number)
      ELSE jsonb_build_object('new', to_jsonb(NEW) - 'id',
                   'old', to_jsonb(OLD) - 'id',
                   'changed_fields',
                   (SELECT coalesce(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(jsonb_strip_nulls(to_jsonb(NEW))) k
                    WHERE (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k)))
    END;
    INSERT INTO audit_log (table_name, record_id, action, changed_by, details)
    VALUES ('checklists', v_record, TG_OP, v_actor, v_details);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_checklists ON checklists;
CREATE TRIGGER trg_audit_checklists
  AFTER INSERT OR UPDATE OR DELETE ON checklists
  FOR EACH ROW EXECUTE FUNCTION audit_checklists();

-- ===== Trigger: forklifts =====
CREATE OR REPLACE FUNCTION audit_forklifts()
RETURNS trigger AS $$
DECLARE v_record TEXT; v_actor TEXT; v_details jsonb;
BEGIN
  v_actor := audit_actor();
  IF TG_OP = 'DELETE' THEN
    v_record := OLD.id::text;
    v_details := jsonb_build_object('old', to_jsonb(OLD) - 'id',
                'id_code', OLD.id_code);
    INSERT INTO audit_log (table_name, record_id, action, changed_by, details)
    VALUES ('forklifts', v_record, 'DELETE', v_actor, v_details);
  ELSE
    v_record := COALESCE(NEW.id, OLD.id)::text;
    v_details := CASE TG_OP
      WHEN 'INSERT' THEN jsonb_build_object('new', to_jsonb(NEW) - 'id',
                   'id_code', NEW.id_code)
      ELSE jsonb_build_object('new', to_jsonb(NEW) - 'id',
                   'old', to_jsonb(OLD) - 'id',
                   'changed_fields',
                   (SELECT coalesce(jsonb_agg(k), '[]'::jsonb) FROM jsonb_object_keys(jsonb_strip_nulls(to_jsonb(NEW))) k
                    WHERE (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k)))
    END;
    INSERT INTO audit_log (table_name, record_id, action, changed_by, details)
    VALUES ('forklifts', v_record, TG_OP, v_actor, v_details);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_forklifts ON forklifts;
CREATE TRIGGER trg_audit_forklifts
  AFTER INSERT OR UPDATE OR DELETE ON forklifts
  FOR EACH ROW EXECUTE FUNCTION audit_forklifts();

-- ===== Trigger: app_users (redacta contraseñas) =====
CREATE OR REPLACE FUNCTION audit_app_users()
RETURNS trigger AS $$
DECLARE v_record TEXT; v_actor TEXT; v_details jsonb;
BEGIN
  -- Nota: app_users no tiene columna updated_by; los cambios hechos via
  -- RPC (create_user/update_user) quedan como 'sistema'.
  v_actor := audit_actor();
  IF TG_OP = 'DELETE' THEN
    v_record := OLD.employee_number;
    v_details := jsonb_build_object('old',
      to_jsonb(OLD) - 'password_hash' - 'password' - 'id');
    INSERT INTO audit_log (table_name, record_id, action, changed_by, details)
    VALUES ('app_users', v_record, 'DELETE', v_actor, v_details);
  ELSE
    v_record := COALESCE(NEW.employee_number, OLD.employee_number);
    v_details := CASE TG_OP
      WHEN 'INSERT' THEN jsonb_build_object('new',
        to_jsonb(NEW) - 'password_hash' - 'password' - 'id')
      ELSE jsonb_build_object('new',
        to_jsonb(NEW) - 'password_hash' - 'password' - 'id',
        'old',
        to_jsonb(OLD) - 'password_hash' - 'password' - 'id',
        'changed_fields',
        (SELECT coalesce(jsonb_agg(k), '[]'::jsonb)
         FROM jsonb_object_keys(jsonb_strip_nulls(
           to_jsonb(NEW) - 'password_hash' - 'password')) k
         WHERE (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k)))
    END;
    INSERT INTO audit_log (table_name, record_id, action, changed_by, details)
    VALUES ('app_users', v_record, TG_OP, v_actor, v_details);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_app_users ON app_users;
CREATE TRIGGER trg_audit_app_users
  AFTER INSERT OR UPDATE OR DELETE ON app_users
  FOR EACH ROW EXECUTE FUNCTION audit_app_users();
