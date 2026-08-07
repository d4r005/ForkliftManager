-- ============================================================
-- MontaControl — Migración SQL para Supabase
-- Ejecuta este script en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- ============================================
-- TABLA: forklifts (montacargas)
-- ============================================
CREATE TABLE IF NOT EXISTS public.forklifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_code     TEXT NOT NULL,
  name        TEXT DEFAULT '',
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
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
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_forklifts_user ON public.forklifts(user_id);
CREATE INDEX IF NOT EXISTS idx_checklists_user ON public.checklists(user_id);
CREATE INDEX IF NOT EXISTS idx_checklists_created ON public.checklists(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE public.forklifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

-- Políticas para forklifts
CREATE POLICY "Users can CRUD own forklifts"
  ON public.forklifts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Políticas para checklists
CREATE POLICY "Users can CRUD own checklists"
  ON public.checklists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- TRIGGER: updated_at automático
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forklifts_updated_at ON public.forklifts;
CREATE TRIGGER forklifts_updated_at
  BEFORE UPDATE ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS checklists_updated_at ON public.checklists;
CREATE TRIGGER checklists_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- TRIGGER: auto-set user_id on insert
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_user_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.user_id = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forklifts_set_user_id ON public.forklifts;
CREATE TRIGGER forklifts_set_user_id
  BEFORE INSERT ON public.forklifts
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_id();

DROP TRIGGER IF EXISTS checklists_set_user_id ON public.checklists;
CREATE TRIGGER checklists_set_user_id
  BEFORE INSERT ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_id();

-- ============================================
-- HECHO ✓
-- ============================================
