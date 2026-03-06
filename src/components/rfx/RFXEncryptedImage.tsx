import React, { useState, useEffect } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { decryptImage } from '@/utils/rfxChatFileUtils';

interface RFXEncryptedImageProps {
  encryptedUrl: string;
  filename: string;
  decryptFile: (encryptedBuffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
  alt?: string;
  className?: string;
  onError?: () => void;
}

const RFXEncryptedImage: React.FC<RFXEncryptedImageProps> = ({
  encryptedUrl,
  filename,
  decryptFile,
  alt = 'Image',
  className = 'max-w-sm rounded-lg',
  onError,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Track the last created blob URL to always revoke the correct one on unmount / change
    let createdObjectUrl: string | null = null;

    const load = async () => {
      // Si no termina en .enc, no es una imagen cifrada
      if (!encryptedUrl.endsWith('.enc')) {
        if (mounted) {
          setBlobUrl(encryptedUrl);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError(false);

        // Descifrar imagen
        const decryptedUrl = await decryptImage(encryptedUrl, decryptFile);
        createdObjectUrl = decryptedUrl;

        if (mounted) {
          setBlobUrl(decryptedUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error('🔐 [RFXEncryptedImage] Error decrypting image:', err);
        if (mounted) {
          setError(true);
          setLoading(false);
          onError?.();
        }
      }
    };

    load();

    // Cleanup: revoke blob URL when component unmounts
    return () => {
      mounted = false;
      const urlToRevoke = createdObjectUrl;
      if (urlToRevoke && urlToRevoke.startsWith('blob:')) URL.revokeObjectURL(urlToRevoke);
    };
  }, [encryptedUrl, decryptFile, onError]);

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-100 border rounded-lg p-4`}>
        <div className="flex flex-col items-center gap-2 text-gray-600">
          <Loader2 className="h-6 w-6 animate-spin" />
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3 w-3 text-green-600" />
            <span>Decrypting image...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-red-50 border border-red-200 rounded-lg p-4`}>
        <div className="text-center">
          <p className="text-sm text-red-600 font-medium">Failed to decrypt image</p>
          <p className="text-xs text-red-500 mt-1">{filename}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <img
        src={blobUrl}
        alt={alt || filename}
        className={className}
        loading="lazy"
      />
      {/* Encrypted badge */}
      <div className="absolute top-2 left-2 bg-green-600/90 backdrop-blur-sm text-white text-xs px-2 py-1 rounded flex items-center gap-1.5 shadow-sm">
        <Shield className="h-3 w-3" />
        <span>Encrypted</span>
      </div>
    </div>
  );
};

export default RFXEncryptedImage;

