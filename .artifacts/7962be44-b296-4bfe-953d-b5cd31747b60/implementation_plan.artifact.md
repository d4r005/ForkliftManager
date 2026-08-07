# Plan de Implementación: Automatización de Nombres y Carga Masiva desde PDF Maestro

Este plan describe las mejoras para procesar nombres en el orden correcto y automatizar la asignación de DC3/Diplomas desde un único archivo PDF que contiene los documentos de todos los empleados.

## User Review Required

> [!IMPORTANT]
> **Carga Masiva desde PDF Maestro**:
> - Se requiere la librería `pdf-lib` para dividir el PDF original en archivos individuales por página sin perder calidad.
> - El sistema analizará el texto de cada página para extraer el nombre del empleado.
> - Se utilizará un algoritmo de coincidencia (fuzzy match) para asociar la página con el empleado correcto en la base de datos, incluso si hay pequeñas variaciones en el nombre.

> [!NOTE]
> **Orden de Nombres en Excel**:
> - Se añadirá una opción en la vista previa del Excel para "Invertir Nombres".
> - Se permitirá configurar si el nombre tiene 1 o 2 palabras al final (ej: "Perez Juan" -> "Juan Perez" vs "Perez Ruiz Juan Jose" -> "Juan Jose Perez Ruiz").

## Proposed Changes

### 1. Procesamiento de Nombres (Excel)

#### [MODIFY] [ExcelImport.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/ExcelImport.jsx)
- Añadir controles en la interfaz de vista previa:
    - Toggle: "Invertir Apellidos y Nombres".
    - Selector: "Palabras del nombre al final" (1 o 2).
- Actualizar la lógica de normalización para aplicar estas transformaciones antes de mostrar los datos en la tabla.

### 2. División y Asignación de PDF Maestro

#### [NEW] [pdfSplit.js](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/utils/pdfSplit.js)
- Utilizar `pdf-lib` para cargar un PDF y extraer una página específica como un nuevo `Blob` de PDF.

#### [NEW] [MasterPdfImport.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/MasterPdfImport.jsx)
- Un nuevo modal que permita subir el "PDF Maestro".
- Flujo de trabajo:
    1. Subir PDF.
    2. Extraer texto de cada página usando `extractPdfText`.
    3. Para cada página:
        - Extraer Nombre/CURP.
        - Buscar coincidencia en la lista de empleados (usando `levenshtein` o similar para nombres).
        - Mostrar una tabla de "Asignaciones detectadas" para revisión del usuario.
    4. Al confirmar:
        - Dividir el PDF por página.
        - Subir cada página a `storage/expedientes`.
        - Actualizar el campo `dc3_pdf_path` o `diploma_pdf_path` del empleado vía RPC.

### 3. Integración en Interfaz

#### [MODIFY] [EmployeeRecords.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/EmployeeRecords.jsx)
- Añadir botón "Importar PDF Maestro".
- Integrar el componente `MasterPdfImport`.

## Verification Plan

### Manual Verification
1. **Inversión de Nombres**: Cargar Excel con "CRUZ RUIZ VENUSTIANO", probar invertir con 1 palabra ("VENUSTIANO CRUZ RUIZ") y verificar.
2. **Importación Maestro**: Subir un PDF de 2 páginas con documentos de dos empleados diferentes.
    - Verificar que el sistema reconozca los nombres.
    - Confirmar y verificar que en el expediente de cada empleado aparezca el PDF correspondiente a su página solamente.
3. **Seguridad**: Asegurar que los archivos individuales heredan las políticas de acceso del bucket `expedientes`.
