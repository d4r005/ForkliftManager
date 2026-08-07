# MontaControl 🚜

Sistema de checklist de inspección de montacargas basado en la norma **NOM-006-STPS-2014** (Numeral 7.8.5).

**Idiomas soportados:** 🇲🇽 Español · 🇺🇸 English · 🇨🇳 中文 · 🇻🇳 Tiếng Việt

## Características

- ✅ Checklist de 26 puntos de inspección de montacargas
- 🌐 Interfaz en 4 idiomas (Español, Inglés, Chino, Vietnamita)
- 💾 Guardado local de revisiones
- 📊 Exportación a Excel (formato compatible con el formato original F-SH-006-06)
- 📱 Diseño responsive (mobile-first para uso en piso)
- 🚜 Gestión de montacargas registrados
- 📈 Dashboard con estadísticas y tasa de aprobación
- 🖨️ Soporte de impresión

## Tecnología

- React 18 + Vite
- SheetJS (XLSX) para exportación a Excel
- localStorage para persistencia de datos
- CSS puro (sin frameworks)

## Instalación

```bash
npm install
npm run dev
```

## Build de producción

```bash
npm run build
npm run preview
```

## Estructura

```
MontaControl/
├── src/
│   ├── components/
│   │   ├── Header.jsx          # Header con selector de idioma
│   │   ├── Dashboard.jsx       # Panel principal con estadísticas
│   │   ├── ChecklistForm.jsx   # Formulario de checklist
│   │   ├── SavedChecklists.jsx # Lista de revisiones guardadas
│   │   └── ForkliftManager.jsx # Gestión de montacargas
│   ├── data/
│   │   └── checklistItems.js   # 26 items de inspección (multilingüe)
│   ├── i18n/
│   │   ├── LanguageContext.jsx # Contexto de idioma
│   │   └── translations.js     # Traducciones de UI
│   ├── hooks/
│   │   └── useStore.js         # Hook para localStorage
│   ├── utils/
│   │   └── exportExcel.js     # Exportación a Excel
│   ├── styles/
│   │   └── main.css           # Estilos
│   ├── App.jsx                # Componente principal
│   └── main.jsx               # Entry point
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
