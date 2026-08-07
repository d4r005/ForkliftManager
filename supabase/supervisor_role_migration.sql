-- ============================================================================
-- Migración: rol "supervisor" + fix del bug de creación de usuarios
-- ============================================================================
-- Ejecuta TODO este archivo en Supabase Dashboard > SQL Editor > New Query.
--
-- Qué hace:
-- 1) Arregla el bug "invalid input syntax for type boolean: ...timestamp..."
--    al crear usuarios (create_user tenía un RETURNING ... INTO mal armado
--    que intentaba mapear 6 columnas dentro de un registro de 8 columnas).
-- 2) Agrega el rol "supervisor" (además de admin/user).
-- 3) Reglas del supervisor:
--    - Acceso a todo igual que un admin (montacargas, checklists, expedientes).
--    - NO puede crear usuarios.
--    - NO puede eliminar usuarios (ni individual ni en bulk).
--    - SÍ puede editar/cambiar contraseña de usuarios normales.
--    - NO puede tocar la cuenta del Administrador (ni su contraseña, ni su
--      rol, ni su estado) — queda completamente protegida.
--    - NO puede otorgar el rol "admin" a nadie (evita escalar privilegios).
-- ============================================================================

-- 1) Permitir el nuevo rol en la tabla
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'user', 'supervisor'));

-- 2) create_user: FIX del bug + soporte de rol supervisor (sigue siendo solo admin)
CREATE OR REPLACE FUNCTION create_user(
  p_admin_employee_number TEXT,
  p_employee_number TEXT,
  p_password TEXT,
  p_name TEXT,
  p_role TEXT DEFAULT 'user'
)
RETURNS JSONB AS '
DECLARE
  v_admin app_users%ROWTYPE;
  v_exists INT;
  v_id UUID;
  v_created_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_admin FROM app_users WHERE employee_number = p_admin_employee_number AND is_active = true;
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''admin_not_found'');
  END IF;

  -- Solo el administrador puede crear usuarios (supervisor NO puede)
  IF v_admin.role != ''admin'' THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''not_authorized'');
  END IF;

  IF p_role NOT IN (''admin'', ''user'', ''supervisor'') THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''invalid_role'');
  END IF;

  SELECT COUNT(*) INTO v_exists FROM app_users WHERE employee_number = p_employee_number;
  IF v_exists > 0 THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''employee_exists'');
  END IF;

  -- FIX: antes se hacía "RETURNING id, employee_number, name, role, is_active,
  -- created_at INTO v_new" con v_new declarada como app_users%ROWTYPE (8
  -- columnas). Como el RETURNING solo traía 6, Postgres las mapeaba
  -- posicionalmente mal (created_at terminaba cayendo en el campo
  -- is_active/boolean) -> "invalid input syntax for type boolean".
  -- Ahora capturamos cada valor en su propia variable, sin ambigüedad.
  INSERT INTO app_users (employee_number, password_hash, name, role)
  VALUES (p_employee_number, crypt(p_password, gen_salt(''bf'')), p_name, p_role)
  RETURNING id, created_at INTO v_id, v_created_at;

  RETURN jsonb_build_object(
    ''success'', true,
    ''user'', jsonb_build_object(
      ''id'', v_id,
      ''employeeNumber'', p_employee_number,
      ''name'', p_name,
      ''role'', p_role,
      ''isActive'', true,
      ''createdAt'', v_created_at
    )
  );
END;
' LANGUAGE plpgsql SECURITY DEFINER;

-- 3) get_users: admin y supervisor pueden listar usuarios
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
  IF v_admin.role NOT IN (''admin'', ''supervisor'') THEN
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

-- 4) update_user: admin y supervisor pueden editar, pero el supervisor:
--    - no puede tocar la cuenta del admin (ninguna columna, incluida password)
--    - no puede otorgar el rol admin a nadie
CREATE OR REPLACE FUNCTION update_user(
  p_admin_employee_number TEXT,
  p_user_id UUID,
  p_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_password TEXT DEFAULT NULL
)
RETURNS JSONB AS '
DECLARE
  v_admin app_users%ROWTYPE;
  v_target app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM app_users WHERE employee_number = p_admin_employee_number AND is_active = true;
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''admin_not_found'');
  END IF;
  IF v_admin.role NOT IN (''admin'', ''supervisor'') THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''not_authorized'');
  END IF;

  SELECT * INTO v_target FROM app_users WHERE id = p_user_id;
  IF v_target.id IS NULL THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''user_not_found'');
  END IF;

  IF v_admin.role = ''supervisor'' THEN
    IF v_target.role = ''admin'' THEN
      RETURN jsonb_build_object(''success'', false, ''error'', ''cannot_modify_admin'');
    END IF;
    IF p_role = ''admin'' THEN
      RETURN jsonb_build_object(''success'', false, ''error'', ''not_authorized'');
    END IF;
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN (''admin'', ''user'', ''supervisor'') THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''invalid_role'');
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

-- 5) delete_user y bulk_delete_users quedan sin cambios: siguen exigiendo
--    role = 'admin', así que un supervisor jamás podrá eliminar usuarios.

-- ============================================================================
-- 6) update_expediente: también admin y supervisor (antes solo admin).
--    El supervisor tiene acceso completo a expedientes (montacargas,
--    checklists, expedientes) salvo la gestión de cuentas de usuario.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_expediente(
  p_admin_employee_number TEXT,
  p_employee_number TEXT,
  p_curp TEXT DEFAULT NULL,
  p_rfc TEXT DEFAULT NULL,
  p_nss TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL,
  p_dc3_vigencia DATE DEFAULT NULL,
  p_diploma_vigencia DATE DEFAULT NULL,
  p_photo_path TEXT DEFAULT NULL,
  p_dc3_pdf_path TEXT DEFAULT NULL,
  p_diploma_pdf_path TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_admin app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM app_users
  WHERE employee_number = p_admin_employee_number AND is_active = true;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_not_found');
  END IF;

  IF v_admin.role NOT IN ('admin', 'supervisor') THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  UPDATE app_users SET
    curp = COALESCE(p_curp, curp),
    rfc = COALESCE(p_rfc, rfc),
    nss = COALESCE(p_nss, nss),
    job_title = COALESCE(p_job_title, job_title),
    dc3_vigencia = COALESCE(p_dc3_vigencia, dc3_vigencia),
    diploma_vigencia = COALESCE(p_diploma_vigencia, diploma_vigencia),
    photo_path = COALESCE(p_photo_path, photo_path),
    dc3_pdf_path = COALESCE(p_dc3_pdf_path, dc3_pdf_path),
    diploma_pdf_path = COALESCE(p_diploma_pdf_path, diploma_pdf_path),
    updated_at = NOW()
  WHERE employee_number = p_employee_number;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'employee_not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
