import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import { supabase } from '../lib/supabase.js';
import { getPdfConfig } from './pdfConfig.js';

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

    // Obtener dimensiones reales considerando rotación
    const { width, height } = page.getSize();

    const drawText = (text, x, y, size = 9) => {
        if (text === undefined || text === null || text === '') return;
        // Dibujamos usando coordenadas directas (0,0 es abajo-izquierda)
        page.drawText(String(text), {
          x: Number(x),
          y: Number(y),
          size: Number(size),
          color: rgb(0, 0, 0)
        });
    };

    // --- CABECERA ---
    const h = config.header;
    drawText(checklist.forkliftId, h.forkliftId.x, h.forkliftId.y, h.forkliftId.size);
    drawText(`${checklist.day}/${checklist.month + 1}/${checklist.year}`, h.date.x, h.date.y, h.date.size);
    drawText(checklist.operatorName, h.operatorName.x, h.operatorName.y, h.operatorName.size);

    // --- CHECKLIST ---
    const { baseX, baseY, deltaX, deltaY, fontSize } = config.checklist;
    const xColumn = baseX + ((checklist.day - 1) * deltaX);

    checklistItems.forEach((item, index) => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        // Calculamos Y restando el desplazamiento del índice
        const yPosItem = baseY - (index * deltaY);
        drawText(rating, xColumn, yPosItem, fontSize || 5);
      }
    });

    // --- PIE ---
    const f = config.footer;
    drawText(checklist.inspectorName, f.inspectorName.x, f.inspectorName.y, f.inspectorName.size);
    if (checklist.observations) {
      page.drawText(checklist.observations, {
        x: f.observations.x,
        y: f.observations.y,
        size: f.observations.size,
        maxWidth: width - (f.observations.x + 20),
        lineHeight: 10
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bitacora_${checklist.forkliftId}_D${checklist.day}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('PDF Error:', error);
    alert('Error al generar PDF: ' + error.message);
  }
}
