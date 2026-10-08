import { useRef, useState, useEffect, useCallback } from 'react';
import { useLang } from '../i18n/LanguageContext.jsx';

// Pad de firma manuscrita: canvas con soporte táctil/ratón
// (pointer events). Guarda el resultado como PNG data URL o null.
export default function SignaturePad({ label, value, onChange, height = 120 }) {
  const { t } = useLang();
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const drewSomething = useRef(false);
  const [editingSign, setEditingSign] = useState(!value);

  const paintBaseLine = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Línea base para firmar
    ctx.strokeStyle = 'rgba(120, 130, 150, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, canvas.height - 24);
    ctx.lineTo(canvas.width - 10, canvas.height - 24);
    ctx.stroke();
    drewSomething.current = false;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const snapshot = drewSomething.current ? canvas.toDataURL('image/png') : null;
    canvas.width = Math.max(rect.width * dpr, 10);
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    paintBaseLine();
    // Redibuja trazos previos al redimensionar (poco frecuente)
    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, height);
      img.src = snapshot;
      drewSomething.current = true;
    }
  }, [height, paintBaseLine]);

  useEffect(() => {
    if (!editingSign) return;
    resizeCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSign]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e) => {
    if (!editingSign) return;
    drawing.current = true;
    const canvas = canvasRef.current;
    canvas.setPointerCapture?.(e.pointerId);
    const ctx = canvas.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  };

  const handlePointerMove = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    drewSomething.current = true;
  };

  const handlePointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (drewSomething.current) onChange?.(canvasRef.current.toDataURL('image/png'));
    else onChange?.(null);
  };

  const clear = () => {
    paintBaseLine();
    onChange?.(null);
    if (!editingSign) setEditingSign(true);
  };

  return (
    <div className="signature-pad">
      <div className="signature-pad-label">
        {label}
        {value && editingSign && <span className="signature-status">✔</span>}
      </div>
      {value && !editingSign ? (
        <div className="signature-preview" onClick={() => setEditingSign(false)} style={{ height }}>
          <img src={value} alt={label} style={{ maxHeight: height - 8, maxWidth: '100%' }} />
          <button className="btn btn-sm btn-secondary signature-rebtn" onClick={clear}>
            ✏️ {t('signatureRedo')}
          </button>
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className="signature-canvas"
            style={{ width: '100%', height, touchAction: 'none', border: '1px dashed rgba(120,130,150,0.4)', borderRadius: '8px', cursor: 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <div className="signature-pad-actions">
            <button className="btn btn-sm btn-secondary" type="button" onClick={clear}>
              ✕ {t('signatureClear')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
