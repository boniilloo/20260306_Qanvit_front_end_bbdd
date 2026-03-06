/**
 * Utilities for handling images in multimodal messages
 * Base64 conversion, validation and compression
 */

export interface ImageMetadata {
  size: number;
  format: string;
  width?: number;
  height?: number;
  description?: string;
}

export interface ProcessedImage {
  data: string; // Base64 data URL
  filename: string;
  metadata: ImageMetadata;
}

// Configuration constants
export const IMAGE_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_WIDTH: 1920,
  COMPRESSION_QUALITY: 0.8,
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  MAX_IMAGES_PER_MESSAGE: 4
};

/**
 * Converts an image file to base64
 */
export function convertImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    
    reader.onerror = (error) => {
      reject(new Error(`Error reading file: ${error}`));
    };
    
    reader.readAsDataURL(file);
  });
}

/**
 * Validates if an image meets the requirements
 */
export function validateImage(file: File): Promise<boolean> {
  return new Promise((resolve, reject) => {
    // Check size
    if (file.size > IMAGE_CONFIG.MAX_FILE_SIZE) {
      reject(new Error(`File is too large. Maximum ${IMAGE_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB allowed.`));
      return;
    }
    
    // Check format
    if (!IMAGE_CONFIG.SUPPORTED_FORMATS.includes(file.type)) {
      reject(new Error(`Unsupported format. Allowed formats: ${IMAGE_CONFIG.SUPPORTED_FORMATS.join(', ')}`));
      return;
    }
    
    // Verify it's a valid image by loading it
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(true);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The file is not a valid image.'));
    };
    
    img.src = url;
  });
}

/**
 * Compresses an image if it exceeds the maximum width
 */
export function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not create canvas context'));
      return;
    }
    
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const { width, height } = img;
      
      // If the image doesn't need compression, return the original file
      if (width <= IMAGE_CONFIG.MAX_WIDTH) {
        resolve(file);
        return;
      }
      
      // Calculate new dimensions maintaining proportion
      const ratio = IMAGE_CONFIG.MAX_WIDTH / width;
      const newWidth = IMAGE_CONFIG.MAX_WIDTH;
      const newHeight = height * ratio;
      
      // Configure canvas
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      // Draw resized image
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      
      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Error compressing image'));
            return;
          }
          
          // Create new file with compressed blob
          const compressedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now()
          });
          
          resolve(compressedFile);
        },
        file.type,
        IMAGE_CONFIG.COMPRESSION_QUALITY
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error loading image for compression'));
    };
    
    img.src = url;
  });
}

/**
 * Gets metadata from an image
 */
export function getImageMetadata(file: File): Promise<ImageMetadata> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const metadata: ImageMetadata = {
        size: file.size,
        format: file.type,
        width: img.width,
        height: img.height
      };
      
      resolve(metadata);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error getting image metadata'));
    };
    
    img.src = url;
  });
}

/**
 * Processes a complete image: validation, compression and base64 conversion
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  try {
    // 1. Validate image
    await validateImage(file);
    
    // 2. Compress if necessary
    const compressedFile = await compressImage(file);
    
    // 3. Get metadata
    const metadata = await getImageMetadata(compressedFile);
    
    // 4. Convert to base64
    const base64Data = await convertImageToBase64(compressedFile);
    
    return {
      data: base64Data,
      filename: file.name,
      metadata
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Processes multiple images
 */
export async function processImages(files: File[]): Promise<ProcessedImage[]> {
  if (files.length > IMAGE_CONFIG.MAX_IMAGES_PER_MESSAGE) {
    throw new Error(`Maximum ${IMAGE_CONFIG.MAX_IMAGES_PER_MESSAGE} images per message`);
  }
  
  const promises = files.map(file => processImage(file));
  return Promise.all(promises);
} 

/**
 * Validates if a file type is a supported image
 */
export function isImageFile(file: File): boolean {
  return IMAGE_CONFIG.SUPPORTED_FORMATS.includes(file.type);
}

/**
 * Filters only image files from a list of files
 */
export function filterImageFiles(files: FileList | File[]): File[] {
  const fileArray = Array.from(files);
  return fileArray.filter(isImageFile);
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
