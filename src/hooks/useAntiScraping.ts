import { useState, useEffect, useCallback } from 'react';

interface AntiScrapingState {
  isSuspicious: boolean;
  showCaptcha: boolean;
  requestCount: number;
  lastRequestTime: number;
}

const ANTI_SCRAPING_VERIFIED_KEY = 'antiScrapingVerified';

export const useAntiScraping = () => {
  const [state, setState] = useState<AntiScrapingState>({
    isSuspicious: false,
    showCaptcha: false,
    requestCount: 0,
    lastRequestTime: Date.now(),
  });

  // Detectar características de bots
  const detectBot = useCallback(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const botPatterns = [
      'bot', 'crawler', 'spider', 'scraper', 'scraping',
      'headless', 'phantom', 'selenium', 'puppeteer',
      'curl', 'wget', 'python', 'requests', 'scrapy',
      'beautifulsoup', 'lxml', 'mechanize'
    ];

    // Verificar User-Agent
    const isBotByUserAgent = botPatterns.some(pattern => userAgent.includes(pattern));
    
    // Verificar características del navegador
    const hasWebDriver = 'webdriver' in navigator;
    const hasChrome = 'chrome' in window;
    const hasPlugins = navigator.plugins.length === 0;
    const hasLanguages = navigator.languages.length === 0;
    const hasCookies = navigator.cookieEnabled === false;
    
    // Verificar resolución de pantalla (bots suelen usar resoluciones específicas)
    const screenSize = `${screen.width}x${screen.height}`;
    const suspiciousResolutions = ['1920x1080', '1366x768', '1024x768', '800x600'];
    const isSuspiciousResolution = suspiciousResolutions.includes(screenSize);

    // Verificar si JavaScript está deshabilitado (indicador de bot)
    const hasJavaScript = typeof window !== 'undefined' && typeof document !== 'undefined';

    return isBotByUserAgent || hasWebDriver || !hasChrome || hasPlugins || hasLanguages || hasCookies || isSuspiciousResolution || !hasJavaScript;
  }, []);

  // Rate limiting
  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    const timeDiff = now - state.lastRequestTime;
    
    // Si han pasado más de 1 minuto, resetear contador
    if (timeDiff > 60000) {
      setState(prev => ({
        ...prev,
        requestCount: 1,
        lastRequestTime: now,
      }));
      return true;
    }

    // Incrementar contador
    const newCount = state.requestCount + 1;
    setState(prev => ({
      ...prev,
      requestCount: newCount,
      lastRequestTime: now,
    }));

    // Si más de 10 requests en 1 minuto, sospechoso
    if (newCount > 10) {
      setState(prev => ({
        ...prev,
        isSuspicious: true,
        showCaptcha: true,
      }));
      localStorage.removeItem(ANTI_SCRAPING_VERIFIED_KEY); // Resetear verificación si hay abuso
      return false;
    }

    return true;
  }, [state.requestCount, state.lastRequestTime]);

  // Verificar comportamiento sospechoso
  const checkSuspiciousBehavior = useCallback(() => {
    // Si ya está verificado, no volver a mostrar captcha
    const verified = localStorage.getItem(ANTI_SCRAPING_VERIFIED_KEY);
    if (verified === 'true') {
      setState(prev => ({
        ...prev,
        isSuspicious: false,
        showCaptcha: false,
      }));
      return true;
    }

    const isBot = detectBot();
    
    if (isBot) {
      setState(prev => ({
        ...prev,
        isSuspicious: true,
        showCaptcha: true,
      }));
      localStorage.removeItem(ANTI_SCRAPING_VERIFIED_KEY); // Resetear verificación si se detecta bot
      return false;
    }

    return checkRateLimit();
  }, [detectBot, checkRateLimit]);

  // Resetear estado después de CAPTCHA exitoso
  const resetAfterCaptcha = useCallback(() => {
    localStorage.setItem(ANTI_SCRAPING_VERIFIED_KEY, 'true');
    setState(prev => ({
      ...prev,
      isSuspicious: false,
      showCaptcha: false,
      requestCount: 0,
    }));
  }, []);

  // Verificar en cada carga de página
  useEffect(() => {
    checkSuspiciousBehavior();
  }, [checkSuspiciousBehavior]);

  return {
    ...state,
    checkSuspiciousBehavior,
    resetAfterCaptcha,
    detectBot,
  };
}; 