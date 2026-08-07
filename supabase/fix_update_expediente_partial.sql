-- =====================================================
-- FIX: update_expediente() estaba BORRANDO datos en cada llamada parcial
-- Fecha: 2026-08-07
--
-- PROBLEMA ENCONTRADO:
-- La función original hacía:
--     UPDATE app_users SET curp = p_curp, rfc = p_rfc, ... WHERE ...
-- Todos los parámetros (p_curp, p_rfc, p_nss, p_job_title, p_photo_path,
-- p_dc3_pdf_path, p_diploma_pdf_path) tienen DEFAULT NULL.
--
-- MasterPdfImport.jsx (la importación masiva de PDF) SOLO envía el campo
-- del documento que está subiendo en ese momento (p.ej. p_dc3_pdf_path),
-- dejando el resto de los parámetros en su valor por defecto (NULL).
-- Como el UPDATE los asigna sin condición, cada importación BORRABA:
--   - El CURP y RFC ya guardados del empleado
--   - El puesto (job_title) y la foto
--   - La ruta del OTRO documento (p.ej. subir el Diploma borraba el DC3)
--
-- Esto es, casi con toda seguridad, la causa raíz de que el importador
-- deje de encontrar coincidencias por CURP con el tiempo: el CURP de
-- los empleados se va poniendo en NULL en la base de datos a medida que
-- se usa el importador.
--
-- SOLUCIÓN: usar COALESCE(parametro, valor_actual) para que un parámetro
-- no enviado (NULL) conserve el valor que ya existía en la fila, en vez
-- de borrarlo.
--
-- CÓMO APLICAR: pega y ejecuta este archivo completo en el SQL Editor de
-- tu proyecto de Supabase (Supabase Dashboard -> SQL Editor -> New query).
-- Es seguro ejecutarlo aunque ya tengas la versión anterior de la función.
-- =====================================================

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

  -- Actualizar el expediente: cada campo NO enviado (NULL) conserva su
  -- valor actual gracias a COALESCE, en vez de borrarse.
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

-- NOTA: si en algún momento SÍ necesitas borrar explícitamente un campo
-- (por ejemplo, quitar una foto), esta versión con COALESCE ya no lo
-- permite pasando NULL. Si tu app necesita esa capacidad, dímelo y agrego
-- un parámetro booleano "p_clear_photo" (o similar) para permitir el borrado
-- explícito sin reintroducir el bug de borrado accidental.
