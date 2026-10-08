import QRCode from 'qrcode';

// Genera la URL destino del QR: abre la app directamente en el
// formulario de nueva revisión con el montacargas preseleccionado.
export function forkliftQRUrl(idCode) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/checklist/${encodeURIComponent(idCode)}`;
}

export async function generateForkliftQR(idCode, size = 256) {
  return QRCode.toDataURL(forkliftQRUrl(idCode), {
    width: size,
    margin: 2,
    color: { dark: '#1E3A8A', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
}

export function downloadDataURL(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Hoja imprimible (web). En webviews sin window.open cae a descarga.
export function printHTML(html) {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
  return true;
}
