# Walkthrough: Eliminación Masiva de Usuarios y Expedientes

Se ha implementado una funcionalidad de selección múltiple que permite a los administradores eliminar varios usuarios o expedientes de forma simultánea, optimizando la gestión del personal.

## Funcionalidades Implementadas

### 1. Selección Múltiple
- **Checkboxes**: Se han añadido casillas de selección en cada tarjeta de usuario y expediente.
- **Seleccionar todo**: Una opción global para marcar todos los elementos visibles de una vez.
- **Indicador Visual**: Las tarjetas seleccionadas cambian de color para una mejor identificación.

### 2. Eliminación por Lote (Bulk Delete)
- **Botón Dinámico**: El botón de "Eliminar seleccionados" solo aparece cuando hay al menos un elemento marcado.
- **Confirmación Segura**: Antes de proceder, el sistema muestra el número total de elementos que se van a eliminar para evitar errores.
- **Protección de Cuenta**: El sistema impide automáticamente la selección y eliminación del administrador que está operando en ese momento.

## Cambios Técnicos
- [NEW] [bulk_delete_migration.sql](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/supabase/bulk_delete_migration.sql): Nueva función RPC para procesar eliminaciones masivas en el servidor.
- [MODIFY] [AuthContext.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/context/AuthContext.jsx): Integración de la función `bulkDeleteUsers`.
- [MODIFY] [UserManager.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/UserManager.jsx) y [EmployeeRecords.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/EmployeeRecords.jsx): Actualización de la lógica de interfaz para manejar la selección y el borrado masivo.
- [MODIFY] [expedientes_migration.sql](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/supabase/expedientes_migration.sql): Se actualizó la función `list_expedientes` para incluir el ID interno del usuario, necesario para la eliminación precisa.

## Verificación Recomendada
1. Ve a **Gestión de usuarios** o **Expedientes**.
2. Marca la casilla "Seleccionar todo".
3. Verifica que el botón de "Eliminar seleccionados" muestre el conteo correcto.
4. Desmarca algunos elementos y verifica que el conteo se actualice.
5. Intenta eliminar y confirma el diálogo.

> [!IMPORTANT]
> Recuerda ejecutar el archivo `supabase/bulk_delete_migration.sql` en tu SQL Editor de Supabase y volver a ejecutar la parte de `list_expedientes` en `expedientes_migration.sql` para que el sistema funcione correctamente.
