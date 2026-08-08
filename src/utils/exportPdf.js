import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import { translations } from '../i18n/translations.js';
import { supabase } from '../lib/supabase.js';

export async function exportChecklistToPdf(checklist, lang = 'es') {
  try {
    // Apuntamos al nuevo nombre de archivo para saltar el caché de raíz
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

    // --- COORDENADAS PARA PLANTILLA NUEVA (RECUADROS BLANCOS) ---

    // 1. Identificación del montacargas (Recuadro 1)
    drawText(checklist.forkliftId, 45, height - 128, 10);

    // 2. Fecha (Recuadro 2 - Central)
    const dateText = `${checklist.day}/${checklist.month + 1}/${checklist.year}`;
    drawText(dateText, 142, height - 128, 8.5);

    // 3. Nombre del operador (Recuadro 3 - Largo)
    drawText(checklist.operatorName, 225, height - 128, 9);

    // --- CHECKLIST ---
    // Columna del día: El '1' está en x=223 aprox.
    const xBaseColumn = 222.8;
    const xColumn = xBaseColumn + ((checklist.day - 1) * 9.25);

    // Y inicial: El item 1 (Llantas) está más arriba en la nueva plantilla
    let yPos = height - 192.5;
    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        drawText(rating, xColumn, yPos + 1.5, 5);
      }
      yPos -= 12.82; // Espaciado vertical reducido para la nueva plantilla
    });

    // --- PIE DE PÁGINA ---
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
    link.download = `Bitacora_${checklist.forkliftId}_${checklist.day}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('PDF Error:', error);
    alert('Error: ' + error.message);
  }
}
