import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { checklistItems } from '../data/checklistItems.js';
import nafLogoUrl from '../assets/bitacora-naf-logo.png';
import shelserLogoUrl from '../assets/bitacora-shelser-logo.png';
import notoRegularUrl from '../assets/NotoSansSC-Regular.ttf';
import notoBoldUrl from '../assets/NotoSansSC-Bold.ttf';

// ============================================================================
// Genera el PDF de la bitácora de revisión de montacargas dibujando todo desde
// cero con pdf-lib — sin depender de ninguna plantilla en Supabase.
// Réplica visual del formato oficial F-SH-006-06, incluyendo el chino tal
// cual aparece en el Excel (fuente Noto Sans SC embebida, subconjunto con
// solo los caracteres usados en la app).
// US Letter horizontal (792 × 612 pt), ajustado a 1 sola página.
// ============================================================================

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_ZH = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

const C_BLACK  = rgb(0, 0, 0);
const C_WHITE  = rgb(1, 1, 1);
const C_GOLD   = rgb(236/255, 179/255, 36/255);
const C_GREEN  = rgb(0.85, 0.92, 0.80);
const C_RED    = rgb(0.96, 0.80, 0.80);
const C_GRAY   = rgb(0.93, 0.93, 0.93);
const C_LIGHT  = rgb(0.97, 0.97, 0.97);

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 10;
const CONCEPT_W = 175;
const TABLE_X = MARGIN + CONCEPT_W;
const DAY_W = (PAGE_W - MARGIN - TABLE_X) / 31; // todas las columnas de día iguales

const isCJK = (ch) => {
  const c = ch.codePointAt(0);
  return (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef) || (c >= 0x3000 && c <= 0x303f);
};

