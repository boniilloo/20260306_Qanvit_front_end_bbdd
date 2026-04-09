/**
 * Utility functions for handling company logos
 */

import React from 'react';

/**
 * Analyzes an image to determine if it's predominantly white/light
 * Uses computer vision only - analyzes ALL image formats
 */
export const analyzeImageBrightness = async (imageUrl: string): Promise<{
  isWhite: boolean;
  averageBrightness: number;
  whitePixelRatio: number;
  method: string;
}> => {
  return new Promise((resolve) => {
    
    // Skip JPG/JPEG formats as requested
    try {
      const clean = imageUrl.split('?')[0].split('#')[0].toLowerCase();
      if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) {
        resolve({ isWhite: false, averageBrightness: 0, whitePixelRatio: 0, method: 'skip-jpg' });
        return;
      }
    } catch {}
    
    const img = new Image();
    // Try without CORS first, then with CORS as fallback
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve({ isWhite: false, averageBrightness: 0, whitePixelRatio: 0, method: 'direct-error' });
          return;
        }
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let totalBrightness = 0;
        let totalPixels = 0;
        
        // Sample pixels (every 4th pixel for performance)
        for (let i = 0; i < data.length; i += 16) { // RGBA = 4 bytes, sample every 4th pixel
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          // Skip transparent pixels
          if (a < 128) continue;
          
          // Calculate brightness (0-255)
          const brightness = (r + g + b) / 3;
          totalBrightness += brightness;
          totalPixels++;
        }
        
        const averageBrightness = totalPixels > 0 ? totalBrightness / totalPixels : 0;
        const isWhite = averageBrightness > 150;
        
        
        resolve({
          isWhite,
          averageBrightness,
          whitePixelRatio: 0, // Not used anymore, simplified to just brightness
          method: 'direct'
        });
        
      } catch (error) {
        resolve({ isWhite: false, averageBrightness: 0, whitePixelRatio: 0, method: 'direct-error' });
      }
    };
    
    img.onerror = (error) => {
      
      // Try via CORS-enabled image proxy as a last resort
      try {
        const proxied = buildProxyUrl(imageUrl);
        const proxyImg = new Image();
        proxyImg.crossOrigin = 'anonymous';
        proxyImg.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve({ isWhite: false, averageBrightness: 0, whitePixelRatio: 0, method: 'proxy-error' });
              return;
            }
            canvas.width = proxyImg.width;
            canvas.height = proxyImg.height;
            ctx.drawImage(proxyImg, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            let totalBrightness = 0;
            let totalPixels = 0;
            for (let i = 0; i < data.length; i += 16) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const a = data[i + 3];
              if (a < 128) continue;
              const brightness = (r + g + b) / 3;
              totalBrightness += brightness;
              totalPixels++;
            }
            const averageBrightness = totalPixels > 0 ? totalBrightness / totalPixels : 0;
            const isWhite = averageBrightness > 150;
            resolve({ isWhite, averageBrightness, whitePixelRatio: 0, method: 'proxy' });
          } catch (e) {
            resolve({ isWhite: false, averageBrightness: 0, whitePixelRatio: 0, method: 'proxy-error' });
          }
        };
        proxyImg.onerror = (err) => {
          resolve({ isWhite: false, averageBrightness: 0, whitePixelRatio: 0, method: 'proxy-error' });
        };
        proxyImg.src = proxied;
      } catch (e) {
        resolve({ isWhite: false, averageBrightness: 0, whitePixelRatio: 0, method: 'proxy-error' });
      }
    };
    
    img.src = imageUrl;
  });
};

/**
 * Build a CORS-enabled proxy URL for a given image URL.
 * Uses images.weserv.nl which sends permissive CORS headers.
 */
function buildProxyUrl(originalUrl: string): string {
  // images.weserv.nl expects the URL without protocol by default
  const stripped = originalUrl.replace(/^https?:\/\//i, '');
  // Encode fully to be safe, request PNG output for consistent canvas behavior
  const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&output=png`;
  return proxied;
}

/**
 * Generate favicon URL from a website URL
 */
export const getFaviconUrl = (websiteUrl: string | null | undefined): string | null => {
  if (!websiteUrl) return null;
  
  try {
    const trimmed = websiteUrl.trim();
    if (!trimmed) return null;

    // Accept "example.com" and "//example.com" formats by normalizing to https://
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      const normalized = trimmed.replace(/^\/\//, "");
      url = new URL(`https://${normalized}`);
    }

    // Use Google's favicon service as it's reliable and CORS-friendly
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch (error) {
    return null;
  }
};


/**
 * Hook for React components to use advanced logo detection
 * Returns a state that updates when analysis is complete
 */
