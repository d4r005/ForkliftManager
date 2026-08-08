import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import { translations } from '../i18n/translations.js';
import { supabase } from '../lib/supabase.js';
import { getPdfConfig } from './pdfConfig.js';

export async function exportChecklistToPdf(checklist, lang = 'es') {
  try {
    const config = getPdfConfig();

    const { data: templateBlob, error: downloadError } = await supabase.storage
      .from('expedientes')
      .download('templates/bitacora_v2.pdf');

    if (downloadError) {
      throw new Error(`No se encontró el archivo 'templates/bitacora_v2.pdf' en Supabase.`);
    }

    const templateBytes = await templateBlob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const drawText = (text, x, y, size = 9) => {
        if (!text) return;
        page.drawText(String(text), { x, y, size, color: rgb(0, 0, 0) });
    };

    // --- COORDINADAS DINÁMICAS DESDE EL DISEÑADOR ---
    drawText(checklist.forkliftId, config.header.forkliftId.x, config.header.forkliftId.y, config.header.forkliftId.size);
    drawText(`${checklist.day}/${checklist.month + 1}/${checklist.year}`, config.header.date.x, config.header.date.y, config.header.date.size);
    drawText(checklist.operatorName, config.header.operatorName.x, config.header.operatorName.y, config.header.operatorName.size);

    const { baseX, baseY, deltaX, deltaY, fontSize: checkSize } = config.checklist;
    const xColumn = baseX + ((checklist.day - 1) * deltaX);

    let yPos = baseY;
    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        drawText(rating, xColumn, yPos + 1.5, checkSize);
      }
      yPos -= deltaY;
    });

    drawText(checklist.inspectorName, config.footer.inspectorName.x, config.footer.inspectorName.y, config.footer.inspectorName.size);
    if (checklist.observations) {
      page.drawText(checklist.observations, {
        x: config.footer.observations.x,
        y: config.footer.observations.y,
        size: config.footer.observations.size,
        maxWidth: width - 200,
        lineHeight: 9,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bitacora_${checklist.forkliftId}_${checklist.day}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('PDF Error:', error);
    alert('Error: ' + error.message);
  }
}
