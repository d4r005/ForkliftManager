import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { checklistItems } from '../data/checklistItems.js';
import nafLogoUrl from '../assets/bitacora-naf-logo.png';
import shelserLogoUrl from '../assets/bitacora-shelser-logo.png';

// ============================================================================
// Genera el PDF de la bitácora de revisión de montacargas dibujando todo desde
// cero con pdf-lib — sin depender de ninguna plantilla en Supabase.
// Réplica visual del formato oficial F-SH-006-06.
// US Letter horizontal (792 × 612 pt).
// ============================================================================

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const C_BLACK  = rgb(0, 0, 0);
const C_WHITE  = rgb(1, 1, 1);
const C_GOLD   = rgb(236/255, 179/255, 36/255);
const C_GREEN  = rgb(0.85, 0.92, 0.80);
const C_RED    = rgb(0.96, 0.80, 0.80);
const C_GRAY   = rgb(0.93, 0.93, 0.93);
const C_LIGHT  = rgb(0.97, 0.97, 0.97);

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 12;
const CONCEPT_W = 185;
const TABLE_X = MARGIN + CONCEPT_W;          // 197
const DAY_W = (PAGE_W - MARGIN - TABLE_X) / 31; // ≈ 18.87

export async function exportChecklistToPdf(checklist) {
  const pdfDoc = await PDFDocument.create();
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // --- helpers (todo en coordenadas "desde arriba") ---
  const py = (yTop) => PAGE_H - yTop; // convierte a sistema pdf-lib (origen abajo-izq)

  // Rectángulo: esquina sup-izq (x, yTop), ancho w, alto h
  const rect = (x, yTop, w, h, color) =>
    page.drawRectangle({ x, y: py(yTop + h), width: w, height: h, color });

  // Línea horizontal
  const hline = (x1, x2, yTop, color = C_BLACK, th = 0.5) =>
    page.drawLine({ start: { x: x1, y: py(yTop) }, end: { x: x2, y: py(yTop) }, thickness: th, color });

  // Línea vertical
  const vline = (x, yTop1, yTop2, color = C_BLACK, th = 0.5) =>
    page.drawLine({ start: { x, y: py(yTop1) }, end: { x, y: py(yTop2) }, thickness: th, color });

  // Texto con la parte superior en yTop
  const text = (str, x, yTop, size, f = font, color = C_BLACK) => {
    if (!str) return;
    page.drawText(String(str), { x, y: py(yTop + size * 0.72), size, font: f, color });
  };

  // Texto centrado verticalmente en una fila (yTop → yTop+rowH) y opcionalmente centrado horizontal
  const textRow = (str, x, yTop, rowH, size, f = font, color = C_BLACK, align = 'left') => {
    if (!str) return;
    const baselineTop = yTop + rowH / 2 + size * 0.25;
    let dx = x;
    if (align === 'center') {
      const w = f.widthOfTextAtSize(String(str), size);
      dx = x - w / 2;
    } else if (align === 'right') {
      const w = f.widthOfTextAtSize(String(str), size);
      dx = x - w;
    }
    page.drawText(String(str), { x: dx, y: py(baselineTop), size, font: f, color });
  };

  // Imagen: esquina sup-izq (x, yTop), ancho w, alto h
  const imgTop = (img, x, yTop, w, h) =>
    page.drawImage(img, { x, y: py(yTop + h), width: w, height: h });

  // ======================== LAYOUT ========================

  // --- Sección 1: Logos + nombre empresa (5 → 53) ---
  let y = 5;
  const s1H = 46;
  try {
    const [nafBuf, shelserBuf] = await Promise.all([
      fetch(nafLogoUrl).then(r => r.arrayBuffer()),
      fetch(shelserLogoUrl).then(r => r.arrayBuffer()),
    ]);
    const nafImg     = await pdfDoc.embedPng(nafBuf);
    const shelserImg = await pdfDoc.embedPng(shelserBuf);

    // Logo NAF (izquierda)
    const nafH = 36;
    const nafW = nafImg.width * (nafH / nafImg.height);
    imgTop(nafImg, MARGIN + 4, y + 4, nafW, nafH);

    // Logo SHELSER (derecha)
    const shH = 36;
    const shW = shelserImg.width * (shH / shelserImg.height);
    imgTop(shelserImg, PAGE_W - MARGIN - 4 - shW, y + 4, shW, shH);
  } catch (e) {
    console.warn('Logos no disponibles:', e);
  }

  textRow('SHELSER S. DE R.L. DE C.V.', (MARGIN + PAGE_W - MARGIN) / 2, y, s1H, 15, fontBold, C_BLACK, 'center');
  y += s1H + 2;

  // --- Sección 2: Franja negra (53 → 76) ---
  const s2H = 22;
  rect(MARGIN, y, PAGE_W - 2 * MARGIN, s2H, C_BLACK);
  textRow('SEGURIDAD Y SALUD EN EL TRABAJO', (MARGIN + PAGE_W) / 2, y, s2H, 11, fontBold, C_WHITE, 'center');
  y += s2H + 2;

  // --- Sección 3: Franja dorada (78 → 106) ---
  const s3H = 26;
  rect(MARGIN, y, PAGE_W - 2 * MARGIN, s3H, C_GOLD);
  textRow('BITACORA DE REVISION DE MONTACARGAS', (MARGIN + PAGE_W) / 2, y, s3H * 0.55, 12, fontBold, C_WHITE, 'center');
  textRow('NOM-006-STPS-2014  Numeral 7.8.5', (MARGIN + PAGE_W) / 2, y + s3H * 0.45, s3H * 0.55, 8, font, C_WHITE, 'center');
  y += s3H + 2;

  // --- Sección 4: Identificación / Mes / Operador (108 → 130) ---
  const s4H = 22;
  // etiquetas
  text('Identificacion del montacargas:', MARGIN + 3, y + 2, 7.5, fontBold);
  text(checklist.forkliftId || '', MARGIN + 3, y + 12, 8.5, font);

  const midX = MARGIN + CONCEPT_W * 0.52;
  text('Mes:', midX, y + 2, 7.5, fontBold);
  const monthIdx = checklist.month ?? new Date().getMonth();
  text(`${MONTHS_ES[monthIdx] || ''}  ${checklist.year || ''}`, midX + 22, y + 2, 8, font);

  text('Nombre del operador:', TABLE_X + 5, y + 2, 7.5, fontBold);
  text(checklist.operatorName || '', TABLE_X + 88, y + 2, 8, font);

  // borde de la sección
  hline(MARGIN, PAGE_W - MARGIN, y, C_BLACK, 0.7);
  hline(MARGIN, PAGE_W - MARGIN, y + s4H, C_BLACK, 0.7);
  vline(MARGIN, y, y + s4H);
  vline(PAGE_W - MARGIN, y, y + s4H);
  y += s4H + 2;

  // --- Sección 5: Instrucciones (132 → 150) ---
  const s5H = 16;
  textRow(
    'Instrucciones: Marque todos los renglones indicados.  SAT: Satisfactorio,  INS: Insatisfactorio,  N/A: No Aplica.',
    (MARGIN + PAGE_W) / 2, y, s5H, 7, fontBold, C_BLACK, 'center'
  );
  hline(MARGIN, PAGE_W - MARGIN, y, C_BLACK, 0.5);
  hline(MARGIN, PAGE_W - MARGIN, y + s5H, C_BLACK, 0.5);
  y += s5H + 2;

  // --- Sección 6: Encabezado de tabla (152 → 167) ---
  const s6H = 15;
  rect(MARGIN, y, CONCEPT_W, s6H, C_GRAY);
  textRow('CONCEPTO A REVISAR', MARGIN + 3, y, s6H, 8, fontBold, C_BLACK, 'left');
  for (let d = 1; d <= 31; d++) {
    const dx = TABLE_X + (d - 1) * DAY_W;
    if (d === checklist.day) rect(dx, y, DAY_W, s6H, C_GOLD);
    textRow(String(d), dx + DAY_W / 2, y, s6H, 7, fontBold, C_BLACK, 'center');
  }
  y += s6H;

  // --- Sección 7: 26 conceptos (167 → 505) ---
  const itemH = 13;
  checklistItems.forEach((item, idx) => {
    const rTop = y + idx * itemH;
    if (idx % 2 === 1) rect(MARGIN, rTop, CONCEPT_W, itemH, C_LIGHT); // rayado alterno
    const label = `${item.id}.- ${item.es}`;
    textRow(label, MARGIN + 3, rTop, itemH, 6.8, font, C_BLACK, 'left');

    const rating = checklist.items?.[item.id];
    if (rating) {
      const dx = TABLE_X + (checklist.day - 1) * DAY_W;
      if (rating === 'SAT') rect(dx, rTop, DAY_W, itemH, C_GREEN);
      else if (rating === 'INS') rect(dx, rTop, DAY_W, itemH, C_RED);
      textRow(rating, dx + DAY_W / 2, rTop, itemH, 6.5, fontBold, C_BLACK, 'center');
    }
  });

  // --- Cuadrícula de la tabla ---
  const gridTop = y - s6H; // inicio del header
  const gridBot = y + 26 * itemH;

  // Líneas horizontales (header + 26 filas)
  for (let i = 0; i <= 26; i++) {
    hline(MARGIN, PAGE_W - MARGIN, y + i * itemH);
  }
  hline(MARGIN, PAGE_W - MARGIN, gridTop); // borde superior del header

  // Líneas verticales
  vline(MARGIN, gridTop, gridBot);
  vline(TABLE_X, gridTop, gridBot);
  for (let d = 0; d <= 31; d++) {
    vline(TABLE_X + d * DAY_W, gridTop, gridBot);
  }

  y = gridBot + 4;

  // --- Sección 8: Nombre de quien revisa ---
  const s8H = 16;
  textRow(`Nombre de quien revisa:  ${checklist.inspectorName || ''}`, MARGIN + 3, y, s8H, 9, fontBold, C_BLACK, 'left');
  hline(MARGIN, PAGE_W - MARGIN, y);
  hline(MARGIN, PAGE_W - MARGIN, y + s8H);
  vline(MARGIN, y, y + s8H);
  vline(PAGE_W - MARGIN, y, y + s8H);
  y += s8H + 2;

  // --- Sección 9: Observaciones ---
  const s9H = 26;
  text(`Observaciones:  ${checklist.observations || ''}`, MARGIN + 3, y + 3, 8, fontBold);
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
