import { useState, useEffect } from 'react';

/**
 * Hook to validate product images and compose relative URLs with company base URL
 * Only validates images when needed (in individual product view)
 */
export const useValidatedProductImages = (
  imageUrls: string[] | undefined,
  companyWebsite: string | undefined,
  shouldValidate: boolean = true
): { validImages: string[], isValidating: boolean } => {
  const [validImages, setValidImages] = useState<string[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    // If validation is disabled, return original URLs
    if (!shouldValidate || !imageUrls || imageUrls.length === 0) {
      setValidImages(imageUrls || []);
      return;
    }

    setIsValidating(true);
    
    const validateImages = async () => {
      const validatedUrls: string[] = [];
      
      for (const url of imageUrls) {
        if (!url || typeof url !== 'string' || !url.trim()) {
          continue;
        }

        const cleanUrl = url.trim();
        let finalUrl = cleanUrl;

        // Check if URL is relative (doesn't start with http:// or https://)
        const isRelative = !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://');
        
        if (isRelative && companyWebsite) {
          try {
            // Get base URL from company website
            const baseUrl = new URL(companyWebsite);
            const origin = baseUrl.origin; // e.g., "https://example.com"
            
            // Compose the full URL
            // If relative URL starts with /, use it as is, otherwise add /
            if (cleanUrl.startsWith('/')) {
              finalUrl = `${origin}${cleanUrl}`;
            } else {
              finalUrl = `${origin}/${cleanUrl}`;
            }
            
            console.log(`🔗 Composed relative URL: ${cleanUrl} -> ${finalUrl}`);
          } catch (error) {
            console.error(`❌ Error composing URL for ${cleanUrl}:`, error);
            continue; // Skip this image if we can't compose the URL
          }
        }

        // Validate that the image can be loaded
        try {
          const isValid = await validateImageUrl(finalUrl);
          if (isValid) {
            validatedUrls.push(finalUrl);
            console.log(`✅ Image validated: ${finalUrl}`);
          } else {
            console.log(`❌ Image failed to load: ${finalUrl}`);
          }
        } catch (error) {
          console.error(`❌ Error validating image ${finalUrl}:`, error);
        }
      }

      setValidImages(validatedUrls);
      setIsValidating(false);
    };

    validateImages();
  }, [imageUrls, companyWebsite, shouldValidate]);

  return { validImages, isValidating };
};

/**
 * Validate that an image URL can be loaded
 */
const validateImageUrl = (url: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const img = new Image();
    
    // Set timeout to avoid hanging on slow/broken URLs
    const timeout = setTimeout(() => {
      img.src = ''; // Cancel loading
      resolve(false);
    }, 5000); // 5 second timeout

    img.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };

    // Start loading the image
    img.src = url;
  });
};

