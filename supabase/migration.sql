CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS forklifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_code         TEXT NOT NULL,
  name            TEXT DEFAULT '',
  employee_number TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forklift_id     TEXT NOT NULL,
  operator_name   TEXT NOT NULL,
  inspector_name  TEXT NOT NULL,
  month           INT NOT NULL,
  year            INT NOT NULL,
  day             INT NOT NULL,
  items           JSONB DEFAULT '{}'::jsonb,
  observations    TEXT DEFAULT '',
  employee_number TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forklifts_emp ON forklifts(employee_number);
CREATE INDEX IF NOT EXISTS idx_checklists_emp ON checklists(employee_number);
CREATE INDEX IF NOT EXISTS idx_checklists_created ON checklists(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_emp ON app_users(employee_number);

ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE forklifts DISABLE ROW LEVEL SECURITY;
ALTER TABLE checklists DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION login_user(p_employee_number TEXT, p_password TEXT)
RETURNS JSONB AS '
DECLARE
  v_user app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM app_users
  WHERE employee_number = p_employee_number AND is_active = true;
  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''user_not_found'');
  END IF;
  IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''invalid_password'');
  END IF;
  RETURN jsonb_build_object(
    ''success'', true,
    ''user'', jsonb_build_object(
      ''id'', v_user.id,
      ''employeeNumber'', v_user.employee_number,
      ''name'', v_user.name,
      ''role'', v_user.role
    )
  );
END;
' LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION change_password(p_employee_number TEXT, p_old_password TEXT, p_new_password TEXT)
RETURNS JSONB AS '
DECLARE
  v_user app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM app_users
  WHERE employee_number = p_employee_number AND is_active = true;
  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''user_not_found'');
  END IF;
  IF v_user.password_hash != crypt(p_old_password, v_user.password_hash) THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''invalid_password'');
  END IF;
  UPDATE app_users SET password_hash = crypt(p_new_password, gen_salt(''bf'')), updated_at = now()
  WHERE id = v_user.id;
  RETURN jsonb_build_object(''success'', true);
END;
' LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_user(p_admin_employee_number TEXT, p_employee_number TEXT, p_password TEXT, p_name TEXT, p_role TEXT DEFAULT 'user')
RETURNS JSONB AS '
DECLARE
  v_admin app_users%ROWTYPE;
  v_exists INT;
  v_new app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM app_users WHERE employee_number = p_admin_employee_number AND is_active = true;
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''admin_not_found'');
  END IF;
  IF v_admin.role != ''admin'' THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''not_authorized'');
  END IF;
  SELECT COUNT(*) INTO v_exists FROM app_users WHERE employee_number = p_employee_number;
  IF v_exists > 0 THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''employee_exists'');
  END IF;
  INSERT INTO app_users (employee_number, password_hash, name, role)
  VALUES (p_employee_number, crypt(p_password, gen_salt(''bf'')), p_name, p_role)
  RETURNING id, employee_number, name, role, is_active, created_at INTO v_new;
  RETURN jsonb_build_object(
    ''success'', true,
    ''user'', jsonb_build_object(
      ''id'', v_new.id,
      ''employeeNumber'', v_new.employee_number,
      ''name'', v_new.name,
      ''role'', v_new.role,
      ''isActive'', v_new.is_active,
      ''createdAt'', v_new.created_at
    )
  );
END;
' LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_users(p_admin_employee_number TEXT)
RETURNS JSONB AS '
DECLARE
  v_admin app_users%ROWTYPE;
  v_users JSONB;
BEGIN
  SELECT * INTO v_admin FROM app_users WHERE employee_number = p_admin_employee_number AND is_active = true;
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''admin_not_found'');
  END IF;
  IF v_admin.role != ''admin'' THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''not_authorized'');
  END IF;
  SELECT jsonb_agg(x) INTO v_users FROM (
    SELECT jsonb_build_object(
      ''id'', id,
      ''employeeNumber'', employee_number,
      ''name'', name,
      ''role'', role,
      ''isActive'', is_active,
      ''createdAt'', created_at
    ) AS x
    FROM app_users ORDER BY created_at ASC
  ) sub;
  RETURN jsonb_build_object(''success'', true, ''users'', COALESCE(v_users, ''[]''::jsonb));
END;
' LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_user(p_admin_employee_number TEXT, p_user_id UUID, p_name TEXT DEFAULT NULL, p_role TEXT DEFAULT NULL, p_is_active BOOLEAN DEFAULT NULL, p_password TEXT DEFAULT NULL)
RETURNS JSONB AS '
DECLARE
  v_admin app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM app_users WHERE employee_number = p_admin_employee_number AND is_active = true;
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''admin_not_found'');
  END IF;
  IF v_admin.role != ''admin'' THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''not_authorized'');
  END IF;
  UPDATE app_users SET
    name = COALESCE(p_name, name),
    role = COALESCE(p_role, role),
    is_active = COALESCE(p_is_active, is_active),
    password_hash = CASE WHEN p_password IS NOT NULL THEN crypt(p_password, gen_salt(''bf'')) ELSE password_hash END,
    updated_at = now()
  WHERE id = p_user_id;
  RETURN jsonb_build_object(''success'', true);
END;
' LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION delete_user(p_admin_employee_number TEXT, p_user_id UUID)
RETURNS JSONB AS '
DECLARE
  v_admin app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM app_users WHERE employee_number = p_admin_employee_number AND is_active = true;
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''admin_not_found'');
  END IF;
  IF v_admin.role != ''admin'' THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''not_authorized'');
  END IF;
  DELETE FROM app_users WHERE id = p_user_id;
  RETURN jsonb_build_object(''success'', true);
END;
' LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS '
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_users_updated_at ON app_users;
CREATE TRIGGER app_users_updated_at BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS forklifts_updated_at ON forklifts;
CREATE TRIGGER forklifts_updated_at BEFORE UPDATE ON forklifts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS checklists_updated_at ON checklists;
CREATE TRIGGER checklists_updated_at BEFORE UPDATE ON checklists
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

INSERT INTO app_users (employee_number, password_hash, name, role)
VALUES ('10008', crypt('Branco2025', gen_salt('bf')), 'Administrador', 'admin')
ON CONFLICT (employee_number) DO UPDATE
SET password_hash = crypt('Branco2025', gen_salt('bf')),
    name = 'Administrador',
    role = 'admin',
    is_active = true;
