# Plan de Implementación: Corrección de Carga Android y Visibilidad Global para Supervisores

Este plan aborda dos puntos críticos: el error de "Página web no disponible" en Android y la necesidad de que los supervisores tengan acceso global a los datos.

## User Review Required

> [!IMPORTANT]
> **Error en Android**: El problema se debe a que la aplicación nativa busca los archivos en una carpeta llamada `web/`, pero Capacitor (el sistema que usamos para conectar la web con el móvil) los coloca por defecto en `public/`. Se corregirá la ruta en el código nativo de Android.

> [!NOTE]
> **Acceso Supervisor**: Se habilitará el rol de Supervisor para que, al igual que el Administrador, pueda ver todas las inspecciones de todos los operadores, facilitando el seguimiento de fallos en los equipos.

## Proposed Changes

### 1. Aplicación Android (Código Nativo)

#### [MODIFY] [MainActivity.java](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/android/app/src/main/java/com/shelser/montacontrol/MainActivity.java)
- Cambiar la línea `webView.loadUrl("file:///android_asset/web/index.html");` por `webView.loadUrl("file:///android_asset/public/index.html");`. Esto alineará la aplicación nativa con la estructura de carpetas de Capacitor.

### 2. Lógica de Datos (Web)

#### [MODIFY] [useStore.js](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/hooks/useStore.js)
- Actualizar las consultas a Supabase en `loadData` para que no apliquen el filtro de `employee_number` si el usuario tiene el rol `supervisor`.
- Permitir que el supervisor actualice o elimine checklists y montacargas de cualquier empleado, al igual que el administrador.

### 3. Documentación

#### [MODIFY] [README.md (Android)](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/android/README.md)
- Actualizar las instrucciones manuales para que indiquen la carpeta `public` en lugar de `web`.

## Verification Plan

### Manual Verification
1. **Android**: Generar un nuevo APK después del cambio y verificar que la aplicación cargue correctamente la pantalla de inicio (Login).
2. **Supervisor**: Iniciar sesión con un usuario con rol de Supervisor y confirmar que el Dashboard muestra el total de revisiones de la empresa y no solo las propias.
3. **Operador**: Confirmar que un usuario con rol de Operador sigue viendo únicamente su propia información por seguridad y orden.
