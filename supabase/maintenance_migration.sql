-- =====================================================
-- MIGRACIÓN: Mantenimiento por horas (horómetro)
-- Fecha: 2026-10-08
-- Agrega a cada montacargas: horas actuales del horómetro,
-- horas al último servicio e intervalo de servicio (h).
-- Tabla 'maintenance_records' = historial de mantenimientos.
-- =====================================================

ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS current_hours NUMERIC DEFAULT 0;
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS hours_last_service NUMERIC DEFAULT 0;
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS service_interval_hours INT DEFAULT 200;

CREATE TABLE IF NOT EXISTS maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forklift_id uuid NOT NULL REFERENCES forklifts(id) ON DELETE CASCADE,
  performed_at DATE DEFAULT CURRENT_DATE,
  maintenance_type TEXT NOT NULL DEFAULT 'preventivo',
  hours_at_service NUMERIC,
  performed_by TEXT,
  notes TEXT,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_forklift
  ON maintenance_records (forklift_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_date
  ON maintenance_records (performed_at DESC);
