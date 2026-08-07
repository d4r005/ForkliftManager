import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Ordena los items de un getTextContent() espacialmente (arriba->abajo, izq->der)
 * y los agrupa en líneas (arrays de strings) respetando bandas de Y.
 * Esto es clave para que las etiquetas ("Nombre", "CURP", etc.) y sus valores
 * (que suelen estar en celdas/renglones distintos de una tabla) NO terminen
 * aplastados en una sola línea gigante, lo que rompía el parseo por regex.
 * @param {Array} items - content.items de pdf.js
 * @returns {string[]} - líneas de texto reconstruidas
 */
function itemsToLines(items) {
  const sorted = [...items].sort((a, b) => {
    const yA = a.transform[5];
    const yB = b.transform[5];
    if (Math.abs(yA - yB) > 5) return yB - yA; // arriba primero
    return a.transform[4] - b.transform[4]; // izquierda primero
  });

  const lines = [];
  let currentY = null;
  let currentLine = [];

  for (const item of sorted) {
    const y = item.transform[5];
    if (currentY === null || Math.abs(y - currentY) <= 5) {
      currentLine.push(item.str);
      currentY = currentY === null ? y : currentY;
    } else {
      if (currentLine.length) lines.push(currentLine.join(' '));
      currentLine = [item.str];
      currentY = y;
    }
  }
  if (currentLine.length) lines.push(currentLine.join(' '));

  // Limpiar espacios múltiples que dejan las celdas de tabla
  return lines.map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 0);
}

/**
 * Extrae el texto de TODAS las páginas de un PDF, ya organizado en líneas.
 * @param {File|ArrayBuffer} file
 * @returns {Promise<{index:number, lines:string[], text:string}[]>}
 */
export async function extractPdfPagesText(file) {
  const arrayBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines = itemsToLines(content.items);
    pages.push({ index: i - 1, lines, text: lines.join('\n') });
  }

  return pages;
}

/**
 * Extrae texto de un archivo PDF (documento completo, todas las páginas concatenadas).
 * Conserva saltos de línea reales entre renglones (no solo entre páginas), lo cual
 * es necesario para que parseDocumentData pueda ubicar etiquetas y valores.
 * @param {File} file - Archivo PDF
 * @returns {Promise<string>} - Texto completo del PDF
 */
export async function extractPdfText(file) {
  const pages = await extractPdfPagesText(file);
  return pages.map(p => p.text).join('\n\n');
}

/**
 * Intenta detectar si una página corresponde a un DC-3 (constancia STPS) o a un
 * Diploma/reconocimiento, en base a frases características de cada formato.
 * @param {string} text
 * @returns {'dc3'|'diploma'|'unknown'}
 */
export function detectDocType(text) {
  const upper = (text || '').toUpperCase();

  const dc3Signals = [
    'DC-3', 'DC3', 'CONSTANCIA DE COMPETENCIAS', 'DATOS DEL TRABAJADOR',
    'DATOS DE LA EMPRESA', 'CLAVE UNICA DE REGISTRO DE POBLACION',
    'CLAVE ÚNICA DE REGISTRO DE POBLACIÓN', 'AGENTE CAPACITADOR',
    'NOM-006-STPS', 'REPRESENTANTE DE LOS TRABAJADORES',
    'OCUPACION ESPECIFICA', 'OCUPACIÓN ESPECÍFICA',
  ];
  const diplomaSignals = [
    'OTORGA LA PRESENTE', 'POR HABER CONCLUIDO', 'CONCLUIDO SATISFACTORIAMENTE',
    'CEDULA PROFESIONAL', 'CÉDULA PROFESIONAL', 'RECONOCIMIENTO',
  ];

  let dc3Score = 0;
  let diplomaScore = 0;
  for (const s of dc3Signals) if (upper.includes(s)) dc3Score++;
  for (const s of diplomaSignals) if (upper.includes(s)) diplomaScore++;

  if (dc3Score === 0 && diplomaScore === 0) return 'unknown';
  return dc3Score >= diplomaScore ? 'dc3' : 'diploma';
}

