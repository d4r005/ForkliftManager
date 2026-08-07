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

/**
 * Algunos DC3/Diplomas usan una letra inicial decorativa como elemento de
 * texto SEPARADO del resto de la palabra (p.ej. el PDF renderiza "R" y
 * "OBLES" como dos objetos de texto distintos en vez de "ROBLES"). Esto deja
 * un espacio falso justo después de la primera letra de un nombre/puesto.
 * Esta función detecta ese patrón puntual y lo corrige, sin tocar espacios
 * legítimos entre palabras reales.
 */
function fixSplitFirstLetter(s) {
  if (!s) return s;
  return s.replace(/^([A-ZÁÉÍÓÚÑ])\s+([A-ZÁÉÍÓÚÑ]{2,})/, '$1$2');
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
      const afterParen = fixSplitFirstLetter(raw.replace(/^nombre.*?\)\s*/i, '').trim());
      const afterColon = fixSplitFirstLetter(raw.replace(/^nombre[^:]*:\s*/i, '').trim());
      const candidate = afterParen !== raw ? afterParen : (afterColon !== raw ? afterColon : '');
      if (isPlausibleName(candidate)) return candidate;

      // Si no, el valor suele estar en la(s) línea(s) siguiente(s) (celda de abajo)
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const cand = fixSplitFirstLetter(lines[j].trim());
        if (isPlausibleName(cand)) return cand;
      }
    }
  }

  // Estrategia 2: Diploma - "...CONSTANCIA A" ... nombre ... "POR HABER CONCLUIDO"
  const idxPor = upperLines.findIndex(l => l.includes('POR HABER CONCLUIDO') || l.includes('POR HABER'));
  if (idxPor > 0) {
    for (let j = idxPor - 1; j >= 0 && j >= idxPor - 4; j--) {
      const cand = fixSplitFirstLetter(lines[j].trim());
      const upCand = cand.toUpperCase();
      if (NON_NAME_WORDS.has(upCand)) continue;
      if (isPlausibleName(cand)) return cand;
    }
  }

  // Estrategia 3: genérica, cualquier "Nombre ...:" restante no filtrado arriba
  for (let i = 0; i < lines.length; i++) {
    const up = upperLines[i];
    if (up.includes('NOMBRE') && !NAME_LABEL_EXCLUDE.test(up)) {
      const val = fixSplitFirstLetter(lines[i].replace(/.*nombre[^:]*:?/i, '').trim());
      if (isPlausibleName(val)) return val;
    }
  }

  return null;
}

const JOB_TITLE_LABEL_EXCLUDE = /(RAZON SOCIAL|RAZÓN SOCIAL|DEL CURSO|EMPRESA|OCUPACION|OCUPACIÓN)/i;

function isPlausibleJobTitle(s) {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 3 || t.length > 60) return false;
  if (!/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.\-\/]+$/i.test(t)) return false;
  return true;
}

/**
 * Busca el puesto/cargo del trabajador. En el DC3 aparece bajo la etiqueta
 * "Puesto*", con el valor en la línea siguiente (misma mecánica de celdas
 * que el nombre, incluyendo la letra inicial separada del resto).
 */
function extractJobTitleFromLines(lines) {
  const upperLines = lines.map(l => l.toUpperCase());
  for (let i = 0; i < lines.length; i++) {
    const up = upperLines[i];
    if (/^PUESTO\b/.test(up) && !JOB_TITLE_LABEL_EXCLUDE.test(up)) {
      const afterColon = fixSplitFirstLetter(lines[i].replace(/^puesto[^:*]*[:*]?\s*/i, '').trim());
      if (isPlausibleJobTitle(afterColon) && afterColon.toUpperCase() !== up.replace(/[*:]/g, '').trim()) {
        return afterColon;
      }
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const cand = fixSplitFirstLetter(lines[j].trim());
        if (isPlausibleJobTitle(cand)) return cand;
      }
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
    if (!boxed || boxed.length < minLen) continue;
    // Probar todas las subcadenas de longitud [minLen, maxLen] dentro de la
    // corrida encontrada (de mayor a menor longitud). Esto es necesario
    // porque a veces un token vecino de 1 solo carácter (p.ej. un "0" suelto
    // de un código de ocupación como "0 4.6") se pega sin querer a la
    // corrida real, dejando el CURP/RFC "escondido" dentro de una cadena
    // más larga en vez de ser exactamente boxed.length === CURP/RFC.length.
    for (let len = Math.min(maxLen, boxed.length); len >= minLen; len--) {
      for (let start = 0; start + len <= boxed.length; start++) {
        const candidate = boxed.slice(start, start + len);
        if (validator(candidate)) return candidate;
      }
    }
  }
  return null;
}

