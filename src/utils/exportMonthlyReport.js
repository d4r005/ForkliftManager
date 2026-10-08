import ExcelJS from 'exceljs';
import { checklistItems } from '../data/checklistItems.js';
import { saveOrShareFile } from './saveOrShareFile.js';

// ============================================================================
// Reporte mensual de revisiones de montacargas (Excel), exportable desde la
// vista de Reportes. Solo supervisores y admin ven el botón que lo invoca.
//
// Contenido:
//   Hoja "Resumen":   KPIs del mes + INS por montacargas + puntos con más INS
//   Hoja "Revisiones": un renglón por revisión del mes, con observaciones
// ============================================================================

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const thin = { style: 'thin', color: { argb: 'FF9AA0A6' } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
const KPI_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECB324' } };
const INS_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6C6C6' } };

/**
 * @param {number} month 0-11
 * @param {number} year
 * @param {Array} checklists todos los checklists cargados
 */
export async function exportMonthlyReport(month, year, checklists) {
  const inMonth = checklists.filter(c => c.month === month && c.year === year);

  // --- Estadísticas del mes ---
  let sat = 0, ins = 0, na = 0;
  const insByForklift = {};
  const insByItem = {};
  inMonth.forEach(c => {
    Object.entries(c.items || {}).forEach(([itemId, rating]) => {
      if (rating === 'SAT') sat++;
      else if (rating === 'INS') {
        ins++;
        insByForklift[c.forkliftId] = (insByForklift[c.forkliftId] || 0) + 1;
        insByItem[itemId] = (insByItem[itemId] || 0) + 1;
      } else if (rating === 'N/A') na++;
    });
  });
  const rated = sat + ins;
  const satisfaction = rated > 0 ? Math.round((sat / rated) * 100) : 100;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ForkliftManager';

  // ================= Hoja Resumen =================
  const ws = wb.addWorksheet('Resumen', { pageSetup: { orientation: 'portrait', fitToPage: true } });
  ws.columns = [
    { width: 6 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 40 }, { width: 6 },
  ];

  const mergeCenter = (range, value, opts = {}) => {
    ws.mergeCells(range);
    const cell = ws.getCell(range.split(':')[0]);
    cell.value = value;
    cell.font = opts.font || { bold: true, size: opts.size || 12, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrap: true };
    if (opts.fill) cell.fill = opts.fill;
    if (opts.border) cell.border = allBorders;
    return cell;
  };

  mergeCenter('B2:F2', 'SHELSER S. DE R.L. DE C.V.', { size: 14 });
  mergeCenter('B3:F3', `REPORTE MENSUAL DE REVISIONES DE MONTACARGAS — ${MONTHS_ES[month] || ''} ${year}`, { size: 12 });
  mergeCenter('B4:F4', `Generado: ${new Date().toLocaleString('es-MX')}`, { size: 9, font: { size: 9, color: { argb: 'FF666666' } } });

  // KPIs
  let row = 6;
  const kpis = [
    ['Revisiones del mes', inMonth.length],
    ['Puntos satisfactorios (SAT)', sat],
    ['Puntos insatisfactorios (INS)', ins],
    ['Puntos no aplican (N/A)', na],
    ['% de satisfacción', `${satisfaction}%`],
    ['Montacargas con INS', Object.keys(insByForklift).length],
  ];
  ws.getCell(`B${row}`).value = 'RESUMEN DEL MES';
  ws.getCell(`B${row}`).font = { bold: true, size: 11 };
  row += 1;
  kpis.forEach(([label, value], i) => {
    const r = row + i;
    const c1 = ws.getCell(`B${r}`);
    const c2 = ws.getCell(`C${r}`);
    c1.value = label;
    c2.value = value;
    c1.border = allBorders; c2.border = allBorders;
    if (label.includes('INS')) { c1.fill = INS_FILL; c2.fill = INS_FILL; }
    else { c1.fill = KPI_FILL; }
    c2.alignment = { horizontal: 'center' };
    c2.font = { bold: true };
  });
  row += kpis.length + 2;

  // INS por montacargas
  ws.getCell(`B${row}`).value = 'INSATISFACTORIOS POR MONTACARGAS';
  ws.getCell(`B${row}`).font = { bold: true, size: 11 };
  row += 1;
  ws.getCell(`B${row}`).value = 'Montacargas';
  ws.getCell(`C${row}`).value = 'INS';
  ['B', 'C'].forEach(col => {
    const c = ws.getCell(`${col}${row}`);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL; c.border = allBorders;
    c.alignment = { horizontal: 'center' };
  });
  row += 1;
  const fkEntries = Object.entries(insByForklift).sort((a, b) => b[1] - a[1]);
  if (fkEntries.length === 0) {
    ws.getCell(`B${row}`).value = 'Sin insatisfactorios este mes 🎉';
    ws.getCell(`B${row}`).font = { color: { argb: 'FF22AA55' }, bold: true };
    row += 1;
  } else {
    fkEntries.forEach(([id, count], i) => {
      const r = row + i;
      ws.getCell(`B${r}`).value = id;
      ws.getCell(`C${r}`).value = count;
      ws.getCell(`B${r}`).border = allBorders;
      ws.getCell(`C${r}`).border = allBorders;
      ws.getCell(`C${r}`).alignment = { horizontal: 'center' };
    });
    row += fkEntries.length;
  }
  row += 2;

  // Puntos con más INS
  ws.getCell(`B${row}`).value = 'PUNTOS CON MÁS INSATISFACTORIOS';
  ws.getCell(`B${row}`).font = { bold: true, size: 11 };
  row += 1;
  ws.getCell(`B${row}`).value = '#';
  ws.getCell(`C${row}`).value = 'INS';
  ws.getCell(`D${row}`).value = 'Concepto';
  ['B', 'C', 'D'].forEach(col => {
    const c = ws.getCell(`${col}${row}`);
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL; c.border = allBorders;
    c.alignment = { horizontal: 'center' };
  });
  ws.mergeCells(`D${row}:F${row}`);
  row += 1;
  const itemEntries = Object.entries(insByItem)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => {
      const item = checklistItems.find(i => String(i.id) === String(id));
      return item ? { item, count } : null;
    })
    .filter(Boolean);
  if (itemEntries.length === 0) {
    ws.getCell(`B${row}`).value = 'Sin insatisfactorios este mes 🎉';
    ws.getCell(`B${row}`).font = { color: { argb: 'FF22AA55' }, bold: true };
  } else {
    itemEntries.forEach(({ item, count }, i) => {
      const r = row + i;
      ws.getCell(`B${r}`).value = item.id;
      ws.getCell(`C${r}`).value = count;
      ws.getCell(`D${r}`).value = item.es;
      ws.mergeCells(`D${r}:F${r}`);
      ['B', 'C', 'D'].forEach(col => ws.getCell(`${col}${r}`).border = allBorders);
      ws.getCell(`C${r}`).alignment = { horizontal: 'center' };
    });
  }

  // ================= Hoja Revisiones =================
  const ws2 = wb.addWorksheet('Revisiones', { pageSetup: { orientation: 'landscape', fitToPage: true } });
  ws2.columns = [
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 24 },
    { width: 24 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 50 },
  ];
  const headers = ['Día', 'Mes', 'Año', 'Montacargas', 'Operador', 'Quien revisa', 'SAT', 'INS', 'N/A', 'Observaciones'];
  headers.forEach((h, i) => {
    const c = ws2.getRow(1).getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL;
    c.border = allBorders;
    c.alignment = { horizontal: 'center' };
  });

  const sorted = [...inMonth].sort((a, b) => (a.day || 0) - (b.day || 0) || String(a.forkliftId).localeCompare(String(b.forkliftId)));
  sorted.forEach((c, i) => {
    const counts = { SAT: 0, INS: 0, 'N/A': 0 };
    Object.values(c.items || {}).forEach(r => { if (counts[r] !== undefined) counts[r]++; });
    const r = ws2.getRow(i + 2);
    r.getCell(1).value = c.day;
    r.getCell(2).value = MONTHS_ES[c.month] || (c.month + 1);
    r.getCell(3).value = c.year;
    r.getCell(4).value = c.forkliftId;
    r.getCell(5).value = c.operatorName || '';
    r.getCell(6).value = c.inspectorName || '';
    r.getCell(7).value = counts.SAT;
    r.getCell(8).value = counts.INS;
    r.getCell(9).value = counts['N/A'];
    r.getCell(10).value = c.observations || '';
    if (counts.INS > 0) r.getCell(8).fill = INS_FILL;
    r.eachCell({ includeEmpty: false }, cell => { cell.border = allBorders; });
  });
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(sorted.length + 1, 2), column: 10 } };
  ws2.freezePanes = 'A2';

  // --- Guardar ---
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = `Reporte_Mensual_${MONTHS_ES[month] || String(month + 1)}_${year}.xlsx`;
  await saveOrShareFile(blob, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
