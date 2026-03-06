import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PublicRFXImageUploadProps {
  rfxId: string;
  currentImageUrl?: string;
  onImageUploaded: (imageUrl: string) => void;
  onImageRemoved: () => void;
}

const PublicRFXImageUpload: React.FC<PublicRFXImageUploadProps> = ({
  rfxId,
  currentImageUrl,
  onImageUploaded,
  onImageRemoved
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Tipo de archivo inválido",
        description: "Por favor sube una imagen JPEG, PNG, WebP o GIF.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast({
        title: "Archivo demasiado grande",
        description: "Por favor sube una imagen menor a 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Generate unique filename
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const timestamp = Date.now();
      const filename = `rfx-${rfxId}-${timestamp}.${fileExtension}`;

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('public-rfx-images')
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('public-rfx-images')
        .getPublicUrl(filename);

      const imageUrl = urlData.publicUrl;

      // Update preview
      setPreviewUrl(imageUrl);

      // Notify parent component
      onImageUploaded(imageUrl);

      toast({
        title: "Imagen subida exitosamente",
        description: "La imagen se ha configurado para esta RFX pública.",
      });

    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Error al subir",
        description: "Hubo un error al subir la imagen. Por favor intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async () => {
    if (!currentImageUrl) return;

    try {
      // Extract filename from URL
      const filename = currentImageUrl.split('/').pop();
      if (filename) {
        // Delete from storage
        const { error } = await supabase.storage
          .from('public-rfx-images')
          .remove([filename]);

        if (error) {
          console.error('Error deleting image:', error);
        }
      }

      // Update preview
      setPreviewUrl(null);

      // Notify parent component
      onImageRemoved();

      toast({
        title: "Imagen eliminada",
        description: "La imagen ha sido eliminada de esta RFX pública.",
      });

    } catch (error) {
      console.error('Error removing image:', error);
      toast({
        title: "Error al eliminar",
        description: "Hubo un error al eliminar la imagen. Por favor intenta de nuevo.",
        variant: "destructive",
      });
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // Create a fake event to reuse the existing handler
      const fakeEvent = {
        target: { files: [file] }
      } as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-5 h-5 text-gray-600" />
        <h3 className="font-medium text-gray-900">Imagen de portada</h3>
      </div>

      {previewUrl ? (
        <Card className="relative group">
          <CardContent className="p-0">
            <div className="relative">
              <img
                src={previewUrl}
                alt="RFX preview"
                className="w-full h-48 object-cover rounded-lg"
              />
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleRemoveImage}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-4">
            {isUploading ? (
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-gray-400" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                {isUploading ? 'Subiendo...' : 'Subir imagen de la RFX'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Arrastra y suelta o haz clic para seleccionar (JPEG, PNG, WebP, GIF - Máx 5MB)
              </p>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {!previewUrl && (
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Subiendo...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Elegir imagen
            </>
          )}
        </Button>
      )}
    </div>
  );
};

export default PublicRFXImageUpload;











