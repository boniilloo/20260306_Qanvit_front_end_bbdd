import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Image, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ImageCropModal } from '@/components/company/ImageCropModal';

interface CoverImage {
  id: string;
  company_id: string;
  image_url: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

interface CoverImageUploadProps {
  companyId: string;
  onImagesChange?: (images: CoverImage[]) => void;
}

export const CoverImageUpload: React.FC<CoverImageUploadProps> = ({
  companyId,
  onImagesChange
}) => {
  const [images, setImages] = useState<CoverImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const { toast } = useToast();

  // Helper function to validate UUID
  const isValidUUID = (id: string): boolean => {
    if (!id || typeof id !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  };

  useEffect(() => {
    if (isValidUUID(companyId)) {
      loadImages();
    }
  }, [companyId]);

  const loadImages = async () => {
    
    if (!companyId || !isValidUUID(companyId)) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('company_cover_images' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setImages((data as unknown as CoverImage[]) || []);
      onImagesChange?.((data as unknown as CoverImage[]) || []);
    } catch (error) {
      console.error('❌ Error loading cover images:', error);
      toast({ title: "Error loading images", variant: "destructive" });
    }
  };

  const uploadImage = async (file: File | Blob) => {
    try {
      // We assume the incoming file/blob is already validated/cropped.
      // For safety, enforce max size 10MB.
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('Image size must be less than 10MB');
      }

      // Upload directly to Supabase Storage
      setIsUploading(true);
      const fileExt = (file as File).name ? ((file as File).name.split('.').pop() || 'jpg') : 'jpg';
      const fileName = `cover-${Date.now()}.${fileExt}`;
      const filePath = `${companyId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, file, { contentType: 'image/jpeg' });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('company_cover_images' as any)
        .upsert([
          {
            company_id: companyId,
            image_url: publicUrl,
            uploaded_by: (await supabase.auth.getUser()).data.user?.id
          }
        ], { onConflict: 'company_id' });

      if (dbError) throw dbError;

      await loadImages();

      toast({
        title: 'Success',
        description: 'Cover image uploaded successfully',
      });

      // Reload the page to reflect the new cover image everywhere
      setTimeout(() => {
        try { window.location.reload(); } catch {}
      }, 200);
    } catch (error: any) {
      console.error('Error validating image:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process image',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const startNextFromQueue = useCallback(() => {
    setCurrentFile(null);
    setIsCropOpen(false);
    setFileQueue((q) => {
      const [, ...rest] = q;
      if (rest.length > 0) {
        setCurrentFile(rest[0]);
        setIsCropOpen(true);
      }
      return rest;
    });
  }, []);

  const handleCroppedConfirm = async (blob: Blob) => {
    try {
      // Convert blob to File with .jpg extension to keep consistent naming
      const stampedName = `cover-cropped-${Date.now()}.jpg`;
      const croppedFile = new File([blob], stampedName, { type: 'image/jpeg' });
      await uploadImage(croppedFile);
    } finally {
      startNextFromQueue();
    }
  };

  const handleCancelCrop = () => {
    startNextFromQueue();
  };

  const deleteImage = async (image: CoverImage) => {
    try {
      // Extract file path from URL
      const urlParts = image.image_url.split('/');
      const filePath = `${companyId}/${urlParts[urlParts.length - 1]}`;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('company-logos')
        .remove([filePath]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('company_cover_images' as any)
        .delete()
        .eq('id', image.id);

      if (dbError) throw dbError;

      await loadImages();

      toast({
        title: 'Success',
        description: 'Cover image deleted successfully',
      });
    } catch (error: any) {
      console.error('Error deleting cover image:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete image',
        variant: 'destructive',
      });
    }
  };

  const downloadImage = async (image: CoverImage) => {
    try {
      const response = await fetch(image.image_url);
      const blob = await response.blob();
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cover-image-${image.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading cover image:', error);
      toast({
        title: 'Error',
        description: 'Failed to download image',
        variant: 'destructive',
      });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    setFileQueue((q) => {
      const newQueue = [...q, ...files];
      if (!isCropOpen && !currentFile && newQueue.length > 0) {
        setCurrentFile(newQueue[0]);
        setIsCropOpen(true);
      }
      return newQueue;
    });
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setFileQueue((q) => {
      const newQueue = [...q, ...files];
      if (!isCropOpen && !currentFile && newQueue.length > 0) {
        setCurrentFile(newQueue[0]);
        setIsCropOpen(true);
      }
      return newQueue;
    });
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">Cover Image</label>
        {/* Top-right Select Image button */}
        <div>
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileInput}
            className="hidden"
            id="cover-image-upload"
            disabled={isUploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading || !isValidUUID(companyId)}
            onClick={() => document.getElementById('cover-image-upload')?.click()}
          >
            {isUploading ? 'Uploading...' : 'Select Image'}
          </Button>
        </div>
      </div>

      {!isValidUUID(companyId) ? (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">Select a company first to upload a cover image</p>
        </div>
      ) : (
        <>
          {/* Full-width image preview */}
          <div className="w-full rounded-xl border overflow-hidden bg-white">
            <div className="relative w-full" style={{ paddingTop: `${(270/1280)*100}%` }}>
              {images.length > 0 ? (
                <img
                  src={images[0].image_url}
                  alt="Company cover"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <span className="text-sm">No cover image uploaded yet</span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons for the current image */}
          {images.length > 0 && (
            <div className="flex items-center gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => downloadImage(images[0])}>
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteImage(images[0])}>
                <X className="h-4 w-4 mr-2" /> Delete
              </Button>
            </div>
          )}
        </>
      )}

      <ImageCropModal
        open={isCropOpen}
        onOpenChange={setIsCropOpen}
        file={currentFile}
        onCancel={handleCancelCrop}
        onConfirm={handleCroppedConfirm}
      />
    </div>
  );
};