const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Dentro de una línea, encuentra la corrida más larga de "tokens" de 1 solo
 * caracter separados por espacios (típico de campos tipo casillas: C U R P, etc.)
 * y los concatena. Sirve para reconstruir CURP/RFC que vienen en recuadros.
 */
function longestBoxedRun(line) {
  const tokens = line.split(/\s+/).filter(Boolean);
  let best = '';
  let current = '';
  for (const tok of tokens) {
    if (tok.length === 1 && /[A-Za-z0-9]/.test(tok)) {
      current += tok;
    } else {
      if (current.length > best.length) best = current;
      current = '';
    }
  }
  if (current.length > best.length) best = current;
  return best;
}

function isPlausibleName(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 5 || t.length > 60) return false;
  if (/\d/.test(t)) return false;
  if (!/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+$/i.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  return true;
}

const NAME_LABEL_EXCLUDE = /(RAZON SOCIAL|RAZÓN SOCIAL|DEL CURSO|EMPRESA|CURSO)/i;
const NON_NAME_WORDS = new Set(['CONSTANCIA', 'OTORGA', 'LA', 'PRESENTE', 'A']);

/**
 * Busca el nombre del trabajador probando varias estrategias, en este orden:
 * 1) Formato DC3 oficial: etiqueta "Nombre (Anotar apellido paterno...)" -> valor
 *    en la misma línea (tras los paréntesis) o en la línea siguiente.
 * 2) Formato Diploma: nombre entre "...CONSTANCIA A" y "POR HABER CONCLUIDO...".
 * 3) Genérico: cualquier línea "Nombre:" no descartada por NAME_LABEL_EXCLUDE.
 */
function extractNameFromLines(lines) {
  const upperLines = lines.map(l => l.toUpperCase());

  // Estrategia 1: DC3 - etiqueta con paréntesis de instrucciones
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const up = upperLines[i];
    if (/^NOMBRE\b/.test(up) && !NAME_LABEL_EXCLUDE.test(up)) {
      // Si la etiqueta trae valor pegado tras el paréntesis de instrucciones o ':'
      const afterParen = raw.replace(/^nombre.*?\)\s*/i, '').trim();
      const afterColon = raw.replace(/^nombre[^:]*:\s*/i, '').trim();
      const candidate = afterParen !== raw ? afterParen : (afterColon !== raw ? afterColon : '');
      if (isPlausibleName(candidate)) return candidate;

      // Si no, el valor suele estar en la(s) línea(s) siguiente(s) (celda de abajo)
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        if (isPlausibleName(lines[j])) return lines[j].trim();
      }
    }
  }

  // Estrategia 2: Diploma - "...CONSTANCIA A" ... nombre ... "POR HABER CONCLUIDO"
  const idxPor = upperLines.findIndex(l => l.includes('POR HABER CONCLUIDO') || l.includes('POR HABER'));
  if (idxPor > 0) {
    for (let j = idxPor - 1; j >= 0 && j >= idxPor - 4; j--) {
      const cand = lines[j].trim();
      const upCand = cand.toUpperCase();
      if (NON_NAME_WORDS.has(upCand)) continue;
      if (isPlausibleName(cand)) return cand;
    }
  }

  // Estrategia 3: genérica, cualquier "Nombre ...:" restante no filtrado arriba
  for (let i = 0; i < lines.length; i++) {
    const up = upperLines[i];
    if (up.includes('NOMBRE') && !NAME_LABEL_EXCLUDE.test(up)) {
      const val = lines[i].replace(/.*nombre[^:]*:?/i, '').trim();
      if (isPlausibleName(val)) return val;
    }
  }

  return null;
}

/**
 * Busca CURP/RFC reconstruyendo corridas de casillas de 1 caracter por línea
 * (robusto a los formatos DC3 donde cada letra/dígito viene en su propia celda).
 */
