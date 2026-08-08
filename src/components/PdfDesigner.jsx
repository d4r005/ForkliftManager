import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { getPdfConfig, savePdfConfig } from '../utils/pdfConfig.js';
import { checklistItems } from '../data/checklistItems.js';
import { exportChecklistToPdf } from '../utils/exportPdf.js';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

export default function PdfDesigner({ onClose }) {
  const [config, setConfig] = useState(null);
  const [templateImg, setTemplateImg] = useState(null);
  const [pdfSize, setPdfSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(0.9);
  const [dragging, setDragging] = useState(null);

  // Datos para el PDF de prueba
  const testData = {
    forkliftId: 'MC-TEST', operatorName: 'OPERADOR PRUEBA', inspectorName: 'INSPECTOR PRUEBA',
    day: 1, month: 0, year: 2025, observations: 'PRUEBA DE ALINEACIÓN.',
    items: { 1: 'SAT', 2: 'SAT', 3: 'INS', 4: 'SAT', 5: 'N/A' }
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
        setPdfSize({ width: viewport.width/2, height: viewport.height/2 });

        const canvas = document.createElement('canvas');
        canvas.height = viewport.height; canvas.width = viewport.width;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        setTemplateImg(canvas.toDataURL());
        setConfig(conf);
        setLoading(false);
      } catch (err) { alert(err.message); }
    })();
  }, []);

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const canvas = document.querySelector('.designer-canvas');
    const rect = canvas.getBoundingClientRect();

    // Coordenadas en puntos PDF (0,0 es abajo-izquierda)
    const x = Math.round(((e.clientX - rect.left) / zoom) * 10) / 10;
    const y = Math.round((pdfSize.height - ((e.clientY - rect.top) / zoom)) * 10) / 10;

    const newConf = { ...config };
    if (dragging.path === 'checklist') {
        newConf.checklist.baseX = x; newConf.checklist.baseY = y;
    } else {
        const [p1, p2] = dragging.path.split('.');
        newConf[p1][p2].x = x; newConf[p1][p2].y = y;
    }
    setConfig(newConf);
  };

  if (loading) return <div className="loading-screen">Abriendo mesa de dibujo...</div>;

  return (
    <div className="pdf-designer" onMouseMove={handleMouseMove} onMouseUp={() => setDragging(null)}>
      <div className="designer-toolbar">
        <div className="toolbar-group">
          <strong>📐 Hoja: {pdfSize.width}x{pdfSize.height}</strong>
          <button className="btn btn-primary" onClick={() => savePdfConfig(config).then(() => alert('Guardado!'))}>💾 Guardar en DB</button>
          <button className="btn btn-secondary" onClick={() => exportChecklistToPdf(testData, 'es', config)}>📄 Probar PDF Actual</button>
        </div>
        <div className="toolbar-controls">
          <div className="control-item"><label>Zoom</label><input type="range" min="0.4" max="1.5" step="0.1" value={zoom} onChange={e=>setZoom(parseFloat(e.target.value))} /></div>
          <div className="control-item"><label>Espaciado Día</label><input type="number" step="0.05" value={config.checklist.deltaX} onChange={e=>setConfig({...config, checklist:{...config.checklist, deltaX: parseFloat(e.target.value)}})} /></div>
          <div className="control-item"><label>Espaciado Item</label><input type="number" step="0.05" value={config.checklist.deltaY} onChange={e=>setConfig({...config, checklist:{...config.checklist, deltaY: parseFloat(e.target.value)}})} /></div>
          <button className="btn btn-sm btn-danger" onClick={onClose}>Cerrar</button>
        </div>
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

          {/* Caja Maestra Checklist */}
          <div className="drag-box checklist-ref" style={{
              left: config.checklist.baseX * zoom, top: (pdfSize.height - config.checklist.baseY) * zoom,
              width: config.checklist.deltaX * zoom, height: config.checklist.deltaY * zoom
          }} onMouseDown={()=>setDragging({path:'checklist'})}>SAT</div>

          {/* Puntos de guía */}
          {[...Array(31)].map((_, d) => checklistItems.map((_, i) => (
            <div key={`${d}-${i}`} className="guide-dot" style={{
                left: (config.checklist.baseX + (d * config.checklist.deltaX)) * zoom + 2,
                top: (pdfSize.height - (config.checklist.baseY - (i * config.checklist.deltaY))) * zoom + 2
            }}><span className="dot-label">{i+1}</span></div>
          )))}
        </div>
      </div>

      <style>{`
        .pdf-designer { position: fixed; inset: 0; background: #111; z-index: 9999; display: flex; flex-direction: column; color: #fff; }
        .designer-toolbar { background: #222; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; }
        .toolbar-group, .toolbar-controls { display: flex; gap: 20px; align-items: center; }
        .control-item { display: flex; flex-direction: column; font-size: 10px; color: #aaa; }
        .control-item input { background: #333; border: 1px solid #444; color: #fff; padding: 2px; width: 70px; border-radius: 3px; }
        .designer-canvas-wrap { flex: 1; overflow: auto; padding: 40px; display: flex; justify-content: center; }
        .designer-canvas { background: white; box-shadow: 0 0 30px #000; }
        .drag-box { position: absolute; padding: 2px 6px; background: rgba(0, 123, 255, 0.4); border: 1px solid #007bff; color: #000; font-weight: bold; font-size: 10px; cursor: move; white-space: nowrap; user-select: none; }
        .checklist-ref { background: rgba(40, 167, 69, 0.5); border-color: #28a745; z-index: 100; font-size: 8px; display: flex; align-items: center; justify-content: center; }
        .guide-dot { position: absolute; width: 4px; height: 4px; background: red; border-radius: 50%; opacity: 0.3; pointer-events: none; }
        .dot-label { position: absolute; top: -8px; left: 4px; font-size: 6px; color: red; }
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
