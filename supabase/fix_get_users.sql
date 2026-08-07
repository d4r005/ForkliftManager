-- FIX: get_users tenía un bug de SQL (ORDER BY + agregado sin subquery)
-- Ejecuta SOLO esto en Supabase SQL Editor para corregirlo:

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
