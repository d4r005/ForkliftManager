-- =====================================================
-- FIX: update_expediente() - dos problemas encontrados
-- Fecha: 2026-08-07
--
-- PROBLEMA 1 (causa de "0 documentos asignados"):
-- En tu base de datos existen DOS versiones (overloads) de update_expediente:
--   A) update_expediente(p_admin_employee_number, p_employee_number, p_curp,
--      p_rfc, p_dc3_vigencia, p_diploma_vigencia, p_photo_path,
--      p_dc3_pdf_path, p_diploma_pdf_path)                    -- 9 parámetros (vieja)
--   B) la misma pero con p_nss y p_job_title agregados          -- 11 parámetros (nueva)
--
-- Esto pasó porque en algún momento se agregó nss/job_title con
-- CREATE OR REPLACE, pero como la lista de parámetros cambió, Postgres la
-- registró como una función NUEVA en vez de reemplazar la vieja — quedaron
-- las dos coexistiendo.
--
-- Cuando MasterPdfImport.jsx llama al RPC enviando solo ALGUNOS parámetros
-- (p.ej. solo admin + employee + dc3_pdf_path), Postgres/PostgREST no puede
-- decidir cuál de las dos funciones usar (ambas son candidatas válidas) y
-- responde con error "Could not choose the best candidate function" (código
-- PGRST203). El código no mostraba ese error al usuario, solo lo registraba
-- en la consola del navegador, por eso se veía como "0 documentos asignados"
-- sin explicación. (EmployeeRecords.jsx nunca tuvo el problema porque siempre
-- manda TODOS los parámetros, lo que resuelve la ambigüedad).
--
-- PROBLEMA 2 (visto antes):
-- La función hacía UPDATE ... SET curp = p_curp (sin COALESCE), así que un
-- parámetro no enviado (NULL por default) borraba el valor ya guardado.
--
-- SOLUCIÓN: eliminar la versión vieja (9 parámetros) y dejar solo la de 11
-- parámetros, con COALESCE para que un campo no enviado conserve su valor.
--
-- CÓMO APLICAR: pega y ejecuta este archivo completo en el SQL Editor de tu
-- proyecto de Supabase (Dashboard -> SQL Editor -> New query -> Run).
-- Es seguro ejecutarlo aunque ya hayas corrido una versión anterior de este fix.
-- =====================================================

-- 1) Eliminar la versión vieja (9 parámetros, sin nss/job_title) que causa
--    la ambigüedad. Si esta firma exacta no existe, el DROP simplemente no
--    hace nada (gracias a IF EXISTS) y no da error.
DROP FUNCTION IF EXISTS update_expediente(
  text, text, text, text, date, date, text, text, text
);

-- 2) Dejar UNA sola versión correcta (11 parámetros) con COALESCE.
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

-- 3) Verificación: debe existir SOLO UNA función llamada update_expediente.
--    Corre esto después y confirma que devuelve 1 sola fila.
-- SELECT proname, pg_get_function_arguments(oid)
-- FROM pg_proc WHERE proname = 'update_expediente';

-- NOTA: si en algún momento SÍ necesitas borrar explícitamente un campo
-- (por ejemplo, quitar una foto), esta versión con COALESCE ya no lo
-- permite pasando NULL. Si tu app necesita esa capacidad, dímelo y agrego
-- un parámetro booleano "p_clear_photo" (o similar) para permitir el borrado
-- explícito sin reintroducir el bug de borrado accidental.