export async function exportChecklistToPdf(checklist) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const font       = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let cjkFont = font;
  let cjkFontBold = fontBold;
  try {
    const [regBuf, boldBuf] = await Promise.all([
      fetch(notoRegularUrl).then(r => r.arrayBuffer()),
      fetch(notoBoldUrl).then(r => r.arrayBuffer()),
    ]);
    cjkFont = await pdfDoc.embedFont(regBuf, { subset: true });
    cjkFontBold = await pdfDoc.embedFont(boldBuf, { subset: true });
  } catch (e) {
    console.warn('No se pudo cargar la fuente china, se omitirán esos caracteres:', e);
  }

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const py = (yTop) => PAGE_H - yTop;

  const fontFor = (bold, cjk) => (cjk ? (bold ? cjkFontBold : cjkFont) : (bold ? fontBold : font));

  // --- Tokeniza un texto mixto ES/ZH en "palabras" (por espacios) clasificadas ---
  const tokenize = (str) => String(str).split(/(\s+)/).filter((t) => t !== '').map((t) => ({
    text: t,
    cjk: [...t].some(isCJK),
  }));

  // Ancho de un token sumando cada carácter con SU propia fuente (ver nota
  // en drawLine sobre por qué esto no puede hacerse por token completo).
  const tokenWidth = (tok, size, bold) =>
    [...tok.text].reduce((sum, ch) => sum + fontFor(bold, isCJK(ch)).widthOfTextAtSize(ch, size), 0);

  // --- Envuelve tokens en líneas que no excedan maxWidth ---
  const wrapTokens = (str, maxWidth, size, bold) => {
    const tokens = tokenize(str);
    const lines = [];
    let cur = [];
    let curW = 0;
    for (const tok of tokens) {
      if (/^\s+$/.test(tok.text)) {
        if (cur.length) { cur.push(tok); curW += tokenWidth(tok, size, bold); }
        continue;
      }
      const w = tokenWidth(tok, size, bold);
      if (curW + w > maxWidth && cur.length) {
        lines.push(cur);
        cur = [];
        curW = 0;
      }
      cur.push(tok);
      curW += w;
    }
    if (cur.length) lines.push(cur);
    return lines.map((line) => {
      // recorta espacios al inicio/fin de línea
      while (line.length && /^\s+$/.test(line[0].text)) line.shift();
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
      return line;
    });
  };

  const lineWidth = (line, size, bold) => line.reduce((s, t) => s + tokenWidth(t, size, bold), 0);

  // Dibuja una línea (array de tokens) empezando en x, con el TOP del texto en yTop.
  // IMPORTANTE: la fuente se elige POR CARÁCTER, no por token completo. La
  // fuente china embebida es un subconjunto (solo ~150 glyphs, los usados en
  // la app) y NO incluye puntuación ASCII básica (":", ","). Si un token
  // mixto como "月:" o "不合格," se dibujaba entero con la fuente china (por
  // tener algún carácter CJK), el ":" / "," caían fuera del subset y salían
  // como un cuadro vacío (glyph .notdef) en vez del carácter — bug reportado
  // en auditoría. Eligiendo la fuente carácter por carácter, la puntuación
  // ASCII siempre usa Helvetica y los caracteres CJK siempre usan Noto Sans SC.
  const drawLine = (line, x, yTop, size, bold, color) => {
    let dx = x;
    for (const tok of line) {
      for (const ch of tok.text) {
        const f = fontFor(bold, isCJK(ch));
        page.drawText(ch, { x: dx, y: py(yTop + size * 0.9), size, font: f, color });
        dx += f.widthOfTextAtSize(ch, size);
      }
    }
  };

  // Dibuja texto mixto de una sola línea, con alineación, centrado vertical en una fila
  const textRow = (str, x, yTop, rowH, size, bold = false, color = C_BLACK, align = 'left') => {
    if (!str) return;
    const line = tokenize(str);
    const w = lineWidth(line, size, bold);
    let dx = x;
    if (align === 'center') dx = x - w / 2;
    else if (align === 'right') dx = x - w;
    const baselineY = yTop + rowH / 2 + size * 0.32;
    drawLine(line, dx, baselineY - size * 0.9, size, bold, color);
  };

  // Dibuja texto mixto envuelto en varias líneas dentro de un ancho máximo,
  // centrado verticalmente dentro de rowH (hasta maxLines líneas)
  const textWrapped = (str, x, yTop, maxWidth, rowH, size, bold = false, color = C_BLACK, lineGap = 1.15, maxLines = 3) => {
    if (!str) return;
    let lines = wrapTokens(str, maxWidth, size, bold);
    if (lines.length > maxLines) lines = lines.slice(0, maxLines);
    const lh = size * lineGap;
    const totalH = lines.length * lh;
    let curTop = yTop + Math.max(0, (rowH - totalH) / 2);
    for (const line of lines) {
      drawLine(line, x, curTop, size, bold, color);
      curTop += lh;
    }
  };

  const rect = (x, yTop, w, h, color) => page.drawRectangle({ x, y: py(yTop + h), width: w, height: h, color });
  const hline = (x1, x2, yTop, color = C_BLACK, th = 0.5) =>
    page.drawLine({ start: { x: x1, y: py(yTop) }, end: { x: x2, y: py(yTop) }, thickness: th, color });
  const vline = (x, yTop1, yTop2, color = C_BLACK, th = 0.5) =>
    page.drawLine({ start: { x, y: py(yTop1) }, end: { x, y: py(yTop2) }, thickness: th, color });
  const imgTop = (img, x, yTop, w, h) => page.drawImage(img, { x, y: py(yTop + h), width: w, height: h });

  // ======================== LAYOUT ========================
  let y = 4;

  // --- Sección 1: Logos + nombre empresa ---
  const s1H = 38;
  try {
    const [nafBuf, shelserBuf] = await Promise.all([
      fetch(nafLogoUrl).then(r => r.arrayBuffer()),
      fetch(shelserLogoUrl).then(r => r.arrayBuffer()),
    ]);
    const nafImg = await pdfDoc.embedPng(nafBuf);
    const shelserImg = await pdfDoc.embedPng(shelserBuf);

    const nafH = 32;
    const nafW = nafImg.width * (nafH / nafImg.height);
    imgTop(nafImg, MARGIN + 3, y + 3, nafW, nafH);

    const shH = 32;
    const shW = shelserImg.width * (shH / shelserImg.height);
    imgTop(shelserImg, PAGE_W - MARGIN - 3 - shW, y + 3, shW, shH);
  } catch (e) {
    console.warn('Logos no disponibles:', e);
  }
  textRow('SHELSER S. DE R.L. DE C.V.', (MARGIN + PAGE_W - MARGIN) / 2, y, s1H, 13, true, C_BLACK, 'center');
  y += s1H + 2;

  // --- Sección 2: Franja negra bilingüe ---
  const s2H = 18;
  rect(MARGIN, y, PAGE_W - 2 * MARGIN, s2H, C_BLACK);
  textRow('SEGURIDAD Y SALUD EN EL TRABAJO 职业安全与健康', (MARGIN + PAGE_W) / 2, y, s2H, 9.5, true, C_WHITE, 'center');
  y += s2H + 2;

  // --- Sección 3: Franja dorada ---
  const s3H = 26;
  rect(MARGIN, y, PAGE_W - 2 * MARGIN, s3H, C_GOLD);
  textRow('BITÁCORA DE REVISIÓN DE MONTACARGAS 叉车检查记录表', (MARGIN + PAGE_W) / 2, y, s3H * 0.55, 10, true, C_WHITE, 'center');
  textRow('NOM-006-STPS-2014  Numeral 7.8.5', (MARGIN + PAGE_W) / 2, y + s3H * 0.5, s3H * 0.5, 7.5, false, C_WHITE, 'center');
  y += s3H + 2;

  // --- Sección 4: Identificación / Mes / Operador ---
  // IMPORTANTE: usar textWrapped (con ancho máximo) y NUNCA textRow (una sola
  // línea sin límite) aquí — "Identificación del montacargas 叉车编号:" es
  // más largo que su columna y con textRow se dibujaba encima de "Mes 月"
  // en la misma línea (bug de traslape de texto).
  const s4H = 26;
  // El renglón de Identificación necesita más ancho que Mes para que su
  // etiqueta bilingüe quepa en 1 sola línea (medido con las fuentes reales:
  // "Identificación del montacargas 叉车编号:" necesita ~106pt a 5.5pt, y
  // "Mes 月: Agosto 八月 2026" cabe perfecto envuelto en 2 líneas con bastante
  // menos ancho) — por eso el split ya NO es 50/50.
  const col1AreaW = 122; // ancho reservado para toda la columna de Identificación
  const col1W = col1AreaW - 8;
  const midX = MARGIN + col1AreaW;
  const col2W = CONCEPT_W - col1AreaW - 8;
  const monthIdx = checklist.month ?? new Date().getMonth();

  // Estructura calcada del Excel original: la ETIQUETA va en su propia
  // fila (sin ':') y el VALOR debajo, tanto para Identificación como para
  // Mes -- no van pegados con ':' en el mismo renglon (eso solo aplica a
  // "Nombre del operador", que en el Excel si es una sola celda "Etiqueta:
  // valor"). Un fix anterior angosto demasiado la columna y la ETIQUETA se
  // cortaba a la mitad ("Identificación del" sin "montacargas 叉车编号"); se
  // ensancho col1 (a costa de Mes, que sobraba espacio) para que la etiqueta
  // quepa en 1 sola linea, con el valor debajo en fuente grande.
  textWrapped(
    'Identificación del montacargas 叉车编号',
    MARGIN + 4, y, col1W, s4H * 0.4, 5.5, true, C_BLACK, 1.1, 1
  );
  textRow(
    checklist.forkliftId || 'N/A',
    MARGIN + 4, y + s4H * 0.42, s4H * 0.58, 11, true, C_BLACK, 'left'
  );
  textWrapped(
    'Mes 月',
    midX + 4, y, col2W, s4H * 0.32, 6, true, C_BLACK, 1.1, 1
  );
  textWrapped(
    `${MONTHS_ES[monthIdx] || ''} ${MONTHS_ZH[monthIdx] || ''} ${checklist.year || ''}`.trim(),
    midX + 4, y + s4H * 0.34, col2W, s4H * 0.66, 8, true, C_BLACK, 1.15, 2
  );
  textWrapped(
    `Nombre del operador 操作员姓名: ${checklist.operatorName || ''}`,
    TABLE_X + 5, y, PAGE_W - MARGIN - TABLE_X - 10, s4H, 7.5, true, C_BLACK, 1.15, 2
  );

  hline(MARGIN, PAGE_W - MARGIN, y, C_BLACK, 0.7);
  hline(MARGIN, PAGE_W - MARGIN, y + s4H, C_BLACK, 0.7);
  vline(MARGIN, y, y + s4H);
  vline(TABLE_X, y, y + s4H);
  vline(PAGE_W - MARGIN, y, y + s4H);
  y += s4H + 2;

  // --- Sección 5: Instrucciones (bilingüe, puede envolver 2 líneas) ---
  const s5H = 20;
  // Texto completo tal cual el formato oficial en Excel (antes se omitia la ultima oracion sobre comentarios adicionales).
  const instrText = 'Instrucciones 说明: Marque todos los renglones indicados. 请勾选所有检查项目。 SAT: Satisfactorio 格, INS: Insatisfactorio 不合格, N/A: No Aplica 不适用。. En caso de cualquier comentario adicional utilice la parte final del formato 如有其他注. 请填写在表格末尾';
  textWrapped(instrText, MARGIN + 4, y, PAGE_W - 2 * MARGIN - 8, s5H, 6, true, C_BLACK, 1.15, 2);
  hline(MARGIN, PAGE_W - MARGIN, y, C_BLACK, 0.5);
  hline(MARGIN, PAGE_W - MARGIN, y + s5H, C_BLACK, 0.5);
  y += s5H + 2;

  // --- Sección 6: Encabezado de tabla ---
  const s6H = 13;
  rect(MARGIN, y, CONCEPT_W, s6H, C_GRAY);
  textRow('CONCEPTO A REVISAR 检查项目', MARGIN + 3, y, s6H, 6.5, true, C_BLACK, 'left');
  for (let d = 1; d <= 31; d++) {
    const dx = TABLE_X + (d - 1) * DAY_W;
    if (d === checklist.day) rect(dx, y, DAY_W, s6H, C_GOLD);
    textRow(String(d), dx + DAY_W / 2, y, s6H, 6, true, C_BLACK, 'center');
  }
  y += s6H;

  // --- Sección 7: 26 conceptos ---
  const itemH = 15;
  checklistItems.forEach((item, idx) => {
    const rTop = y + idx * itemH;
    if (idx % 2 === 1) rect(MARGIN, rTop, CONCEPT_W, itemH, C_LIGHT);
    const label = `${item.id}.- ${item.es} ${item.zh}`;
    textWrapped(label, MARGIN + 3, rTop, CONCEPT_W - 6, itemH, 5.6, false, C_BLACK, 1.05, 2);

    const rating = checklist.items?.[item.id];
    if (rating) {
      const dx = TABLE_X + (checklist.day - 1) * DAY_W;
      if (rating === 'SAT') rect(dx, rTop, DAY_W, itemH, C_GREEN);
      else if (rating === 'INS') rect(dx, rTop, DAY_W, itemH, C_RED);
      textRow(rating, dx + DAY_W / 2, rTop, itemH, 6, true, C_BLACK, 'center');
    }
  });

  // --- Cuadrícula ---
  const gridTop = y - s6H;
  const gridBot = y + 26 * itemH;
  for (let i = 0; i <= 26; i++) hline(MARGIN, PAGE_W - MARGIN, y + i * itemH);
  hline(MARGIN, PAGE_W - MARGIN, gridTop);
  vline(MARGIN, gridTop, gridBot);
  vline(TABLE_X, gridTop, gridBot);
  for (let d = 0; d <= 31; d++) vline(TABLE_X + d * DAY_W, gridTop, gridBot);

  y = gridBot + 3;

  // --- Sección 8: Nombre de quien revisa ---
  const s8H = 14;
  textRow(`NOMBRE DE QUIEN REVISA 检查人姓名: ${checklist.inspectorName || ''}`, MARGIN + 3, y, s8H, 7.5, true, C_BLACK, 'left');
  hline(MARGIN, PAGE_W - MARGIN, y);
  hline(MARGIN, PAGE_W - MARGIN, y + s8H);
  vline(MARGIN, y, y + s8H);
  vline(PAGE_W - MARGIN, y, y + s8H);
  y += s8H + 2;

  // --- Sección 9: Observaciones ---
  const s9H = 20;
  textWrapped(`OBSERVACIONES 备注: ${checklist.observations || ''}`, MARGIN + 3, y, PAGE_W - 2 * MARGIN - 6, s9H, 7, true, C_BLACK, 1.15, 2);
  hline(MARGIN, PAGE_W - MARGIN, y);
  hline(MARGIN, PAGE_W - MARGIN, y + s9H);
  vline(MARGIN, y, y + s9H);
  vline(PAGE_W - MARGIN, y, y + s9H);

  // --- Guardar ---
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateStr = `${checklist.year}-${String((checklist.month ?? 0) + 1).padStart(2, '0')}-${String(checklist.day).padStart(2, '0')}`;
  link.download = `Bitacora_${checklist.forkliftId || 'SN'}_${dateStr}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
