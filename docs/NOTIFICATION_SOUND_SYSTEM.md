# Sistema de Sonido para Notificaciones

## Descripción General

El sistema de sonido de notificaciones reproduce automáticamente un tono agradable cuando llega una nueva notificación en tiempo real a la plataforma. Este sonido ayuda a los usuarios a estar al tanto de eventos importantes sin tener que vigilar constantemente el badge de notificaciones.

## Características

### 1. Sonido Generado con Web Audio API

- El sonido se genera en tiempo real usando la Web Audio API del navegador
- No requiere archivos de audio externos
- Sonido agradable de dos tonos armónicos (quinta perfecta - ratio 3:2)
- Duración breve: 400ms
- Volumen moderado: 15% del máximo

### 2. Activación/Desactivación

Los usuarios pueden controlar el sonido desde el panel de notificaciones en el sidebar:

- **Icono de Volumen**: Ubicado en el header del dropdown de notificaciones (campana)
- **Estado Activado** (Volume2 icon): El sonido se reproducirá con cada notificación nueva
- **Estado Desactivado** (VolumeX icon): No se reproducirá ningún sonido
- **Persistencia**: La preferencia se guarda en `localStorage` y persiste entre sesiones

### 3. Comportamiento Inteligente

El sonido solo se reproduce cuando:

- ✅ Es una notificación **nueva** que llega en tiempo real (evento INSERT)
- ✅ El usuario ha **habilitado el sonido** (por defecto está activado)
- ✅ La ventana del navegador está **visible** (`document.visibilityState === 'visible'`)
- ✅ El usuario ya ha **interactuado con la página** (requisito de navegadores modernos)

El sonido NO se reproduce cuando:

- ❌ Se cargan notificaciones existentes al iniciar sesión
- ❌ Se actualiza o elimina una notificación existente
- ❌ La ventana está en segundo plano
- ❌ El sonido está desactivado por el usuario

## Implementación Técnica

### Archivos Involucrados

1. **`src/hooks/useNotificationSound.ts`**
   - Hook personalizado para manejar el audio
   - Gestiona el AudioContext y la generación de sonido
   - Controla el estado habilitado/deshabilitado

2. **`src/contexts/NotificationsContext.tsx`**
   - Integra el hook de sonido
   - Reproduce el sonido cuando llega una notificación nueva (INSERT en tiempo real)
   - Exporta `setSoundEnabled` para control externo

3. **`src/components/Sidebar.tsx`**
   - Interfaz de usuario para activar/desactivar el sonido
   - Guarda la preferencia en localStorage
   - Sincroniza el estado con el contexto

### Parámetros del Sonido

```typescript
// Frecuencias (Hz)
Oscilador 1: 800 Hz  // Do alto
Oscilador 2: 1200 Hz // Sol muy alto (quinta perfecta)

// Envelope (segundos)
Ataque: 0.05s  // Subida rápida
Decay:  0.35s  // Caída suave
Duración Total: 0.4s

// Volumen
Ganancia máxima: 0.15 (15%)
```

### Compatibilidad con Navegadores

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (con `webkitAudioContext`)
- ✅ Opera

**Nota**: Los navegadores modernos requieren que el usuario haya interactuado con la página antes de permitir reproducción de audio. El sistema se encarga de esto automáticamente.

## Consideraciones de UX

1. **Volumen Moderado**: El sonido es suave (15%) para no ser intrusivo
2. **Duración Breve**: Solo 400ms para no molestar
3. **Tonos Armónicos**: Frecuencias en quinta perfecta para un sonido agradable
4. **Control del Usuario**: Fácil de activar/desactivar con un clic
5. **Feedback Visual**: El icono cambia para indicar el estado actual
6. **Tooltip Informativo**: Muestra el estado actual al hacer hover

## Mejoras Futuras (Opcional)

- Diferentes tonos para diferentes tipos de notificaciones
- Control de volumen deslizable
- Selección de sonidos predefinidos
- Modo "No molestar" con horario programado
- Integración con la Notification API del navegador






