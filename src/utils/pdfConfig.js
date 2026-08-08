import { supabase } from '../lib/supabase.js';

/**
 * Configuración de coordenadas para el PDF.
 * Ahora se sincroniza con Supabase.
 */
const DEFAULT_CONFIG = {
  header: {
    forkliftId: { x: 50, y: 664, size: 10 },
    date: { x: 148, y: 664, size: 8.5 },
    operatorName: { x: 220, y: 664, size: 9 },
    inspectorNameTop: { x: 380, y: 664, size: 9 },
  },
  checklist: {
    baseX: 222.8,
    baseY: 600.0,
    deltaX: 9.25,
    deltaY: 12.82,
    fontSize: 5
  },
  footer: {
    inspectorName: { x: 175, y: 264, size: 9 },
    observations: { x: 130, y: 250, size: 7.5 }
  }
};

export const getPdfConfig = async () => {
  try {
    const { data, error } = await supabase
      .from('system_configs')
      .select('value')
      .eq('key', 'pdf_layout')
      .single();

    if (error || !data) {
      console.warn('Usando configuración PDF por defecto:', error?.message);
      return DEFAULT_CONFIG;
    }
    return data.value;
  } catch (err) {
    console.error('Error fetching PDF config:', err);
    return DEFAULT_CONFIG;
  }
};

export const savePdfConfig = async (config) => {
  const { error } = await supabase
    .from('system_configs')
    .upsert({ key: 'pdf_layout', value: config, updated_at: new Date().toISOString() });

  if (error) {
    console.error('Error saving PDF config:', error);
    throw error;
  }
};
