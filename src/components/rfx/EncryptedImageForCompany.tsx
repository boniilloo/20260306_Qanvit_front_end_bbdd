import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { userCrypto } from '@/lib/userCrypto';

interface EncryptedImageForCompanyProps {
  src: string;
  decryptFile: ((encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>) | null;
  isEncrypted: boolean;
  alt?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * Componente para mostrar imágenes encriptadas para miembros de empresa
 * Descarga la imagen encriptada, la desencripta usando la clave de la empresa, y la muestra
 */
export const EncryptedImageForCompany: React.FC<EncryptedImageForCompanyProps> = ({ 
  src, 
  decryptFile, 
  isEncrypted, 
  alt = "Image",
  className = "w-full h-full object-cover",
  onClick
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // Track the last created blob URL to always revoke the correct one on unmount / change
    let createdObjectUrl: string | null = null;

    const load = async () => {
      // Si no es una imagen encriptada (no termina en .enc) o no hay función de descifrado, usar src directo
      if (!isEncrypted || !src.endsWith('.enc') || !decryptFile) {
        if (mounted) {
          setObjectUrl(src);
          setLoading(false);
        }
        return;
      }

      try {
        // Descargar el blob cifrado
        console.log('🔐 [EncryptedImageForCompany] Fetching encrypted image:', src);
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }
        const encryptedBuffer = await response.arrayBuffer();
        console.log('🔐 [EncryptedImageForCompany] Fetched buffer size:', encryptedBuffer.byteLength);

        // Extraer IV (primeros 12 bytes) y Datos
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);

        // Convertir IV a base64
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        console.log('🔐 [EncryptedImageForCompany] IV extracted');

        // Descifrar
        console.log('🔐 [EncryptedImageForCompany] Decrypting...');
        const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
        console.log('🔐 [EncryptedImageForCompany] Decrypted buffer size:', decryptedBuffer?.byteLength);
        
        if (mounted && decryptedBuffer) {
          // Detectar tipo MIME basado en extensión original
          const originalExt = src.split('/').pop()?.split('?')[0].replace('.enc', '').split('.').pop()?.toLowerCase() || 'jpg';
          let mimeType = 'image/jpeg';
          
          if (originalExt === 'png') mimeType = 'image/png';
          else if (originalExt === 'webp') mimeType = 'image/webp';
          else if (originalExt === 'gif') mimeType = 'image/gif';
          else if (originalExt === 'svg') mimeType = 'image/svg+xml';
          
          console.log('🔐 [EncryptedImageForCompany] Creating blob with MIME type:', mimeType);

          // Crear blob y URL
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          const url = URL.createObjectURL(blob);
          createdObjectUrl = url;
          setObjectUrl(url);
          setLoading(false);
        } else if (mounted && !decryptedBuffer) {
          throw new Error('Failed to decrypt image');
        }
      } catch (e: any) {
        console.error('🔐 [EncryptedImageForCompany] Error decrypting image:', e);
        if (mounted) {
          setError(e.message || 'Failed to decrypt image');
          setLoading(false);
          // Fallback: intentar mostrar como imagen normal
          setObjectUrl(src);
        }
      }
    };

    load();

    return () => {
      mounted = false;
      const urlToRevoke = createdObjectUrl;
      if (urlToRevoke && urlToRevoke !== src && urlToRevoke.startsWith('blob:')) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [src, decryptFile, isEncrypted]);

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-100`}>
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !objectUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-100 text-gray-500 text-sm`}>
        Error loading image
      </div>
    );
  }

  return (
    <img 
      src={objectUrl || src} 
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => {
        console.error('🔐 [EncryptedImageForCompany] Image failed to load');
        setError('Failed to load image');
      }}
    />
  );
};








