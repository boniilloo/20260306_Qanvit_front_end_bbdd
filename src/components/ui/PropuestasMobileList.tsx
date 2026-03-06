import React, { useState, useMemo } from 'react';
import { ChevronDown, Target, Building2, Grid3x3 } from 'lucide-react';
import { Button } from './button';
import PropuestaMobileCard from './PropuestaMobileCard';
import type { Propuesta } from '@/types/chat';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

type SortType = 'overall' | 'technical' | 'company';

interface PropuestasMobileListProps {
  propuestas: Propuesta[];
  title?: string;
  subtitle?: string;
  conversationId?: string;
  isPublicExample?: boolean;
}

const PropuestasMobileList = ({ 
  propuestas, 
  title = "Recommended Solutions",
  subtitle = "Based on technical and company match analysis",
  conversationId, 
  isPublicExample = false 
}: PropuestasMobileListProps) => {
  const [sortType, setSortType] = useState<SortType>('overall');
  const [showAll, setShowAll] = useState(false);

  // Función para calcular el overall match
  const calculateOverallMatch = (propuesta: Propuesta) => {
    return (propuesta.company_match !== undefined && propuesta.company_match !== null)
      ? Math.round((propuesta.match + propuesta.company_match) / 2)
      : propuesta.match;
  };

  // Ordenar propuestas según el tipo seleccionado
  const sortedPropuestas = useMemo(() => {
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

      return bValue - aValue;
    });

    return allSorted.slice(0, 25);
  }, [propuestas, sortType]);

  // Mostrar solo las primeras 3 inicialmente, o todas si showAll es true
  const displayedPropuestas = showAll ? sortedPropuestas : sortedPropuestas.slice(0, 3);
  const hasMore = sortedPropuestas.length > 3;

  return (
    <section className="w-full max-w-[100svw] overflow-hidden px-4">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-[#1b2c4a] mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
      </div>

      {/* Sort Options */}
      <div className="mb-4">
        <div className="text-sm font-medium text-gray-700 mb-2">Sort by:</div>
        <ToggleGroup 
          type="single" 
          value={sortType} 
          onValueChange={(value) => value && setSortType(value as SortType)}
          className="justify-start flex-wrap gap-2"
        >
          <ToggleGroupItem 
            value="overall" 
            aria-label="Sort by overall match"
            className="flex items-center gap-2 data-[state=on]:bg-[#80c8f0] data-[state=on]:text-white"
          >
            <Target className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Overall Match</span>
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="technical" 
            aria-label="Sort by technical match"
            className="flex items-center gap-2 data-[state=on]:bg-blue-500 data-[state=on]:text-white"
          >
            <Grid3x3 className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Tech Match</span>
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="company" 
            aria-label="Sort by company match"
            className="flex items-center gap-2 data-[state=on]:bg-green-500 data-[state=on]:text-white"
          >
            <Building2 className="w-4 h-4" />
            <span className="text-xs sm:text-sm">Company Match</span>
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Info tooltip */}
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700">
            {sortType === 'overall' && (
              <><strong>Overall Match:</strong> Combines technical compatibility and company fit.</>
            )}
            {sortType === 'technical' && (
              <><strong>Tech Match:</strong> Technical capability match only.</>
            )}
            {sortType === 'company' && (
              <><strong>Company Match:</strong> Company profile and attributes fit.</>
            )}
          </p>
        </div>
      </div>

      {/* Vertical List of Cards - match ExampleConversations mobile spacing */}
      <div className="-mx-4 px-4 space-y-3">
        {displayedPropuestas.map((propuesta, index) => {
          const uniqueKey = `${propuesta.id_company_revision}|${propuesta.id_product_revision || 'no-product'}`;
          
          return (
            <div
              key={uniqueKey}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <PropuestaMobileCard propuesta={propuesta} sortType={sortType} />
            </div>
          );
        })}
      </div>

      {/* Show More Button */}
      {hasMore && !showAll && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={() => setShowAll(true)}
            variant="outline"
            className="w-full gap-2"
          >
            <span>Show {sortedPropuestas.length - 3} more recommendations</span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Show Less Button */}
      {showAll && hasMore && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={() => {
              setShowAll(false);
              // Scroll back to top of recommendations
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            variant="outline"
            className="w-full gap-2"
          >
            <span>Show less</span>
            <ChevronDown className="w-4 h-4 rotate-180" />
          </Button>
        </div>
      )}
    </section>
  );
};

export default PropuestasMobileList;

