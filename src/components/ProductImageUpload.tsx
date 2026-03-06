import React, { useState, useEffect } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { userCrypto } from '@/lib/userCrypto';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';

// Componente para mostrar imágenes descifradas
const EncryptedImage = ({
  src,
  decryptFile,
  isEncrypted,
  className = 'w-full h-full object-cover',
}: {
  src: string;
  decryptFile: any;
  isEncrypted: boolean;
  className?: string;
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Track the last created blob URL to always revoke the correct one on unmount / change
    let createdObjectUrl: string | null = null;

    const load = async () => {
      console.log('🔍 [EncryptedImage] Load triggered. isEncrypted:', isEncrypted, 'src:', src, 'decryptFile exists:', !!decryptFile);
      
      // Si no es una imagen encriptada (no termina en .enc) o no hay función de descifrado, usar src directo
      if (!isEncrypted || !src.endsWith('.enc') || !decryptFile) {
        console.log('🔍 [EncryptedImage] Using direct src');
        setObjectUrl(src);
        return;
      }

      try {
        // Descargar el blob cifrado
        console.log('🔐 [EncryptedImage] Fetching encrypted image:', src);
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        const encryptedBuffer = await response.arrayBuffer();
        console.log('🔐 [EncryptedImage] Fetched buffer size:', encryptedBuffer.byteLength);

        // Extraer IV (primeros 12 bytes) y Datos
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);

        // Convertir IV a base64
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        console.log('🔐 [EncryptedImage] IV extracted:', ivBase64);

        // Descifrar
        console.log('🔐 [EncryptedImage] Decrypting...');
        const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
        console.log('🔐 [EncryptedImage] Decrypted buffer size:', decryptedBuffer?.byteLength);
        
        if (mounted) {
          // Detectar tipo MIME basado en extensión original
          const originalExt = src.split('/').pop()?.split('?')[0].replace('.enc', '').split('.').pop()?.toLowerCase() || 'jpg';
          let mimeType = 'image/jpeg';
          
          if (originalExt === 'png') mimeType = 'image/png';
          else if (originalExt === 'webp') mimeType = 'image/webp';
          else if (originalExt === 'gif') mimeType = 'image/gif';
          else if (originalExt === 'svg') mimeType = 'image/svg+xml';
          
          console.log('🔐 [EncryptedImage] Creating blob with MIME type:', mimeType);

          // Crear blob y URL
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          const url = URL.createObjectURL(blob);
          createdObjectUrl = url;
          setObjectUrl(url);
        }
      } catch (e) {
        console.error('❌ [EncryptedImage] Failed to decrypt image:', e);
        // If decryption fails, try to show it as a normal image if it's not really encrypted but has .enc
        // This is a fallback for mixed states during dev
        if (mounted) {
            // Try to load as normal image just in case
            setObjectUrl(src);
            // Don't set error yet
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
  }, [src, isEncrypted, decryptFile]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-red-50 text-red-500 text-xs p-2 text-center">
        Decryption Failed
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="animate-pulse w-8 h-8 bg-gray-200 rounded-full"></div>
      </div>
    );
  }

  return (
    <img
      src={objectUrl}
      alt="Product image"
      className={className}
      onError={(e) => {
        e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDMuNkM4LjEgMy42IDggOC4xIDggMjFIMjFWMy42WiIgZmlsbD0iIzNiODJmNiIgZmlsbC1vcGFjaXR5PSIwLjEiLz4KPHBhdGggZD0iTTIxIDMuNkM4LjEgMy42IDggOC4xIDggMjFIMjFWMy42WiIgc3Ryb2tlPSIjM2I4MmY2IiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+';
      }}
    />
  );
};

interface ProductImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  productId?: string;
  maxImages?: number;
  maxSizeInMB?: number;
  bucket?: string;
  storagePath?: string;
  disabled?: boolean; // Si es true, desactiva la subida de imágenes
  isEncrypted?: boolean; // Si true, las imágenes se subirán cifradas
  rfxId?: string; // Necesario si isEncrypted=true para obtener la clave
  publicCrypto?: {
    // For public RFXs, use the unencrypted key-based crypto
    isLoading: boolean;
    isReady: boolean;
    error: string | null;
    isEncrypted: boolean;
    encrypt: (text: string) => Promise<string>;
    decrypt: (text: string) => Promise<string>;
    encryptFile: (buffer: ArrayBuffer) => Promise<{ iv: string, data: ArrayBuffer } | null>;
    decryptFile: (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
    key: CryptoKey | null;
  };
}

