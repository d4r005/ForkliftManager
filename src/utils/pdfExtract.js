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

// Vigencia estándar de la industria para constancias DC3 de operador de
// montacargas bajo NOM-006-STPS: 2 años a partir de la fecha de ejecución
// del curso. El DC3 en sí no fija por ley una fecha de caducidad — esta es
// la práctica común de renovación usada por capacitadoras STPS en México.
// Si tu empresa usa otro periodo, ajusta esta constante.
const DC3_VALIDITY_YEARS = 2;

/**
 * Suma años a una fecha en formato ISO (AAAA-MM-DD).
 */
function addYears(isoDate, years) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  dt.setFullYear(dt.getFullYear() + years);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
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
  // Los DC3/Diplomas de este formato NO traen una fecha de "vigencia/expira"
  // explícita: solo indican cuándo se impartió el curso ("Periodo de
  // ejecución" en el DC3, o la fecha de firma en el Diploma). Por práctica
  // de la industria para certificaciones de operador de montacargas
  // (NOM-006-STPS), la vigencia de la constancia se calcula como la fecha
  // de ejecución/finalización del curso + DC3_VALIDITY_YEARS (2 años).
  // Si el documento SÍ trae una frase explícita de vigencia, esa tiene
  // prioridad sobre el cálculo automático.
  const allDates = [];

  // Formato "DD/MM/AAAA", "DD-MM-AAAA", "AAAA-MM-DD"
  const slashDashPatterns = [
    /(\d{1,2}\/\d{1,2}\/\d{4})/g,
    /(\d{1,2}-\d{1,2}-\d{4})/g,
    /(\d{4}-\d{1,2}-\d{1,2})/g,
  ];
  for (const pattern of slashDashPatterns) {
    let m;
    while ((m = pattern.exec(cleanText)) !== null) {
      const iso = normalizeDate(m[1]);
      if (iso) allDates.push(iso);
    }
  }

  // Formato STPS DC3 en columnas "Año Mes Día" sin separadores, p.ej. "2026 07 22"
  // (el DC3 oficial presenta la fecha en 3 celdas separadas: Año, Mes, Día)
  const ymdColumnRegex = /\b(20\d{2})\s+(0[1-9]|1[0-2])\s+(0[1-9]|[12]\d|3[01])\b/g;
  {
    let m;
    while ((m = ymdColumnRegex.exec(cleanText)) !== null) {
      allDates.push(`${m[1]}-${m[2]}-${m[3]}`);
    }
  }

  // Formato español largo, p.ej. "22 DE JULIO DEL 2026" (usado en diplomas)
  const MONTHS_ES = {
    ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04', MAYO: '05', JUNIO: '06',
    JULIO: '07', AGOSTO: '08', SEPTIEMBRE: '09', OCTUBRE: '10', NOVIEMBRE: '11', DICIEMBRE: '12',
  };
  const longDateRegex = /\b(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚ]+)\s+DEL?\s+(\d{4})\b/gi;
  {
    let m;
    while ((m = longDateRegex.exec(cleanText.toUpperCase())) !== null) {
      const monthNum = MONTHS_ES[m[2]];
      if (monthNum) {
        allDates.push(`${m[3]}-${monthNum}-${String(m[1]).padStart(2, '0')}`);
      }
    }
  }

  // 1) Vigencia EXPLÍCITA (si el documento la declara) — máxima prioridad
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

  // 2) Fecha de ejecución/finalización del curso: la más reciente de las
  //    detectadas en la página (la fecha "a" del periodo de ejecución, o la
  //    fecha de firma del diploma, suele ser cronológicamente la última).
  if (allDates.length > 0) {
    const sorted = [...new Set(allDates)].sort(); // orden ISO = orden cronológico
    result.fechaCapacitacion = sorted[sorted.length - 1];

    // 3) Si no había vigencia explícita, calcularla: fecha de ejecución + 2 años
    //    (vigencia estándar del sector para constancias DC3 de montacarguistas).
    if (!result.vigencia) {
      result.vigencia = addYears(result.fechaCapacitacion, DC3_VALIDITY_YEARS);
    }
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

/**
 * Extrae la fotografía embebida en una página de un DC3.
 *
 * Los DC3 oficiales de la STPS traen una zona marcada "FOTOGRAFÍA" en la
 * esquina superior derecha de la primera hoja, donde el trabajador pega una
 * foto tamaño credencial. Esta función:
 *   1) Renderiza la página completa a un canvas de alta resolución.
 *   2) Busca en el texto la palabra "FOTOGRAF" para localizar la zona.
 *   3) Recorta la región debajo/del lado de esa etiqueta.
 *   4) Devuelve un Blob JPEG listo para subir a Storage.
 *
 * Si no encuentra la zona o no puede renderizar, devuelve null (no falla).
 *
 * @param {File|ArrayBuffer} file - El PDF completo
 * @param {number} pageIndex - Índice de la página (0-based)
 * @returns {Promise<Blob|null>} - Blob JPEG de la foto, o null
 */
export async function extractPhotoFromPdfPage(file, pageIndex) {
  try {
    const arrayBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(pageIndex + 1);

    // Renderizar a alta resolución (scale 2 = ~144 DPI)
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Buscar la posición de "FOTOGRAF" en el texto de la página
    const content = await page.getTextContent();
    const photoItem = content.items.find(item =>
      /FOTOGRAF/i.test(item.str)
    );

    let x, y, w, h;

    if (photoItem) {
      // Coordenadas del texto en el sistema del PDF (origin abajo-izq)
      const tx = photoItem.transform[4];
      const ty = photoItem.transform[5];
      // Convertir a coordenadas de canvas (origin arriba-izq, escala 2)
      const cx = tx * 2;
      const cy = canvas.height - ty * 2;

      // La foto suele estar en un recuadro al lado o debajo de "FOTOGRAFÍA"
      // Típico del DC3: recuadro ~3cm x 3.5cm ( credential size)
      // En píxeles a escala 2 (~144 DPI): 3cm ≈ 170px, 3.5cm ≈ 200px
      w = 200;
      h = 230;

      // La etiqueta "FOTOGRAFÍA" suele estar arriba del recuadro o a un lado.
      // Intentamos: si hay texto a la derecha de la etiqueta, la foto está abajo.
      // Si no, la foto está a la derecha.
      const hasTextRight = content.items.some(item =>
        item.transform[4] > tx + 100 &&
        Math.abs(item.transform[5] - ty) < 50 &&
        item.str.trim().length > 0
      );

      if (hasTextRight) {
        // Foto debajo de la etiqueta
        x = cx - 10;
        y = cy;
      } else {
        // Foto a la derecha de la etiqueta
        x = cx + 80;
        y = cy - 30;
      }
    } else {
      // No se encontró "FOTOGRAFÍA" — usar heurística: esquina superior derecha
      // del DC3 (donde suele estar la foto en formato oficial STPS)
      w = 200;
      h = 230;
      x = canvas.width - w - 80;
      y = 60;
    }

    // Ajustar límites al canvas
    x = Math.max(0, Math.min(x, canvas.width - w));
    y = Math.max(0, Math.min(y, canvas.height - h));

    // Recortar
    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = w;
    photoCanvas.height = h;
    const photoCtx = photoCanvas.getContext('2d');
    photoCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

    // Convertir a JPEG
    return new Promise((resolve) => {
      photoCanvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.85
      );
    });
  } catch (err) {
    console.warn('extractPhotoFromPdfPage: no se pudo extraer foto:', err);
    return null;
  }
}
