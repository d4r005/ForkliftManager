# Walkthrough: Corrección de Importación y Soporte de NSS/Puesto

Se ha solucionado el problema al importar archivos Excel y se han añadido nuevos campos al expediente de los empleados (NSS y Puesto).

## Cambios Realizados

### Base de Datos
- **Migración SQL**: Se han añadido las columnas `nss` y `job_title` a la tabla `app_users`.
- **Funciones RPC**: Se han actualizado las funciones `bulk_import_employees`, `list_expedientes`, `get_expediente` y `update_expediente` para manejar los nuevos campos.

### Frontend
- **Importación de Excel**:
    - Se añadió soporte para el alias "Empleado" (además de "Número de empleado").
    - Se añadió soporte para importar las columnas "NSS" y "Puesto".
    - Se actualizó la plantilla de descarga para incluir estos campos.
- **Gestión de Expedientes**:
    - El formulario de edición ahora incluye campos para NSS y Puesto.
    - La vista de detalles muestra la información de NSS y Puesto.
- **Internacionalización**: Se añadieron las etiquetas `expJobTitle` y `expNss` en los 4 idiomas soportados.

## Verificación

> [!TIP]
> Ya puedes intentar cargar el archivo Excel que tenías. El sistema ahora reconocerá automáticamente la columna "Empleado" y capturará el "NSS" y el "Puesto".

1. **Importación**: Probado con el formato de columnas: `Empleado`, `Nombre`, `RFC`, `CURP`, `NSS`, `Puesto`.
2. **Edición Manual**: Verificado que al guardar cambios en NSS o Puesto desde el formulario, estos persisten correctamente.
3. **Visualización**: Verificado que los datos aparecen en la vista de detalles del expediente.
