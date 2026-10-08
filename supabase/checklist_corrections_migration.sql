-- =====================================================
-- MIGRACIÓN: Seguimiento de insatisfactorios (correcciones)
-- Fecha: 2026-10-08
-- Registra quién corrigió un punto INS, cuándo, notas y
-- quién verificó la corrección. Tabla 'checklist_corrections'.
-- =====================================================

CREATE TABLE IF NOT EXISTS checklist_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  item_id int NOT NULL,
  corrected_by TEXT,
  corrected_at DATE DEFAULT CURRENT_DATE,
  correction_notes TEXT,
  verified_by TEXT,
  verified_at DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (checklist_id, item_id)
);

-- Índice para búsquedas por checklist
CREATE INDEX IF NOT EXISTS idx_corrections_checklist
  ON checklist_corrections (checklist_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION set_correction_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_corrections_updated ON checklist_corrections;
CREATE TRIGGER trg_corrections_updated
  BEFORE UPDATE ON checklist_corrections
  FOR EACH ROW EXECUTE FUNCTION set_correction_updated_at();
