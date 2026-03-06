import { supabase } from '@/integrations/supabase/client';

// Almacenamiento en memoria para rate limiting (en producción usar Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class AntiScrapingService {
  private static instance: AntiScrapingService;
  private rateLimitConfig: RateLimitConfig = {
    maxRequests: 50, // Máximo 50 requests por ventana
    windowMs: 60000, // Ventana de 1 minuto
  };

  static getInstance(): AntiScrapingService {
    if (!AntiScrapingService.instance) {
      AntiScrapingService.instance = new AntiScrapingService();
    }
    return AntiScrapingService.instance;
  }

  // Obtener IP del cliente (simulado para frontend)
  private getClientIP(): string {
    // En un entorno real, esto vendría del servidor
    // Por ahora, usamos una combinación de user agent y timestamp
    return `${navigator.userAgent}-${Date.now()}`;
  }

  // Verificar rate limiting
  async checkRateLimit(): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const clientIP = this.getClientIP();
    const now = Date.now();
    
    const current = rateLimitStore.get(clientIP);
    
    if (!current || now > current.resetTime) {
      // Resetear contador
      rateLimitStore.set(clientIP, {
        count: 1,
        resetTime: now + this.rateLimitConfig.windowMs,
      });
      return {
        allowed: true,
        remaining: this.rateLimitConfig.maxRequests - 1,
        resetTime: now + this.rateLimitConfig.windowMs,
      };
    }

    if (current.count >= this.rateLimitConfig.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: current.resetTime,
      };
    }

    // Incrementar contador
    current.count++;
    rateLimitStore.set(clientIP, current);

    return {
      allowed: true,
      remaining: this.rateLimitConfig.maxRequests - current.count,
      resetTime: current.resetTime,
    };
  }

  // Detectar bots basado en headers y comportamiento
  detectBot(headers: Record<string, string>): boolean {
    const userAgent = headers['user-agent'] || '';
    const accept = headers['accept'] || '';
    const acceptLanguage = headers['accept-language'] || '';
    const acceptEncoding = headers['accept-encoding'] || '';

    // Patrones de bots conocidos
    const botPatterns = [
      'bot', 'crawler', 'spider', 'scraper', 'scraping',
      'headless', 'phantom', 'selenium', 'puppeteer',
      'curl', 'wget', 'python', 'requests', 'scrapy',
      'beautifulsoup', 'lxml', 'mechanize', 'webdriver'
    ];

    // Verificar User-Agent
    const isBotByUserAgent = botPatterns.some(pattern => 
      userAgent.toLowerCase().includes(pattern)
    );

    // Verificar headers sospechosos
    const suspiciousHeaders = {
      'accept': !accept.includes('text/html'),
      'accept-language': !acceptLanguage.includes('en'),
      'accept-encoding': !acceptEncoding.includes('gzip'),
    };

    const hasSuspiciousHeaders = Object.values(suspiciousHeaders).some(Boolean);

    return isBotByUserAgent || hasSuspiciousHeaders;
  }

  // Registrar intento de acceso sospechoso
  async logSuspiciousActivity(activity: {
    type: string;
    details: string;
    userAgent?: string;
    ip?: string;
    timestamp?: number;
  }): Promise<void> {
    try {
      // En un entorno real, esto se guardaría en la base de datos
      console.warn('Suspicious activity detected:', activity);
      
      // Opcional: guardar en Supabase para análisis
      // Nota: La tabla security_logs no existe en el esquema actual
      // En un entorno real, se crearía esta tabla o se usaría otra existente
      console.log('Security log entry:', {
        type: activity.type,
        details: activity.details,
        user_agent: activity.userAgent || navigator.userAgent,
        ip_address: activity.ip || this.getClientIP(),
        timestamp: activity.timestamp || Date.now(),
      });
    } catch (error) {
      console.error('Error logging suspicious activity:', error);
    }
  }

  // Generar challenge para verificar que el cliente es legítimo
  generateChallenge(): { challenge: string; expectedResponse: string } {
    const challenge = Math.random().toString(36).substring(2, 8);
    const expectedResponse = this.hashChallenge(challenge);
    
    return { challenge, expectedResponse };
  }

  // Hash simple del challenge (en producción usar algo más seguro)
  private hashChallenge(challenge: string): string {
    let hash = 0;
    for (let i = 0; i < challenge.length; i++) {
      const char = challenge.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Verificar respuesta del challenge
  verifyChallenge(challenge: string, response: string): boolean {
    const expectedResponse = this.hashChallenge(challenge);
    return response === expectedResponse;
  }

  // Obtener datos con protección anti-scraping
  async getProtectedData<T>(
    dataFetcher: () => Promise<T>,
    options: {
      requireChallenge?: boolean;
      obfuscateData?: boolean;
      maxRetries?: number;
    } = {}
  ): Promise<T | null> {
    const {
      requireChallenge = false,
      obfuscateData = false,
      maxRetries = 3
    } = options;

    // Verificar rate limiting
    const rateLimit = await this.checkRateLimit();
    if (!rateLimit.allowed) {
      await this.logSuspiciousActivity({
        type: 'rate_limit_exceeded',
        details: `Rate limit exceeded for IP: ${this.getClientIP()}`,
      });
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    // Detectar bots
    const headers = {
      'user-agent': navigator.userAgent,
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'accept-language': navigator.language,
      'accept-encoding': 'gzip, deflate, br',
    };

    if (this.detectBot(headers)) {
      await this.logSuspiciousActivity({
        type: 'bot_detected',
        details: 'Bot detected by headers analysis',
        userAgent: navigator.userAgent,
      });
      throw new Error('Access denied. Bot detected.');
    }

    // Si se requiere challenge, generarlo
    if (requireChallenge) {
      const { challenge, expectedResponse } = this.generateChallenge();
      // En un entorno real, esto se manejaría con un modal o similar
      console.log('Challenge required:', challenge);
    }

    // Intentar obtener datos con reintentos
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const data = await dataFetcher();
        
        // Aplicar ofuscación si es necesario
        if (obfuscateData && Array.isArray(data)) {
          return this.obfuscateArrayData(data) as T;
        }
        
        return data;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          // Esperar antes del siguiente intento
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('Failed to fetch data after multiple attempts');
  }

  // Obfuscar datos de array
  private obfuscateArrayData<T>(data: T[]): T[] {
    return data.map((item, index) => {
      if (typeof item === 'object' && item !== null) {
        const obfuscated = { ...item };
        
        // Obfuscar campos específicos
        if ('nombre_empresa' in obfuscated) {
          obfuscated.nombre_empresa = this.obfuscateText(obfuscated.nombre_empresa as string);
        }
        if ('description' in obfuscated) {
          obfuscated.description = this.obfuscateText(obfuscated.description as string);
        }
        if ('main_activities' in obfuscated) {
          obfuscated.main_activities = this.obfuscateText(obfuscated.main_activities as string);
        }
        
        // Agregar datos falsos ocasionalmente
        if (index % 5 === 0) {
          (obfuscated as any).fake_field = `fake_data_${index}`;
        }
        
        return obfuscated;
      }
      return item;
    });
  }

  // Obfuscar texto
  private obfuscateText(text: string): string {
    if (!text) return text;
    
    const obfuscationMap: { [key: string]: string } = {
      'a': '&#97;', 'e': '&#101;', 'i': '&#105;', 'o': '&#111;', 'u': '&#117;',
      'A': '&#65;', 'E': '&#69;', 'I': '&#73;', 'O': '&#79;', 'U': '&#85;',
    };

    let obfuscated = text;
    Object.entries(obfuscationMap).forEach(([char, entity]) => {
      obfuscated = obfuscated.replace(new RegExp(char, 'g'), entity);
    });

    return obfuscated;
  }
}

export const antiScrapingService = AntiScrapingService.getInstance(); 