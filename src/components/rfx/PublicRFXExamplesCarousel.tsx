import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FileText, ArrowRight, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePublicRFXs } from '@/hooks/usePublicRFXs';
import { formatDistanceToNow } from 'date-fns';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

interface ImageWithSkeletonProps {
  src: string | null;
  alt: string;
  className?: string;
}

const ImageWithSkeleton: React.FC<ImageWithSkeletonProps> = ({ src, alt, className = "" }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!src) {
      setImageError(true);
      return;
    }

    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => setImageError(true);
    img.src = src;
  }, [src]);

  if (!src || imageError) {
    // Show default icon if no image or error
    return (
      <div className="w-10 h-10 bg-gradient-to-br from-[#f4a9aa] to-[#f4a9aa] rounded-lg flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-white" />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 relative">
      {!imageLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-lg"></div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          imageLoaded ? 'opacity-100' : 'opacity-0'
        } ${className}`}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
    </div>
  );
};

const PublicRFXExamplesCarousel: React.FC = () => {
  const { publicRfxs, loading } = usePublicRFXs();
  const navigate = useNavigate();

  const handleClick = (rfxId: string) => {
    navigate(`/rfx-example/${rfxId}`);
  };

  if (loading && publicRfxs.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-2 mb-4 px-2">
          <div className="w-5 h-5 bg-gray-200 rounded animate-pulse" />
          <div className="w-52 h-6 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="w-32 h-4 bg-gray-200 rounded animate-pulse" />
                <div className="w-full h-4 bg-gray-200 rounded animate-pulse" />
                <div className="w-3/4 h-4 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (publicRfxs.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#f4a9aa]" />
          <h2 className="text-xl font-bold text-[#22183a]">Public RFX Examples</h2>
          <Badge variant="secondary" className="ml-2">
            {publicRfxs.length} examples
          </Badge>
        </div>
      </div>

      <Carousel
        opts={{
          align: 'start',
          loop: true,
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-2 md:-ml-4">
          {publicRfxs.map((pr) => (
            <CarouselItem
              key={pr.id}
              className="pl-2 md:pl-4 basis-full sm:basis-1/2"
            >
              <Card
                className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02] border-2 hover:border-[#f4a9aa] h-full"
                onClick={() => handleClick(pr.rfx_id)}
              >
                <CardContent className="p-5 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ImageWithSkeleton
                        src={pr.image_url}
                        alt={pr.title || pr.rfx?.name || 'RFX Example'}
                      />
                      {pr.is_featured && (
                        <Badge className="bg-[#f4a9aa] text-[#22183a] text-xs">
                          Featured
                        </Badge>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-[#22183a] mb-2 line-clamp-2">
                    {pr.title || pr.rfx?.name || 'RFX Example'}
                  </h3>

                  {(pr.description || pr.rfx?.description) && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                      {pr.description || pr.rfx?.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>
                        {formatDistanceToNow(
                          new Date(pr.rfx?.created_at || pr.created_at),
                          { addSuffix: true }
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[#f4a9aa] text-sm font-medium">
                      <span>View RFX</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden md:flex -left-12" />
        <CarouselNext className="hidden md:flex -right-12" />
      </Carousel>
    </div>
  );
};

export default PublicRFXExamplesCarousel;


