import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PublicConversationImageUploadProps {
  conversationId: string;
  currentImageUrl?: string;
  onImageUploaded: (imageUrl: string) => void;
  onImageRemoved: () => void;
}

const PublicConversationImageUpload: React.FC<PublicConversationImageUploadProps> = ({
  conversationId,
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
        title: "Invalid file type",
        description: "Please upload a JPEG, PNG, WebP, or GIF image.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Generate unique filename
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const timestamp = Date.now();
      const filename = `conversation-${conversationId}-${timestamp}.${fileExtension}`;

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('public-conversation-images')
        .upload(filename, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('public-conversation-images')
        .getPublicUrl(filename);

      const imageUrl = urlData.publicUrl;

      // Update preview
      setPreviewUrl(imageUrl);

      // Notify parent component
      onImageUploaded(imageUrl);

      toast({
        title: "Image uploaded successfully",
        description: "The image has been set for this public conversation.",
      });

    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Upload failed",
        description: "There was an error uploading the image. Please try again.",
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
          .from('public-conversation-images')
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
        title: "Image removed",
        description: "The image has been removed from this public conversation.",
      });

    } catch (error) {
      console.error('Error removing image:', error);
      toast({
        title: "Remove failed",
        description: "There was an error removing the image. Please try again.",
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
        <h3 className="font-medium text-gray-900">Conversation Image</h3>
      </div>

      {previewUrl ? (
        <Card className="relative group">
          <CardContent className="p-0">
            <div className="relative">
              <img
                src={previewUrl}
                alt="Conversation preview"
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
                {isUploading ? 'Uploading...' : 'Upload conversation image'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Drag and drop or click to select (JPEG, PNG, WebP, GIF - Max 5MB)
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
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Choose Image
            </>
          )}
        </Button>
      )}
    </div>
  );
};

export default PublicConversationImageUpload;
