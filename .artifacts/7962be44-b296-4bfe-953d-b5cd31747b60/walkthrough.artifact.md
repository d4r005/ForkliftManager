# Walkthrough: Automatización de Nombres e Importación de PDF Maestro

Se han implementado herramientas avanzadas para agilizar la gestión de expedientes, permitiendo corregir el orden de los nombres desde Excel y cargar documentos masivamente desde un único PDF.

## Funcionalidades Implementadas

### 1. Inversión Inteligente de Nombres (Excel)
En la ventana de **Importar Excel**, ahora encontrarás nuevas opciones en la vista previa:
- **Toggle "Invertir orden de nombres"**: Permite cambiar de `Apellidos Nombre` a `Nombre Apellidos`.
- **Selector de palabras**: Permite elegir cuántas palabras del final corresponden al nombre (útil para nombres compuestos como "Juan Jose").
- **Visualización en tiempo real**: Los nombres resaltan en color azul cuando la transformación está activa.

### 2. Importador de PDF Maestro (DC3/Diplomas)
En la lista de **Expedientes**, se ha añadido el botón "📄 Importar PDF Maestro":
- **División Automática**: Sube un único PDF con múltiples páginas; el sistema lo dividirá en archivos individuales por página.
- **Detección por IA/Texto**: El sistema lee cada página buscando nombres o CURP.
- **Asociación Inteligente**: Compara los datos detectados con tu lista de empleados y sugiere una asignación con un porcentaje de certeza.
- **Revisión Manual**: Puedes corregir cualquier asignación antes de procesar.
- **Carga Directa**: Al confirmar, cada página se guarda en el expediente del empleado correspondiente como un PDF independiente.

## Cambios Técnicos
- [NEW] [pdfSplit.js](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/utils/pdfSplit.js): Utiliza `pdf-lib` para manipular PDFs en el navegador.
- [NEW] [MasterPdfImport.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/MasterPdfImport.jsx): Componente de interfaz para el proceso de PDF Maestro.
- [MODIFY] [ExcelImport.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/ExcelImport.jsx): Lógica de inversión de nombres integrada.
- [MODIFY] [EmployeeRecords.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/EmployeeRecords.jsx): Punto de entrada para la nueva funcionalidad.

## Verificación Recomendada
1. **Excel**: Prueba subiendo un Excel con nombres invertidos y usa el toggle para corregirlos.
2. **PDF Maestro**: Prueba subiendo un PDF con 2 o 3 certificados. Verifica que el sistema identifique a los empleados y que, tras procesar, el PDF de cada empleado en su expediente tenga solo **una página**.
