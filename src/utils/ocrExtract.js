// OCR para extraer texto de la placa de datos del montacargas.
// Se usa import dinámico de tesseract.js para que el bundle principal no
// incluya WASM/Web Workers pesados al arrancar — especialmente importante
// en Android WebView, donde cargar todo de golpe puede causar problemas
// de memoria. El OCR solo se carga cuando el usuario sube una placa.

/**
 * Preprocesa una imagen en canvas para mejorar el OCR:
 * 1. Rota N grados (si se conoce la orientación)
 * 2. Escala 2x para que Tesseract tenga más pixeles por carácter
 * 3. Convierte a escala de grises
 * 4. Aumenta contraste
 * Devuelve un nuevo Blob listo para pasar a Tesseract.
 */
function preprocessImage(file, rotation = 0, scale = 2, contrast = 0.4) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const rot = ((rotation % 360) + 360) % 360;
      const swap = rot === 90 || rot === 270;
      const srcW = img.width;
      const srcH = img.height;
      const outW = (swap ? srcH : srcW) * scale;
      const outH = (swap ? srcW : srcH) * scale;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Rotar alrededor del centro
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -srcW / 2, -srcH / 2);

      // Convertir a grayscale + contraste en un solo pasada de pixels
      try {
        const imageData = ctx.getImageData(0, 0, outW, outH);
        const d = imageData.data;
        const c = Math.max(0.01, 1 + contrast);
        for (let i = 0; i < d.length; i += 4) {
          // Luminancia (ITU-R BT.601)
          let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // Contraste: desplazar a -128..127, multiplicar, volver a 0..255
          gray = (gray - 128) * c + 128;
          gray = gray < 0 ? 0 : gray > 255 ? 255 : gray;
          d[i] = d[i + 1] = d[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
      } catch (e) {
        // Si getImageData falla (CORS u otro), al menos tenemos la imagen rotada+escalada
        console.warn('preprocess: no se pudo ajustar grayscale/contraste:', e);
      }

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error('No se pudo generar la imagen preprocesada'));
      }, 'image/png');
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
  const Tesseract = (await import('tesseract.js')).default;

  // --- Paso 1: detectar orientación y guion (OSD) ---
  let rotation = 0;
  let needsChinese = false;
  try {
    const { data } = await Tesseract.detect(imageFile);
    if (data?.orientation_degrees) {
      rotation = data.orientation_degrees;
    }
    // Tesseract OSD a veces confunde chino con japonés/coreano — cualquier
    // script CJK activa el soporte de chino.
    if (data?.script && /han|japanese|korean|cjk/i.test(data.script)) {
      needsChinese = true;
    }
  } catch (e) {
    console.warn('OSD no disponible, se usa imagen original sin rotar:', e);
  }

  // --- Paso 2: preprocesar imagen (rotar + escalar + grayscale + contraste) ---
  let processedImage;
  try {
    processedImage = await preprocessImage(imageFile, rotation, 2, 0.4);
  } catch (e) {
    console.warn('preprocess falló, usando imagen original:', e);
    processedImage = imageFile;
  }

  // --- Paso 3: OCR completo ---
  const langs = needsChinese ? 'chi_sim+eng+spa' : 'eng+spa';

  let bestText = '';
  let bestConfidence = -1;

  // Intento 1: imagen preprocesada con PSM por defecto
  try {
    const worker = await Tesseract.createWorker(langs, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
      },
    });
    const { data } = await worker.recognize(processedImage);
    await worker.terminate();
    if (data.confidence > bestConfidence) {
      bestText = data.text || '';
      bestConfidence = data.confidence;
    }
  } catch (e) {
    console.warn('OCR intento 1 falló:', e);
  }

  // Intento 2: si el primero dio confianza baja, probar con más escala y PSM 6
  if (bestConfidence < 50) {
    try {
      if (onProgress) onProgress(0);
      const img2 = await preprocessImage(imageFile, rotation, 3, 0.5);
      const worker2 = await Tesseract.createWorker(langs, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
        },
      });
      await worker2.setParameters({ tessedit_pageseg_mode: 6 });
      const { data } = await worker2.recognize(img2);
      await worker2.terminate();
      if (data.confidence > bestConfidence) {
        bestText = data.text || '';
        bestConfidence = data.confidence;
      }
    } catch (e) {
      console.warn('OCR intento 2 falló:', e);
    }
  }

  // Intento 3: si aún no hay nada, probar rotación 180 sin OSD
  if (bestConfidence < 35) {
    try {
      if (onProgress) onProgress(0);
      const img3 = await preprocessImage(imageFile, (rotation + 180) % 360, 3, 0.5);
      const worker3 = await Tesseract.createWorker(langs, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
        },
      });
      await worker3.setParameters({ tessedit_pageseg_mode: 6 });
      const { data } = await worker3.recognize(img3);
      await worker3.terminate();
      if (data.confidence > bestConfidence) {
        bestText = data.text || '';
        bestConfidence = data.confidence;
      }
    } catch (e) {
      console.warn('OCR intento 3 falló:', e);
    }
  }

  return bestText;
}

// ============================================================
//  Parser tolerante a errores de OCR
// ============================================================

/**
 * Normaliza texto para comparaciones fuzzy: mayúsculas, sin acentos,
 * sin espacios extra. Permite buscar keywords incluso cuando el OCR
 * introdujo errores leves.
 */
function normalize(s) {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^A-Z0-9]/g, '');       // solo letras y números
}

/**
 * Busca si un conjunto de keywords aparece en el texto normalizado.
 * Usa distancia de Levenshtein ligera (hasta 2 sustituciones) para
 * tolerar errores típicos del OCR.
 */
