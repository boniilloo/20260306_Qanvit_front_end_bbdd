import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductCarouselProps {
  companyId: string;
}

const ProductCarousel: React.FC<ProductCarouselProps> = ({ companyId }) => {
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [currentImageLoaded, setCurrentImageLoaded] = useState(false);
  
  // Filter out failed images
  const validImages = images.filter(image => !failedImages.has(image));

  // Función para precargar una imagen
  const preloadImage = (imageUrl: string) => {
    const img = new Image();
    img.onload = () => {
      setLoadedImages(prev => new Set([...prev, imageUrl]));
      if (imageUrl === validImages[currentIndex]) {
        setCurrentImageLoaded(true);
      }
    };
    img.onerror = () => {
      setFailedImages(prev => new Set([...prev, imageUrl]));
    };
    img.src = imageUrl;
  };

  // Precargar imágenes adyacentes cuando cambia el índice
  useEffect(() => {
    if (validImages.length === 0) return;
    
    const currentImage = validImages[currentIndex];
    if (currentImage && !loadedImages.has(currentImage) && !failedImages.has(currentImage)) {
      preloadImage(currentImage);
    }
    
    // Precargar imagen siguiente
    const nextIndex = (currentIndex + 1) % validImages.length;
    const nextImage = validImages[nextIndex];
    if (nextImage && !loadedImages.has(nextImage) && !failedImages.has(nextImage)) {
      preloadImage(nextImage);
    }
    
    // Precargar imagen anterior
    const prevIndex = currentIndex === 0 ? validImages.length - 1 : currentIndex - 1;
    const prevImage = validImages[prevIndex];
    if (prevImage && !loadedImages.has(prevImage) && !failedImages.has(prevImage)) {
      preloadImage(prevImage);
    }
  }, [currentIndex, validImages, loadedImages, failedImages]);

  useEffect(() => {
    const fetchProductImages = async () => {
      if (!companyId) return;
      
      setLoading(true);
      try {
        // Get product IDs for this company
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: productIds, error: productError } = await supabase
          .from('product')
          .select('id')
          .eq('company_id', companyId);

        if (productError || !productIds?.length) {
          setImages([]);
          setLoading(false);
          return;
        }

        // Get product revisions with images
        const { data: productRevisions, error } = await supabase
          .from('product_revision')
          .select('image')
          .in('product_id', productIds.map(p => p.id))
          .eq('is_active', true);

        if (error) {
          console.error('Error fetching product images:', error);
          setImages([]);
          setLoading(false);
          return;
        }

        // Collect all image URLs and remove duplicates
        const allImageUrls: string[] = [];
        
        productRevisions?.forEach((revision, index) => {
          
          if (revision.image) {
            let imageUrls: string[] = [];
            
            // Handle different formats of image field
            if (typeof revision.image === 'string') {
              try {
                // Try to parse as JSON array
                const parsed = JSON.parse(revision.image);
                if (Array.isArray(parsed)) {
                  imageUrls = parsed;
                } else {
                  // If not array, treat as single URL
                  imageUrls = [revision.image];
                }
              } catch {
                // If not JSON, treat as single URL
                imageUrls = [revision.image];
              }
            } else if (Array.isArray(revision.image)) {
              imageUrls = revision.image;
            }
            
            
            // Add valid URLs to our collection
            imageUrls.forEach(url => {
              if (url && typeof url === 'string' && url.trim()) {
                const cleanUrl = url.trim();
                if (!allImageUrls.includes(cleanUrl)) {
                  allImageUrls.push(cleanUrl);
                }
              }
            });
          }
        });


        setImages(allImageUrls);
        setLoading(false);
        
        // Cargar la primera imagen inmediatamente
        if (allImageUrls.length > 0) {
          preloadImage(allImageUrls[0]);
        }
        
      } catch (error) {
        console.error('Error fetching product images:', error);
        setImages([]);
        setLoading(false);
      }
    };

    fetchProductImages();
  }, [companyId]);

  // Auto-advance carousel
  useEffect(() => {
    if (validImages.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % validImages.length);
    }, 3000); // Change image every 3 seconds

    return () => clearInterval(interval);
  }, [validImages.length]);

  const nextImage = () => {
    setCurrentIndex(prev => (prev + 1) % validImages.length);
  };

  const prevImage = () => {
    setCurrentIndex(prev => (prev - 1 + validImages.length) % validImages.length);
  };

  const handleImageError = (imageUrl: string) => {
    // Add image URL to failed images
    setFailedImages(prev => new Set([...prev, imageUrl]));
    // Automatically go to next image
    nextImage();
  };

  if (loading) {
    return (
      <div className="w-full h-64 bg-muted animate-pulse rounded-lg flex items-center justify-center">
        <span className="text-muted-foreground">Cargando imágenes...</span>
      </div>
    );
  }

  if (!validImages.length) {
    return (
      <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
        <span className="text-muted-foreground">No hay imágenes disponibles</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-64 overflow-hidden rounded-lg bg-background border">
      {/* Image container with smooth crossfade */}
      <div className="relative w-full h-full">
        {validImages.map((image, index) => (
          <div key={image} className={`absolute inset-0 w-full h-full transition-all duration-700 ease-in-out ${
            index === currentIndex 
              ? 'opacity-100 scale-100' 
              : 'opacity-0 scale-105'
          }`}>
            {loadedImages.has(image) ? (
              <img
                src={image}
                alt={`Producto ${index + 1}`}
                className="w-full h-full object-contain"
                onError={() => handleImageError(image)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-pulse flex items-center justify-center">
                <div className="text-gray-500 text-sm">Loading...</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation arrows */}
      {validImages.length > 1 && (
        <>
          <button
            onClick={prevImage}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full p-2 transition-colors"
            aria-label="Imagen anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full p-2 transition-colors"
            aria-label="Siguiente imagen"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {/* Indicators */}
      {validImages.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {validImages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? 'bg-primary' : 'bg-background/60'
              }`}
              aria-label={`Ir a imagen ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Image counter */}
      {validImages.length > 1 && (
        <div className="absolute top-4 right-4 bg-background/80 px-2 py-1 rounded text-sm">
          {currentIndex + 1} / {validImages.length}
        </div>
      )}
    </div>
  );
};

export default ProductCarousel;