function extractBoxedCode(lines, minLen, maxLen, validator) {
  for (const line of lines) {
    const boxed = longestBoxedRun(line).toUpperCase();
    if (boxed.length >= minLen && boxed.length <= maxLen && validator(boxed)) {
      return boxed;
    }
  }
  return null;
}

const CURP_RE = /^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/;
const RFC_RE = /^[A-Z]{3,4}\d{6}[A-Z0-9]{3}$/;

/**
 * Parsea texto extraído de un DC3 o Diploma para encontrar datos
 * @param {string} text - Texto del PDF (con saltos de línea preservados)
 * @returns {object} - Datos encontrados { name, curp, rfc, vigencia, docType }
 */
export function parseDocumentData(text) {
  const result = {
    name: null,
    curp: null,
    rfc: null,
    vigencia: null,
    fechaCapacitacion: null,
    curso: null,
    docType: detectDocType(text),
  };

  const cleanText = (text || '').replace(/\s+/g, ' ').trim();
  const lines = (text || '').split('\n').map(l => l.trim()).filter(l => l);

  // === CURP: primero por casillas (robusto), luego regex laxa como respaldo ===
  result.curp = extractBoxedCode(lines, 18, 18, (c) => CURP_RE.test(c));
  if (!result.curp) {
    const curpRegex = /([A-Z\s]{4,8}\d[\d\s]{5,10}[A-Z\s]{6,10}\d[\dA-Z\s])/i;
    const curpMatch = cleanText.match(curpRegex);
    if (curpMatch) {
      const candidate = curpMatch[1].replace(/\s+/g, '').toUpperCase();
      if (candidate.length === 18) result.curp = candidate;
    }
  }

  // === RFC: casillas primero, luego regex laxa ===
  result.rfc = extractBoxedCode(lines, 12, 13, (c) => RFC_RE.test(c) || /^[A-Z]{3,4}\d{6}[A-Z0-9]{2,3}$/.test(c));
  if (!result.rfc) {
    const rfcRegex = /([A-Z\s]{3,5}\d[\d\s]{5,8}[A-Z\d\s]{3,5})/i;
    const rfcMatch = cleanText.match(rfcRegex);
    if (rfcMatch) {
      const candidate = rfcMatch[1].replace(/\s+/g, '').toUpperCase();
      if (candidate.length >= 12 && candidate.length <= 13) result.rfc = candidate;
    }
  }

  // === NOMBRE: heurísticas por línea (DC3 / Diploma / genérico) ===
  result.name = extractNameFromLines(lines);

  // === Fechas ===
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

  if (!result.vigencia && allDates.length > 0) {
    const lastDate = allDates[allDates.length - 1];
    result.vigencia = normalizeDate(lastDate);
    result.fechaCapacitacion = allDates[0] ? normalizeDate(allDates[0]) : null;
  }

  // === Curso ===
  const cursoPatterns = [
    /curso\s*de[:\s]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
    /nombre del curso[:\s]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{5,50})/i,
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
 * Compara el nombre de un empleado contra el texto completo de una página,
 * sin importar el ORDEN de las palabras (los DC3 usan "Apellidos Nombre" y
 * los diplomas suelen usar "Nombre Apellidos"). Devuelve una proporción 0..1
 * de palabras del nombre del empleado encontradas en el texto.
 * @param {string} empName
 * @param {string} pageText
 * @returns {number}
 */
export function nameWordOverlapRatio(empName, pageText) {
  const empWords = normalize(empName).split(' ').filter(w => w.length > 2);
  if (empWords.length < 2) return 0;
  const textWords = new Set(normalize(pageText).split(' '));
  const matched = empWords.filter(w => textWords.has(w));
  return matched.length / empWords.length;
}

export { normalize as normalizeText };

/**
 * Normaliza una fecha a formato AAAA-MM-DD
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;

  let m = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  m = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  return dateStr;
}