/**
 * Busca en una línea la corrida de casillas de fecha en formato oficial
 * STPS: "Año Mes Día a Año Mes Día" con cada dígito en su propia celda
 * (p.ej. "2 0 2 6 0 7 2 2 a 2 0 2 6 0 7 2 2"). Devuelve { start, end } en
 * formato ISO (AAAA-MM-DD), o null si no encuentra el patrón.
 */
function extractBoxedDateRange(lines) {
  const pattern = /(\d{4})(\d{2})(\d{2})a(\d{4})(\d{2})(\d{2})/i;
  for (const line of lines) {
    const boxed = longestBoxedRun(line).toLowerCase();
    const m = boxed.match(pattern);
    if (m) {
      return {
        start: `${m[1]}-${m[2]}-${m[3]}`,
        end: `${m[4]}-${m[5]}-${m[6]}`,
      };
    }
  }
  return null;
}

/**
 * Recorta las líneas a solo la sección "DATOS DEL TRABAJADOR" (antes de
 * "DATOS DE LA EMPRESA"). El CURP/RFC de la EMPRESA (que sí aparece en el
 * DC3, bajo "Registro Federal de Contribuyentes con homoclave") NO es el
 * RFC del trabajador — si no acotamos la búsqueda, se puede confundir uno
 * con el otro. Comparamos sin espacios porque algunas celdas de tabla
 * quedan pegadas sin espacio (p.ej. "DATOS DELAEMPRESA").
 */
function employeeSectionLines(lines) {
  const noSpace = (s) => s.toUpperCase().replace(/\s+/g, '');
  const cutoffIdx = lines.findIndex(l => noSpace(l).includes('DATOSDELAEMPRESA'));
  return cutoffIdx > 0 ? lines.slice(0, cutoffIdx) : lines;
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
    jobTitle: null,
    vigencia: null,
    fechaCapacitacion: null,
    curso: null,
    docType: detectDocType(text),
  };

  const cleanText = (text || '').replace(/\s+/g, ' ').trim();
  const lines = (text || '').split('\n').map(l => l.trim()).filter(l => l);
  // El CURP/RFC del TRABAJADOR solo puede estar en la sección "DATOS DEL
  // TRABAJADOR"; acotamos ahí para no confundirlo con el RFC de la EMPRESA
  // (que también aparece en el DC3, más abajo).
  const empLines = employeeSectionLines(lines);
  const empText = empLines.join(' ');

  // === CURP: primero por casillas (robusto), luego regex laxa como respaldo ===
  result.curp = extractBoxedCode(empLines, 18, 18, (c) => CURP_RE.test(c));
  if (!result.curp) {
    const curpRegex = /([A-Z\s]{4,8}\d[\d\s]{5,10}[A-Z\s]{6,10}\d[\dA-Z\s])/i;
    const curpMatch = empText.match(curpRegex);
    if (curpMatch) {
      const candidate = curpMatch[1].replace(/\s+/g, '').toUpperCase();
      if (candidate.length === 18) result.curp = candidate;
    }
  }

  // === RFC: casillas primero, luego regex laxa (acotado a la sección del
  //     trabajador — el RFC de la empresa NO debe terminar en este campo).
  //     También excluimos la línea de la que salió el CURP: su corrida de
  //     casillas es más larga que un RFC y comparte estructura (letras+6
  //     dígitos+alfanumérico), así que un "recorte" de esa misma corrida
  //     puede colar como falso positivo de RFC si no se descarta. La
  //     mayoría de los DC3 oficiales, de hecho, NO tienen un campo de RFC
  //     del trabajador — solo CURP — así que es normal y correcto que
  //     result.rfc quede en null en ese caso. ===
  const curpLineIdx = result.curp
    ? empLines.findIndex(l => longestBoxedRun(l).toUpperCase().includes(result.curp))
    : -1;
  const rfcSearchLines = curpLineIdx >= 0
    ? empLines.filter((_, idx) => idx !== curpLineIdx)
    : empLines;
  result.rfc = extractBoxedCode(rfcSearchLines, 12, 13, (c) => RFC_RE.test(c) || /^[A-Z]{3,4}\d{6}[A-Z0-9]{2,3}$/.test(c));
  if (!result.rfc) {
    const rfcRegex = /([A-Z\s]{3,5}\d[\d\s]{5,8}[A-Z\d\s]{3,5})/i;
    const rfcMatch = empText.match(rfcRegex);
    if (rfcMatch) {
      const candidate = rfcMatch[1].replace(/\s+/g, '').toUpperCase();
      if (candidate.length >= 12 && candidate.length <= 13 && candidate !== result.curp) {
        result.rfc = candidate;
      }
    }
  }

  // === NOMBRE: heurísticas por línea (DC3 / Diploma / genérico) ===
  result.name = extractNameFromLines(lines);

  // === PUESTO/CARGO (solo aparece en el DC3) ===
  result.jobTitle = extractJobTitleFromLines(lines);

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

  // Formato STPS DC3 con casillas de UN DÍGITO por celda, p.ej.
  // "2 0 2 6 0 7 2 2 a 2 0 2 6 0 7 2 2" (Periodo de ejecución: De ... a ...).
  // Este es el formato REAL más común del DC3 oficial (cada dígito en su
  // propia celda, igual que el CURP/RFC) — sin esto, la fecha de ejecución
  // del curso nunca se detecta y la vigencia queda vacía.
  const boxedRange = extractBoxedDateRange(lines);
  if (boxedRange) {
    allDates.push(boxedRange.start, boxedRange.end);
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
/**
 * Extrae la fotografía embebida en una página de DC3.
 *
 * ENFOQUE: en vez de renderizar la página a canvas y recortar a ciegas
 * (que requiere encontrar el texto "FOTOGRAFÍA" como referencia y falla
 * cuando ese texto viene como imagen o no existe), aquí se extraen
 * directamente las imágenes (XObjects) embebidas en la página del PDF
 * y se identifica cuál es la foto del trabajador.
 *
 * Criterio: la foto es la primera imagen RGB (sin canal alfa, kind === 2)
 * con orientación portrait (alto >= ancho). Si no hay una portrait, se
 * toma la primera imagen RGB. Las imágenes RGBA (kind 3) suelen ser
 * firmas/escudos y se descartan; las grayscale (kind 1) son excepcionales.
 *
 * @param {File|ArrayBuffer} file - El archivo PDF
 * @param {number} pageIndex - Índice base-0 de la página
 * @returns {Promise<Blob|null>} - JPEG blob de la foto, o null si no se encuentra
 */
export async function extractPhotoFromPdfPage(file, pageIndex) {
  try {
    const arrayBuffer = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(pageIndex + 1);
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;

    // Recopilar todas las imágenes (XObjects) de la página
    const images = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] === OPS.paintImageXObject || ops.fnArray[i] === OPS.paintJpegXObject) {
        const imgName = ops.argsArray[i][0];
        try {
          const img = await new Promise((resolve, reject) => {
            page.objs.get(imgName, resolve, reject);
          });
          images.push({ name: imgName, ...img });
        } catch (e) {
          // Saltar imágenes que no se puedan cargar
        }
      }
    }

    if (images.length === 0) {
      console.warn('extractPhotoFromPdfPage: no se encontraron imágenes en la página');
      return null;
    }

    // Filtrar solo imágenes RGB (kind 2) — las RGBA (kind 3) suelen ser
    // firmas/escudos con transparencia, y las grayscale (kind 1) son raras.
    const rgbImages = images.filter(img => img.kind === 2);
    if (rgbImages.length === 0) {
      console.warn('extractPhotoFromPdfPage: no hay imágenes RGB, probando con todas');
      // Último recurso: usar la primera imagen disponible
      if (images.length > 0) {
        return imageDataToJpegBlob(images[0]);
      }
      return null;
    }

    // Preferir orientación portrait (alto >= ancho), típica de foto de credencial
    let photo = rgbImages.find(img => img.height >= img.width);
    if (!photo) photo = rgbImages[0]; // fallback: primera RGB

    return imageDataToJpegBlob(photo);
  } catch (err) {
    console.warn('extractPhotoFromPdfPage: no se pudo extraer foto:', err);
    return null;
  }
}

