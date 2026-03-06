import React, { useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import PropuestasCarousel from '@/components/ui/PropuestasCarousel';
import PropuestasMobileList from '@/components/ui/PropuestasMobileList';
import AuthOverlay from '@/components/ui/AuthOverlay';
import FQAvatar from '@/components/chat/FQAvatar';
import type { Propuesta } from '@/types/chat';
import { EvaluationMessage } from '@/hooks/useEvaluationCarousel';

interface EvaluationCarouselRendererProps {
  evaluationMessage: EvaluationMessage;
  conversationId?: string;
  carouselIndex?: number;
  isPublicExample?: boolean;
  // Selection support
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onToggleSelect?: (key: string, selected: boolean) => void;
  onPropuestasChange?: (propuestas: Propuesta[]) => void;
}

/**
 * Componente reutilizable para renderizar el carrusel de evaluaciones.
 * Se puede usar tanto en el FQ Agent como en RFX Projects.
 */
const EvaluationCarouselRenderer: React.FC<EvaluationCarouselRendererProps> = ({
  evaluationMessage,
  conversationId,
  carouselIndex = 1,
  isPublicExample = false,
  selectable = false,
  selectedKeys,
  onToggleSelect,
  onPropuestasChange,
}) => {
  const isMobile = useIsMobile();
  const { user } = useAuth();

  // Function to map data to proposals for the card
  const mapToPropuestas = (arr: any[]): Propuesta[] => {
    return (Array.isArray(arr) ? arr : []).map(item => {
      
      // Handle nested justification structure from the images
      let justification = item.justification;
      let justification_sentence = item.justification_sentence;
      let justification_pros = item.justification_pros;
      let justification_cons = item.justification_cons;
      
      // If justification is an object with nested structure (as shown in images)
      if (justification && typeof justification === 'object') {
        justification_sentence = justification.sentence || justification_sentence;
        justification_pros = justification.pros || justification_pros;
        justification_cons = justification.cons || justification_cons;
      }
      
      return {
        id_company_revision: item.id_company_revision || '',
        id_product_revision: item.id_product_revision || '',
        empresa: item.empresa || '',
        website: item.website || '',
        producto: item.producto || '',
        product_website: item.product_website || '',
        match: item.match || 0,
        technical_match: item.technical_match ?? undefined,
        company_match: item.company_match ?? undefined,
        company_match_justification: item.company_match_justification || undefined,
        justification: justification || undefined,
        justification_sentence: justification_sentence || undefined,
        justification_pros: justification_pros || undefined,
        justification_cons: justification_cons || undefined,
        country_hq: item.country_hq || '',
      };
    });
  };

  // Function to calculate overall match
  const calculateOverallMatch = (item: any) => {
    return (item.company_match !== undefined && item.company_match !== null)
      ? Math.round((item.match + item.company_match) / 2)
      : item.match;
  };

  // Function to get unique key for deduplication using both company and product revision IDs
  const getUniqueKey = (item: any) => 
    `${item?.id_company_revision || 'no-company'}|${item?.id_product_revision || 'no-product'}`;

  // Function to filter and keep only one card per company (highest overall percentage)
  const filterTopMatches = (matches: any[]) => {
    // Group matches by company and keep only the one with highest overall percentage
    const companyGroups = new Map<string, any>();
    
    // Process each match
    for (const match of matches) {
      const companyKey = match?.empresa || 'unknown-company';
      const overallScore = calculateOverallMatch(match);
      
      // If this company doesn't exist in our map, or if this match has a higher overall score
      if (!companyGroups.has(companyKey) || overallScore > calculateOverallMatch(companyGroups.get(companyKey))) {
        companyGroups.set(companyKey, match);
      }
    }

    // Convert back to array and sort by overall score (descending)
    const filteredMatches = Array.from(companyGroups.values())
      .sort((a, b) => calculateOverallMatch(b) - calculateOverallMatch(a));

    // Return only the first 25 matches
    return filteredMatches.slice(0, 25);
  };

  // Get all best_matches and apply filtering
  const allMatches = Array.isArray(evaluationMessage.data.best_matches) 
    ? evaluationMessage.data.best_matches 
    : [];
  const filteredMatches = filterTopMatches(allMatches);
  const bestMatches = mapToPropuestas(filteredMatches);

  // Notify parent about the current displayed proposals
  useEffect(() => {
    if (onPropuestasChange) {
      onPropuestasChange(bestMatches);
    }
  }, [onPropuestasChange, bestMatches]);

  const messageId = conversationId 
    ? `conversation-${conversationId}-carousel-${carouselIndex}`
    : `carousel-${carouselIndex}`;

  return (
    <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 mb-8">
      <div className="flex items-start space-x-4">
        {!isMobile && <FQAvatar className="mt-1 shadow-sm flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <AuthOverlay 
            showOverlay={!user && !isPublicExample} 
            message="Sign in to view detailed supplier recommendations"
          >
            {isMobile ? (
              <PropuestasMobileList 
                propuestas={bestMatches}
                title="Recommended Solutions"
                subtitle="Based on technical and company match analysis"
                conversationId={conversationId}
                isPublicExample={isPublicExample}
              />
            ) : (
              <PropuestasCarousel 
                propuestas={bestMatches}
                title="Recommended Solutions"
                subtitle="Based on technical and company match analysis"
                conversationId={conversationId}
                carouselId={messageId}
                isPublicExample={isPublicExample}
                selectable={selectable}
                selectedKeys={selectedKeys}
                onToggleSelect={onToggleSelect}
              />
            )}
          </AuthOverlay>
        </div>
      </div>
    </div>
  );
};

export default EvaluationCarouselRenderer;

