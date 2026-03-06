import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { SupplierFitToRFX } from '@/hooks/useRFXAnalysisResult';
import MarkdownText from './MarkdownText';

interface SupplierRisk {
  category: 'technical' | 'schedule' | 'cost' | 'operational' | 'commercial' | 'other';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

interface MatchWithRFXSpecsProps {
  fitToRfx: SupplierFitToRFX;
  risks?: SupplierRisk[];
}

type ViewMode = 'gaps' | 'highlights' | 'both';

const MatchWithRFXSpecs: React.FC<MatchWithRFXSpecsProps> = ({ fitToRfx, risks }) => {
  const {
    match_percentage_overall,
    must_have_coverage_percentage,
    nice_to_have_coverage_percentage,
    match_comment,
    gaps,
    highlights,
  } = fitToRfx;

  const [viewMode, setViewMode] = useState<ViewMode>('both');
  const showGaps = viewMode === 'gaps' || viewMode === 'both';
  const showHighlights = viewMode === 'highlights' || viewMode === 'both';

  // Reset to 'both' when supplier changes (gaps/highlights change)
  useEffect(() => {
    setViewMode('both');
  }, [gaps, highlights]);

  // Determine color based on percentage
  const getPercentageColor = (percentage: number) => {
    if (percentage >= 85) return '#7de19a'; // verde (85+)
    if (percentage >= 75) return '#80c8f0'; // azul claro (75-84)
    if (percentage >= 65) return '#fbbf24'; // amarillo (65-74)
    if (percentage >= 50) return '#fb923c'; // naranja (50-64)
    return '#ef4444'; // rojo (<50)
  };

  const overallColor = getPercentageColor(match_percentage_overall);

  // Calculate the stroke-dasharray for the circular progress
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = `${(match_percentage_overall / 100) * circumference} ${circumference}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Match with RFX specs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-6">
          {/* Left Column - Match Chart (1/4 width) */}
          <div className="col-span-1 space-y-6">
            {/* Circular Progress Chart */}
            <div className="flex justify-center">
              <div className="relative w-40 h-40">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                  {/* Background circle */}
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="12"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke={overallColor}
                    strokeWidth="12"
                    strokeDasharray={strokeDasharray}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                {/* Percentage text in center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-bold" style={{ color: overallColor }}>
                    {match_percentage_overall}%
                  </span>
                </div>
              </div>
            </div>

            {/* Overall metric */}
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1 font-medium">Overall Match</div>
              <div className="text-2xl font-bold text-[#1A1F2C]">
                {match_percentage_overall}%
              </div>
            </div>
          </div>

          {/* Right Column - Match Comment (3/4 width) */}
          <div className="col-span-3 flex flex-col justify-center">
            <div className="bg-[#f1f1f1] rounded-lg p-4">
              <h4 className="text-sm font-semibold text-[#1A1F2C] mb-2">Reasoning</h4>
              <div className="text-sm text-gray-700 leading-relaxed">
                <MarkdownText>{match_comment}</MarkdownText>
              </div>
            </div>
          </div>
        </div>

        {/* Risks Section */}
        {risks && risks.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold mb-3 text-[#1A1F2C]">Risks</h3>
            <ul className="space-y-2">
              {risks.map((risk, idx) => (
                <li key={idx} className="text-sm text-gray-700">
                  <span className="font-bold capitalize">{risk.category}</span>{' '}
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      risk.severity === 'high'
                        ? 'bg-red-100 text-red-800'
                        : risk.severity === 'medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {risk.severity}
                  </span>
                  : <MarkdownText>{risk.description}</MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Gaps & Highlights Section */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-[#1A1F2C]">Gaps & Highlights</h3>
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
                    ? 'bg-[#80c8f0] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Both
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MatchWithRFXSpecs;