/**
 * Convierte los datos crudos de una imagen pdfjs a un JPEG Blob.
 * Funciona en el navegador usando canvas.
 * @param {{width:number, height:number, kind:number, data:Uint8Array}} img
 * @returns {Promise<Blob|null>}
 */
function imageDataToJpegBlob(img) {
  return new Promise((resolve) => {
    try {
      const channels = img.kind === 1 ? 1 : (img.kind === 2 ? 3 : 4);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      // Crear ImageData y copiar los píxeles
      const imageData = ctx.createImageData(img.width, img.height);
      const src = img.data;
      const dst = imageData.data;

      if (channels === 3) {
        // RGB -> RGBA
        for (let i = 0, j = 0; i < dst.length; i += 4, j += 3) {
          dst[i] = src[j];
          dst[i + 1] = src[j + 1];
          dst[i + 2] = src[j + 2];
          dst[i + 3] = 255;
        }
      } else if (channels === 4) {
        // RGBA -> RGBA (copia directa)
        dst.set(src);
      } else if (channels === 1) {
        // Grayscale -> RGBA
        for (let i = 0, j = 0; i < dst.length; i += 4, j++) {
          dst[i] = dst[i + 1] = dst[i + 2] = src[j];
          dst[i + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.90
      );
    } catch (e) {
      console.warn('imageDataToJpegBlob: error:', e);
      resolve(null);
    }
  });
}
