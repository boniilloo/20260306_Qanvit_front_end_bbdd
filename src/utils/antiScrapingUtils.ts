// Utilidades para protección contra scraping

// Obfuscar texto para hacer el scraping más difícil
export const obfuscateText = (text: string): string => {
  if (!text) return text;
  
  // Reemplazar caracteres con entidades HTML similares
  const obfuscationMap: { [key: string]: string } = {
    'a': '&#97;',
    'e': '&#101;',
    'i': '&#105;',
    'o': '&#111;',
    'u': '&#117;',
    'A': '&#65;',
    'E': '&#69;',
    'I': '&#73;',
    'O': '&#79;',
    'U': '&#85;',
  };

  let obfuscated = text;
  Object.entries(obfuscationMap).forEach(([char, entity]) => {
    obfuscated = obfuscated.replace(new RegExp(char, 'g'), entity);
  });

  return obfuscated;
};

// Desobfuscar texto para mostrar correctamente
export const deobfuscateText = (text: string): string => {
  if (!text) return text;
  
  const deobfuscationMap: { [key: string]: string } = {
    '&#97;': 'a',
    '&#101;': 'e',
    '&#105;': 'i',
    '&#111;': 'o',
    '&#117;': 'u',
    '&#65;': 'A',
    '&#69;': 'E',
    '&#73;': 'I',
    '&#79;': 'O',
    '&#85;': 'U',
  };

  let deobfuscated = text;
  Object.entries(deobfuscationMap).forEach(([entity, char]) => {
    deobfuscated = deobfuscated.replace(new RegExp(entity, 'g'), char);
  });

  return deobfuscated;
};

// Generar datos falsos para confundir scrapers
export const generateFakeData = (count: number = 10) => {
  const fakeCompanies = [
    'TechCorp Solutions',
    'Global Manufacturing Inc',
    'Innovation Labs Ltd',
    'Precision Engineering Co',
    'Advanced Systems Group',
    'Quality Products International',
    'Smart Technologies LLC',
    'Elite Manufacturing Partners',
    'Future Industries Corp',
    'Premium Solutions Network'
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `fake-${i + 1}`,
    nombre_empresa: fakeCompanies[i % fakeCompanies.length],
    description: 'Información protegida - Acceso limitado',
    countries: 'Ubicación no disponible',
    cities: [],
    sectors: 'Sector no especificado',
    website: null,
    main_activities: 'Actividades no disponibles',
    strengths: 'Información confidencial'
  }));
};

// Detectar patrones de scraping en URLs
export const detectScrapingPatterns = (url: string): boolean => {
  const suspiciousPatterns = [
    /page=\d+/,
    /offset=\d+/,
    /limit=\d+/,
    /per_page=\d+/,
    /items_per_page=\d+/,
    /start=\d+/,
    /end=\d+/,
    /from=\d+/,
    /to=\d+/,
    /batch=\d+/,
    /chunk=\d+/,
    /segment=\d+/
  ];

  return suspiciousPatterns.some(pattern => pattern.test(url));
};

// Verificar si la petición viene de un scraper conocido
export const isKnownScraper = (userAgent: string): boolean => {
  const knownScrapers = [
    'scrapy',
    'beautifulsoup',
    'selenium',
    'puppeteer',
    'playwright',
    'headless',
    'phantomjs',
    'casperjs',
    'nightmare',
    'cypress',
    'webdriver',
    'chromedriver',
    'geckodriver',
    'safaridriver',
    'edgedriver'
  ];

  const lowerUserAgent = userAgent.toLowerCase();
  return knownScrapers.some(scraper => lowerUserAgent.includes(scraper));
};

// Generar token de sesión único para verificar legitimidad
export const generateSessionToken = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `${timestamp}-${random}`;
};

// Verificar si el token de sesión es válido
export const validateSessionToken = (token: string): boolean => {
  if (!token) return false;
  
  const parts = token.split('-');
  if (parts.length !== 2) return false;
  
  const timestamp = parseInt(parts[0]);
  const now = Date.now();
  
  // Token válido por 1 hora
  return (now - timestamp) < 3600000;
};

// Detectar comportamiento de navegación sospechoso
export const detectSuspiciousBehavior = (): boolean => {
  // Verificar si el usuario está navegando muy rápido
  const navigationHistory = window.performance.getEntriesByType('navigation');
  if (navigationHistory.length > 0) {
    const lastNavigation = navigationHistory[navigationHistory.length - 1] as PerformanceNavigationTiming;
    const loadTime = lastNavigation.loadEventEnd - lastNavigation.loadEventStart;
    
    // Si la página carga muy rápido (menos de 100ms), podría ser un bot
    if (loadTime < 100) return true;
  }

  // Verificar si el usuario está haciendo clics muy rápidos
  let clickCount = 0;
  let lastClickTime = 0;
  
  document.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastClickTime < 50) { // Clics muy rápidos
      clickCount++;
      if (clickCount > 5) return true;
    }
    lastClickTime = now;
  });

  return false;
};

// Obfuscar datos de proveedores para hacer el scraping más difícil
export const obfuscateSupplierData = (suppliers: any[]): any[] => {
  return suppliers.map((supplier, index) => ({
    ...supplier,
    nombre_empresa: index % 3 === 0 ? obfuscateText(supplier.nombre_empresa) : supplier.nombre_empresa,
    description: index % 2 === 0 ? obfuscateText(supplier.description || '') : supplier.description,
    main_activities: index % 4 === 0 ? obfuscateText(supplier.main_activities || '') : supplier.main_activities,
    // Agregar datos falsos ocasionalmente
    ...(index % 5 === 0 && {
      fake_field: `fake_data_${index}`,
      obfuscated: true
    })
  }));
}; 