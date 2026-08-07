# MontaControl 🚜

Sistema de checklist de inspección de montacargas basado en la norma **NOM-006-STPS-2014** (Numeral 7.8.5).

**Idiomas soportados:** 🇲🇽 Español · 🇺🇸 English · 🇨🇳 中文 · 🇻🇳 Tiếng Việt

## Características

- ✅ Checklist de 26 puntos de inspección de montacargas
- 🌐 Interfaz en 4 idiomas (Español, Inglés, Chino, Vietnamita)
- 🔐 Autenticación de usuarios (Supabase Auth)
- ☁️ Base de datos en la nube (Supabase PostgreSQL)
- 💾 Sincronización entre dispositivos
- 📊 Exportación a Excel (formato compatible con F-SH-006-06)
- 📱 Diseño responsive (mobile-first para uso en piso)
- 🚜 Gestión de montacargas registrados
- 📈 Dashboard con estadísticas y tasa de aprobación
- 🖨️ Soporte de impresión
- 🛡️ Row-Level Security (cada usuario solo ve sus datos)

## Tecnología

- React 18 + Vite
- Supabase (Auth + PostgreSQL + RLS)
- SheetJS (XLSX) para exportación a Excel
- CSS puro (sin frameworks)

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/d4r005/MontaControl.git
cd MontaControl

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# 4. Ejecutar la migración SQL
#    - Ir a Supabase Dashboard > SQL Editor > New Query
#    - Pegar el contenido de supabase/migration.sql
#    - Ejecutar

# 5. Iniciar el servidor de desarrollo
npm run dev
```

## Configuración de Supabase

### Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

### Base de datos

Ejecuta el script `supabase/migration.sql` en el SQL Editor de Supabase. Esto crea:

- Tabla `forklifts` — registro de montacargas
- Tabla `checklists` — revisiones guardadas (con items en JSONB)
- Políticas RLS — cada usuario solo accede a sus propios datos
- Triggers — auto-actualización de `updated_at` y auto-asignación de `user_id`

## Estructura

```
MontaControl/
├── src/
│   ├── components/
│   │   ├── Login.jsx           # Pantalla de login/registro
│   │   ├── Header.jsx          # Header con selector de idioma + user menu
│   │   ├── Dashboard.jsx       # Panel principal con estadísticas
│   │   ├── ChecklistForm.jsx   # Formulario de checklist
│   │   ├── SavedChecklists.jsx # Lista de revisiones guardadas
│   │   └── ForkliftManager.jsx # Gestión de montacargas
│   ├── context/
│   │   └── AuthContext.jsx     # Contexto de autenticación (Supabase)
│   ├── data/
│   │   └── checklistItems.js   # 26 items de inspección (multilingüe)
│   ├── i18n/
│   │   ├── LanguageContext.jsx # Contexto de idioma
│   │   └── translations.js     # Traducciones de UI
│   ├── hooks/
│   │   └── useStore.js         # Hook para datos (Supabase)
│   ├── lib/
│   │   └── supabase.js         # Cliente de Supabase
│   ├── utils/
│   │   └── exportExcel.js     # Exportación a Excel
│   ├── styles/
│   │   └── main.css           # Estilos
│   ├── App.jsx                # Componente principal
│   └── main.jsx               # Entry point
├── supabase/
│   └── migration.sql          # Script SQL para crear tablas y RLS
├── .env.example               # Template de variables de entorno
├── package.json
├── vite.config.js
└── index.html
```

## Items de inspección (NOM-006-STPS-2014)

1. Llanta / revestimiento / presión de aire
2. Todas las luces
3. Dispositivos de advertencia
4. Número de horas / millaje
5. Relojes indicadores
6. Daños a la carrocería
7. Escapes de aceite / fluido / combustible / agua
8. Nivel de aceite de motor
9. Nivel del refrigerante
10. Nivel de combustible
11. Nivel de aceite hidráulico
12. Batería
13. Puntos de lubricación externa
14. Nivel de tanque de gas
15. Claxon
16. Dirección hidráulica
17. Freno
18. Freno de emergencia
19. Inclinación de las cuchillas
20. Subir y bajar las cuchillas
21. Aditamentos hidráulicos
22. Estado y seguro de las cuchillas
23. Cinturón de seguridad
24. Transmisión / Dirección
25. Equipo de protección contra incendio
26. Alarma de reversa

## Valores de calificación

- **SAT** — Satisfactorio / 合格 / Đạt
- **INS** — Insatisfactorio / 不合格 / Không đạt
- **N/A** — No Aplica / 不适用 / Không áp dụng

## Licencia

Proyecto interno — SHELSER S. DE R.L. DE C.V.
