import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// ============================================================================
// Guarda/comparte un archivo binario (PDF, Excel, etc.) de forma correcta
// según la plataforma.
//
// En navegador (web) el patrón clásico de <a download> + blob URL funciona
// perfecto. Pero dentro del WebView de Android (Capacitor) ese patrón NO
// hace nada — el WebView no tiene "gestor de descargas" que intercepte el
// click, así que el botón de exportar PDF/Excel se sentía roto en la app
// nativa. La solución correcta en Android es escribir el archivo a disco con
// el plugin Filesystem y abrir la hoja de "Compartir/Guardar" nativa con el
// plugin Share, para que el usuario pueda guardarlo en Drive, enviarlo por
// WhatsApp, abrirlo con Excel/PDF viewer, etc.
// ============================================================================

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // reader.result = "data:<mime>;base64,AAAA..." — nos quedamos solo con
      // la parte base64 pura, que es lo que Filesystem.writeFile espera.
      const base64 = String(reader.result).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {Blob} blob - contenido del archivo
 * @param {string} fileName - nombre con extensión, ej. "Bitacora_MC01_2026-08.pdf"
 * @param {string} mimeType - ej. "application/pdf"
 */
export async function saveOrShareFile(blob, fileName, mimeType) {
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(blob);

      // Directory.Cache es accesible por el FileProvider de Capacitor sin
      // pedir permisos de almacenamiento adicionales (a diferencia de
      // Directory.Documents/External, que en Android 10+ requieren
      // scoped storage y dan más problemas).
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      });

      const { uri } = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      });

      await Share.share({
        title: fileName,
        url: uri,
        dialogTitle: 'Guardar o compartir archivo',
      });
    } catch (err) {
      // El usuario cancelar el diálogo de compartir también cae aquí
      // (AbortError-like) — no lo tratamos como error real salvo que
      // realmente falle la escritura del archivo.
      console.error('Error al guardar/compartir archivo en Android:', err);
      throw err;
    }
    return;
  }

  // --- Web: método clásico de descarga por blob URL ---
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
