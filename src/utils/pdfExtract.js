import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Extrae texto de un archivo PDF
 * @param {File} file - Archivo PDF
 * @returns {Promise<string>} - Texto completo del PDF
 */
export async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Ordenar espacialmente: de arriba a abajo (Y desc) y de izquierda a derecha (X asc)
    const sortedItems = [...content.items].sort((a, b) => {
      const yA = a.transform[5];
      const yB = b.transform[5];
      const xA = a.transform[4];
      const xB = b.transform[4];

      // Tolerancia de 5 unidades para considerar la misma línea
      if (Math.abs(yA - yB) > 5) {
        return yB - yA; // Superior primero
      }
      return xA - xB; // Izquierda primero
    });

    const text = sortedItems.map(item => item.str).join(' ');
    fullText += text + '\n';
  }

  return fullText;
}

/**
 * Parsea texto extraído de un DC3 o Diploma para encontrar datos
 * @param {string} text - Texto del PDF
 * @returns {object} - Datos encontrados { name, curp, rfc, vigencia }
 */
export function parseDocumentData(text) {
  const result = {
    name: null,
    curp: null,
    rfc: null,
    vigencia: null,
    fechaCapacitacion: null,
    curso: null,
  };

  // Normalizar texto
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // CURP: 18 caracteres alfanuméricos, formato AAAA######AAAAAA##
  // Manejar CURP con muchos espacios o ruidos entre caracteres
  const curpRegex = /([A-Z\s]{4,8}\d[\d\s]{5,10}[A-Z\s]{6,10}\d[\dA-Z\s])/i;
  const curpMatch = cleanText.match(curpRegex);
  if (curpMatch) {
    const candidate = curpMatch[1].replace(/\s+/g, '').toUpperCase();
    if (candidate.length === 18) result.curp = candidate;
  }

  // RFC: 12-13 caracteres
  const rfcRegex = /([A-Z\s]{3,5}\d[\d\s]{5,8}[A-Z\d\s]{3,5})/i;
  const rfcMatch = cleanText.match(rfcRegex);
  if (rfcMatch) {
    const candidate = rfcMatch[1].replace(/\s+/g, '').toUpperCase();
    if (candidate.length >= 12 && candidate.length <= 13) result.rfc = candidate;
  }

  // Fechas en formato DD/MM/AAAA, DD-MM-AAAA, o AAAA-MM-DD
  const datePatterns = [
    /(\d{1,2}\/\d{1,2}\/\d{4})/g,
    /(\d{1,2}-\d{1,2}-\d{4})/g,
    /(\d{4}-\d{1,2}-\d{1,2})/g,
  ];

  const allDates = [];
  for (const pattern of datePatterns) {
    let m;
    while ((m = pattern.exec(cleanText)) !== null) {
      allDates.push(m[1]);
    }
  }

  // Buscar "vigencia" o "válida hasta" o "expira" cerca de una fecha
  const vigenciaPatterns = [
    /vigencia[^0-9]*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
    /válid[ao][^0-9]*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
    /valid[^0-9]*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
    /expir[^0-9]*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
    /hasta[^0-9]*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
    /vigente[^0-9]*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/i,
  ];

  for (const vp of vigenciaPatterns) {
    const vm = cleanText.match(vp);
    if (vm) {
      result.vigencia = normalizeDate(vm[1]);
      break;
    }
  }

  // Si no encontramos vigencia explícita, buscar la última fecha (suele ser fecha de fin)
  if (!result.vigencia && allDates.length > 0) {
    const lastDate = allDates[allDates.length - 1];
    result.vigencia = normalizeDate(lastDate);
    result.fechaCapacitacion = allDates[0] ? normalizeDate(allDates[0]) : null;
  }

  // Nombre: buscar después de "nombre", "trabajador", "operador", "capacitado"
  const namePatterns = [
    /nombre\s*(?:del\s*)?(?:trabajador|operador|empleado|capacitado|del\s*curso)[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
    /(?:trabajador|operador|empleado)[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
    /(?:capacitado|participante)[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
  ];

  for (const np of namePatterns) {
    const nm = cleanText.match(np);
    if (nm) {
      // Limpiar el nombre
      let name = nm[1].trim();
      // Remover CURP o RFC si se colaron
      name = name.replace(/[A-Z]{4}\d{6}[A-Z]{6}\d{2}/, '').trim();
      name = name.replace(/[A-Z]{4}\d{6}[A-Z]{3}\d?/, '').trim();
      // Tomar máximo 4 palabras (nombre + apellidos)
      name = name.split(/\s+/).slice(0, 5).join(' ');
      if (name.length >= 5) {
        result.name = name;
        break;
      }
    }
  }

  // Curso: buscar tipo de curso
  const cursoPatterns = [
    /curso[:\s]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
    /capacitaci[oó]n[:\s]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
    /tema[:\s]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
  ];

  for (const cp of cursoPatterns) {
    const cm = cleanText.match(cp);
    if (cm) {
      result.curso = cm[1].trim().split(/\s+/).slice(0, 8).join(' ');
      break;
    }
  }

  return result;
}

/**
 * Normaliza una fecha a formato AAAA-MM-DD
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;

  // Formato AAAA-MM-DD
  let m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // Formato DD/MM/AAAA
  m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // Formato DD-MM-AAAA
  m = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  return dateStr;
}
