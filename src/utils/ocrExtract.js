// OCR para extraer texto de la placa de datos del montacargas.
// Se usa import dinámico de tesseract.js para que el bundle principal no
// incluya WASM/Web Workers pesados al arrancar — especialmente importante
// en Android WebView, donde cargar todo de golpe puede causar problemas
// de memoria. El OCR solo se carga cuando el usuario sube una placa.

/**
 * Rota una imagen (File/Blob) N grados usando un canvas, y devuelve un
 * nuevo Blob. Necesario porque muchas fotos de placas se toman en
 * cualquier ángulo y Tesseract NO corrige la rotación por sí solo en modo
 * de reconocimiento normal (solo con OSD, que es lo que usamos para
 * detectar el ángulo antes de llamar a esta función).
 */
function rotateImageFile(file, degrees) {
  return new Promise((resolve, reject) => {
    if (!degrees) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const swap = degrees === 90 || degrees === 270;
      const w = swap ? img.height : img.width;
      const h = swap ? img.width : img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.translate(w / 2, h / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error('No se pudo generar la imagen rotada'));
      }, file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg', 0.92);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Extrae texto de una imagen usando OCR (Tesseract.js)
 * @param {File} imageFile - Archivo de imagen (foto de la placa de datos)
 * @param {Function} onProgress - Callback de progreso (0-1)
 * @returns {Promise<string>} - Texto reconocido
 */
export async function extractTextFromImage(imageFile, onProgress) {
  // Dynamic import: tesseract.js solo se carga cuando se necesita OCR
  const Tesseract = (await import('tesseract.js')).default;

  // --- Paso 1: detectar orientación y guion (OSD) ---
  // Las fotos de placas se toman en cualquier ángulo (a veces hasta de
  // lado o al revés, como en placas fijadas en superficies verticales) y
  // Tesseract.recognize() por sí solo NO corrige la rotación — si el
  // texto no está aproximadamente derecho, la detección falla casi por
  // completo (esto explica placas que "no encuentran nada"). Se usa el
  // modelo OSD (rápido, no hace OCR completo) para detectar cuántos
  // grados hay que rotar la imagen, y de paso qué escritura tiene
  // (Latin/Han) para decidir si hace falta cargar el paquete de chino.
  let imageToRecognize = imageFile;
  let needsChinese = false;
  try {
    const { data } = await Tesseract.detect(imageFile);
    if (data?.orientation_degrees) {
      imageToRecognize = await rotateImageFile(imageFile, data.orientation_degrees);
    }
    if (data?.script && /han/i.test(data.script)) {
      needsChinese = true;
    }
  } catch (e) {
    console.warn('No se pudo detectar orientación/escritura de la placa, se usa la imagen original:', e);
  }

  // --- Paso 2: OCR completo ---
  // Muchas placas de montacargas son de fabricantes chinos (HELI, Hangcha,
  // Lonking, etc.) y mezclan texto en chino con etiquetas/números en
  // inglés. Se agrega 'chi_sim' solo cuando el OSD detectó escritura Han,
  // para no pagar la descarga extra del paquete de chino en placas
  // normales en español/inglés.
  const langs = needsChinese ? 'eng+spa+chi_sim' : 'eng+spa';
  const result = await Tesseract.recognize(
    imageToRecognize,
    langs,
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
  // "Configuration No." es el equivalente a "modelo" en placas de
  // fabricantes chinos (HELI, Hangcha, etc.) — se agrega antes de los
  // patrones genéricos MODELO/MODEL para que tenga prioridad.
  const modelPatterns = [
    /CONFIGURATION\s*(?:NO\.?)?[:\.\s]*([A-Z0-9\-\/\. \t]{3,20})/i,
    /MODELO[:\s]*([A-Z0-9\-\/\. \t]{3,20})/i,
    /MODEL[:\s]*([A-Z0-9\-\/\. \t]{3,20})/i,
    /M\/M[:\s]*([A-Z0-9\-\/\. \t]{3,20})/i,
    /TIPO[:\s]*([A-Z0-9\-\/\. \t]{3,20})/i,
    /TYPE[:\s]*([A-Z0-9\-\/\. \t]{3,20})/i,
  ];
  for (const mp of modelPatterns) {
    const m = text.match(mp);
    if (m) {
      result.model = m[1].trim().split(/\s+/).slice(0, 3).join(' ');
      break;
    }
  }

  // === NÚMERO DE SERIE ===
  // [:\.\s]* (en vez de [:\s]*) para tolerar el punto de "Serial No." /
  // "Ser. No." antes del valor — con solo [:\s]* el punto quedaba fuera
  // de la clase de caracteres permitida y la coincidencia fallaba.
  const serialPatterns = [
    /(?:N[UÚ]MERO\s*(?:DE\s*)?SERIE|SERIAL\s*(?:NUMBER|NO|N[º°\.])?|SER\.?\s*NO\.?|S\/N)[:\.\s]*([A-Z0-9\-]{5,30})/i,
    /(?:NO\.?\s*(?:DE\s*)?SERIE|SERIE)[:\.\s]*([A-Z0-9\-]{5,30})/i,
    /\bS\/N[:\.\s]*([A-Z0-9\-]{5,30})/i,
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
    /(?:CAPACIDAD|CAPACITY|CARGA|LOAD|RATED\s*(?:CAPACITY|LOAD))[:\.\s]*(\d[\d,\.]*)\s*(KG|KGS|LB|LBS|TON|TONS)?/i,
    /(\d[\d,\.]*)\s*(KG|KGS|TON)\s*(?:DE\s*)?(?:CAPACIDAD|CARGA|LOAD)/i,
    /MAX(?:IMUM)?\s*(?:CAPACITY|LOAD|CARGA)[:\.\s]*(\d[\d,\.]*)\s*(KG|KGS|LB|LBS|TON)?/i,
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
    { kw: ['INTERNAL COMBUSTION', 'COMBUSTI[OÓ]N INTERNA'], val: 'Combustión interna' },
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
  // "Manufacture Date" en placas chinas suele venir como fecha completa
  // (AAAA-MM-DD o AA-MM-DD) en vez de solo el año — se busca primero
  // junto a esa etiqueta específica antes de caer al patrón genérico.
  const mfgDateMatch = cleanText.match(/MANUFACTURE\s*DATE[:\.\s]*(\d{2,4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})/);
  if (mfgDateMatch) {
    let yr = mfgDateMatch[1];
    if (yr.length === 2) yr = `20${yr}`;
    const y = parseInt(yr, 10);
    if (y >= 1980 && y <= new Date().getFullYear() + 1) {
      result.manufactureYear = String(y);
    }
  }
  if (!result.manufactureYear) {
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
  }

  // === VOLTAJE (si eléctrico) ===
  const voltageMatch = text.match(/(?:VOLTAGE|VOLTAJE|V)[:\s]*(\d{2,3})\s*(V|VOLTS?)?/i);
  if (voltageMatch) {
    result.voltage = voltageMatch[1];
  }

  // === PESO ===
  // "Device Weight" es la etiqueta usada en placas de fabricantes chinos
  // (peso del propio equipo, no la capacidad de carga).
  const weightMatch = text.match(/(?:DEVICE\s*WEIGHT|PESO|WEIGHT|MASA)[:\.\s]*(\d[\d,\.]*)\s*(KG|KGS|TON)?/i);
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
