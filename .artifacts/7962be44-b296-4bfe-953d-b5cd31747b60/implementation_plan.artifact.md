# Plan de Implementación: Eliminación Masiva de Usuarios y Expedientes

Este plan detalla los cambios para permitir que un administrador seleccione y elimine múltiples usuarios o expedientes de forma simultánea.

## User Review Required

> [!WARNING]
> La eliminación de un usuario o expediente es permanente y afectará a la tabla `app_users`. Se incluirá una confirmación de seguridad antes de proceder.

> [!IMPORTANT]
> No se permitirá que el administrador se elimine a sí mismo en una operación masiva para evitar bloqueos accidentales del sistema.

## Proposed Changes

### Base de Datos (Supabase)

#### [NEW] [bulk_delete_migration.sql](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/supabase/bulk_delete_migration.sql)
- Crear una nueva función RPC `bulk_delete_users` que reciba un array de UUIDs.

### Frontend

#### [MODIFY] [AuthContext.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/context/AuthContext.jsx)
- Añadir la función `bulkDeleteUsers(userIds)` para invocar el nuevo RPC.

#### [MODIFY] [UserManager.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/UserManager.jsx)
- Implementar estado para selección múltiple (`selectedIds`).
- Añadir checkbox en cada tarjeta de usuario.
- Añadir checkbox de "Seleccionar todo".
- Añadir botón "Eliminar seleccionados" en la cabecera cuando hay elementos seleccionados.

#### [MODIFY] [EmployeeRecords.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/EmployeeRecords.jsx)
- Implementar estado para selección múltiple.
- Añadir checkbox en cada tarjeta de expediente.
- Añadir checkbox de "Seleccionar todo".
- Añadir botón "Eliminar seleccionados".

#### [MODIFY] [translations.js](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/i18n/translations.js)
- Añadir traducciones para: `selectAll`, `deleteSelected`, `confirmBulkDelete`, `itemsSelected`.

## Verification Plan

### Manual Verification
1. **Selección**: Verificar que al marcar "Seleccionar todo" se marquen todos los usuarios/expedientes visibles.
2. **Protección**: Intentar seleccionar al administrador actual y verificar que el sistema lo ignore o impida su eliminación masiva.
3. **Eliminación**: Seleccionar 3 usuarios de prueba y confirmar la eliminación. Verificar que desaparezcan de ambas vistas (Usuarios y Expedientes).
4. **Estado**: Verificar que el botón de eliminar masivamente solo aparezca cuando hay al menos un elemento seleccionado.
