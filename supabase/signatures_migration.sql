-- =====================================================
-- MIGRACIÓN: Firmas manuscritas en el checklist
-- Fecha: 2026-10-08
-- Agrega columnas para las firmas (PNG en data URL) del
-- operador y de quien revisa en la tabla checklists.
-- =====================================================

ALTER TABLE checklists ADD COLUMN IF NOT EXISTS operator_signature TEXT;
ALTER TABLE checklists ADD COLUMN IF NOT EXISTS inspector_signature TEXT;
