-- ============================================================
-- MontaControl — Migración SQL para Supabase
-- Sistema: Login por número de empleado + contraseña
-- Admin: empleado 10008 / contraseña Branco2025
-- ============================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- ============================================
-- EXTENSIÓN para hash de contraseñas
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- TABLA: app_users (usuarios del sistema)
-- ============================================
CREATE TABLE IF NOT EXISTS public.app_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABLA: forklifts (montacargas)
-- ============================================
CREATE TABLE IF NOT EXISTS public.forklifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_code         TEXT NOT NULL,
  name            TEXT DEFAULT '',
  employee_number TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABLA: checklists (revisiones)
-- ============================================
CREATE TABLE IF NOT EXISTS public.checklists (
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

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_forklifts_emp ON public.forklifts(employee_number);
CREATE INDEX IF NOT EXISTS idx_checklists_emp ON public.checklists(employee_number);
CREATE INDEX IF NOT EXISTS idx_checklists_created ON public.checklists(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_emp ON public.app_users(employee_number);

-- ============================================
-- DESHABILITAR RLS (usamos RPC functions con SECURITY DEFINER)
-- ============================================
ALTER TABLE public.app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.forklifts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists DISABLE ROW LEVEL SECURITY;

-- ============================================
-- FUNCIÓN: LOGIN
-- ============================================
CREATE OR REPLACE FUNCTION public.login_user(p_employee_number TEXT, p_password TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.app_users
  WHERE employee_number = p_employee_number AND is_active = true;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_password');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'employeeNumber', v_user.employee_number,
      'name', v_user.name,
      'role', v_user.role
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCIÓN: CAMBIAR CONTRASEÑA
-- ============================================
CREATE OR REPLACE FUNCTION public.change_password(
  p_employee_number TEXT,
  p_old_password TEXT,
  p_new_password TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_user public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.app_users
  WHERE employee_number = p_employee_number AND is_active = true;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  IF v_user.password_hash != crypt(p_old_password, v_user.password_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_password');
  END IF;

  UPDATE public.app_users
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = v_user.id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCIÓN: CREAR USUARIO (solo admin)
-- ============================================
CREATE OR REPLACE FUNCTION public.create_user(
  p_admin_employee_number TEXT,
  p_employee_number TEXT,
  p_password TEXT,
  p_name TEXT,
  p_role TEXT DEFAULT 'user'
)
RETURNS JSONB AS $$
DECLARE
  v_admin public.app_users%ROWTYPE;
  v_exists INT;
BEGIN
  SELECT * INTO v_admin FROM public.app_users
  WHERE employee_number = p_admin_employee_number AND is_active = true;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_not_found');
  END IF;

  IF v_admin.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT COUNT(*) INTO v_exists FROM public.app_users WHERE employee_number = p_employee_number;
  IF v_exists > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'employee_exists');
  END IF;

  INSERT INTO public.app_users (employee_number, password_hash, name, role)
  VALUES (p_employee_number, crypt(p_password, gen_salt('bf')), p_name, p_role)
  RETURNING id, employee_number, name, role, is_active, created_at INTO v_admin;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_admin.id,
      'employeeNumber', v_admin.employee_number,
      'name', v_admin.name,
      'role', v_admin.role,
      'isActive', v_admin.is_active,
      'createdAt', v_admin.created_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCIÓN: LISTAR USUARIOS (solo admin)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_users(p_admin_employee_number TEXT)
RETURNS JSONB AS $$
DECLARE
  v_admin public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM public.app_users
  WHERE employee_number = p_admin_employee_number AND is_active = true;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_not_found');
  END IF;

  IF v_admin.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'users', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'employeeNumber', employee_number,
          'name', name,
          'role', role,
          'isActive', is_active,
          'createdAt', created_at
        )
      )
      FROM public.app_users
      ORDER BY created_at ASC
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCIÓN: ACTUALIZAR USUARIO (solo admin)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_user(
  p_admin_employee_number TEXT,
  p_user_id UUID,
  p_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_password TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_admin public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM public.app_users
  WHERE employee_number = p_admin_employee_number AND is_active = true;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_not_found');
  END IF;

  IF v_admin.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  UPDATE public.app_users SET
    name = COALESCE(p_name, name),
    role = COALESCE(p_role, role),
    is_active = COALESCE(p_is_active, is_active),
    password_hash = CASE WHEN p_password IS NOT NULL THEN crypt(p_password, gen_salt('bf')) ELSE password_hash END,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCIÓN: ELIMINAR USUARIO (solo admin)
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_user(
  p_admin_employee_number TEXT,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_admin public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM public.app_users
  WHERE employee_number = p_admin_employee_number AND is_active = true;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_not_found');
  END IF;

  IF v_admin.role != 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  DELETE FROM public.app_users WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCIÓN: TRIGGER updated_at automático
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_users_updated_at ON public.app_users;
CREATE TRIGGER app_users_updated_at BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS forklifts_updated_at ON public.forklifts;
CREATE TRIGGER forklifts_updated_at BEFORE UPDATE ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS checklists_updated_at ON public.checklists;
CREATE TRIGGER checklists_updated_at BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- USUARIO ADMIN INICIAL
-- Empleado: 10008  Contraseña: Branco2025
-- ============================================
INSERT INTO public.app_users (employee_number, password_hash, name, role)
VALUES ('10008', crypt('Branco2025', gen_salt('bf')), 'Administrador', 'admin')
ON CONFLICT (employee_number) DO UPDATE
SET password_hash = crypt('Branco2025', gen_salt('bf')),
    name = 'Administrador',
    role = 'admin',
    is_active = true;

-- ============================================
-- HECHO ✓
-- Admin: empleado 10008 / contraseña Branco2025
-- ============================================================
