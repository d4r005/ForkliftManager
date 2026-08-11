// OCR para extraer texto de la placa de datos del montacargas.
// Se usa import dinámico de tesseract.js para que el bundle principal no
// incluya WASM/Web Workers pesados al arrancar — especialmente importante
// en Android WebView, donde cargar todo de golpe puede causar problemas
// de memoria. El OCR solo se carga cuando el usuario sube una placa.

/**
 * Extrae texto de una imagen usando OCR (Tesseract.js)
 * @param {File} imageFile - Archivo de imagen (foto de la placa de datos)
 * @param {Function} onProgress - Callback de progreso (0-1)
 * @returns {Promise<string>} - Texto reconocido
 */
export async function extractTextFromImage(imageFile, onProgress) {
  // Dynamic import: tesseract.js solo se carga cuando se necesita OCR
  const Tesseract = (await import('tesseract.js')).default;
  const result = await Tesseract.recognize(
    imageFile,
    'spa+eng',
    {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(m.progress);
        }
      },
    }
  );
  return result.data.text || '';
}

/**
 * Parsea texto extraído de la placa de datos de un montacargas
 * para encontrar información del equipo
 * @param {string} text - Texto OCR de la placa
 * @returns {object} - Datos del equipo encontrados
 */
export function parseForkliftPlateData(text) {
  const result = {
    brand: null,        // Marca (Toyota, Clark, Hyster, etc.)
    model: null,        // Modelo
    serialNumber: null, // Número de serie
    capacity: null,     // Capacidad de carga (kg)
    capacityUnit: null,  // Unidad (kg, lbs)
    powerType: null,     // Tipo de energía (Eléctrico, Gas, Diesel, GLP)
    mastType: null,      // Tipo de mástil
    maxLiftHeight: null, // Altura máxima de elevación (mm)
    tireType: null,      // Tipo de llantas
    manufactureYear: null, // Año de fabricación
    voltage: null,       // Voltaje (si eléctrico)
    weight: null,        // Peso del equipo
  };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const cleanText = text.replace(/\s+/g, ' ').trim().toUpperCase();

  // === MARCA ===
  const brands = [
    'TOYOTA', 'CLARK', 'HYSTER', 'YALE', 'CAT', 'CATERPILLAR',
    'MITSUBISHI', 'KOMATSU', 'NISSAN', 'TCM', 'DAEWOO', 'DOOSAN',
    'BT', 'CROWN', 'JUNGHEINRICH', 'STILL', 'LINDE', 'REACH',
    'HYSTER-YALE', 'HELIM', 'EP', 'BOLZONI', 'AYT', 'HANGCHA',
    'LONKING', 'HELI', 'DF', 'ANHUI'
  ];

  for (const brand of brands) {
    if (cleanText.includes(brand)) {
      result.brand = capitalize(brand);
      break;
    }
  }

  // === MODELO ===
  const modelPatterns = [
    /MODELO[:\s]*([A-Z0-9\-\/\.\s]{3,20})/i,
    /MODEL[:\s]*([A-Z0-9\-\/\.\s]{3,20})/i,
    /M\/M[:\s]*([A-Z0-9\-\/\.\s]{3,20})/i,
    /TIPO[:\s]*([A-Z0-9\-\/\.\s]{3,20})/i,
    /TYPE[:\s]*([A-Z0-9\-\/\.\s]{3,20})/i,
  ];
  for (const mp of modelPatterns) {
    const m = text.match(mp);
    if (m) {
      result.model = m[1].trim().split(/\s+/).slice(0, 3).join(' ');
      break;
    }
  }

  // === NÚMERO DE SERIE ===
  const serialPatterns = [
    /(?:N[UÚ]MERO\s*(?:DE\s*)?SERIE|SERIAL\s*(?:NUMBER|NO|N[º°\.])?|SER\.?\s*NO\.?|S\/N)[:\s]*([A-Z0-9\-]{5,30})/i,
    /(?:NO\.?\s*(?:DE\s*)?SERIE|SERIE)[:\s]*([A-Z0-9\-]{5,30})/i,
    /\bS\/N[:\s]*([A-Z0-9\-]{5,30})/i,
  ];
  for (const sp of serialPatterns) {
    const m = text.match(sp);
    if (m) {
      result.serialNumber = m[1].trim();
      break;
    }
  }

  // === CAPACIDAD ===
  const capacityPatterns = [
    /(?:CAPACIDAD|CAPACITY|CARGA|LOAD)[:\s]*(\d[\d,\.]*)\s*(KG|KGS|LB|LBS|TON|TONS)?/i,
    /(\d[\d,\.]*)\s*(KG|KGS|TON)\s*(?:DE\s*)?(?:CAPACIDAD|CARGA|LOAD)?/i,
    /MAX(?:IMUM)?\s*(?:CAPACITY|LOAD|CARGA)[:\s]*(\d[\d,\.]*)\s*(KG|KGS|LB|LBS|TON)?/i,
  ];
  for (const cp of capacityPatterns) {
    const m = text.match(cp);
    if (m) {
      result.capacity = m[1].replace(/[,\.]/g, '');
      result.capacityUnit = (m[2] || 'KG').toUpperCase();
      break;
    }
  }

  // === TIPO DE ENERGÍA ===
  const powerKeywords = [
    { kw: ['ELÉCTRICO', 'ELECTRICO', 'ELECTRIC', 'BATERÍA', 'BATERIA'], val: 'Eléctrico' },
    { kw: ['DIESEL', 'DIÉSEL'], val: 'Diesel' },
    { kw: ['GAS', 'GASOLINA', 'GASOLINE'], val: 'Gasolina' },
    { kw: ['GLP', 'GAS LICUADO', 'PROPANO', 'PROPANE'], val: 'GLP' },
    { kw: ['HÍBRIDO', 'HIBRIDO', 'HYBRID'], val: 'Híbrido' },
  ];
  for (const p of powerKeywords) {
    if (p.kw.some(k => cleanText.includes(k))) {
      result.powerType = p.val;
      break;
    }
  }

  // === TIPO DE MÁSTIL ===
  const mastKeywords = [
    { kw: ['SIMPLE', 'SINGLE', 'ESTÁNDAR', 'STANDARD'], val: 'Simple' },
    { kw: ['DUPLEX', '2 ETAPAS', 'TWO STAGE'], val: 'Dúplex' },
    { kw: ['TRIPLEX', '3 ETAPAS', 'TRIPLE', 'THREE STAGE'], val: 'Tríplex' },
    { kw: ['QUAD', '4 ETAPAS', 'FOUR STAGE'], val: 'Quádruple' },
  ];
  for (const m of mastKeywords) {
    if (m.kw.some(k => cleanText.includes(k))) {
      result.mastType = m.val;
      break;
    }
  }

  // === ALTURA MÁXIMA DE ELEVACIÓN ===
  const heightPatterns = [
    /(?:ALTURA|HEIGHT|ELEVACI[OÓ]N|LIFT)[:\s]*(\d[\d,\.]*)\s*(MM|CM|M|MTS)?/i,
    /(?:MAX(?:IMUM)?\s*(?:LIFT|HEIGHT|ALTURA))[:\s]*(\d[\d,\.]*)\s*(MM|CM|M)?/i,
  ];
  for (const hp of heightPatterns) {
    const m = text.match(hp);
    if (m) {
      result.maxLiftHeight = m[1].replace(/[,\.]/g, '');
      break;
    }
  }

  // === TIPO DE LLANTAS ===
  const tireKeywords = [
    { kw: ['NEUMÁTICAS', 'NEUMATICAS', 'PNEUMATIC', 'INFLABLES'], val: 'Neumáticas' },
    { kw: ['SÓLIDAS', 'SOLIDAS', 'SOLID', 'SUPERELASTIC'], val: 'Sólidas' },
    { kw: ['POLIURETANO', 'POLYURETHANE', 'PU'], val: 'Poliuretano' },
  ];
  for (const t of tireKeywords) {
    if (t.kw.some(k => cleanText.includes(k))) {
      result.tireType = t.val;
      break;
    }
  }

  // === AÑO DE FABRICACIÓN ===
  const yearPatterns = [
    /(?:AÑO|YEAR|FABRICACI[OÓ]N|MANUFACTURE)[:\s]*(\d{4})/i,
    /\b(19[89]\d|20[0-2]\d)\b/, // Año directo
  ];
  for (const yp of yearPatterns) {
    const m = text.match(yp);
    if (m) {
      const year = parseInt(m[1] || m[0]);
      if (year >= 1980 && year <= new Date().getFullYear()) {
        result.manufactureYear = year.toString();
        break;
      }
    }
  }

  // === VOLTAJE (si eléctrico) ===
  const voltageMatch = text.match(/(?:VOLTAGE|VOLTAJE|V)[:\s]*(\d{2,3})\s*(V|VOLTS?)?/i);
  if (voltageMatch) {
    result.voltage = voltageMatch[1];
  }

  // === PESO ===
  const weightMatch = text.match(/(?:PESO|WEIGHT|MASA)[:\s]*(\d[\d,\.]*)\s*(KG|KGS|TON)?/i);
  if (weightMatch) {
    result.weight = weightMatch[1].replace(/[,\.]/g, '');
  }

  // Contar cuántos campos se encontraron
  const foundCount = Object.values(result).filter(v => v !== null).length;

  return { ...result, _foundCount: foundCount };
}

/**
 * Capitaliza la primera letra
 */
function capitalize(str) {
  if (str === 'CAT') return 'CAT';
  if (str === 'BT') return 'BT';
  if (str === 'EP') return 'EP';
  if (str === 'DF') return 'DF';
  return str.charAt(0) + str.slice(1).toLowerCase();
}
