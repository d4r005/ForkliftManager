# ForkliftManager Android

App nativa de Android para el sistema de checklist de montacargas (NOM-006-STPS-2014).

## Estructura del proyecto

```
ForkliftManager/
├── src/                    # Código web (React + Vite) — compartido
├── android/                # Proyecto nativo Android
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/com/shelser/montacontrol/
│   │   │   │   └── MainActivity.java
│   │   │   ├── assets/web/  # Build web copiado aquí al compilar
│   │   │   └── res/
│   │   │       ├── values/       # Español (default)
│   │   │       ├── values-en/    # Inglés
│   │   │       ├── values-zh/    # Chino
│   │   │       └── values-vi/    # Vietnamita
│   │   └── build.gradle
│   ├── build.gradle
│   ├── settings.gradle
│   └── gradle/
├── .github/workflows/
│   └── build-android.yml   # GitHub Action: compila APK automáticamente
├── capacitor.config.json
└── package.json
```

## Compilar el APK

### Opción 1: Automática (GitHub Actions)
1. Ve a Settings → Secrets → Actions en el repo
2. Agrega los secrets:
   - `VITE_SUPABASE_ANON_KEY` — tu anon key de Supabase
   - `ANDROID_SIGNING_KEY` — keystore en base64 (`base64 -w0 release.keystore`)
   - `ANDROID_KEY_ALIAS` — alias del keystore
   - `ANDROID_KEY_PASSWORD` — password de la key
   - `ANDROID_KEYSTORE_PASSWORD` — password del keystore
3. Haz push a `main` o crea un tag `v1.0.0`
4. Descarga el APK desde Actions → Build Android APK → Artifacts

### Opción 2: Local con Android Studio
```bash
npm install
npm run build
npx cap sync android
npx cap open android
```
En Android Studio: Build → Build APK

### Opción 3: Local con Gradle
```bash
npm install
npm run build
mkdir -p android/app/src/main/assets/web
cp -r dist/* android/app/src/main/assets/web/
cd android
./gradlew assembleRelease
```
APK en: `android/app/build/outputs/apk/release/`

## Generar keystore de firma
```bash
keytool -genkey -v -keystore release.keystore -alias montacontrol -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore  # Copia el output para el secret ANDROID_SIGNING_KEY
```

## Idiomas soportados
- 🇲🇽 Español (default)
- 🇺🇸 Inglés
- 🇨🇳 Chino (中文)
- 🇻🇳 Vietnamita (Tiếng Việt)
