import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface UseAvatarUploadReturn {
  uploading: boolean;
  uploadAvatar: (file: File) => Promise<string | null>;
  deleteAvatar: (avatarUrl: string) => Promise<boolean>;
}

export const useAvatarUpload = (): UseAvatarUploadReturn => {
  const [uploading, setUploading] = useState(false);

  const resizeImage = (file: File, size: number = 200): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      
      img.onload = () => {
        // Set canvas size to desired square dimensions
        canvas.width = size;
        canvas.height = size;
        
        // Calculate crop dimensions to maintain aspect ratio
        const { width, height } = img;
        const cropSize = Math.min(width, height);
        const offsetX = (width - cropSize) / 2;
        const offsetY = (height - cropSize) / 2;
        
        // Draw cropped and resized image
        ctx.drawImage(
          img,
          offsetX, offsetY, cropSize, cropSize, // Source rectangle (crop to square)
          0, 0, size, size // Destination rectangle (resize to target size)
        );
        
        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const resizedFile = new File([blob], file.name, {
                type: 'image/webp',
                lastModified: Date.now(),
              });
              resolve(resizedFile);
            }
          },
          'image/webp',
          0.8 // 80% quality for good compression
        );
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const uploadAvatar = async (file: File): Promise<string | null> => {
    try {
      setUploading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to upload an avatar.",
          variant: "destructive",
        });
        return null;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Error",
          description: "Please select a valid image file.",
          variant: "destructive",
        });
        return null;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Image size must be less than 5MB.",
          variant: "destructive",
        });
        return null;
      }

      // Resize and compress image
      const resizedFile = await resizeImage(file);
      
      // Generate unique filename
      const fileExt = 'webp';
      const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;
      
      // Delete existing avatar if it exists
      const { data: existingFiles } = await supabase.storage
        .from('avatars')
        .list(user.id);
      
      if (existingFiles && existingFiles.length > 0) {
        const filesToDelete = existingFiles.map(file => `${user.id}/${file.name}`);
        await supabase.storage
          .from('avatars')
          .remove(filesToDelete);
      }

      // Upload new file
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, resizedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update user profile with new avatar URL
      const { error: updateError } = await supabase
        .from('app_user')
        .update({ avatar_url: publicUrl })
        .eq('auth_user_id', user.id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: "Avatar updated successfully.",
      });

      return publicUrl;

    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Error",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const deleteAvatar = async (avatarUrl: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Extract filename from URL
      const url = new URL(avatarUrl);
      const pathParts = url.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      const filePath = `${user.id}/${fileName}`;

      // Delete file from storage
      const { error } = await supabase.storage
        .from('avatars')
        .remove([filePath]);

      if (error) throw error;

      // Update user profile to remove avatar URL
      const { error: updateError } = await supabase
        .from('app_user')
        .update({ avatar_url: null })
        .eq('auth_user_id', user.id);

      if (updateError) throw updateError;

      toast({
        title: "Success",
        description: "Avatar removed successfully.",
      });

      return true;

    } catch (error) {
      console.error('Error deleting avatar:', error);
      toast({
        title: "Error",
        description: "Failed to remove avatar. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    uploading,
    uploadAvatar,
    deleteAvatar
  };
};