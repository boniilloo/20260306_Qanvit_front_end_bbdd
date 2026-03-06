import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AntiScrapingCaptchaProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const AntiScrapingCaptcha: React.FC<AntiScrapingCaptchaProps> = ({
  onSuccess,
  onCancel,
}) => {
  const [captchaText, setCaptchaText] = useState('');
  const [userInput, setUserInput] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  // Generar CAPTCHA aleatorio
  const generateCaptcha = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaText(result);
    setUserInput('');
    setError('');
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (userInput.toUpperCase() === captchaText) {
      onSuccess();
    } else {
      setError('Código incorrecto. Inténtalo de nuevo.');
      setAttempts(prev => prev + 1);
      
      if (attempts >= 2) {
        generateCaptcha();
        setAttempts(0);
      }
    }
  };

  const handleRefresh = () => {
    generateCaptcha();
    setAttempts(0);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-2">
            <AlertTriangle className="h-8 w-8 text-orange-500 mr-2" />
            <CardTitle>Verificación de Seguridad</CardTitle>
          </div>
          <p className="text-sm text-gray-600">
            Por favor, completa esta verificación para continuar
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-center">
              <div className="bg-gray-100 p-4 rounded-lg mb-4">
                <div className="text-2xl font-mono font-bold tracking-wider text-gray-800">
                  {captchaText}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mb-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Generar nuevo código
              </Button>
            </div>
            
            <div>
              <Input
                type="text"
                placeholder="Ingresa el código de arriba"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="text-center text-lg font-mono tracking-wider"
                maxLength={6}
                autoFocus
              />
              {error && (
                <p className="text-red-500 text-sm mt-2 text-center">{error}</p>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" className="flex-1">
                Verificar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}; 