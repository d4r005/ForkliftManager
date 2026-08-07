# Plan de Implementación: Corrección de Importación de Excel y Ampliación de Datos de Empleado

Este plan aborda el error "No se encontraron datos válidos" al importar empleados desde Excel y amplía el sistema para soportar los campos adicionales (NSS y Puesto) que se encuentran en el archivo del usuario.

## User Review Required

> [!IMPORTANT]
> El error actual se debe a que el sistema busca la columna "Número de empleado" o "Employee", pero el Excel del usuario utiliza "Empleado". Se añadirán alias para reconocer "Empleado", "NSS" y "Puesto".

> [!NOTE]
> Se agregarán las columnas `nss` y `job_title` a la tabla `app_users` en Supabase para almacenar la información completa.

## Proposed Changes

### Base de Datos (Supabase)

#### [NEW] [add_nss_job_title_migration.sql](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/supabase/add_nss_job_title_migration.sql)
- Crear una migración para añadir `nss` (TEXT) y `job_title` (TEXT) a la tabla `app_users`.

#### [MODIFY] [bulk_import_employees (RPC)](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/supabase/bulk_import_migration.sql)
- Actualizar la función para procesar los nuevos campos `nss` y `job_title` desde el JSON de entrada.

#### [MODIFY] [list_expedientes (RPC)](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/supabase/expedientes_migration.sql)
- Incluir `nss` y `job_title` en el objeto JSON retornado.

#### [MODIFY] [get_expediente (RPC)](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/supabase/expedientes_migration.sql)
- Incluir los nuevos campos en la consulta.

#### [MODIFY] [update_expediente (RPC)](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/supabase/expedientes_migration.sql)
- Añadir parámetros opcionales para `nss` y `job_title`.

### Frontend

#### [MODIFY] [ExcelImport.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/ExcelImport.jsx)
- Actualizar la lógica de normalización para incluir alias como "Empleado", "NSS", "Puesto", "Cargo".
- Modificar `downloadTemplate` para incluir estas columnas en la plantilla generada.
- Actualizar el envío de datos al RPC para incluir `nss` y `job_title`.

#### [MODIFY] [EmployeeRecords.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/EmployeeRecords.jsx)
- Actualizar el estado `editData` y el formulario de edición para incluir NSS y Puesto.
- Actualizar la vista de detalles para mostrar estos campos.
- Actualizar la llamada al RPC `update_expediente`.

#### [MODIFY] [translations.js](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/i18n/translations.js)
- Añadir etiquetas para "NSS" y "Puesto" (Job Title) en todos los idiomas.

## Verification Plan

### Manual Verification
1. Ejecutar la migración SQL en Supabase.
2. Intentar cargar el archivo Excel del usuario.
3. Verificar que la vista previa muestre correctamente los datos de "Empleado", "Nombre", "RFC", "CURP", "NSS" y "Puesto".
4. Confirmar la importación y verificar en la lista de expedientes que los nuevos campos se visualicen correctamente.
5. Editar un expediente manualmente y verificar que NSS y Puesto se guarden correctamente.