export const useLogoAnalysis = (logoUrl: string | null | undefined, isSupplierRoute: boolean = false) => {
  const [needsDarkBg, setNeedsDarkBg] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [analysisData, setAnalysisData] = React.useState<{
    averageBrightness: number;
    whitePixelRatio: number;
    reason: string;
    method: string;
  } | null>(null);
  
  React.useEffect(() => {
    if (!logoUrl || !isSupplierRoute) {
      setNeedsDarkBg(false);
      setAnalysisData(null);
      return;
    }
    
    setIsAnalyzing(true);
    
    // Use computer vision analysis for ALL images (no format restriction)
    analyzeImageBrightness(logoUrl)
      .then(analysis => {
        let reason = '';
        let method = 'computer-vision';
        
        if (analysis.averageBrightness > 0 && analysis.method !== 'skip-jpg') {
          // Use brightness threshold only
          const isWhite = analysis.averageBrightness > 150;
          method = 'computer-vision';
          reason = isWhite ? `Brillo alto: ${analysis.averageBrightness.toFixed(1)} > 150` : `Brillo bajo: ${analysis.averageBrightness.toFixed(1)} âÿ¤ 150`;
          
          setNeedsDarkBg(isWhite);
        } else if (analysis.method === 'skip-jpg') {
          method = 'skipped';
          reason = 'Imagen JPG/JPEG: anÃ¡lisis desactivado';
          setNeedsDarkBg(false);
        } else {
          // Analysis failed
          method = 'error';
          reason = 'AnÃ¡lisis fallÃ³ - CORS bloquea el anÃ¡lisis';
          setNeedsDarkBg(false);
        }
        
        setAnalysisData({
          averageBrightness: analysis.averageBrightness,
          whitePixelRatio: analysis.whitePixelRatio,
          reason,
          method
        });
        
        setIsAnalyzing(false);
      })
      .catch((error) => {
        setNeedsDarkBg(false);
        setAnalysisData({
          averageBrightness: 0,
          whitePixelRatio: 0,
          reason: 'Error en anÃ¡lisis de imagen',
          method: 'error'
        });
        setIsAnalyzing(false);
      });
  }, [logoUrl, isSupplierRoute]);
  
  return { needsDarkBg, isAnalyzing, analysisData };
};

/**
 * Enhanced logo analysis hook with favicon fallback
 */
export const useLogoWithFavicon = (
  logoUrl: string | null | undefined, 
  websiteUrl: string | null | undefined,
  isSupplierRoute: boolean = false
) => {
  const [finalLogoUrl, setFinalLogoUrl] = React.useState<string | null>(logoUrl);
  const [isLoadingFavicon, setIsLoadingFavicon] = React.useState(false);
  const [logoError, setLogoError] = React.useState(false);
  
  const { needsDarkBg, isAnalyzing, analysisData } = useLogoAnalysis(finalLogoUrl, isSupplierRoute);
  
  React.useEffect(() => {
    // Reset state when supplier identity changes (logo and/or website).
    // Without websiteUrl here, two suppliers with null logoUrl could share stale favicon state.
    setFinalLogoUrl(logoUrl ?? null);
    setLogoError(false);
    setIsLoadingFavicon(false);
  }, [logoUrl, websiteUrl, isSupplierRoute]);
  
  // Test if the current logo URL is working, or use favicon if no logo
  React.useEffect(() => {
    if (!isSupplierRoute) return;
    let cancelled = false;
    
    // If no logo URL, try favicon directly
    if (!finalLogoUrl && websiteUrl) {
      setIsLoadingFavicon(true);
      const faviconUrl = getFaviconUrl(websiteUrl);
      if (faviconUrl) {
        if (cancelled) return;
        setFinalLogoUrl(faviconUrl);
        setLogoError(true); // Mark as using favicon
      }
      setIsLoadingFavicon(false);
      return () => {
        cancelled = true;
      };
    }
    
    // If we have a logo URL, test if it works
    if (!finalLogoUrl) {
      return () => {
        cancelled = true;
      };
    }
    
    const testImage = new Image();
    testImage.onload = () => {
      if (cancelled) return;
      // Logo is working, no need for favicon
      setLogoError(false);
    };
    testImage.onerror = () => {
      if (cancelled) return;
      // Logo failed to load, try favicon
      setLogoError(true);
      
      if (websiteUrl) {
        setIsLoadingFavicon(true);
        const faviconUrl = getFaviconUrl(websiteUrl);
        if (faviconUrl) {
          if (cancelled) return;
          setFinalLogoUrl(faviconUrl);
        }
        setIsLoadingFavicon(false);
      }
    };
    testImage.src = finalLogoUrl;
    return () => {
      cancelled = true;
    };
  }, [finalLogoUrl, websiteUrl, isSupplierRoute]);
  
  return { 
    needsDarkBg, 
    isAnalyzing: isAnalyzing || isLoadingFavicon, 
    analysisData,
    finalLogoUrl,
    isUsingFavicon: logoError && websiteUrl
  };
};
