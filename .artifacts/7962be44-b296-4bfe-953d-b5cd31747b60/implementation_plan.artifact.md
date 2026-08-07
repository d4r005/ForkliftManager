# Plan de Implementación: Navegación Adaptativa (Web y Android)

Este plan detalla los cambios necesarios para implementar un panel lateral de navegación para la versión web y una barra de navegación inferior para la versión Android, mejorando la experiencia de usuario según la plataforma.

## User Review Required

> [!IMPORTANT]
> Se utilizará la API de Capacitor para detectar si la aplicación se ejecuta en la web o de forma nativa (Android).
> La navegación inferior en Android tiene un límite de espacio. Se evaluará si todos los elementos caben o si es necesario un menú "Más".

## Proposed Changes

### Componentes de Navegación

#### [NEW] [Navigation.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/Navigation.jsx)
Crear un nuevo componente que maneje ambos tipos de navegación:
- `SideNav`: Para la versión web. Estará fijo a la izquierda.
- `BottomNav`: Para la versión Android. Estará fijo en la parte inferior.
- Detectará la plataforma usando `Capacitor.getPlatform()`.

#### [MODIFY] [Header.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/Header.jsx)
- Eliminar la sección `<nav className="header-nav">`.
- Mantener la parte superior (Logo y Panel de Usuario), pero ajustarla para que sea un "Top Bar" más ligero.

#### [MODIFY] [App.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/App.jsx)
- Integrar el nuevo componente `Navigation`.
- Ajustar el diseño (layout) principal para que el contenido se desplace correctamente según el tipo de navegación activo.

### Estilos

#### [MODIFY] [main.css](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/styles/main.css)
- Añadir estilos para `.side-nav` (ancho fijo, altura completa, flex-column).
- Añadir estilos para `.bottom-nav` (fijo abajo, ancho completo, flex-row).
- Ajustar `.app-main` para tener margen izquierdo en web y margen inferior en Android.
- Esconder el `footer` o reposicionarlo según sea conveniente.

## Verification Plan

### Manual Verification
- Probar en el navegador (versión web) para verificar el panel lateral.
- Simular un dispositivo móvil en las herramientas de desarrollo de Chrome (o usar el emulador de Android si está disponible) para verificar la navegación inferior.
- Asegurarse de que el cambio de vista (Dashboard, List, etc.) funcione correctamente desde ambos menús.
- Verificar que el contador de "Revisiones guardadas" (badge) se muestre correctamente.
