import { PDFDocument, rgb } from 'pdf-lib';
import { checklistItems, ratingOptions } from '../data/checklistItems.js';
import { translations } from '../i18n/translations.js';
import { supabase } from '../lib/supabase.js';

/**
 * Genera un PDF basado en una plantilla en Supabase, escalándola para llenar la página.
 */
export async function exportChecklistToPdf(checklist, lang = 'es') {
  try {
    // 1. Descargar la plantilla usando el cliente de Supabase (más seguro que fetch)
    const { data: templateBlob, error: downloadError } = await supabase.storage
      .from('expedientes')
      .download('templates/template.pdf');

    if (downloadError) {
        throw new Error(`Error al descargar plantilla: ${downloadError.message}`);
    }

    const templateBytes = await templateBlob.arrayBuffer();

    const srcDoc = await PDFDocument.load(templateBytes);
    const pdfDoc = await PDFDocument.create();

    // Tamaño estándar Carta (Letter) en puntos: 612 x 792
    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;

    const [srcPage] = await pdfDoc.copyPages(srcDoc, [0]);
    const { width: srcWidth, height: srcHeight } = srcPage.getSize();

    // Crear una nueva página tamaño Carta
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    // Calcular escala para que ocupe el 95% del ancho de la hoja
    const scale = (PAGE_WIDTH * 0.95) / srcWidth;

    // Dibujar la página original escalada y centrada
    page.drawPage(srcPage, {
      x: (PAGE_WIDTH - srcWidth * scale) / 2,
      y: (PAGE_HEIGHT - srcHeight * scale) / 2,
      width: srcWidth * scale,
      height: srcHeight * scale,
    });

    // Configuración de dibujo
    const t = translations[lang] || translations.es;
    const dateStr = `${checklist.day}/${checklist.month + 1}/${checklist.year}`;
    const fontSize = 10;

    const drawText = (text, x, y, size = fontSize) => {
        page.drawText(text || '', {
            x: x,
            y: y,
            size: size,
            color: rgb(0, 0, 0)
        });
    };

    // Encabezados (Coordenadas aproximadas)
    drawText(checklist.forkliftId, 120, 680);
    drawText(checklist.operatorName, 380, 680);
    drawText(dateStr, 120, 665);
    drawText(checklist.inspectorName, 380, 665);

    // Checklist Items
    let yPos = 610;
    checklistItems.forEach(item => {
      const rating = checklist.items?.[item.id];
      if (rating) {
        let xOffset = 0;
        if (rating === 'SAT') xOffset = 470;
        else if (rating === 'INS') xOffset = 505;
        else if (rating === 'N/A') xOffset = 540;

        if (xOffset > 0) {
          drawText('X', xOffset, yPos, 11);
        }
      }
      yPos -= 16.2;
    });

    // Observaciones
    if (checklist.observations) {
      page.drawText(checklist.observations, {
        x: 60,
        y: 120,
        size: 9,
        maxWidth: 500,
        lineHeight: 12,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `Bitacora_${checklist.forkliftId}_${checklist.year}_${checklist.month + 1}.pdf`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error('Error:', error);
    alert('Error al generar el PDF: ' + error.message);
  }
}
