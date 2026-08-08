import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { getPdfConfig, savePdfConfig } from '../utils/pdfConfig.js';
import { checklistItems } from '../data/checklistItems.js';
import * as pdfjsLib from 'pdfjs-dist';

// Usar la CDN de Cloudflare para el worker, evitando problemas de resolución en build
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

export default function PdfDesigner({ onClose }) {
  const [config, setConfig] = useState(null);
  const [templateImg, setTemplateImg] = useState(null);
  const [pdfSize, setPdfSize] = useState({ width: 612, height: 792 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [conf, { data: signed }] = await Promise.all([
          getPdfConfig(),
          supabase.storage.from('expedientes').createSignedUrl('templates/bitacora_v2.pdf', 3600)
        ]);

        if (!signed?.signedUrl) throw new Error('No se pudo obtener la URL del PDF');

        // Cargar PDF vía pdf.js
        const loadingTask = pdfjsLib.getDocument({
            url: signed.signedUrl,
            // Deshabilitar workers si hay problemas de CORS, aunque CDN suele ir bien
            disableWorker: false
        });

        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewportOrig = page.getViewport({ scale: 1 });
        setPdfSize({ width: viewportOrig.width, height: viewportOrig.height });

        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;
        setTemplateImg(canvas.toDataURL());

        setConfig(conf);
        setLoading(false);
      } catch (err) {
        console.error('Error loading designer:', err);
        alert('Error al cargar la plantilla: ' + err.message);
        setLoading(false);
      }
    })();
  }, []);

  const pdfToScreen = (x, y) => ({
    left: x * zoom,
    top: (pdfSize.height - y) * zoom
  });

  const screenToPdf = (left, top) => ({
    x: Math.round((left / zoom) * 10) / 10,
    y: Math.round((pdfSize.height - (top / zoom)) * 10) / 10
  });

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const newLeft = (e.clientX - rect.left - dragging.offsetX);
    const newTop = (e.clientY - rect.top - dragging.offsetY);

    const { x, y } = screenToPdf(newLeft, newTop);

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

  const handleMouseDown = (e, path) => {
    e.preventDefault();
    const rect = e.target.getBoundingClientRect();
    setDragging({
      path,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    });
  };

  const updateChecklistMetric = (key, val) => {
    setConfig(prev => ({
      ...prev,
      checklist: { ...prev.checklist, [key]: parseFloat(val) }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePdfConfig(config);
      alert('Configuración guardada en Supabase.');
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  if (loading) return <div className="loading-screen">Cargando bitácora...</div>;

  return (
    <div className="pdf-designer" onMouseMove={handleMouseMove} onMouseUp={() => setDragging(null)}>
      <div className="designer-toolbar">
        <div className="toolbar-group">
          <h3>🎨 Diseñador ({pdfSize.width}x{pdfSize.height})</h3>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⌛...' : '💾 Guardar en DB'}
          </button>
        </div>

        <div className="toolbar-controls">
          <div className="control-item">
            <label>Zoom</label>
            <input type="range" min="0.5" max="2" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
          </div>
          <div className="control-item">
            <label>Ancho Col</label>
            <input type="number" step="0.05" value={config.checklist.deltaX} onChange={e => updateChecklistMetric('deltaX', e.target.value)} />
          </div>
          <div className="control-item">
            <label>Alto Fila</label>
            <input type="number" step="0.05" value={config.checklist.deltaY} onChange={e => updateChecklistMetric('deltaY', e.target.value)} />
          </div>
          <button className="btn btn-secondary" onClick={onClose}>X</button>
        </div>
      </div>

      <div className="designer-canvas-wrap">
        <div className="designer-canvas" style={{
            width: pdfSize.width * zoom,
            height: pdfSize.height * zoom,
            backgroundImage: `url(${templateImg})`,
            backgroundSize: '100% 100%',
            position: 'relative'
        }}>

          <DraggableBox label="ID" path="header.forkliftId" config={config.header.forkliftId} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />
          <DraggableBox label="Fecha" path="header.date" config={config.header.date} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />
          <DraggableBox label="Operador" path="header.operatorName" config={config.header.operatorName} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />

          <div className="draggable-box checklist-ref" style={{
                ...pdfToScreen(config.checklist.baseX, config.checklist.baseY),
                position: 'absolute', width: config.checklist.deltaX * zoom, height: config.checklist.deltaY * zoom,
                background: 'rgba(0, 255, 0, 0.4)', border: '1px solid green', zIndex: 10
            }} onMouseDown={(e) => handleMouseDown(e, 'checklist')}>
            Ref D1/I1
          </div>

          {[...Array(31)].map((_, d) =>
            checklistItems.slice(0, 26).map((item, i) => (
              <div key={`${d}-${i}`} style={{
                ...pdfToScreen(config.checklist.baseX + (d * config.checklist.deltaX), config.checklist.baseY - (i * config.checklist.deltaY)),
                position: 'absolute', width: 2, height: 2, background: 'red', borderRadius: '50%', opacity: 0.2
              }} />
            ))
          )}

          <DraggableBox label="Firma" path="footer.inspectorName" config={config.footer.inspectorName} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />
          <DraggableBox label="Obs" path="footer.observations" config={config.footer.observations} zoom={zoom} pdfH={pdfSize.height} onDown={handleMouseDown} />
        </div>
      </div>

      <style>{`
        .pdf-designer { position: fixed; inset: 0; background: #222; z-index: 9999; display: flex; flex-direction: column; color: white; }
        .designer-toolbar { background: #333; padding: 10px; display: flex; justify-content: space-between; border-bottom: 2px solid #444; }
        .toolbar-group { display: flex; gap: 15px; align-items: center; }
        .toolbar-controls { display: flex; gap: 20px; align-items: center; }
        .control-item { display: flex; flex-direction: column; font-size: 11px; }
        .control-item input { background: #444; border: 1px solid #555; color: white; padding: 2px; width: 60px; }
        .designer-canvas-wrap { flex: 1; overflow: auto; padding: 50px; background: #111; }
        .draggable-box { padding: 2px 4px; background: rgba(26, 115, 232, 0.6); border: 1px solid #1a73e8; font-size: 10px; color: white; cursor: move; user-select: none; }
      `}</style>
    </div>
  );
}

function DraggableBox({ label, config, zoom, pdfH, onDown, path }) {
  return (
    <div className="draggable-box" style={{
      position: 'absolute',
      left: config.x * zoom,
      top: (pdfH - config.y) * zoom
    }} onMouseDown={(e) => onDown(e, path)}>
      {label}
    </div>
  );
}
