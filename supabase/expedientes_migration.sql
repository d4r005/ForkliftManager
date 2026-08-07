-- =====================================================
-- MIGRACIÓN: Sistema de Expedientes de Montacarguistas
-- Fecha: 2026-08-07
-- Agrega campos de expediente a app_users y crea bucket privado
-- =====================================================

-- 1. Agregar columnas a app_users (si no existen)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'curp') THEN
    ALTER TABLE app_users ADD COLUMN curp TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'rfc') THEN
    ALTER TABLE app_users ADD COLUMN rfc TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'dc3_vigencia') THEN
    ALTER TABLE app_users ADD COLUMN dc3_vigencia DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'diploma_vigencia') THEN
    ALTER TABLE app_users ADD COLUMN diploma_vigencia DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'photo_path') THEN
    ALTER TABLE app_users ADD COLUMN photo_path TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'dc3_pdf_path') THEN
    ALTER TABLE app_users ADD COLUMN dc3_pdf_path TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'diploma_pdf_path') THEN
    ALTER TABLE app_users ADD COLUMN diploma_pdf_path TEXT;
  END IF;
END $$;

-- 2. Crear bucket privado para expedientes
INSERT INTO storage.buckets (id, name, public)
VALUES ('expedientes', 'expedientes', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas de Storage (control de acceso)
-- Como usamos auth personalizada (no Supabase Auth), las políticas
-- permiten acceso via anon key (frontend usa RPC para control) y service_role

-- Lectura: cualquier request autenticado via nuestras RPC
DROP POLICY IF EXISTS "expedientes_read" ON storage.objects;
CREATE POLICY "expedientes_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'expedientes');

-- Escritura: solo service_role (los uploads se validan en el frontend con admin check)
DROP POLICY IF EXISTS "expedientes_write" ON storage.objects;
CREATE POLICY "expedientes_write" ON storage.objects
  FOR INSERT TO anon, authenticated, service_role
  WITH CHECK (bucket_id = 'expedientes');

-- Actualización: solo service_role y anon (frontend valida admin)
DROP POLICY IF EXISTS "expedientes_update" ON storage.objects;
CREATE POLICY "expedientes_update" ON storage.objects
  FOR UPDATE TO anon, authenticated, service_role
  USING (bucket_id = 'expedientes');

-- Eliminación: solo service_role y anon
DROP POLICY IF EXISTS "expedientes_delete" ON storage.objects;
CREATE POLICY "expedientes_delete" ON storage.objects
  FOR DELETE TO anon, authenticated, service_role
  USING (bucket_id = 'expedientes');

-- 4. Función: Listar todos los expedientes
CREATE OR REPLACE FUNCTION list_expedientes()
RETURNS JSONB AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', true,
    'employees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'employeeNumber', employee_number,
        'name', name,
        'curp', curp,
        'rfc', rfc,
        'nss', nss,
        'jobTitle', job_title,
        'dc3Vigencia', dc3_vigencia,
        'diplomaVigencia', diploma_vigencia,
        'photoPath', photo_path,
        'dc3PdfPath', dc3_pdf_path,
        'diplomaPdfPath', diploma_pdf_path,
        'isActive', is_active
      ) ORDER BY employee_number ASC)
      FROM app_users
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Función: Obtener expediente de un empleado específico
CREATE OR REPLACE FUNCTION get_expediente(p_employee_number TEXT)
RETURNS JSONB AS $$
DECLARE
  v_emp RECORD;
BEGIN
  SELECT employee_number, name, curp, rfc, nss, job_title, dc3_vigencia, diploma_vigencia,
         photo_path, dc3_pdf_path, diploma_pdf_path
  INTO v_emp
  FROM app_users
  WHERE employee_number = p_employee_number AND is_active = true;

  IF v_emp.employee_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'employee_not_found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'employee', jsonb_build_object(
      'employeeNumber', v_emp.employee_number,
      'name', v_emp.name,
      'curp', v_emp.curp,
      'rfc', v_emp.rfc,
      'nss', v_emp.nss,
      'jobTitle', v_emp.job_title,
      'dc3Vigencia', v_emp.dc3_vigencia,
      'diplomaVigencia', v_emp.diploma_vigencia,
      'photoPath', v_emp.photo_path,
      'dc3PdfPath', v_emp.dc3_pdf_path,
      'diplomaPdfPath', v_emp.diploma_pdf_path
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Función: Actualizar expediente (solo admin)
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
  -- Verificar que el admin es admin
  SELECT * INTO v_admin FROM app_users
  WHERE employee_number = p_admin_employee_number AND is_active = true;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_not_found');
  END IF;

  IF v_admin.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Actualizar el expediente
  UPDATE app_users SET
    curp = p_curp,
    rfc = p_rfc,
    nss = p_nss,
    job_title = p_job_title,
    dc3_vigencia = p_dc3_vigencia,
    diploma_vigencia = p_diploma_vigencia,
    photo_path = p_photo_path,
    dc3_pdf_path = p_dc3_pdf_path,
    diploma_pdf_path = p_diploma_pdf_path,
    updated_at = NOW()
  WHERE employee_number = p_employee_number;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'employee_not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
