import React from 'react';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
import CompanyInfoCard from './CompanyInfoCard';
import EvaluationRating from './EvaluationRating';

interface CompanyData {
  id?: string;
  nombre_empresa: string;
  main_activities?: string;
  sectors?: string;
  countries?: string[] | string;
  website?: string;
}

interface CompanyCarouselProps {
  companies: CompanyData[];
  title?: string;
  conversationId?: string;
  carouselId?: string;
  isPublicExample?: boolean;
}

const CompanyCarousel = ({ companies, title, conversationId, carouselId, isPublicExample = false }: CompanyCarouselProps) => {
  if (!companies || companies.length === 0) {
    return null;
  }

  // If only one company, don't show carousel controls
  if (companies.length === 1) {
    return (
      <div className="w-full">
        {title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>🏢</span> {title}
          </h3>
        )}
        <div className="flex justify-start">
          <CompanyInfoCard company={companies[0]} />
        </div>
        
        {/* Add evaluation rating for single company - only for non-public examples */}
        {conversationId && carouselId && !isPublicExample && (
          <div className="mt-4">
            <EvaluationRating 
              conversationId={conversationId}
              messageId={carouselId}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    /* 1) El wrapper nunca debe medir más que el viewport */
    <section className="w-full max-w-[100svw] overflow-hidden">
      {title && (
        <div className="flex items-center justify-between mb-6 px-4 md:px-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <span>🏢</span> {title}
            </h3>
          </div>
        </div>
      )}

      {/* 2) Embla con "contain" para que no empuje fuera del viewport */}
      <Carousel
        className="w-full"
        opts={{
          align: 'start',
          loop: false,
          /** evita "saltos" que generan ancho fantasma */
          containScroll: 'trimSnaps',
          /** asegúrate de pasar 1 slide por gesto */
          slidesToScroll: 1,
        }}
      >
        {/* 3) Evitar margin negativo en móvil */}
        <CarouselContent className="ml-0 md:-ml-4">
          {companies.map((company, index) => (
            <CarouselItem
              key={`${company.nombre_empresa}-${index}`}
              /* 4) 100% de ancho en móvil; 50% desde md */
              className="
                pl-0 md:pl-4
                basis-full md:basis-1/2
                shrink-0 grow-0
                min-w-0
              "
            >
              <div className="px-4 md:px-0">
                <CompanyInfoCard company={company} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        {/* 5) Flechas solo en escritorio */}
        <CarouselPrevious className="hidden md:flex" />
        <CarouselNext className="hidden md:flex" />
      </Carousel>
      
      {/* Add evaluation rating for this carousel - only for non-public examples */}
      {conversationId && carouselId && !isPublicExample && (
        <div className="mt-4">
          <EvaluationRating 
            conversationId={conversationId}
            messageId={carouselId}
          />
        </div>
      )}
    </section>
  );
};

export default CompanyCarousel;