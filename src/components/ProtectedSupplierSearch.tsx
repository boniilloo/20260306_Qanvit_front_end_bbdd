import React, { useState, useEffect } from 'react';
import { useAntiScraping } from '@/hooks/useAntiScraping';
import { AntiScrapingCaptcha } from '@/components/ui/AntiScrapingCaptcha';
import SupplierSearch from '@/pages/SupplierSearch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Shield, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ProtectedSupplierSearch: React.FC = () => {
  const { isSuspicious, showCaptcha, checkSuspiciousBehavior, resetAfterCaptcha } = useAntiScraping();
  const [isVerified, setIsVerified] = useState(false);
  const [showData, setShowData] = useState(false);
  const [obfuscatedData, setObfuscatedData] = useState<string[]>([]);

  // Obfuscar datos para hacer el scraping más difícil
  const obfuscateData = () => {
    const fakeData = [
      'Empresa Ejemplo 1',
      'Empresa Ejemplo 2', 
      'Empresa Ejemplo 3',
      'Empresa Ejemplo 4',
      'Empresa Ejemplo 5',
      'Empresa Ejemplo 6'
    ];
    setObfuscatedData(fakeData);
  };

  useEffect(() => {
    if (isSuspicious && !isVerified) {
      obfuscateData();
    }
  }, [isSuspicious, isVerified]);

  const handleCaptchaSuccess = () => {
    setIsVerified(true);
    resetAfterCaptcha();
  };

  const handleCaptchaCancel = () => {
    // Redirigir a la página principal
    window.location.href = '/';
  };

  // Si es sospechoso y no está verificado, mostrar CAPTCHA
  if (showCaptcha && !isVerified) {
    return <AntiScrapingCaptcha onSuccess={handleCaptchaSuccess} onCancel={handleCaptchaCancel} />;
  }

  // Si es sospechoso pero está verificado, mostrar datos obfuscados
  if (isSuspicious && isVerified) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                <CardTitle>Modo de Seguridad Activo</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Se ha detectado actividad sospechosa. Los datos mostrados están protegidos contra scraping.
              </p>
              <Button
                variant="outline"
                onClick={() => setShowData(!showData)}
                className="flex items-center gap-2"
              >
                {showData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showData ? 'Ocultar' : 'Mostrar'} datos
              </Button>
            </CardContent>
          </Card>

          {showData && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {obfuscatedData.map((item, index) => (
                <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-gray-800">{item}</h3>
                    <p className="text-sm text-gray-600 mt-2">
                      Datos protegidos - Información limitada
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Si no es sospechoso, mostrar la página normal
  return <SupplierSearch />;
};

export default ProtectedSupplierSearch; 