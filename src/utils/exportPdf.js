import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import { translations } from '../i18n/translations.js';
import { supabase } from '../lib/supabase.js';

export async function exportChecklistToPdf(checklist, lang = 'es') {
  try {
    const { data: templateBlob, error: downloadError } = await supabase.storage
      .from('expedientes')
      .download('templates/template.pdf');

    if (downloadError) throw new Error(`Error al descargar plantilla: ${downloadError.message}`);
    const templateBytes = await templateBlob.arrayBuffer();

    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const drawText = (text, x, y, size = 9) => {
        if (!text) return;
        page.drawText(String(text), { x, y, size, color: rgb(0, 0, 0) });
    };

    // --- 1. CABECERA ---
    drawText(checklist.forkliftId, 110, height - 165, 11);
    drawText(checklist.operatorName, 380, height - 165, 10);
    drawText(`${checklist.day}/${checklist.month + 1}/${checklist.year}`, 110, height - 188, 10);
    drawText(checklist.inspectorName, 380, height - 188, 10);

    // --- 2. CHECKLIST (SAT / INS / N/A) ---
    // xBaseColumn ajustado para centrar texto de 3 letras
    const xBaseColumn = 236.2;
    const xColumn = xBaseColumn + ((checklist.day - 1) * 9.25);

    let yPos = height - 250.5;
    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        // Escribimos SAT, INS o N/A con fuente pequeña para que quepa en el cuadro
        drawText(rating, xColumn, yPos + 1.5, 5.5);
      }
      yPos -= 14.05;
    });

    // --- 3. PIE DE PÁGINA ---
    drawText(checklist.inspectorName, 180, height - 618, 9);
    if (checklist.observations) {
      page.drawText(checklist.observations, {
        x: 130,
        y: height - 632,
        size: 8,
        maxWidth: width - 200,
        lineHeight: 10,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bitacora_${checklist.forkliftId}_Dia_${checklist.day}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error:', error);
    alert('Error al generar el PDF: ' + error.message);
  }
}
