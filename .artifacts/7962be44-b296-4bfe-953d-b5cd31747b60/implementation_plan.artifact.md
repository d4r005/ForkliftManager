# Plan de Implementación: Mejora de Reconocimiento en PDF Maestro

Este plan aborda la falta de coincidencias al importar el PDF Maestro de DC3, optimizando el motor de extracción de texto para manejar el formato específico de estos documentos (CURP con espacios y nombres sin etiquetas claras).

## User Review Required

> [!IMPORTANT]
> **Formato de CURP**: Los documentos DC3 suelen tener el CURP con espacios entre cada letra (ej. `N U X N ...`). Se ha detectado que el sistema actual no reconoce este formato.
> **Detección por Nombre**: Se implementará una búsqueda directa de los nombres de tus empleados dentro de todo el texto del PDF, lo que aumentará drásticamente la tasa de éxito incluso si el formato del documento varía.

## Proposed Changes

### 1. Motor de Extracción (Utilidades)

#### [MODIFY] [pdfExtract.js](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/utils/pdfExtract.js)
- Actualizar `parseDocumentData` para:
    - Reconocer CURP con espacios opcionales entre caracteres.
    - Limpiar automáticamente los espacios al detectar un CURP para normalizarlo.
    - Capturar bloques de texto en mayúsculas que podrían ser nombres si fallan las etiquetas estándar.

### 2. Lógica de Asociación (Componente)

#### [MODIFY] [MasterPdfImport.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/MasterPdfImport.jsx)
- Mejorar `findBestMatch`:
    - Antes de usar lógica difusa (fuzzy), buscar si el nombre exacto de algún empleado aparece en cualquier parte del texto extraído de la página.
    - Dar prioridad máxima a la coincidencia por CURP (ya normalizado).
- Actualizar la visualización de "Datos detectados" para mostrar el CURP encontrado incluso si tiene espacios.

## Verification Plan

### Manual Verification
1. **Prueba de CURP**: Subir el archivo `DC3_Masivo_21_trabajadores (1).pdf` y verificar que el CURP `NUXN961126HNEGXG04` sea detectado correctamente a pesar de los espacios en el papel.
2. **Prueba de Nombre**: Verificar que "NGUYEN VAN NGOC" sea asociado automáticamente al empleado correspondiente.
3. **Revisión de Páginas**: Confirmar que las páginas que contienen datos (anversos) sean marcadas para importar, mientras que las páginas en blanco o reversos puedan ser descartadas manualmente o ignoradas si no hay coincidencia.
