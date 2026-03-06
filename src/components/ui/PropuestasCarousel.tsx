
import React, { useState, useMemo } from 'react';
import PropuestaCard from './PropuestaCard';
import EvaluationRating from './EvaluationRating';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import type { Propuesta } from '@/types/chat';

type SortType = 'overall' | 'technical' | 'company';

interface PropuestasCarouselProps {
  propuestas: Propuesta[];
  title: string;
  subtitle?: string;
  conversationId?: string;
  carouselId?: string;
  isPublicExample?: boolean;
  // Selection support
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (key: string, selected: boolean) => void;
}

const PropuestasCarousel = ({ propuestas, title, subtitle, conversationId, carouselId, isPublicExample = false, selectable = false, selectedKeys, onToggleSelect }: PropuestasCarouselProps) => {
  const [sortType, setSortType] = useState<SortType>('overall');

  // Función para calcular el overall match
  const calculateOverallMatch = (propuesta: Propuesta) => {
    return (propuesta.company_match !== undefined && propuesta.company_match !== null)
      ? Math.round((propuesta.match + propuesta.company_match) / 2)
      : propuesta.match;
  };

  // Seleccionar y ordenar propuestas según el tipo seleccionado (máximo 25 por filtro)
  const sortedPropuestas = useMemo(() => {
    // Primero ordenar todos los resultados según el criterio del filtro actual
    const allSorted = [...propuestas].sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortType) {
        case 'overall':
          aValue = calculateOverallMatch(a);
          bValue = calculateOverallMatch(b);
          break;
        case 'technical':
          aValue = a.match;
          bValue = b.match;
          break;
        case 'company':
          aValue = a.company_match ?? a.match;
          bValue = b.company_match ?? b.match;
          break;
        default:
          aValue = calculateOverallMatch(a);
          bValue = calculateOverallMatch(b);
      }

      return bValue - aValue; // Orden descendente (mayor a menor)
    });

    // Luego tomar solo los primeros 25 para mostrar en la interfaz
    return allSorted.slice(0, 25);
  }, [propuestas, sortType]);

  // Agrupar propuestas ordenadas en pares para mostrar 2 filas
  const groupedPropuestas = [];
  for (let i = 0; i < sortedPropuestas.length; i += 2) {
    groupedPropuestas.push(sortedPropuestas.slice(i, i + 2));
  }

  return (
    /* 1) El wrapper nunca debe medir más que el viewport */
    <section className="w-full max-w-[100svw] overflow-hidden" data-onboarding-target="propuestas-carousel">
      {/* Cabecera */}
      {title && (
        <div className="mb-6 px-4 md:px-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-navy">{title}</h3>
              {subtitle && <p className="text-sm text-charcoal/70 mt-1">{subtitle}</p>}
            </div>
          </div>
          
          {/* Sort buttons */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <span className="text-sm font-medium text-charcoal/70 mr-2">Sort by:</span>
              {[
                { key: 'overall' as SortType, label: 'Overall Match', icon: '🎯' },
                { key: 'technical' as SortType, label: 'Tech Match', icon: '⚙️' },
                { key: 'company' as SortType, label: 'Company Match', icon: '🏢' }
              ].map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setSortType(key)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
                    ${sortType === key
                      ? 'bg-sky text-white shadow-md hover:bg-sky/90' 
                      : 'bg-white text-navy border border-gray-200 hover:bg-gray-50 hover:border-sky/30'
                    }
                  `}
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            
            {/* Info messages for each filter */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-xs text-blue-800 space-y-1">
                {sortType === 'overall' && (
                  <p><strong>🎯 Overall Match:</strong> Combines technical compatibility and company fit.</p>
                )}
                {sortType === 'technical' && (
                  <p><strong>⚙️ Tech Match:</strong> Focuses on technical specifications and product capabilities.</p>
                )}
                {sortType === 'company' && (
                  <p><strong>🏢 Company Match:</strong> Emphasizes company profile according to your requirements.</p>
                )}
              </div>
              
            </div>
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
          {groupedPropuestas.map((group, i) => {
            // Create a stable key for the group using the first propuesta's unique identifier
            const groupKey = group.length > 0 
              ? `${group[0].id_company_revision}|${group[0].id_product_revision || 'no-product'}`
              : `group-${i}`;
            
            return (
            <CarouselItem
              key={groupKey}
              /* 4) 100% de ancho en móvil; 50% desde md */
              className="
                pl-0 md:pl-4
                basis-full md:basis-1/2
                shrink-0 grow-0
                min-w-0
              "
            >
              <div className="px-4 md:px-0">
                <div className="flex flex-col gap-4">
                  {group.map((propuesta, j) => {
                    // Create a stable unique key using both company and product revision IDs
                    const uniqueKey = `${propuesta.id_company_revision}|${propuesta.id_product_revision || 'no-product'}`;
                    
                    return (
                      <div
                        key={uniqueKey}
                        className="animate-fade-in"
                        style={{ animationDelay: `${(i * 2 + j) * 0.1}s` }}
                      >
                        <PropuestaCard 
                          propuesta={propuesta} 
                          sortType={sortType}
                          // Selection checkbox overlay when enabled
                          onSelectChange={selectable && onToggleSelect ? (selected) => onToggleSelect(uniqueKey, selected) : undefined}
                          selected={!!selectedKeys?.has(uniqueKey)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </CarouselItem>
            );
          })}
        </CarouselContent>

        {/* 5) Flechas solo en escritorio */}
        <CarouselPrevious 
          className="hidden md:flex" 
          data-onboarding-target="carousel-prev-arrow"
        />
        <CarouselNext 
          className="hidden md:flex" 
          data-onboarding-target="carousel-next-arrow"
        />
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

export default PropuestasCarousel;
