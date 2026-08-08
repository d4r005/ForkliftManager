# ForkliftManager 🚜

Sistema integral de gestión y checklist de inspección de montacargas basado en la norma **NOM-006-STPS-2014** (Numeral 7.8.5).

**Idiomas soportados:** 🇲🇽 Español · 🇺🇸 English · 🇨🇳 中文 · 🇻🇳 Tiếng Việt

## Características Principales

- ✅ **Checklist Normativo:** 26 puntos de inspección detallados para montacargas.
- 📱 **Multiplataforma:** Web (Vite) y App Nativa (Android vía Capacitor).
- 🔐 **Gestión de Usuarios:** Sistema de autenticación por Número de Empleado con roles (Administrador / Usuario).
- 📁 **Expedientes Digitales:** Módulo para gestionar documentos de empleados (DC3, Diplomas, CURP, RFC).
- 🤖 **Importación Inteligente (OCR):** Procesador de "Master PDF" que divide documentos masivos y los asigna automáticamente a empleados usando reconocimiento de texto.
- 📊 **Dashboard:** Estadísticas en tiempo real y tasa de aprobación de inspecciones.
- ☁️ **Sincronización:** Base de datos en la nube con Supabase (PostgreSQL).
- 📈 **Excel & PDF:** Exportación a Excel (formato F-SH-006-06) e importación masiva de datos.
- 🛡️ **Seguridad:** Lógica de negocio protegida mediante Funciones RPC en base de datos.

## Tecnología

- **Frontend:** React 18 + Vite
- **Móvil:** Capacitor 7+ (Soporte nativo para Android)
- **Backend:** Supabase (PostgreSQL + Auth personalizado + Storage)
- **Inteligencia/Documentos:** 
  - `tesseract.js` para OCR y reconocimiento de texto.
  - `pdf-lib` y `pdfjs-dist` para manipulación y segmentación de PDFs.
- **Datos:** `xlsx` (SheetJS) para manejo de hojas de cálculo.
- **Estilos:** CSS3 puro con variables dinámicas.

## Instalación y Desarrollo

### Requisitos previos
- Node.js (v18+)
- Android Studio (para la versión móvil)

### Configuración
```bash
# 1. Clonar el repositorio
git clone https://github.com/d4r005/ForkliftManager.git
cd ForkliftManager

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
```

### Comandos útiles
```bash
# Iniciar servidor de desarrollo web
npm run dev

# Sincronizar y compilar para Android
npm run android

# Construir para producción
npm run build

# Abrir el proyecto en Android Studio
npm run cap:open
```

## Base de Datos (Supabase)

El sistema utiliza un esquema relacional optimizado. Ejecuta `supabase/migration.sql` en el SQL Editor para crear:

- **Tablas:**
  - `app_users`: Gestión de empleados, roles y contraseñas (cifradas con pgcrypto).
  - `forklifts`: Registro de unidades de montacargas.
  - `checklists`: Historial de inspecciones con almacenamiento JSONB.
- **Funciones RPC:**
  - `login_user`: Validación de credenciales por número de empleado.
  - `update_expediente`: Gestión avanzada de documentos y vigencias.
  - `create_user` / `get_users`: Administración de personal.

## Estructura del Proyecto

```
ForkliftManager/
├── android/            # Código nativo Android (Capacitor)
├── src/
│   ├── components/
│   │   ├── MasterPdfImport.jsx # Splitter de PDF con OCR
│   │   ├── EmployeeRecords.jsx # Gestión de documentos
│   │   ├── UserManager.jsx     # Panel de administración
│   │   ├── Dashboard.jsx       # Estadísticas
│   │   └── ...
│   ├── context/
│   │   └── AuthContext.jsx     # Auth por # de Empleado
│   ├── utils/
│   │   ├── pdfExtract.js       # Lógica de OCR y parsing
│   │   └── pdfSplit.js         # Lógica de segmentación de archivos
│   ├── i18n/                   # Traducciones (ES, EN, ZH, VI)
│   └── styles/                 # main.css
├── supabase/
│   └── migration.sql           # Esquema completo de DB
├── capacitor.config.json       # Configuración móvil
└── vite.config.js
```

## Licencia

Proyecto interno — SHELSER S. DE R.L. DE C.V.
