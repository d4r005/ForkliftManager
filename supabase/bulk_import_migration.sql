-- =====================================================
-- IMPORTACIÓN MASIVA DE EMPLEADOS CON EXPEDIENTE
-- =====================================================

-- Función: Importar múltiples empleados con datos de expediente
-- Recibe un array JSON con los datos de cada empleado
-- Crea el usuario (si no existe) y actualiza el expediente
CREATE OR REPLACE FUNCTION bulk_import_employees(
  p_admin_employee_number TEXT,
  p_employees JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_admin app_users%ROWTYPE;
  v_emp JSONB;
  v_results JSONB[] := ARRAY[]::JSONB[];
  v_user_id UUID;
  v_existing app_users%ROWTYPE;
  v_success_count INT := 0;
  v_error_count INT := 0;
  v_created_count INT := 0;
  v_updated_count INT := 0;
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

  FOR v_emp IN SELECT * FROM jsonb_array_elements(p_employees)
  LOOP
    BEGIN
      -- Buscar si ya existe el empleado
      SELECT * INTO v_existing
      FROM app_users
      WHERE employee_number = v_emp->>'employee_number';

      IF v_existing.id IS NULL THEN
        -- Crear nuevo usuario
        INSERT INTO app_users (employee_number, password_hash, name, role, is_active)
        VALUES (
          v_emp->>'employee_number',
          crypt(v_emp->>'password', gen_salt('bf')),
          v_emp->>'name',
          COALESCE(v_emp->>'role', 'user'),
          true
        )
        RETURNING id INTO v_user_id;

        v_created_count := v_created_count + 1;
      ELSE
        -- Actualizar expediente del usuario existente
        v_user_id := v_existing.id;
        v_updated_count := v_updated_count + 1;
      END IF;

      -- Actualizar expediente (CURP, RFC, vigencias, paths)
      UPDATE app_users SET
        curp = NULLIF(v_emp->>'curp', ''),
        rfc = NULLIF(v_emp->>'rfc', ''),
        nss = NULLIF(v_emp->>'nss', ''),
        job_title = NULLIF(v_emp->>'job_title', ''),
        dc3_vigencia = NULLIF(v_emp->>'dc3_vigencia', '')::DATE,
        diploma_vigencia = NULLIF(v_emp->>'diploma_vigencia', '')::DATE,
        updated_at = NOW()
      WHERE id = v_user_id;

      v_success_count := v_success_count + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'employee_number', v_emp->>'employee_number',
        'name', v_emp->>'name',
        'status', CASE WHEN v_existing.id IS NULL THEN 'created' ELSE 'updated' END,
        'success', true
      ));

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'employee_number', v_emp->>'employee_number',
        'name', v_emp->>'name',
        'status', 'error',
        'success', false,
        'error', SQLERRM
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total', jsonb_array_length(p_employees),
    'created', v_created_count,
    'updated', v_updated_count,
    'errors', v_error_count,
    'results', to_jsonb(v_results)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
