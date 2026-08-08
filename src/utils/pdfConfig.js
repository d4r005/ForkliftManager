import { supabase } from '../lib/supabase.js';

/**
 * Configuración de coordenadas para el PDF.
 * Ahora se sincroniza con Supabase.
 *
 * Calibrado contra el template real "templates/bitacora_v2.pdf"
 * (US Letter horizontal, 792x612pt). Los 26 renglones del checklist
 * NO tienen la misma altura (los renglones 1, 7 y 22 ocupan 2 líneas
 * de texto porque su descripción es más larga), por lo que en vez de
 * una fórmula lineal (baseY - index*deltaY) usamos un arreglo `itemY`
 * con la coordenada Y exacta de cada uno de los 26 renglones. Las
 * columnas de los días (1-31) sí son uniformes, por lo que baseX/deltaX
 * siguen usando la fórmula lineal.
 */
const DEFAULT_CONFIG = {
  header: {
    // El renglón de "Identificación del montacargas" tiene solo ~9.4pt de
    // espacio libre bajo su etiqueta (2 líneas), así que usa fuente más chica.
    forkliftId: { x: 53, y: 470.4, size: 7 },
    date: { x: 126, y: 474, size: 8 },
    operatorName: { x: 186, y: 474, size: 8.5 },
  },
  checklist: {
    baseX: 195.2,
    deltaX: 17.52,
    fontSize: 5,
    // Coordenada Y exacta por renglón (índice 0 = item id 1 ... índice 25 = item id 26)
    itemY: [
      434.8, 418.7, 410.9, 402.6, 394.1, 385.3, 376.2, 359.1, 350.1, 341.2,
      332.5, 322.9, 312.6, 303.1, 292.9, 283.3, 275.3, 267.2, 259.2, 251.1,
      243.1, 235.1, 219.5, 211.4, 203.4, 195.4
    ],
    // Fallback legacy por si algún config viejo no trae itemY
    baseY: 434.8,
    deltaY: 12.82
  },
  footer: {
    // La fila de "NOMBRE DE QUIEN REVISA" solo mide ~8pt de alto en el template.
    inspectorName: { x: 164, y: 187.5, size: 6.5 },
    observations: { x: 120, y: 176, size: 7.5 }
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

export { DEFAULT_CONFIG };
