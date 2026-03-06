import React, { useEffect, useState } from 'react';
import { Lightbulb, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ProposalSuggestion = {
  id: string;
  title: string;
  rationale?: string;
  impactedPaths?: string[];
  diffs: Record<string, string>;
  /** @deprecated Legacy JSON Patch format for backward compat */
  patch?: any[];
};

interface ProposalSuggestionsWarningProps {
  suggestions: ProposalSuggestion[];
  onNavigateToProposal?: (index: number) => void;
}

const ProposalSuggestionsWarning: React.FC<ProposalSuggestionsWarningProps> = ({ 
  suggestions, 
  onNavigateToProposal 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Reset al índice 0 cuando cambien las sugerencias
    setCurrentIndex(0);
    setIsVisible(true);
  }, [suggestions]);

  // Debug: log when we receive suggestions and why we might not render
  useEffect(() => {
    console.log('[RFX Proposals Debug] ProposalSuggestionsWarning render:', {
      suggestionsLength: suggestions?.length ?? 0,
      isVisible,
      willRender: (suggestions?.length ?? 0) > 0 && isVisible,
      suggestionIds: suggestions?.map(s => s.id) ?? [],
    });
  }, [suggestions, isVisible]);

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : suggestions.length - 1;
    setCurrentIndex(newIndex);
    scrollToProposal(newIndex);
  };

  const handleNext = () => {
    const newIndex = currentIndex < suggestions.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(newIndex);
    scrollToProposal(newIndex);
  };

  const scrollToProposal = (index: number) => {
    // Call the navigation handler to expand the appropriate section
    if (onNavigateToProposal) {
      onNavigateToProposal(index);
    }
  };


  const handleClose = () => {
    setIsVisible(false);
  };

  if (suggestions.length === 0 || !isVisible) {
    if (suggestions.length === 0) {
      console.log('[RFX Proposals Debug] ProposalSuggestionsWarning returning null: suggestions.length === 0');
    } else {
      console.log('[RFX Proposals Debug] ProposalSuggestionsWarning returning null: isVisible === false');
    }
    return null;
  }

  const currentSuggestion = suggestions[currentIndex];

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-blue-50 border-2 border-blue-300 rounded-lg shadow-lg p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-blue-900">Proposal Suggestions</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-6 w-6 p-0 hover:bg-blue-100"
              >
                <X className="h-4 w-4 text-blue-700" />
              </Button>
            </div>
            <p className="text-sm text-blue-800 mb-2">
              {suggestions.length === 1 
                ? 'There is 1 proposal suggestion available' 
                : `There are ${suggestions.length} proposal suggestions available`}
            </p>
            
            {/* Show current suggestion information */}
            {currentSuggestion && (
              <div className="mb-3 p-2 bg-blue-100 rounded border border-blue-200">
                <h5 className="font-medium text-blue-900 text-xs mb-1">
                  {currentSuggestion.title}
                </h5>
                {currentSuggestion.rationale && (
                  <p className="text-xs text-blue-800 line-clamp-2">
                    {currentSuggestion.rationale}
                  </p>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-2 mb-3">
              <Button
                size="sm"
                onClick={handlePrevious}
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-blue-800 px-2">
                {currentIndex + 1} / {suggestions.length}
              </span>
              <Button
                size="sm"
                onClick={handleNext}
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ProposalSuggestionsWarning;
