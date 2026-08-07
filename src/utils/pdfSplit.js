import { PDFDocument } from 'pdf-lib';

/**
 * Divide un PDF maestro en archivos individuales por página
 * @param {File} file - Archivo PDF maestro
 * @param {number} pageIndex - Índice de la página a extraer (0-based)
 * @returns {Promise<Blob>} - Blob del PDF de una sola página
 */
export async function extractPdfPage(file, pageIndex) {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);

  const newPdf = await PDFDocument.create();
  const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex]);
  newPdf.addPage(copiedPage);

  const pdfBytes = await newPdf.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}