const ProductImageUpload: React.FC<ProductImageUploadProps> = ({
  images = [],
  onImagesChange,
  productId,
  maxImages = 5,
  maxSizeInMB = 1,
  bucket = 'company-logos',
  storagePath = 'products',
  disabled = false,
  isEncrypted = false,
  rfxId,
  publicCrypto
}) => {
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  
  // Use the crypto hook to get the key if encryption is enabled
  // If publicCrypto is provided, use it instead of loading private crypto
  const privateCrypto = useRFXCrypto(publicCrypto ? null : (isEncrypted ? (rfxId || null) : null));
  const activeCrypto = publicCrypto || privateCrypto;
  const { encryptFile, decryptFile, isEncrypted: rfxEncrypted } = activeCrypto;
  
  // Debug log
  console.log('🖼️ [ProductImageUpload] Crypto state:', {
    isEncrypted,
    rfxId,
    hasPublicCrypto: !!publicCrypto,
    rfxEncrypted,
    hasDecryptFile: !!decryptFile
  });

  // Filter out non-Supabase URLs (keep only Supabase Storage URLs)
  // Also allow local URLs for dev or if they match the current domain
  const supabaseImages = images.filter(url => {
    const isSupabase = url.includes('supabase.co/storage/') || url.includes('storage.supabase.co/');
    const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
    return isSupabase || isLocal;
  });

  const handleFileSelect = async (files: File[]) => {
    if (files.length === 0) return;

    // Check if adding these files would exceed the limit
    if (supabaseImages.length + files.length > maxImages) {
      toast({
        title: 'Error',
        description: `You can only upload a maximum of ${maxImages} images`,
        variant: 'destructive'
      });
      return;
    }

    // Validate file sizes
    const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
    const oversizedFiles = files.filter(file => file.size > maxSizeInBytes);
    
    if (oversizedFiles.length > 0) {
      toast({
        title: 'Error',
        description: `Images cannot exceed ${maxSizeInMB}MB`,
        variant: 'destructive'
      });
      return;
    }

    // Validate file types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));
    
    if (invalidFiles.length > 0) {
      toast({
        title: 'Error',
        description: 'Only JPG, PNG and WebP images are allowed',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    
    try {
      const uploadedUrls: string[] = [];
      
      for (const file of files) {
        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${productId || 'temp'}_${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        // If encrypted, append .enc to indicate encryption and handle mime type differently
        const finalFileName = isEncrypted ? `${fileName}.enc` : fileName;
        const fullPath = `${storagePath}/${finalFileName}`;
        
        let fileToUpload: File | ArrayBuffer = file;
        let options: any = {
          cacheControl: '3600',
          upsert: false
        };

        // Encrypt file if encryption is enabled and key is available
        if (isEncrypted && rfxEncrypted && encryptFile) {
           console.log('🔐 [ImageUpload] Encrypting image before upload...');
           const arrayBuffer = await file.arrayBuffer();
           const encrypted = await encryptFile(arrayBuffer);
           
           if (!encrypted) {
             throw new Error("Failed to encrypt image");
           }

           // We need to store IV + Data. 
           // Strategy: Prepend IV (12 bytes) to the encrypted data.
           // Since IV is fixed 12 bytes for AES-GCM, we can easily slice it off on decryption.
           const ivBytes = userCrypto.base64ToArrayBuffer(encrypted.iv); // 12 bytes
           const dataBytes = new Uint8Array(encrypted.data as ArrayBuffer);
           
           const combined = new Uint8Array(ivBytes.byteLength + dataBytes.byteLength);
           combined.set(new Uint8Array(ivBytes), 0);
           combined.set(dataBytes, ivBytes.byteLength);
           
           fileToUpload = combined.buffer;
           options.contentType = 'application/octet-stream'; // Generic binary for encrypted files
        }
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(fullPath, fileToUpload, options);

        if (error) {
          throw error;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(fullPath);

        uploadedUrls.push(publicUrl);
      }

      // Update images array with new uploads
      const newImages = [...supabaseImages, ...uploadedUrls];
      onImagesChange(newImages);

      toast({
        title: 'Success',
        description: `${files.length} image(s) uploaded successfully`
      });

    } catch (error) {
      console.error('Error uploading images:', error);
      toast({
        title: 'Error',
        description: 'Error uploading images',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    await handleFileSelect(files);
    // Reset input
    event.target.value = '';
  };

  const handleRemoveImage = async (index: number) => {
    const imageUrl = supabaseImages[index];
    
    // Try to delete from storage if it's a Supabase URL
    if (imageUrl.includes('supabase.co/storage/') || imageUrl.includes('storage.supabase.co/') || imageUrl.includes('/storage/v1/object/')) {
      try {
        // Extract file path from URL - find the path after the bucket name
        const urlParts = imageUrl.split(`/${bucket}/`);
        if (urlParts.length > 1) {
          const filePath = urlParts[1];
          await supabase.storage
            .from(bucket)
            .remove([filePath]);
        }
      } catch (error) {
        console.error('Error deleting from storage:', error);
        // Continue with removing from array even if storage deletion fails
      }
    }

    const newImages = supabaseImages.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFileSelect(files);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">
          Product Images ({supabaseImages.length}/{maxImages})
        </label>
      </div>

      {!disabled && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <ImageIcon className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-2">
            Drag images here or click to select
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            id={`image-upload-${productId || 'default'}`}
            disabled={uploading || supabaseImages.length >= maxImages}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => document.getElementById(`image-upload-${productId || 'default'}`)?.click()}
            disabled={uploading || supabaseImages.length >= maxImages}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : 'Select Images'}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Maximum {maxImages} images • {maxSizeInMB}MB per image • JPG, PNG, WebP formats
          </p>
        </div>
      )}

      {supabaseImages.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {supabaseImages.map((imageUrl, index) => (
            <div key={index} className="relative group">
              <button
                type="button"
                className="aspect-square w-full bg-muted rounded-lg overflow-hidden border cursor-zoom-in"
                onClick={() => setViewerImage(imageUrl)}
              >
                <EncryptedImage 
                  src={imageUrl} 
                  decryptFile={decryptFile} 
                  isEncrypted={isEncrypted && rfxEncrypted} 
                  className="w-full h-full object-cover"
                />
              </button>
              {!disabled && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemoveImage(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        <p>• Only Supabase Storage images are maintained</p>
      </div>

      <Dialog open={!!viewerImage} onOpenChange={(open) => { if (!open) setViewerImage(null); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Image viewer</DialogTitle>
          </DialogHeader>
          {viewerImage && (
            <div className="w-full max-h-[75vh] overflow-auto rounded-md border bg-muted/20 p-2">
              <div className="w-full flex justify-center">
                <EncryptedImage
                  src={viewerImage}
                  decryptFile={decryptFile}
                  isEncrypted={isEncrypted && rfxEncrypted}
                  className="max-w-full max-h-[70vh] h-auto object-contain rounded"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductImageUpload;
