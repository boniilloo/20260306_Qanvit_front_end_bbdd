import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { SupplierFitToRFX } from '@/hooks/useRFXAnalysisResult';
import MarkdownText from './MarkdownText';

interface GapsAndHighlightsProps {
  fitToRfx: SupplierFitToRFX;
}

type ViewMode = 'gaps' | 'highlights' | 'both';

const GapsAndHighlights: React.FC<GapsAndHighlightsProps> = ({ fitToRfx }) => {
  const { gaps, highlights } = fitToRfx;
  const [viewMode, setViewMode] = useState<ViewMode>('gaps');

  const showGaps = viewMode === 'gaps' || viewMode === 'both';
  const showHighlights = viewMode === 'highlights' || viewMode === 'both';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Gaps & Highlights</CardTitle>
            <p className="text-sm text-gray-500">AI-generated analysis points</p>
          </div>
          {/* View Mode Selector */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              onClick={() => setViewMode('gaps')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'gaps'
                  ? 'bg-red-100 text-red-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Gaps
            </button>
            <button
              onClick={() => setViewMode('highlights')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'highlights'
                  ? 'bg-green-100 text-green-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Highlights
            </button>
            <button
              onClick={() => setViewMode('both')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'both'
                  ? 'bg-[#f4a9aa] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Both
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Gaps (Red) */}
        {showGaps && gaps && gaps.length > 0 && (
          <div className="space-y-2">
            {viewMode === 'both' && (
              <h4 className="text-sm font-semibold text-red-700 mb-3">Gaps</h4>
            )}
            {gaps.map((gap, index) => (
              <div key={`gap-${index}`} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                </div>
                <div className="text-sm text-gray-700 flex-1">
                  <MarkdownText>{gap}</MarkdownText>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Highlights (Green) */}
        {showHighlights && highlights && highlights.length > 0 && (
          <div className={`space-y-2 ${viewMode === 'both' ? 'pt-4' : ''}`}>
            {viewMode === 'both' && (
              <h4 className="text-sm font-semibold text-green-700 mb-3">Highlights</h4>
            )}
            {highlights.map((highlight, index) => (
              <div key={`highlight-${index}`} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                </div>
                <div className="text-sm text-gray-700 flex-1">
                  <MarkdownText>{highlight}</MarkdownText>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {((showGaps && (!gaps || gaps.length === 0)) || 
          (showHighlights && (!highlights || highlights.length === 0))) && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">
              {viewMode === 'gaps' && 'No gaps identified'}
              {viewMode === 'highlights' && 'No highlights identified'}
              {viewMode === 'both' && 'No gaps or highlights identified'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GapsAndHighlights;

