import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import { translations } from '../i18n/translations.js';
import { supabase } from '../lib/supabase.js';

export async function exportChecklistToPdf(checklist, lang = 'es') {
  try {
    // 1. Descargar la plantilla usando el cliente oficial de Supabase
    // Esto evita errores de CORS y problemas de permisos públicos.
    const { data: templateBlob, error: downloadError } = await supabase.storage
      .from('expedientes')
      .download('templates/template.pdf', {
        cacheControl: '0', // Forzar descarga fresca
      });

    if (downloadError) {
      console.error('Download error:', downloadError);
      throw new Error(`Error de Supabase: ${downloadError.message}`);
    }

    const templateBytes = await templateBlob.arrayBuffer();

    // 2. Cargar y preparar el PDF
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();

    const drawText = (text, x, y, size = 9) => {
        if (!text) return;
        page.drawText(String(text), { x, y, size, color: rgb(0, 0, 0) });
    };

    // --- 3. COORDENADAS PARA LA NUEVA PLANTILLA ---
    // Identificación
    drawText(checklist.forkliftId, 50, height - 128, 10);
    // Fecha
    drawText(`${checklist.day}/${checklist.month + 1}/${checklist.year}`, 148, height - 128, 8.5);
    // Operador
    drawText(checklist.operatorName, 220, height - 128, 9);

    // Checklist
    const xBaseColumn = 222.8;
    const xColumn = xBaseColumn + ((checklist.day - 1) * 9.25);
    let yPos = height - 192.5;

    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        drawText(rating, xColumn, yPos + 1.5, 5);
      }
      yPos -= 12.82;
    });

    // Pie
    drawText(checklist.inspectorName, 175, height - 528, 9);
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
    console.error('PDF Generation Error:', error);
    alert('Error al generar el PDF: ' + error.message);
  }
}
