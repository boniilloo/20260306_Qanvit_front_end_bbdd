import React from 'react';
import { Globe } from 'lucide-react';
import { useLogoWithFavicon } from '@/utils/logoUtils';

interface SmartLogoProps {
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

export const SmartLogo: React.FC<SmartLogoProps> = ({
  logoUrl,
  websiteUrl,
  companyName,
  size = 'md',
  className = '',
  showDebugInfo = false,
  onClick,
  isSupplierRoute = false
}) => {
  const { needsDarkBg, isAnalyzing, analysisData, finalLogoUrl, isUsingFavicon } = useLogoWithFavicon(
    logoUrl, 
    websiteUrl, 
    isSupplierRoute
  );

  const getContainerClasses = () => {
    const baseClasses = `${sizeClasses[size]} flex items-center justify-center font-bold shadow-lg overflow-hidden border ${className}`;
    
    if (isAnalyzing) {
      return `${baseClasses} bg-blue-50 opacity-70 animate-pulse`;
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
        className={finalLogoUrl ? getContainerClasses() : getFallbackClasses()}
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        {finalLogoUrl ? (
          <img 
            src={finalLogoUrl} 
            alt={companyName}
            className="w-full h-full object-contain"
          />
        ) : (
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
            🔍 Logo: {isAnalyzing ? 'Analyzing...' : needsDarkBg ? '🖤 Dark' : '⚪ Light'}
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
          
          {finalLogoUrl && (
            <div style={{marginTop: '2px', fontSize: '6px', color: '#9ca3af'}}>
              <strong>URL:</strong> {finalLogoUrl.substring(0, 30)}...
              {isUsingFavicon && <div style={{color: '#f59e0b'}}><strong>🔄 Favicon</strong></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartLogo;
