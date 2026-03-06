import { useCallback, useEffect, useRef } from 'react';

/**
 * Hook para reproducir un sonido de notificación
 * Usa la Web Audio API para generar un sonido agradable
 */
export const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const isEnabledRef = useRef(true);

  // Inicializar el AudioContext cuando sea necesario
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('[NotificationSound] Error creating AudioContext:', error);
      }
    }
    return audioContextRef.current;
  }, []);

  // Función para reproducir el sonido de notificación
  const playNotificationSound = useCallback(() => {
    if (!isEnabledRef.current) return;

    try {
      const audioContext = initAudioContext();
      if (!audioContext) return;

      // Resume el contexto si está suspendido (requisito de navegadores modernos)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const now = audioContext.currentTime;

      // Crear un oscilador para generar el sonido
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // Configurar los osciladores con frecuencias armónicas
      // Usamos una quinta perfecta (ratio 3:2) para un sonido agradable
      oscillator1.frequency.setValueAtTime(800, now); // Do alto
      oscillator2.frequency.setValueAtTime(1200, now); // Sol muy alto

      // Configurar el envelope del volumen (ataque rápido, decay suave)
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05); // Ataque rápido
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4); // Decay suave

      // Conectar los nodos
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Reproducir el sonido
      oscillator1.start(now);
      oscillator2.start(now);
      
      // Detener después de 0.4 segundos
      oscillator1.stop(now + 0.4);
      oscillator2.stop(now + 0.4);

    } catch (error) {
      console.warn('[NotificationSound] Error playing sound:', error);
    }
  }, [initAudioContext]);

  // Habilitar/deshabilitar el sonido
  const setEnabled = useCallback((enabled: boolean) => {
    isEnabledRef.current = enabled;
  }, []);

  // Limpiar el AudioContext al desmontar
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  // Inicializar el AudioContext en la primera interacción del usuario
  useEffect(() => {
    const handleUserInteraction = () => {
      initAudioContext();
      // Remover los listeners después de la primera interacción
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };

    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);

    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, [initAudioContext]);

  return {
    playNotificationSound,
    setEnabled,
  };
};






