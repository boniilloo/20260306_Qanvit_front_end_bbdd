import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useLogoWithFavicon } from '@/utils/logoUtils';

interface ProgressiveSmartLogoProps {
  logoUrl?: string | null;
  websiteUrl?: string | null;
  companyName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showDebugInfo?: boolean;
  onClick?: () => void;
  isSupplierRoute?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-20 h-20 text-xl'
};

const iconSizes = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10'
};

// CSS para el placeholder shimmer
const placeholderStyles = `
  @keyframes shimmer {
    0% {
      background-position: -200px 0;
    }
    100% {
      background-position: calc(200px + 100%) 0;
    }
  }
  
  .logo-placeholder {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200px 100%;
    animation: shimmer 1.5s infinite;
  }
`;

export const ProgressiveSmartLogo: React.FC<ProgressiveSmartLogoProps> = ({
  logoUrl,
  websiteUrl,
  companyName,
  size = 'md',
  className = '',
  showDebugInfo = false,
  onClick,
  isSupplierRoute = false
}) => {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  
  // Solo analizar logos si es necesario (no para favicons)
  const shouldAnalyze = logoUrl && !logoUrl.includes('favicon') && !logoUrl.includes('google.com/s2/favicons');
  
  const { needsDarkBg, isAnalyzing, analysisData, finalLogoUrl, isUsingFavicon } = useLogoWithFavicon(
    shouldAnalyze ? logoUrl : null, 
    websiteUrl, 
    isSupplierRoute
  );

  // Agregar estilos CSS
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = placeholderStyles;
    document.head.appendChild(style);
    
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Manejar la carga de la imagen
  useEffect(() => {
    if (!finalLogoUrl) {
      setIsImageLoaded(false);
      setImageError(false);
      setCurrentImageUrl(null);
      return;
    }

    // Resetear estados
    setIsImageLoaded(false);
    setImageError(false);
    setCurrentImageUrl(finalLogoUrl);

    // Crear una nueva imagen para probar la carga
    const img = new Image();
    
    img.onload = () => {
      setIsImageLoaded(true);
      setImageError(false);
    };
    
    img.onerror = () => {
      setImageError(true);
      setIsImageLoaded(false);
    };
    
    img.src = finalLogoUrl;
  }, [finalLogoUrl]);

  const getContainerClasses = () => {
    const baseClasses = `${sizeClasses[size]} flex items-center justify-center font-bold shadow-lg overflow-hidden border ${className}`;
    
    if (isAnalyzing || !isImageLoaded) {
      return `${baseClasses} bg-gray-100 border-gray-200`;
    }
    
    if (needsDarkBg) {
      return `${baseClasses} bg-black border-gray-300`;
    }
    
    return `${baseClasses} bg-white border-gray-200`;
  };

  const getFallbackClasses = () => {
    const baseClasses = `${sizeClasses[size]} flex items-center justify-center font-bold shadow-lg overflow-hidden bg-gradient-to-br from-navy to-sky rounded-2xl text-white ${className}`;
    return baseClasses;
  };

  return (
    <div className="relative">
      <div 
        className={currentImageUrl ? getContainerClasses() : getFallbackClasses()}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        {/* Mostrar placeholder mientras carga o analiza */}
        {(!isImageLoaded || isAnalyzing) && currentImageUrl && (
          <div className={`w-full h-full logo-placeholder rounded-lg`} />
        )}
        
        {/* Mostrar imagen cuando esté lista */}
        {isImageLoaded && currentImageUrl && (
          <img 
            src={currentImageUrl} 
            alt={companyName}
            className="w-full h-full object-contain"
            style={{
              opacity: isImageLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out'
            }}
          />
        )}
        
        {/* Fallback cuando no hay imagen */}
        {!currentImageUrl && (
          <Globe className={`${iconSizes[size]} text-white`} />
        )}
      </div>

      {/* Debug Info - Development Only */}
      {showDebugInfo && process.env.NODE_ENV === 'development' && (
        <div style={{
          fontSize: '8px',
          color: '#666',
          marginTop: '4px',
          padding: '4px',
          backgroundColor: '#f9fafb',
          borderRadius: '4px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{fontWeight: 'bold', marginBottom: '2px'}}>
            🔍 Logo: {isAnalyzing ? 'Analyzing...' : isImageLoaded ? (needsDarkBg ? '🖤 Dark' : '⚪ Light') : '⏳ Loading'}
          </div>
          
          {analysisData && !isAnalyzing && (
            <div style={{fontSize: '7px', lineHeight: '1.2'}}>
              <div><strong>Método:</strong> {
                analysisData.method === 'computer-vision' 
                  ? '🎯 Visión' 
                  : analysisData.method === 'error'
                  ? '❌ Error'
                  : '⚠️ ' + analysisData.method
              }</div>
              <div><strong>Brillo:</strong> {analysisData.averageBrightness.toFixed(1)}/255</div>
              <div><strong>Razón:</strong> {analysisData.reason}</div>
            </div>
          )}
          
          {currentImageUrl && (
            <div style={{marginTop: '2px', fontSize: '6px', color: '#9ca3af'}}>
              <strong>URL:</strong> {currentImageUrl.substring(0, 30)}...
              {isUsingFavicon && <div style={{color: '#f59e0b'}}><strong>🔄 Favicon</strong></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgressiveSmartLogo;
