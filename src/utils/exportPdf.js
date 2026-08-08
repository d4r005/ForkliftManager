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

    // --- 1. CABECERA (Ajustada a los recuadros blancos) ---
    // Identificación del montacargas (MC01)
    drawText(checklist.forkliftId, 110, height - 165, 11);
    // Nombre del operador
    drawText(checklist.operatorName, 380, height - 165, 10);
    // Fecha (Día/Mes/Año)
    drawText(`${checklist.day}/${checklist.month + 1}/${checklist.year}`, 110, height - 188, 10);
    // Nombre de quien revisa
    drawText(checklist.inspectorName, 380, height - 188, 10);

    // --- 2. CHECKLIST (Las 'X') ---
    // Calculamos la columna según el día del mes (1-31)
    // El '1' empieza aproximadamente en x=238. Cada columna mide unos 9.2 puntos.
    const xBaseColumn = 237.5;
    const xColumn = xBaseColumn + ((checklist.day - 1) * 9.25);

    // El primer item (Llantas) empieza en height - 250
    let yPos = height - 250.5;
    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      // Solo dibujamos si es SAT o INS (puedes cambiar la marca según el tipo si gustas)
      if (rating && rating !== 'N/A') {
        drawText('X', xColumn, yPos, 8);
      } else if (rating === 'N/A') {
        drawText('-', xColumn, yPos, 8);
      }
      yPos -= 14.05; // Salto de línea exacto para tus renglones
    });

    // --- 3. PIE DE PÁGINA ---
    // Nombre de quien revisa (abajo)
    drawText(checklist.inspectorName, 180, height - 618, 9);
    // Observaciones
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