function fuzzyIncludes(cleanText, keyword, maxDist = 2) {
  const nk = normalize(keyword);
  if (cleanText.includes(nk)) return true;
  // Si el keyword es corto (<=4), no fuzzy-match — demasiado falso positivo
  if (nk.length <= 4) return false;
  // Buscar ventanas del mismo tamaño y comparar
  for (let i = 0; i <= cleanText.length - nk.length; i++) {
    let dist = 0;
    const slice = cleanText.slice(i, i + nk.length);
    for (let j = 0; j < nk.length; j++) {
      if (slice[j] !== nk[j]) {
        dist++;
        if (dist > maxDist) break;
      }
    }
    if (dist <= maxDist) return true;
  }
  return false;
}

/**
 * Parsea texto extraído de la placa de datos de un montacargas
 * para encontrar información del equipo
 * @param {string} text - Texto OCR de la placa
 * @returns {object} - Datos del equipo encontrados
 */
export function parseForkliftPlateData(text) {
  const result = {
    brand: null,
    model: null,
    serialNumber: null,
    capacity: null,
    capacityUnit: null,
    powerType: null,
    mastType: null,
    maxLiftHeight: null,
    tireType: null,
    manufactureYear: null,
    voltage: null,
    weight: null,
  };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const cleanText = normalize(text);

  // === MARCA ===
  const brands = [
    'TOYOTA', 'CLARK', 'HYSTER', 'YALE', 'CAT', 'CATERPILLAR',
    'MITSUBISHI', 'KOMATSU', 'NISSAN', 'TCM', 'DAEWOO', 'DOOSAN',
    'BT', 'CROWN', 'JUNGHEINRICH', 'STILL', 'LINDE', 'REACH',
    'HYSTER-YALE', 'HELI', 'EP', 'BOLZONI', 'AYT', 'HANGCHA',
    'LONKING', 'ANHUI'
  ];

  // Marcas cortas (<=3 letras) requieren coincidencia exacta en
  // boundary de palabra — un 'DF' dentro de 'NEDFORK' NO es la marca DF.
  for (const brand of brands) {
    if (brand.length <= 3) {
      const re = new RegExp(`(?:^|[^A-Z])${brand}(?:[^A-Z]|$)`, 'i');
      if (re.test(text)) {
        result.brand = capitalize(brand);
        break;
      }
    } else if (fuzzyIncludes(cleanText, brand, 1)) {
      result.brand = capitalize(brand);
      break;
    }
  }

  // === MODELO ===
  // "Configuration No." en placas chinas; "Model"/"Modelo" en placas estándar.
  const modelPatterns = [
    /CONFIGURATION\s*(?:NO\.?)?[:\.\s]*([A-Z0-9\-\/\. ]{3,20})/i,
    /EVIFIGURATION\s*(?:NO\.?)?[:\.\s]*([A-Z0-9\-\/\. ]{3,20})/i, // OCR error común
    /MODELO[:\s]*([A-Z0-9\-\/\. ]{3,20})/i,
    /MODEL[:\s]*([A-Z0-9\-\/\. ]{3,20})/i,
    /M\/M[:\s]*([A-Z0-9\-\/\. ]{3,20})/i,
    /TIPO[:\s]*([A-Z0-9\-\/\. ]{3,20})/i,
    /TYPE[:\s]*([A-Z0-9\-\/\. ]{3,20})/i,
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
  // Solo si viene explícitamente etiquetada como capacidad/carga/load.
  // "Device Weight" NO es capacidad — se maneja en peso.
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
  // Usa fuzzy matching para tolerar errores del OCR como "CONTERBAANED"
  const powerKeywords = [
    { kw: ['ELÉCTRICO', 'ELECTRICO', 'ELECTRIC', 'BATERÍA', 'BATERIA'], val: 'Eléctrico' },
    { kw: ['DIESEL', 'DIÉSEL'], val: 'Diesel' },
    { kw: ['GAS', 'GASOLINA', 'GASOLINE'], val: 'Gasolina' },
    { kw: ['GLP', 'GAS LICUADO', 'PROPANO', 'PROPANE'], val: 'GLP' },
    { kw: ['HÍBRIDO', 'HIBRIDO', 'HYBRID'], val: 'Híbrido' },
    { kw: ['INTERNAL COMBUSTION', 'COMBUSTI[OÓ]N INTERNA'], val: 'Combustión interna' },
  ];
  for (const p of powerKeywords) {
    if (p.kw.some(k => fuzzyIncludes(cleanText, k, 2))) {
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
    if (m.kw.some(k => fuzzyIncludes(cleanText, k, 1))) {
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
    if (t.kw.some(k => fuzzyIncludes(cleanText, k, 1))) {
      result.tireType = t.val;
      break;
    }
  }

  // === AÑO DE FABRICACIÓN ===
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
      /\b(19[89]\d|20[0-2]\d)\b/,
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
  // "Device Weight" en placas chinas; "Peso"/"Weight" en estándar.
  // Se tolera "ko" como error de OCR de "kg".
  const weightMatch = text.match(/(?:DEVICE\s*WEIGHT|PESO|WEIGHT|MASA)[:\.\s]*(\d[\d,\.]*)\s*(KG|KGS|KO|TON)?/i);
  if (weightMatch) {
    result.weight = weightMatch[1].replace(/[,\.]/g, '');
  }

  // === FALLBACK: buscar números sueltos cerca de "kg" que no sean capacidad ===
  // Si no se encontró capacidad ni peso, pero hay un número + kg en el texto,
  // es probablemente el peso del equipo (más común en placas chinas).
  if (!result.capacity && !result.weight) {
    const kgMatch = text.match(/(\d{3,5})\s*(?:kg|ko|kgs)/i);
    if (kgMatch) {
      result.weight = kgMatch[1].replace(/[,\.]/g, '');
    }
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
