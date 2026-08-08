import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { getPdfConfig, savePdfConfig } from '../utils/pdfConfig.js';
import { checklistItems } from '../data/checklistItems.js';
import { exportChecklistToPdf } from '../utils/exportPdf.js';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export default function PdfDesigner({ onClose }) {
  const [config, setConfig] = useState(null);
  const [templateImg, setTemplateImg] = useState(null);
  const [pdfSize, setPdfSize] = useState({ width: 612, height: 792 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1.1);
  const [dragging, setDragging] = useState(null);

  // Datos ficticios para la vista previa
  const previewData = {
    forkliftId: 'MC-TEST',
    operatorName: 'OPERADOR DE PRUEBA',
    inspectorName: 'INSPECTOR PRUEBA',
    day: 1, month: 0, year: 2025,
    items: { 1: 'SAT', 2: 'SAT', 3: 'SAT' },
    observations: 'ESTA ES UNA OBSERVACIÓN DE PRUEBA PARA VER EL AJUSTE.'
  };

  useEffect(() => {
    (async () => {
      try {
        const [conf, { data: signed }] = await Promise.all([
          getPdfConfig(),
          supabase.storage.from('expedientes').createSignedUrl('templates/bitacora_v2.pdf', 3600)
        ]);
        if (!signed?.signedUrl) throw new Error('Error al obtener plantilla');

        const pdf = await pdfjsLib.getDocument(signed.signedUrl).promise;
        const page = await pdf.getPage(1);
        const viewportOrig = page.getViewport({ scale: 1 });
        setPdfSize({ width: viewportOrig.width, height: viewportOrig.height });

        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height; canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        setTemplateImg(canvas.toDataURL());

        setConfig(conf);
        setLoading(false);
      } catch (err) {
        alert('Error: ' + err.message);
        setLoading(false);
      }
    })();
  }, []);

  const toPdfCoord = (screenVal) => Math.round((screenVal / zoom) * 10) / 10;
  const toScreenCoord = (pdfVal) => pdfVal * zoom;

  const handleMouseDown = (e, path) => {
    e.preventDefault();
    const rect = e.target.getBoundingClientRect();
    setDragging({
      path,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const canvasRect = document.querySelector('.designer-canvas').getBoundingClientRect();
    const left = e.clientX - canvasRect.left - dragging.offsetX;
    const top = e.clientY - canvasRect.top - dragging.offsetY;

    const x = toPdfCoord(left);
    const y = toPdfCoord(pdfSize.height * zoom - top);

    const newConfig = { ...config };
    const parts = dragging.path.split('.');
    if (parts.length === 2) {
      newConfig[parts[0]][parts[1]] = { ...newConfig[parts[0]][parts[1]], x, y };
    } else if (parts[0] === 'checklist') {
      newConfig.checklist.baseX = x;
      newConfig.checklist.baseY = y;
    }
    setConfig(newConfig);
  };

  const updateMetric = (key, val) => {
    setConfig(prev => ({ ...prev, checklist: { ...prev.checklist, [key]: parseFloat(val) } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePdfConfig(config);
      alert('¡Coordenadas guardadas en Supabase!');
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  if (loading) return <div className="loading-screen">Cargando bitácora real...</div>;

  return (
    <div className="pdf-designer" onMouseMove={handleMouseMove} onMouseUp={() => setDragging(null)}>
      <div className="designer-toolbar">
        <div className="toolbar-group">
          <strong>📏 PDF: {pdfSize.width}x{pdfSize.height}</strong>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '...' : '💾 Guardar'}</button>
          <button className="btn btn-secondary" onClick={() => exportChecklistToPdf(previewData)}>📄 Probar PDF</button>
        </div>
        <div className="toolbar-controls">
          <div className="control-item"><label>Zoom</label><input type="range" min="0.5" max="2" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} /></div>
          <div className="control-item"><label>Ancho Día</label><input type="number" step="0.1" value={config.checklist.deltaX} onChange={e => updateMetric('deltaX', e.target.value)} /></div>
          <div className="control-item"><label>Alto Item</label><input type="number" step="0.1" value={config.checklist.deltaY} onChange={e => updateMetric('deltaY', e.target.value)} /></div>
          <button className="btn btn-sm" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      <div className="designer-canvas-wrap">
        <div className="designer-canvas" style={{ width: pdfSize.width * zoom, height: pdfSize.height * zoom, backgroundImage: `url(${templateImg})`, backgroundSize: '100% 100%', position: 'relative' }}>

          <VisualBox label={previewData.forkliftId} path="header.forkliftId" config={config.header.forkliftId} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />
          <VisualBox label="01/01/2025" path="header.date" config={config.header.date} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />
          <VisualBox label={previewData.operatorName} path="header.operatorName" config={config.header.operatorName} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />

          {/* Referencia Checklist */}
          <div className="checklist-ref-box" style={{
            left: toScreenCoord(config.checklist.baseX),
            top: toScreenCoord(pdfSize.height - config.checklist.baseY),
            width: toScreenCoord(config.checklist.deltaX), height: toScreenCoord(config.checklist.deltaY)
          }} onMouseDown={(e) => handleMouseDown(e, 'checklist')}>
            SAT
          </div>

          {/* Guías de Red Dots */}
          {[...Array(31)].map((_, d) => checklistItems.map((_, i) => (
            <div key={`${d}-${i}`} className="guide-dot" style={{
              left: toScreenCoord(config.checklist.baseX + (d * config.checklist.deltaX) + (config.checklist.deltaX/2)),
              top: toScreenCoord(pdfSize.height - (config.checklist.baseY - (i * config.checklist.deltaY)) + (config.checklist.deltaY/2))
            }} />
          )))}

          <VisualBox label="INSPECTOR FIRMA" path="footer.inspectorName" config={config.footer.inspectorName} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />
        </div>
      </div>

      <style>{`
        .pdf-designer { position: fixed; inset: 0; background: #1a1a1a; z-index: 9999; display: flex; flex-direction: column; color: white; font-family: sans-serif; }
        .designer-toolbar { background: #2d2d2d; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; }
        .toolbar-group, .toolbar-controls { display: flex; gap: 15px; align-items: center; }
        .control-item { display: flex; flex-direction: column; gap: 2px; font-size: 10px; text-transform: uppercase; opacity: 0.8; }
        .control-item input { background: #444; border: 1px solid #555; color: white; padding: 3px; width: 60px; border-radius: 4px; }
        .designer-canvas-wrap { flex: 1; overflow: auto; padding: 60px; background: #111; display: flex; justify-content: center; }
        .designer-canvas { background-color: white; box-shadow: 0 0 50px rgba(0,0,0,0.5); cursor: crosshair; }
        .visual-box { position: absolute; padding: 2px 5px; background: rgba(26, 115, 232, 0.2); border: 1px dashed #1a73e8; color: #000; font-weight: bold; cursor: move; white-space: nowrap; user-select: none; }
        .visual-box:hover { background: rgba(26, 115, 232, 0.4); }
        .checklist-ref-box { position: absolute; background: rgba(40, 167, 69, 0.3); border: 2px solid #28a745; color: #155724; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 8px; cursor: move; z-index: 20; }
        .guide-dot { position: absolute; width: 3px; height: 3px; background: #ff4757; border-radius: 50%; opacity: 0.4; pointer-events: none; }
      `}</style>
    </div>
  );
}

function VisualBox({ label, config, zoom, pdfH, onDown, path }) {
  return (
    <div className="visual-box" style={{
      left: config.x * zoom,
      top: (pdfH - config.y) * zoom,
      fontSize: (config.size * zoom) + 'px'
    }} onMouseDown={(e) => onDown(e, path)}>
      {label}
    </div>
  );
}
