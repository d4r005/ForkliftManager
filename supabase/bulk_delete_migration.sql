-- =====================================================
-- MIGRACIÓN: Eliminación Masiva de Usuarios
-- Fecha: 2026-08-07
-- =====================================================

CREATE OR REPLACE FUNCTION bulk_delete_users(
  p_admin_employee_number TEXT,
  p_user_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
  v_admin app_users%ROWTYPE;
BEGIN
  -- Verificar admin
  SELECT * INTO v_admin FROM app_users
  WHERE employee_number = p_admin_employee_number AND is_active = true;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_not_found');
  END IF;

  IF v_admin.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Eliminar usuarios (excepto al admin que ejecuta la acción para mayor seguridad)
  DELETE FROM app_users
  WHERE id = ANY(p_user_ids)
    AND employee_number != p_admin_employee_number;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
