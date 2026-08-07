-- =====================================================
-- ForkliftManager — Migración: Incluir foto en login_user()
-- Ejecutar en Supabase SQL Editor
-- =====================================================

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
      ''role'', v_user.role,
      ''photoPath'', v_user.photo_path
    )
  );
END;
' LANGUAGE plpgsql SECURITY DEFINER;
