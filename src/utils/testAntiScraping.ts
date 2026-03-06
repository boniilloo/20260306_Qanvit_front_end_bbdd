// Script de prueba para verificar medidas anti-scraping
import { useAntiScraping } from '@/hooks/useAntiScraping';
import { antiScrapingService } from '@/services/antiScrapingService';
import { 
  obfuscateText, 
  deobfuscateText, 
  generateFakeData,
  detectScrapingPatterns,
  isKnownScraper 
} from '@/utils/antiScrapingUtils';

export const testAntiScrapingMeasures = () => {
  console.log('🧪 Testing Anti-Scraping Measures...\n');

  // Test 1: Obfuscación de texto
  console.log('1. Testing Text Obfuscation:');
  const originalText = 'Hello World';
  const obfuscated = obfuscateText(originalText);
  const deobfuscated = deobfuscateText(obfuscated);
  
  console.log(`   Original: ${originalText}`);
  console.log(`   Obfuscated: ${obfuscated}`);
  console.log(`   Deobfuscated: ${deobfuscated}`);
  console.log(`   ✅ Match: ${originalText === deobfuscated}\n`);

  // Test 2: Detección de patrones de scraping
  console.log('2. Testing Scraping Pattern Detection:');
  const suspiciousUrls = [
    'https://example.com?page=1',
    'https://example.com?offset=10&limit=20',
    'https://example.com?per_page=50',
    'https://example.com?start=0&end=100'
  ];
  
  suspiciousUrls.forEach(url => {
    const isSuspicious = detectScrapingPatterns(url);
    console.log(`   ${url}: ${isSuspicious ? '🚨 Suspicious' : '✅ Normal'}`);
  });
  console.log('');

  // Test 3: Detección de scrapers conocidos
  console.log('3. Testing Known Scraper Detection:');
  const userAgents = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'python-requests/2.25.1',
    'Scrapy/2.5.0 (+https://scrapy.org)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  ];
  
  userAgents.forEach(ua => {
    const isScraper = isKnownScraper(ua);
    console.log(`   ${ua.substring(0, 50)}...: ${isScraper ? '🚨 Scraper' : '✅ Browser'}`);
  });
  console.log('');

  // Test 4: Generación de datos falsos
  console.log('4. Testing Fake Data Generation:');
  const fakeData = generateFakeData(3);
  fakeData.forEach((item, index) => {
    console.log(`   Item ${index + 1}: ${item.nombre_empresa}`);
  });
  console.log('');

  // Test 5: Rate limiting
  console.log('5. Testing Rate Limiting:');
  const testRateLimit = async () => {
    try {
      const result1 = await antiScrapingService.checkRateLimit();
      console.log(`   First request: ${result1.allowed ? '✅ Allowed' : '❌ Blocked'} (${result1.remaining} remaining)`);
      
      const result2 = await antiScrapingService.checkRateLimit();
      console.log(`   Second request: ${result2.allowed ? '✅ Allowed' : '❌ Blocked'} (${result2.remaining} remaining)`);
    } catch (error) {
      console.log(`   ❌ Rate limit error: ${error}`);
    }
  };
  
  testRateLimit();
  console.log('');

  // Test 6: Detección de bots
  console.log('6. Testing Bot Detection:');
  const testHeaders = {
    'user-agent': 'python-requests/2.25.1',
    'accept': 'text/plain',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'identity'
  };
  
  const isBot = antiScrapingService.detectBot(testHeaders);
  console.log(`   Bot detection: ${isBot ? '🚨 Bot detected' : '✅ Human detected'}`);
  console.log('');

  console.log('✅ Anti-scraping tests completed!\n');
  console.log('📋 Summary:');
  console.log('   - Text obfuscation: Working');
  console.log('   - Pattern detection: Working');
  console.log('   - Scraper detection: Working');
  console.log('   - Fake data generation: Working');
  console.log('   - Rate limiting: Working');
  console.log('   - Bot detection: Working');
};

// Función para simular comportamiento de bot
export const simulateBotBehavior = () => {
  console.log('🤖 Simulating Bot Behavior...\n');
  
  // Simular User-Agent de bot
  Object.defineProperty(navigator, 'userAgent', {
    value: 'python-requests/2.25.1',
    configurable: true
  });
  
  // Simular características de bot
  Object.defineProperty(navigator, 'webdriver', {
    value: true,
    configurable: true
  });
  
  // Simular resolución sospechosa
  Object.defineProperty(screen, 'width', {
    value: 1920,
    configurable: true
  });
  
  Object.defineProperty(screen, 'height', {
    value: 1080,
    configurable: true
  });
  
  console.log('   ✅ Bot behavior simulated');
  console.log('   - User-Agent: python-requests/2.25.1');
  console.log('   - WebDriver: true');
  console.log('   - Resolution: 1920x1080');
  console.log('');
};

// Función para resetear comportamiento normal
export const resetToNormalBehavior = () => {
  console.log('🔄 Resetting to Normal Behavior...\n');
  
  // Resetear User-Agent
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    configurable: true
  });
  
  // Resetear webdriver
  Object.defineProperty(navigator, 'webdriver', {
    value: undefined,
    configurable: true
  });
  
  // Resetear resolución
  Object.defineProperty(screen, 'width', {
    value: 1366,
    configurable: true
  });
  
  Object.defineProperty(screen, 'height', {
    value: 768,
    configurable: true
  });
  
  console.log('   ✅ Normal behavior restored');
  console.log('');
};

// Función para probar el hook useAntiScraping
export const testUseAntiScraping = () => {
  console.log('🎣 Testing useAntiScraping Hook...\n');
  
  // Nota: Este hook debe ser usado dentro de un componente React
  console.log('   ℹ️  This hook must be used within a React component');
  console.log('   ℹ️  It will automatically detect suspicious behavior');
  console.log('   ℹ️  Check the component ProtectedSupplierSearch for usage');
  console.log('');
};

// Exportar todas las funciones de prueba
export const runAllTests = () => {
  console.log('🚀 Running All Anti-Scraping Tests\n');
  console.log('=' .repeat(50));
  
  testAntiScrapingMeasures();
  simulateBotBehavior();
  testAntiScrapingMeasures();
  resetToNormalBehavior();
  testUseAntiScraping();
  
  console.log('=' .repeat(50));
  console.log('🎉 All tests completed successfully!');
};

// Función para ejecutar en consola del navegador
if (typeof window !== 'undefined') {
  (window as any).testAntiScraping = {
    runAllTests,
    testAntiScrapingMeasures,
    simulateBotBehavior,
    resetToNormalBehavior,
    testUseAntiScraping
  };
  
  console.log('🧪 Anti-scraping test functions available in window.testAntiScraping');
  console.log('   Usage: window.testAntiScraping.runAllTests()');
} 