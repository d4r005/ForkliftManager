import * as XLSX from 'xlsx';
import { checklistItems, ratingOptions, languages } from '../data/checklistItems.js';
import { translations } from '../i18n/translations.js';

export function exportChecklistToExcel(checklist, lang = 'es') {
  const t = translations[lang] || translations.es;
  const months = t.months;

  // Build header rows
  const headerRow1 = [
    '', '', '', 'SHELSER S. DE R.L. DE C.V.',
    '', '', '', '', '', '', '', '',
    '', '', t.safetyHealth
  ];
  const headerRow2 = [
    `${t.appSubtitle}\n${t.normRef}`,
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
  ];
  const headerRow3 = [
    `${t.forkliftId}: ${checklist.forkliftId}`,
    '', '', '', '', '', '', '', '', '', '', '', '', '',
    `${t.operatorName}: ${checklist.operatorName}`,
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
  ];
  const headerRow4 = [
    t.instructions,
    '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
  ];

  // Day header row (1-31)
  const dayHeader = [t.conceptHeader];
  for (let i = 1; i <= 31; i++) {
    dayHeader.push(i);
  }

  // Item rows
  const itemRows = checklistItems.map(item => {
    const row = [`${item.id}.- ${item[lang] || item.es}`];
    for (let i = 1; i <= 31; i++) {
      if (i === checklist.day) {
        const rating = checklist.items?.[item.id];
        row.push(rating || '');
      } else {
        row.push('');
      }
    }
    return row;
  });

  // Footer rows
  const inspectorRow = [`${t.inspectorName}: ${checklist.inspectorName || ''}`];
  const obsRow = [`${t.observations}: ${checklist.observations || ''}`];

  // Assemble
  const wsData = [
    headerRow1,
    headerRow2,
    headerRow3,
    headerRow4,
    dayHeader,
    ...itemRows,
    [],
    inspectorRow,
    [],
    obsRow,
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [{ wch: 50 }];
  for (let i = 0; i < 31; i++) {
    ws['!cols'].push({ wch: 5 });
  }

  // Merge title cells
  ws['!merges'] = [
    { s: { r: 0, c: 3 }, e: { r: 0, c: 10 } },
    { s: { r: 0, c: 14 }, e: { r: 0, c: 20 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 14 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 14 } },
    { s: { r: 2, c: 15 }, e: { r: 2, c: 30 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 46 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Checklist');

  const dateStr = `${checklist.year}-${String(checklist.month + 1).padStart(2, '0')}-${String(checklist.day).padStart(2, '0')}`;
  const fileName = `Checklist_Montacargas_${checklist.forkliftId}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
