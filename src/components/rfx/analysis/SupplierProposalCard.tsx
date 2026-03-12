import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { SupplierAnalysis } from '@/hooks/useRFXAnalysisResult';
import SmartLogo from '@/components/ui/SmartLogo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SupplierProposalCardProps {
  supplier: SupplierAnalysis & {
    company_logo?: string | null;
    company_website?: string | null;
  };
  isSelected: boolean;
  onClick: () => void;
  commentCount?: number;
}

const SupplierProposalCard: React.FC<SupplierProposalCardProps> = ({
  supplier,
  isSelected,
  onClick,
  commentCount = 0,
}) => {
  const { supplier_name, table_view_summary } = supplier;
  const matchPercentage = table_view_summary.match_percentage;

  // Determine color based on percentage
  const getMatchColor = (percentage: number) => {
    if (percentage >= 85) return 'text-[#f4a9aa]'; // verde (85+)
    if (percentage >= 75) return 'text-[#f4a9aa]'; // azul claro (75-84)
    if (percentage >= 65) return 'text-[#fbbf24]'; // amarillo (65-74)
    if (percentage >= 50) return 'text-[#fb923c]'; // naranja (50-64)
    return 'text-[#ef4444]'; // rojo (<50)
  };

  const matchColor = getMatchColor(matchPercentage);

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-[#f4a9aa] bg-[#f4a9aa]/5' : 'hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Vertical layout: Logo on top, percentage below */}
        <div className="flex flex-col items-center gap-2">
          {/* Company Logo */}
          <div className="relative">
            <SmartLogo
              logoUrl={supplier.company_logo}
              websiteUrl={supplier.company_website}
              companyName={supplier_name}
              size="md"
              className="rounded-xl"
              isSupplierRoute={true}
            />
            {commentCount > 0 && (
              <TooltipProvider delayDuration={50}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#f4a9aa] text-[#22183a] text-[11px] font-bold flex items-center justify-center border border-white shadow-sm"
                      aria-label={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
                    >
                      {commentCount > 99 ? '99+' : commentCount}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center">
                    There {commentCount === 1 ? 'is' : 'are'} {commentCount} comment{commentCount === 1 ? '' : 's'} available.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Match Percentage */}
          <div className="text-center">
            <span className={`text-base font-bold ${matchColor}`}>
              {matchPercentage}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SupplierProposalCard;

