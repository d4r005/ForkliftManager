# Plan de Implementación: Corrección de Pantalla en Blanco y Confirmación de Visibilidad Global

Este plan resuelve el problema de la "pantalla en blanco" en Android y confirma el funcionamiento de la visibilidad global para Administradores y Supervisores en ambas plataformas.

## Análisis del Problema (Pantalla en Blanco)

> [!IMPORTANT]
> La aplicación Android muestra una pantalla en blanco porque la clase `MainActivity` actual no utiliza el "Puente" de Capacitor (`BridgeActivity`).
> Al usar un `WebView` manual con el protocolo `file://`, las rutas de los archivos generados por Vite (como `/assets/...`) fallan al cargar. Además, esto impide que los plugins de Capacitor funcionen.

## Propuesta de Solución

### 1. Aplicación Android (MainActivity)

#### [MODIFY] [MainActivity.java](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/android/app/src/main/java/com/shelser/montacontrol/MainActivity.java)
- Cambiar la herencia de `AppCompatActivity` a `BridgeActivity`.
- Eliminar la configuración manual del `WebView`, ya que Capacitor se encarga de esto de forma óptima y segura.
- Mantener la línea `FLAG_SECURE` para seguir bloqueando capturas de pantalla, integrándola en el ciclo de vida de Capacitor.

### 2. Configuración de Construcción (Vite)

#### [MODIFY] [vite.config.js](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/vite.config.js)
- Asegurar que la base sea relativa si es necesario, aunque al usar `BridgeActivity` la carga se realiza vía un servidor local interno (`https://localhost`), lo cual es compatible con la configuración actual.

## Respuesta a Dudas del Usuario

> [!NOTE]
> **Visibilidad Global**: Sí, tanto en la **web** como en la **aplicación Android**, si inicias sesión como **Administrador** o **Supervisor**, verás automáticamente el Dashboard global y la lista de revisiones de todos los empleados. Los operadores seguirán viendo solo sus propios datos. Esto ya está implementado en la lógica compartida (`useStore.js`).

## Verification Plan

### Manual Verification
1. **Compilación**: Ejecutar `npm run build` y `npx cap sync android`.
2. **Generación de APK**: Generar el APK release firmado.
3. **Prueba en Dispositivo**: Instalar el APK y verificar que aparezca la pantalla de login correctamente (no blanco).
4. **Prueba de Roles**: Iniciar sesión como Supervisor en el teléfono y verificar que aparezcan las revisiones globales.
