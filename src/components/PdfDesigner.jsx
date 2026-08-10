import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { getPdfConfig, savePdfConfig, DEFAULT_CONFIG } from '../utils/pdfConfig.js';
import { checklistItems } from '../data/checklistItems.js';
import { exportChecklistToPdf } from '../utils/exportPdf.js';
import * as pdfjsLib from 'pdfjs-dist';

// Worker empaquetado localmente por Vite (misma versión que la librería,
// siempre en sync — evita el error "API version does not match Worker version"
// que salía al usar una URL de CDN con un número de versión fijo).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export default function PdfDesigner({ onClose }) {
  const [config, setConfig] = useState(null);
  const [templateImg, setTemplateImg] = useState(null);
  const [pdfSize, setPdfSize] = useState({ width: 792, height: 612 }); // US Letter landscape
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [dragging, setDragging] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  const testData = {
    forkliftId: 'MC-TEST', operatorName: 'OPERADOR PRUEBA', inspectorName: 'INSPECTOR PRUEBA',
    day: 1, month: 0, year: 2025, observations: 'ESTA ES UNA PRUEBA.',
    items: { 1: 'SAT', 2: 'SAT', 3: 'SAT', 7: 'SAT', 22: 'SAT', 26: 'SAT' }
  };

  // Helper: asegura que config.checklist.itemY sea un arreglo de 26 valores
  const ensureItemY = (conf) => {
    const ck = conf.checklist;
    if (!Array.isArray(ck.itemY) || ck.itemY.length < 26) {
      const itemY = [];
      for (let i = 0; i < 26; i++) {
        itemY.push(ck.itemY && ck.itemY[i] !== undefined
          ? ck.itemY[i]
          : (ck.baseY || 434.8) - i * (ck.deltaY || 12.82));
      }
      return { ...conf, checklist: { ...ck, itemY } };
    }
    return conf;
  };

  useEffect(() => {
    (async () => {
      try {
        const [conf, { data: signed }] = await Promise.all([
          getPdfConfig(),
          supabase.storage.from('expedientes').createSignedUrl('templates/bitacora_v2.pdf', 3600)
        ]);
        const pdf = await pdfjsLib.getDocument(signed.signedUrl).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const realSize = { width: viewport.width/2, height: viewport.height/2 };
        setPdfSize(realSize);

        const canvas = document.createElement('canvas');
        canvas.height = viewport.height; canvas.width = viewport.width;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        setTemplateImg(canvas.toDataURL());

        // Migrar config vieja: si no trae itemY, generar el arreglo
        const migrated = ensureItemY(conf);
        setConfig(migrated);
        setLoading(false);
      } catch (err) { alert(err.message); }
    })();
  }, []);

  const getItemY = (index) => {
    const ck = config.checklist;
    if (Array.isArray(ck.itemY) && ck.itemY[index] !== undefined) return ck.itemY[index];
    return (ck.baseY || 434.8) - index * (ck.deltaY || 12.82);
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const canvas = document.querySelector('.designer-canvas');
    const rect = canvas.getBoundingClientRect();

    // X e Y en puntos reales de PDF
    const x = Math.round(((e.clientX - rect.left) / zoom) * 10) / 10;
    const y = Math.round((pdfSize.height - ((e.clientY - rect.top) / zoom)) * 10) / 10;

    const newConf = { ...config, checklist: { ...config.checklist } };

    if (dragging.path === 'checklist') {
        // Mover el primer renglón (baseX/baseY) — arrastra toda la grilla
        const deltaY = y - newConf.checklist.itemY[0];
        const deltaX = x - newConf.checklist.baseX;
        newConf.checklist.baseX = x;
        newConf.checklist.itemY = newConf.checklist.itemY.map((yVal, i) =>
          Math.round((yVal + deltaY) * 10) / 10
        );
    } else if (dragging.path.startsWith('row.')) {
        // Mover un renglón individual
        const rowIdx = parseInt(dragging.path.split('.')[1], 10);
        newConf.checklist.itemY = [...newConf.checklist.itemY];
        newConf.checklist.itemY[rowIdx] = y;
    } else {
        const [p1, p2] = dragging.path.split('.');
        newConf[p1] = { ...newConf[p1] };
        newConf[p1][p2] = { ...newConf[p1][p2], x, y };
    }
    setConfig(newConf);
  };

  if (loading) return <div className="loading-screen">Detectando formato...</div>;

  return (
    <div className="pdf-designer" onMouseMove={handleMouseMove} onMouseUp={() => { setDragging(null); setSelectedRow(null); }}>
      <div className="designer-toolbar">
        <div className="toolbar-group">
          <strong>📐 {pdfSize.width > pdfSize.height ? 'Horizontal' : 'Vertical'} ({pdfSize.width}x{pdfSize.height})</strong>
          <button className="btn btn-primary" onClick={() => savePdfConfig(config).then(() => alert('Guardado!'))}>💾 Guardar Todo</button>
          <button className="btn btn-secondary" onClick={() => exportChecklistToPdf(testData)}>📄 Probar PDF Actual</button>
          <button className="btn btn-sm" onClick={() => { setConfig(ensureItemY(DEFAULT_CONFIG)); }}>↩️ Reset Default</button>
        </div>
        <div className="toolbar-controls">
          <div className="control-item"><label>Zoom</label><input type="range" min="0.5" max="1.5" step="0.1" value={zoom} onChange={e=>setZoom(parseFloat(e.target.value))} /></div>
          <div className="control-item"><label>Espaciado Día (ΔX)</label><input type="number" step="0.01" value={config.checklist.deltaX} onChange={e=>setConfig({...config, checklist:{...config.checklist, deltaX: parseFloat(e.target.value)}})} /></div>
          <div className="control-item"><label>Font Size</label><input type="number" step="0.5" value={config.checklist.fontSize} onChange={e=>setConfig({...config, checklist:{...config.checklist, fontSize: parseFloat(e.target.value)}})} /></div>
          <button className="btn btn-sm" onClick={onClose}>X</button>
        </div>
      </div>

      <div className="designer-toolbar" style={{background:'#1a1a1a', padding:'6px 10px', fontSize:'10px', color:'#888'}}>
        <span>💡 Arrastra el recuadro verde para mover toda la grilla. Arrastra cualquier renglón rojo para ajustar su Y individualmente.</span>
      </div>

      <div className="designer-canvas-wrap">
        <div className="designer-canvas" style={{
            width: pdfSize.width * zoom, height: pdfSize.height * zoom,
            backgroundImage: `url(${templateImg})`, backgroundSize: '100% 100%', position: 'relative'
        }}>

          <DragBox label="🆔 ID" path="header.forkliftId" val={config.header.forkliftId} zoom={zoom} h={pdfSize.height} onDown={setDragging} />
          <DragBox label="📅 FECHA" path="header.date" val={config.header.date} zoom={zoom} h={pdfSize.height} onDown={setDragging} />
          <DragBox label="👤 OPERADOR" path="header.operatorName" val={config.header.operatorName} zoom={zoom} h={pdfSize.height} onDown={setDragging} />
          <DragBox label="✍️ FIRMA" path="footer.inspectorName" val={config.footer.inspectorName} zoom={zoom} h={pdfSize.height} onDown={setDragging} />

          {/* Caja verde: baseX + renglón 0 — arrastra toda la grilla */}
          <div className="drag-box checklist-ref" style={{
              left: config.checklist.baseX * zoom, top: (pdfSize.height - getItemY(0)) * zoom,
              width: config.checklist.deltaX * zoom, height: 14 * zoom
          }} onMouseDown={(e)=>{e.preventDefault(); setDragging({path:'checklist'});}}>STA</div>

          {/* Un handle rojo por cada uno de los 26 renglones — arrastra Y individual */}
          {checklistItems.map((item, i) => {
            const yVal = getItemY(i);
            return (
              <div key={`row-${i}`} className="row-handle" style={{
                  left: (config.checklist.baseX - 12) * zoom,
                  top: (pdfSize.height - yVal) * zoom,
              }} onMouseDown={(e)=>{e.preventDefault(); setDragging({path:`row.${i}`}); setSelectedRow(i);}}
              title={`Renglón ${i+1} (Y=${yVal})`}
              >{i+1}</div>
            );
          })}

          {/* Puntos guia: intersección día x renglón usando itemY exacto */}
          {[...Array(31)].map((_, d) => checklistItems.map((_, i) => (
            <div key={`${d}-${i}`} className="guide-dot" style={{
                left: (config.checklist.baseX + (d * config.checklist.deltaX)) * zoom + 3,
                top: (pdfSize.height - getItemY(i)) * zoom + 3
            }} />
          )))}
        </div>
      </div>

      <style>{`
        .pdf-designer { position: fixed; inset: 0; background: #111; z-index: 9999; display: flex; flex-direction: column; color: #fff; }
        .designer-toolbar { background: #222; padding: 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; }
        .toolbar-group, .toolbar-controls { display: flex; gap: 15px; align-items: center; }
        .control-item { display: flex; flex-direction: column; font-size: 9px; color: #888; }
        .control-item input { background: #333; border: 1px solid #444; color: #fff; padding: 2px; width: 65px; }
        .designer-canvas-wrap { flex: 1; overflow: auto; padding: 40px; display: flex; justify-content: center; }
        .designer-canvas { background: white; box-shadow: 0 0 40px #000; }
        .drag-box { position: absolute; padding: 1px 4px; background: rgba(0, 123, 255, 0.3); border: 1px solid #007bff; color: #000; font-weight: bold; font-size: 10px; cursor: move; white-space: nowrap; user-select: none; }
        .checklist-ref { background: rgba(40, 167, 69, 0.4); border-color: #28a745; z-index: 100; display: flex; align-items: center; justify-content: center; }
        .row-handle { position: absolute; width: 18px; height: 14px; background: rgba(220, 53, 69, 0.5); border: 1px solid #dc3545; color: #fff; font-size: 7px; font-weight: bold; display: flex; align-items: center; justify-content: center; cursor: ns-resize; user-select: none; z-index: 50; }
        .row-handle:hover { background: rgba(220, 53, 69, 0.9); }
        .guide-dot { position: absolute; width: 3px; height: 3px; background: red; border-radius: 50%; opacity: 0.3; pointer-events: none; }
      `}</style>
    </div>
  );
}

function DragBox({ label, path, val, zoom, h, onDown }) {
  return (
    <div className="drag-box" style={{ left: val.x * zoom, top: (h - val.y) * zoom }} onMouseDown={(e) => { e.preventDefault(); onDown({path}); }}>
      {label}
    </div>
  );
}
