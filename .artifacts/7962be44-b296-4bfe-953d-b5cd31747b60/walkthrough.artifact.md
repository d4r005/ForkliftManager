# Walkthrough: Generación de APK Release Firmado

Se ha generado exitosamente el archivo APK de producción, listo para ser instalado en dispositivos Android.

## Acciones Realizadas

### 1. Configuración de Firma
- Se modificó el archivo `android/app/build.gradle` para incluir la configuración de firma (`signingConfigs`).
- Se vinculó el archivo `montacontrol-release.keystore` usando la contraseña **`Branco2025`** y el alias **`montacontrol`**.

### 2. Preparación del Entorno
- Se restauraron los archivos de ejecución de Gradle (`gradlew`) en la carpeta `android`.
- Se instaló la dependencia necesaria `@pdf-lib/fontkit`.

### 3. Proceso de Compilación
- **Build Web**: Se ejecutó `npm run build` para generar los activos estáticos optimizados.
- **Sincronización**: Se usó `npx cap sync android` para transferir la web al contenedor nativo.
- **Gradle Build**: Se ejecutó la tarea `assembleRelease` para compilar el código nativo y empaquetar el APK firmado.

## Resultado

> [!TIP]
> El archivo APK se encuentra en la siguiente ruta:
> `C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/android/app/build/outputs/apk/release/app-release.apk`

### Instrucciones de Instalación
1. Copia el archivo `app-release.apk` a tu teléfono Android.
2. Abre el archivo desde un explorador de archivos en el teléfono.
3. Permite la instalación desde fuentes desconocidas si se te solicita.
4. ¡La aplicación de ForkliftManager estará lista para usar!
