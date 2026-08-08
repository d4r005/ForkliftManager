import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import { translations } from '../i18n/translations.js';
import { supabase } from '../lib/supabase.js';

/**
 * Genera un PDF escribiendo directamente sobre la plantilla descargada.
 */
export async function exportChecklistToPdf(checklist, lang = 'es') {
  try {
    // 1. Descargar la plantilla desde Supabase
    const { data: templateBlob, error: downloadError } = await supabase.storage
      .from('expedientes')
      .download('templates/template.pdf');

    if (downloadError) {
        throw new Error(`Error al descargar plantilla: ${downloadError.message}`);
    }

    const templateBytes = await templateBlob.arrayBuffer();

    // 2. Cargar el documento original (Escribiremos directamente en él)
    const pdfDoc = await PDFDocument.load(templateBytes);
    const pages = pdfDoc.getPages();
    const page = pages[0]; // Usamos la primera página directamente

    const { width, height } = page.getSize();
    console.log('PDF Size:', width, height); // Para depuración en consola

    // 3. Configuración de texto
    const t = translations[lang] || translations.es;
    const dateStr = `${checklist.day}/${checklist.month + 1}/${checklist.year}`;

    // Función auxiliar para dibujar texto (Coordenadas relativas al tamaño del PDF)
    const drawText = (text, x, y, size = 10) => {
        if (!text) return;
        page.drawText(String(text), {
            x: x,
            y: y,
            size: size,
            color: rgb(0, 0, 0)
        });
    };

    // --- COORDENADAS BASE (Ajustar si el texto sale fuera de lugar) ---
    // Usamos coordenadas estándar. Si el PDF es pequeño, se verán grandes.
    drawText(checklist.forkliftId, 100, height - 110);
    drawText(checklist.operatorName, 350, height - 110);
    drawText(dateStr, 100, height - 130);
    drawText(checklist.inspectorName, 350, height - 130);

    // 4. Checklist Items
    let yPos = height - 180;
    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        let xOffset = 0;
        if (rating === 'SAT') xOffset = width - 150;
        else if (rating === 'INS') xOffset = width - 115;
        else if (rating === 'N/A') xOffset = width - 80;

        if (xOffset > 0) {
          drawText('X', xOffset, yPos, 11);
        }
      }
      yPos -= 14.5; // Espaciado vertical entre líneas
    });

    // 5. Observaciones
    if (checklist.observations) {
      page.drawText(checklist.observations, {
        x: 50,
        y: 80,
        size: 9,
        maxWidth: width - 100,
        lineHeight: 11,
      });
    }

    // 6. Guardar y descargar
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `Bitacora_${checklist.forkliftId}.pdf`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error detallado:', error);
    alert('Error al generar el PDF: ' + error.message);
  }
}
