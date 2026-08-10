# Plan de Implementación: Generación de APK Release

Este plan detalla los pasos para generar un archivo APK de producción (release) para la aplicación Android.

## User Review Required

> [!IMPORTANT]
> **Firma del APK**: Se ha detectado un archivo `montacontrol-release.keystore`. Para generar un APK firmado automáticamente, se requieren las contraseñas del almacén de llaves y de la clave, así como el alias. De lo contrario, se generará un APK "unsigned" que deberá firmarse manualmente.
> **Gradle Wrapper**: Faltan los archivos del Gradle Wrapper (`gradlew`, `gradlew.bat`) en la carpeta `android`. Se intentará restaurarlos.

## Proposed Changes

### Preparación del Proyecto

#### [ACTION] Instalar dependencias faltantes
- Se ha detectado que falta `@pdf-lib/fontkit`. Se instalará para asegurar que la compilación web sea exitosa.

#### [ACTION] Reconstrucción de la carpeta Android (si es necesario)
- Si los archivos de Gradle no pueden restaurarse, se podría requerir reinstalar la plataforma Android de Capacitor:
  ```bash
  npx cap add android
  ```
  *Nota: Esto se hará con precaución para no perder configuraciones personalizadas en `AndroidManifest.xml` o recursos.*

### Generación del Build

#### [STEP] Compilación Web
- Ejecutar `npm run build` para generar los activos estáticos en la carpeta `dist`.

#### [STEP] Sincronización Capacitor
- Ejecutar `npx cap sync android` para copiar los activos web al proyecto nativo.

#### [STEP] Generación de APK Release
- Ejecutar el comando de Gradle:
  ```bash
  cd android && ./gradlew assembleRelease
  ```

## Verification Plan

### Manual Verification
1. Verificar que el archivo `app-release.apk` (o `app-release-unsigned.apk`) se genere en la ruta `android/app/build/outputs/apk/release/`.
2. Probar la instalación del APK en un dispositivo Android físico o emulador.
3. Asegurarse de que la aplicación cargue correctamente los activos web compilados recientemente.
