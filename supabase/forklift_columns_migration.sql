-- =====================================================
-- ForkliftManager — Migración: Columnas de datos del equipo
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- Agregar columnas para datos del equipo y fotos
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS model TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS serial_number TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS capacity TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS capacity_unit TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS power_type TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS mast_type TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS max_lift_height TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS tire_type TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS manufacture_year TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS voltage TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS weight TEXT DEFAULT '';
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS photo_path TEXT;
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS plate_photo_path TEXT;
ALTER TABLE forklifts ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Verificar
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'forklifts' ORDER BY ordinal_position;
