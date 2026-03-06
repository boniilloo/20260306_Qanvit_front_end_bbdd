import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SupplierCard from './SupplierCard';
import { useIsMobile } from '@/hooks/use-mobile';
import { clsx } from 'clsx';
import { randomScore } from '@/utils/supplierUtils';
import { useToggle } from '@/hooks/useToggle';

interface Supplier {
  name: string;
  country: string;
  flag?: string;
  capability: string;
  score: number;
  placeholder?: boolean;
}

interface SupplierCarouselProps {
  suppliers: Supplier[];
  title: string;
}

const SupplierCarousel = ({ suppliers, title }: SupplierCarouselProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { open, toggle } = useToggle(false);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 280;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Split suppliers for desktop view
  const firstTwo = suppliers.slice(0, 2);
  const extras = suppliers.slice(2);
  const hasExtras = extras.length > 0;

  const gridClasses = "grid gap-4 md:gap-5 xl:gap-6 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]";

  return (
    <div className="relative">
      {title && (
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          {isMobile && (
            <div className="flex gap-1">
              <button
                onClick={() => scroll('left')}
                className="p-1.5 rounded-full bg-white border border-slate-200 hover:border-[#007aff] transition-colors"
              >
                <ChevronLeft size={14} className="text-slate-600" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="p-1.5 rounded-full bg-white border border-slate-200 hover:border-[#007aff] transition-colors"
              >
                <ChevronRight size={14} className="text-slate-600" />
              </button>
            </div>
          )}
        </div>
      )}
      
      {isMobile ? (
        // Mobile: Keep carousel behavior
        <div className="overflow-x-auto">
          <div 
            ref={scrollRef}
            className="flex gap-3 pl-4 snap-x snap-mandatory hide-scrollbar pb-2"
          >
            {suppliers.map((supplier, index) => (
              <div key={index} className="flex-shrink-0 snap-start">
                <SupplierCard 
                  name={supplier.name}
                  country={supplier.country}
                  flag={supplier.flag || ''}
                  tagline={supplier.capability}
                  score={randomScore()}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        // Desktop: Show 2 first, then collapsible section
        <div>
          {/* First two cards - always visible */}
          <div className="grid gap-4 md:gap-5 xl:gap-6 md:grid-cols-2">
            {firstTwo.map((supplier, index) => (
              <SupplierCard 
                key={index}
                name={supplier.name}
                country={supplier.country}
                flag={supplier.flag || ''}
                tagline={supplier.capability}
                score={randomScore()}
              />
            ))}
          </div>

          {/* Extra cards - collapsible */}
          {hasExtras && (
            <>
              <div
                className={clsx(
                  "grid gap-4 md:gap-5 xl:gap-6 mt-5 md:grid-cols-3 transition-all duration-200",
                  open ? "max-h-[999px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"
                )}
              >
                {extras.map((supplier, index) => (
                  <SupplierCard 
                    key={index + 2}
                    name={supplier.name}
                    country={supplier.country}
                    flag={supplier.flag || ''}
                    tagline={supplier.capability}
                    score={randomScore()}
                  />
                ))}
              </div>

              {/* Toggle button */}
              <button
                onClick={toggle}
                className="mt-4 text-[#009dff] text-[15px] font-medium hover:underline focus:outline-none"
              >
                {open ? "Hide extra ▴" : "View more ▾"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SupplierCarousel;
