import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import { supabase } from '../lib/supabase.js';
import { getPdfConfig } from './pdfConfig.js';

/**
 * Genera el PDF.
 * overrideConfig permite al Diseñador probar cambios sin guardar en DB.
 */
export async function exportChecklistToPdf(checklist, lang = 'es', overrideConfig = null) {
  try {
    const config = overrideConfig || await getPdfConfig();

    const { data: templateBlob, error: downloadError } = await supabase.storage
      .from('expedientes')
      .download('templates/bitacora_v2.pdf');

    if (downloadError) throw new Error(`Error: ${downloadError.message}`);

    const templateBytes = await templateBlob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const drawText = (text, x, y, size = 9) => {
        if (text === undefined || text === null || text === '') return;
        // pdf-lib usa (0,0) abajo a la izquierda.
        page.drawText(String(text), { x, y, size, color: rgb(0, 0, 0) });
    };

    // --- CABECERA ---
    const h = config.header;
    drawText(checklist.forkliftId, h.forkliftId.x, h.forkliftId.y, h.forkliftId.size);
    drawText(`${checklist.day}/${checklist.month + 1}/${checklist.year}`, h.date.x, h.date.y, h.date.size);
    drawText(checklist.operatorName, h.operatorName.x, h.operatorName.y, h.operatorName.size);

    // --- CHECKLIST ---
    const { baseX, baseY, deltaX, deltaY, fontSize } = config.checklist;
    const xColumn = baseX + ((checklist.day - 1) * deltaX);

    let yPosCurrent = baseY;
    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        // Escribimos SAT/INS centrado un poco
        drawText(rating, xColumn, yPosCurrent, fontSize || 5);
      }
      yPosCurrent -= deltaY; // Bajamos en el PDF (restando Y)
    });

    // --- PIE ---
    const f = config.footer;
    drawText(checklist.inspectorName, f.inspectorName.x, f.inspectorName.y, f.inspectorName.size);
    if (checklist.observations) {
      page.drawText(checklist.observations, {
        x: f.observations.x, y: f.observations.y,
        size: f.observations.size, maxWidth: width - 200, lineHeight: 10
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bitacora_Prueba.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('PDF Error:', error);
    alert('Error: ' + error.message);
  }
}
