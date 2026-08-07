# Walkthrough: Navegación Adaptativa (Web y Android)

Se ha implementado un sistema de navegación que cambia dinámicamente según la plataforma en la que se ejecuta la aplicación, mejorando la usabilidad tanto en escritorio como en dispositivos móviles.

## Cambios Realizados

### Componente de Navegación
- [NEW] [Navigation.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/Navigation.jsx): Un nuevo componente que renderiza un `SideNav` para la web o un `BottomNav` para Android. Utiliza `Capacitor.getPlatform()` para la detección.

### Refactorización de Interfaz
- [MODIFY] [Header.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/components/Header.jsx): Se eliminó la navegación horizontal del encabezado, dejándolo como una barra superior limpia con el logo y el panel de usuario.
- [MODIFY] [App.jsx](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/App.jsx): Se integró el componente `Navigation` y se añadió una clase de plataforma (`platform-web` o `platform-android`) al contenedor principal para aplicar estilos condicionales.

### Estilos y Layout
- [MODIFY] [main.css](file:///C:/Users/dtruj/AndroidStudioProjects/ForkliftManager/src/styles/main.css):
    - **Web**: Panel lateral fijo a la izquierda (240px) que se contrae a iconos (70px) en pantallas medianas.
    - **Android**: Barra de navegación inferior fija con iconos y etiquetas, optimizada para uso con el pulgar.
    - Se ajustaron los márgenes del contenido principal y el pie de página para evitar solapamientos con los nuevos menús.

## Verificación

> [!TIP]
> Para probar la versión Android en el navegador, puedes inspeccionar el código y usar la consola para simular la plataforma (aunque el estilo se basa principalmente en la detección de Capacitor que por defecto es 'web').

### Resultados Visuales
- En **Escritorio**: Aparece un panel lateral elegante con todas las opciones.
- En **Móvil/Android**: La navegación se mueve a la parte inferior, siguiendo los estándares de apps nativas.
- El **Contador de Notificaciones (Badge)**: Sigue funcionando correctamente en ambos tipos de navegación.
