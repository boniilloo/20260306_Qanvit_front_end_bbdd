import React from 'react';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';

interface SimpleNameCarouselProps {
  items: string[];
  title: string;
  icon?: string;
}

const SimpleNameCarousel = ({ items, title, icon = "📋" }: SimpleNameCarouselProps) => {
  if (!items || items.length === 0) {
    return null;
  }

  // If only one item, don't show carousel controls
  if (items.length === 1) {
    return (
      <div className="w-full">
        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
          <span>{icon}</span> {title}
        </h4>
        <div className="flex justify-start">
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800">
            {items[0]}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h4>
      
      <Carousel
        className="w-full"
        opts={{
          align: 'start',
          loop: false,
          containScroll: 'trimSnaps',
          slidesToScroll: 1,
        }}
      >
        <CarouselContent className="ml-0">
          {items.map((item, index) => (
            <CarouselItem
              key={`${item}-${index}`}
              className="pl-0 basis-auto shrink-0 grow-0 min-w-0"
            >
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-800 whitespace-nowrap mr-2">
                {item}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        {/* Show navigation arrows only if there are more items than can fit */}
        {items.length > 3 && (
          <>
            <CarouselPrevious className="hidden md:flex -left-4" />
            <CarouselNext className="hidden md:flex -right-4" />
          </>
        )}
      </Carousel>
    </div>
  );
};

export default SimpleNameCarousel;
