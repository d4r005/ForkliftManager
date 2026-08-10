import ExcelJS from 'exceljs';
import { checklistItems } from '../data/checklistItems.js';
import nafLogoUrl from '../assets/bitacora-naf-logo.png';
import shelserLogoUrl from '../assets/bitacora-shelser-logo.png';

// ============================================================================
// Replica exacta del formato oficial "F-SH-006-06 Bitácora de revisión de
// montacargas" (SHELSER S. DE R.L. DE C.V.). El formato oficial de la empresa
// SIEMPRE es bilingüe Español + Chino, sin importar el idioma seleccionado en
// la app — por eso aquí no usamos las traducciones de i18n para encabezados,
// sino el texto fijo tal cual aparece en el documento físico.
//
// Dimensionado para que quepa en 1 sola hoja tamaño Carta (Letter) horizontal
// al imprimir/exportar, y con las 31 columnas de días TODAS del mismo ancho.
// ============================================================================

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTHS_ZH = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

const BLACK = 'FF000000';
const WHITE = 'FFFFFFFF';
const GOLD = 'FFECB324';

const thin = { style: 'thin', color: { argb: 'FF000000' } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

// Columnas del formato oficial (47 columnas: A..AU), reducidas de tamaño para
// que la hoja quepa en 1 página Carta y todos los cuadros de día midan igual.
// A..P (16 cols) = zona de texto/etiquetas; Q..AU (31 cols, TODAS iguales) = días 1-31
const DAY_COL_WIDTH = 2.6;
const COL_WIDTHS = [
  1.5, 5, 5, 5, 5, 5, 5, 3.2, 1.5, 5, 5, 5, 5, 5, 5, 5, // A..P (concepto)
  ...Array(31).fill(DAY_COL_WIDTH), // Q..AU (días, todos iguales)
];

async function fetchAsBuffer(url) {
  const res = await fetch(url);
  return await res.arrayBuffer();
}

/**
 * Genera el Excel de la bitácora de revisión de montacargas replicando el
 * formato oficial F-SH-006-06 (logos, franja negra, franja dorada, cuadrícula
 * de 26 conceptos x 31 días), ajustado para caber en 1 hoja tamaño Carta.
 * @param {object} checklist
 */
export async function exportChecklistToExcel(checklist) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bitácora', {
    pageSetup: {
      paperSize: 1, // 1 = Letter (Carta)
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 },
    },
  });

  ws.columns = COL_WIDTHS.map((w) => ({ width: w }));

  // --- Fila 1-2: logos + nombre de empresa + subtítulo bilingüe ---
  ws.mergeCells('A1:I2');
  ws.mergeCells('J1:AK1');
  ws.mergeCells('J2:AK2');
  ws.mergeCells('AL1:AU2');
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 26;

  const company = ws.getCell('J1');
  company.value = 'SHELSER S. DE R.L. DE C.V.';
  company.font = { name: 'Arial', size: 14, bold: true, color: { argb: BLACK } };
  company.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  const subtitle = ws.getCell('J2');
  subtitle.value = 'SEGURIDAD Y SALUD EN EL TRABAJO 职业安全与健康';
  subtitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: WHITE } };
  subtitle.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  subtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLACK } };

  // --- Fila 3: franja dorada con el título ---
  ws.mergeCells('A3:AU3');
  ws.getRow(3).height = 32;
  const title = ws.getCell('A3');
  title.value = 'BITÁCORA DE REVISIÓN DE MONTACARGAS 叉车检查记录表\nNOM-006-STPS-2014 Numeral 7.8.5';
  title.font = { name: 'Arial', size: 11, bold: true, color: { argb: WHITE } };
  title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };

  // --- Fila 4-5: identificación / mes / operador ---
  ws.mergeCells('A4:H4');
  ws.mergeCells('I4:O4');
  ws.mergeCells('P4:AU5');
  ws.mergeCells('A5:H5');
  ws.mergeCells('I5:O5');
  ws.getRow(4).height = 16;
  ws.getRow(5).height = 15;

  const forkliftLabel = ws.getCell('A4');
  forkliftLabel.value = 'Identificación del montacargas 叉车编号:';
  const monthLabel = ws.getCell('I4');
  monthLabel.value = 'Mes 月';
  const operatorCell = ws.getCell('P4');
  operatorCell.value = `Nombre del operador操作员姓名: ${checklist.operatorName || ''}`;
  [forkliftLabel, monthLabel].forEach((c) => {
    c.font = { name: 'Calibri', size: 8, bold: true, color: { argb: BLACK } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  operatorCell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: BLACK } };
  operatorCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

  const forkliftValue = ws.getCell('A5');
  forkliftValue.value = checklist.forkliftId || '';
  const monthValue = ws.getCell('I5');
  const monthIdx = checklist.month ?? new Date().getMonth();
  monthValue.value = `${MONTHS_ES[monthIdx] || ''} ${MONTHS_ZH[monthIdx] || ''}  ${checklist.year || ''}`.trim();
  [forkliftValue, monthValue].forEach((c) => {
    c.font = { name: 'Calibri', size: 8, bold: false, color: { argb: BLACK } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  // --- Fila 6: instrucciones ---
  ws.mergeCells('A6:AU6');
  ws.getRow(6).height = 20;
  const instructions = ws.getCell('A6');
  instructions.value = 'Instrucciones 说明: Marque todos los renglones indicados. 请勾选所有检查项目。 SAT: Satisfactorio 格, INS: Insatisfactorio 不合格, N/A: No Aplica 不适用。. En caso de cualquier comentario adicional utilice la parte final del formato.如有其他备注，请填写在表格末尾。';
  instructions.font = { name: 'Calibri', size: 6.5, bold: true, color: { argb: BLACK } };
  instructions.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  // --- Fila 7: encabezado de la tabla (concepto + días 1-31) ---
  ws.mergeCells('A7:P7');
  ws.getRow(7).height = 13;
  const conceptHeader = ws.getCell('A7');
  conceptHeader.value = 'CONCEPTO A REVISAR 检查项目';
  conceptHeader.font = { name: 'Calibri', size: 7.5, bold: true, color: { argb: BLACK } };
  conceptHeader.alignment = { horizontal: 'left', vertical: 'middle' };

  for (let d = 1; d <= 31; d++) {
    const cell = ws.getCell(7, 17 + (d - 1)); // columna Q = índice 17
    cell.value = d;
    cell.font = { name: 'Calibri', size: 6.5, bold: true, color: { argb: BLACK } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allBorders;
    if (d === checklist.day) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    }
  }

  // --- Filas 8-33: 26 conceptos de revisión ---
  const dayCol = 17 + (checklist.day - 1);
  checklistItems.forEach((item, idx) => {
    const r = 8 + idx;
    ws.mergeCells(r, 1, r, 16); // A:P
    ws.getRow(r).height = 13.5;

    const label = ws.getCell(r, 1);
    label.value = `${item.id}.- ${item.es} ${item.zh}`;
    label.font = { name: 'Calibri', size: 7, bold: false, color: { argb: BLACK } };
    label.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    label.border = allBorders;

    for (let d = 1; d <= 31; d++) {
      const c = 17 + (d - 1);
      const cell = ws.getCell(r, c);
      cell.border = allBorders;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (c === dayCol) {
        const rating = checklist.items?.[item.id];
        if (rating) {
          cell.value = rating;
          cell.font = { name: 'Calibri', size: 6.5, bold: true, color: { argb: BLACK } };
          if (rating === 'SAT') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
          if (rating === 'INS') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } };
        }
      }
    }
  });

  // --- Fila 34: nombre de quien revisa ---
  const revRow = 34;
  ws.mergeCells(`A${revRow}:AU${revRow}`);
  ws.getRow(revRow).height = 16;
  const revCell = ws.getCell(`A${revRow}`);
  revCell.value = `NOMBRE DE QUIEN REVISA 检查人姓名: ${checklist.inspectorName || ''}`;
  revCell.font = { name: 'Calibri', size: 7.5, bold: true, color: { argb: BLACK } };
  revCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // --- Filas 35-37: observaciones ---
  ws.mergeCells('A35:AU37');
  ws.getRow(35).height = 14;
  const obsCell = ws.getCell('A35');
  obsCell.value = `OBSERVACIONES 备注: ${checklist.observations || ''}`;
  obsCell.font = { name: 'Calibri', size: 7.5, bold: true, color: { argb: BLACK } };
  obsCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };

  // --- Bordes en toda la zona de tabla (filas 4-34) ---
  for (let r = 4; r <= 34; r++) {
    for (let c = 1; c <= 47; c++) {
      const cell = ws.getCell(r, c);
      if (!cell.border) cell.border = allBorders;
    }
  }

  // --- Logos ---
  try {
    const [nafBuf, shelserBuf] = await Promise.all([
      fetchAsBuffer(nafLogoUrl),
      fetchAsBuffer(shelserLogoUrl),
    ]);
    const nafId = wb.addImage({ buffer: nafBuf, extension: 'png' });
    const shelserId = wb.addImage({ buffer: shelserBuf, extension: 'png' });

    ws.addImage(nafId, { tl: { col: 0.1, row: 0.05 }, ext: { width: 150, height: 67 } });
    ws.addImage(shelserId, { tl: { col: 39.6, row: 0.02 }, ext: { width: 70, height: 71 } });
  } catch (e) {
    console.warn('No se pudieron insertar los logos en el Excel:', e);
  }

  const dateStr = `${checklist.year}-${String((checklist.month ?? 0) + 1).padStart(2, '0')}-${String(checklist.day).padStart(2, '0')}`;
  const fileName = `Bitacora_Montacargas_${checklist.forkliftId || 'SN'}_${dateStr}.xlsx`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
