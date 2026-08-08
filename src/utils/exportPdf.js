import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import { translations } from '../i18n/translations.js';
import { supabase } from '../lib/supabase.js';

export async function exportChecklistToPdf(checklist, lang = 'es') {
  try {
    const { data } = supabase.storage.from('expedientes').getPublicUrl('templates/template.pdf');
    const freshUrl = `${data.publicUrl}?t=${Date.now()}`;

    const response = await fetch(freshUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo descargar la plantilla.');
    const templateBytes = await response.arrayBuffer();

    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const drawText = (text, x, y, size = 9) => {
        if (!text) return;
        page.drawText(String(text), { x, y, size, color: rgb(0, 0, 0) });
    };

    // --- 1. CABECERA (NUEVA PLANTILLA) ---
    // Identificación del montacargas
    drawText(checklist.forkliftId, 50, height - 128, 10);
    // Fecha (en el recuadro central pequeño)
    drawText(`${checklist.day}/${checklist.month + 1}/${checklist.year}`, 148, height - 128, 9);
    // Nombre del operador
    drawText(checklist.operatorName, 220, height - 128, 9);
    // Inspector (arriba junto al operador si es necesario, o solo abajo)
    // drawText(checklist.inspectorName, 380, height - 128, 9);

    // --- 2. CHECKLIST (SAT / INS / N/A) ---
    // Columna del día: El '1' está en x=223 aprox. Ancho col = 9.2 pts
    const xBaseColumn = 222.8;
    const xColumn = xBaseColumn + ((checklist.day - 1) * 9.25);

    // Y inicial: El item 1 está en height - 192 aprox.
    let yPos = height - 192.5;
    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        // Dibujamos el rating centrado en la celda
        drawText(rating, xColumn, yPos + 1.5, 5);
      }
      yPos -= 12.82; // Espaciado vertical para la nueva plantilla
    });

    // --- 3. PIE DE PÁGINA ---
    // Nombre de quien revisa
    drawText(checklist.inspectorName, 175, height - 528, 9);
    // Observaciones
    if (checklist.observations) {
      page.drawText(checklist.observations, {
        x: 130,
        y: height - 542,
        size: 7.5,
        maxWidth: width - 200,
        lineHeight: 9,
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
