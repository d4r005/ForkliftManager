/**
 * Configuración de coordenadas para el PDF.
 * Se guarda en localStorage para persistencia local del diseñador.
 */
const DEFAULT_CONFIG = {
  header: {
    forkliftId: { x: 50, y: 128, size: 10 },
    date: { x: 148, y: 128, size: 8.5 },
    operatorName: { x: 220, y: 128, size: 9 },
    inspectorNameTop: { x: 380, y: 128, size: 9 },
  },
  checklist: {
    baseX: 222.8,
    baseY: 192.5,
    deltaX: 9.25,
    deltaY: 12.82,
    fontSize: 5
  },
  footer: {
    inspectorName: { x: 175, y: 528, size: 9 },
    observations: { x: 130, y: 542, size: 7.5 }
  }
};

export const getPdfConfig = () => {
  const saved = localStorage.getItem('pdf_layout_config');
  if (saved) return JSON.parse(saved);
  return DEFAULT_CONFIG;
};

export const savePdfConfig = (config) => {
  localStorage.setItem('pdf_layout_config', JSON.stringify(config));
};
