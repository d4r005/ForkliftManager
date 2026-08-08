import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { getPdfConfig, savePdfConfig } from '../utils/pdfConfig.js';
import { checklistItems } from '../data/checklistItems.js';
import * as pdfjsLib from 'pdfjs-dist';

// Configuración compatible con Vite para el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export default function PdfDesigner({ onClose }) {
  const [config, setConfig] = useState(null);
  const [templateImg, setTemplateImg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1.2);

  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [conf, { data: signed }] = await Promise.all([
          getPdfConfig(),
          supabase.storage.from('expedientes').createSignedUrl('templates/bitacora_v2.pdf', 3600)
        ]);

        if (!signed?.signedUrl) throw new Error('No se pudo obtener la URL del PDF');

        // Cargar y renderizar PDF a Imagen
        const loadingTask = pdfjsLib.getDocument(signed.signedUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 2 }); // Alta resolución para el diseño
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
    top: (792 - y) * zoom
  });

  const screenToPdf = (left, top) => ({
    x: Math.round((left / zoom) * 10) / 10,
    y: Math.round((792 - (top / zoom)) * 10) / 10
  });

  const handleMouseDown = (e, path) => {
    e.preventDefault();
    setDragging({
      path,
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: e.target.offsetLeft,
      initialTop: e.target.offsetTop
    });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;

    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;

    const newLeft = dragging.initialLeft + dx;
    const newTop = dragging.initialTop + dy;

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

  const handleMouseUp = () => setDragging(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePdfConfig(config);
      alert('Configuración guardada en la base de datos para todos los usuarios.');
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    }
    setSaving(false);
  };

  if (loading) return <div className="loading-screen">Generando vista previa del PDF...</div>;

  return (
    <div className="pdf-designer" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <div className="designer-toolbar">
        <h3>🎨 Diseñador de Bitácora (Nube)</h3>
        <div className="toolbar-actions">
          <label>Zoom: </label>
          <input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} />
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '⌛ Guardando...' : '💾 Guardar en DB'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      <div className="designer-canvas-wrap" ref={containerRef}>
        <div className="designer-canvas" style={{
            width: 612 * zoom,
            height: 792 * zoom,
            backgroundImage: `url(${templateImg})`,
            backgroundSize: '100% 100%',
            position: 'relative',
            border: '2px solid #333',
            backgroundRepeat: 'no-repeat'
        }}>

          <DraggableBox label="ID" path="header.forkliftId" config={config.header.forkliftId} zoom={zoom} onDown={handleMouseDown} />
          <DraggableBox label="Fecha" path="header.date" config={config.header.date} zoom={zoom} onDown={handleMouseDown} />
          <DraggableBox label="Operador" path="header.operatorName" config={config.header.operatorName} zoom={zoom} onDown={handleMouseDown} />

          <div
            className="draggable-box checklist-ref"
            style={{
                ...pdfToScreen(config.checklist.baseX, config.checklist.baseY),
                position: 'absolute',
                background: 'rgba(0, 255, 0, 0.4)',
                border: '2px solid green',
                width: 20 * zoom,
                height: 12 * zoom,
                cursor: 'move',
                zIndex: 10
            }}
            onMouseDown={(e) => handleMouseDown(e, 'checklist')}
          >
            Ref D1/I1
          </div>

          {[...Array(5)].map((_, day) =>
            checklistItems.slice(0, 5).map((item, idx) => (
              <div key={`${day}-${idx}`} style={{
                ...pdfToScreen(
                    config.checklist.baseX + (day * config.checklist.deltaX),
                    config.checklist.baseY - (idx * config.checklist.deltaY)
                ),
                position: 'absolute',
                width: 4, height: 4, background: 'red', borderRadius: '50%', opacity: 0.3
              }} />
            ))
          )}

          <DraggableBox label="Firma/Nombre" path="footer.inspectorName" config={config.footer.inspectorName} zoom={zoom} onDown={handleMouseDown} />
          <DraggableBox label="Observaciones" path="footer.observations" config={config.footer.observations} zoom={zoom} onDown={handleMouseDown} />

        </div>
      </div>

      <style>{`
        .pdf-designer { position: fixed; inset: 0; background: #eee; z-index: 9999; display: flex; flex-direction: column; overflow: hidden; }
        .designer-toolbar { background: #333; color: white; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; }
        .designer-canvas-wrap { flex: 1; overflow: auto; padding: 40px; display: flex; justify-content: center; }
        .draggable-box { padding: 2px 6px; background: rgba(26, 115, 232, 0.3); border: 1px solid #1a73e8; font-size: 10px; color: black; font-weight: bold; white-space: nowrap; user-select: none; }
        .checklist-ref { font-size: 8px; color: green; display: flex; align-items: center; justify-content: center; }
      `}</style>
    </div>
  );
}

function DraggableBox({ label, path, config, zoom, onDown }) {
  const top = (792 - config.y) * zoom;
  const left = config.x * zoom;
  return (
    <div className="draggable-box" style={{ position: 'absolute', top, left, cursor: 'move' }} onMouseDown={(e) => onDown(e, path)}>
      {label}
    </div>
  );
}
