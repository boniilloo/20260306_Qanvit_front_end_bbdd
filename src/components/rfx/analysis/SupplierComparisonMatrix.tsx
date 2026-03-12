import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SupplierAnalysis } from '@/hooks/useRFXAnalysisResult';
import { AlertTriangle } from 'lucide-react';
import SmartLogo from '@/components/ui/SmartLogo';
import MarkdownText from './MarkdownText';

interface SupplierComparisonMatrixProps {
  suppliers: (SupplierAnalysis & {
    company_logo?: string | null;
    company_website?: string | null;
  })[];
  onSupplierClick?: (supplier: SupplierAnalysis & {
    company_logo?: string | null;
    company_website?: string | null;
  }) => void;
}

const SupplierComparisonMatrix: React.FC<SupplierComparisonMatrixProps> = ({
  suppliers,
  onSupplierClick,
}) => {
  // Sort suppliers by match percentage (highest first)
  const sortedSuppliers = [...suppliers].sort(
    (a, b) => b.table_view_summary.match_percentage - a.table_view_summary.match_percentage
  );

  // Determine color for match percentage
  const getMatchColor = (percentage: number) => {
    if (percentage >= 85) return '#f4a9aa'; // verde (85+)
    if (percentage >= 75) return '#f4a9aa'; // azul claro (75-84)
    if (percentage >= 65) return '#fbbf24'; // amarillo (65-74)
    if (percentage >= 50) return '#fb923c'; // naranja (50-64)
    return '#ef4444'; // rojo (<50)
  };

  // Get quality grade color
  const getGradeColor = (grade: string) => {
    const baseLetter = grade.charAt(0).toUpperCase();
    if (baseLetter === 'A') return '#f4a9aa'; // verde
    if (baseLetter === 'B') return '#f4a9aa'; // azul claro
    if (baseLetter === 'C') return '#fbbf24'; // amarillo
    if (baseLetter === 'D') return '#fb923c'; // naranja
    return '#ef4444'; // rojo para E, F
  };

  // Calculate the stroke-dasharray for circular progress (small version)
  const getStrokeDasharray = (percentage: number) => {
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    return `${(percentage / 100) * circumference} ${circumference}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-xl font-bold text-[#22183a] mb-4">Multi-supplier comparison</h2>
          
          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left p-4 font-semibold text-gray-700">Metric</th>
                  {sortedSuppliers.map((supplier) => (
                    <th
                      key={supplier.company_uuid || supplier.supplier_name}
                      className="text-center p-4 min-w-[180px] cursor-pointer hover:bg-[#f4a9aa]/5 transition-colors"
                      onClick={() => onSupplierClick?.(supplier)}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <SmartLogo
                          logoUrl={supplier.company_logo}
                          websiteUrl={supplier.company_website}
                          companyName={supplier.supplier_name}
                          size="sm"
                          className="rounded-lg"
                          isSupplierRoute={true}
                        />
                        <span className="font-semibold text-[#22183a]">{supplier.supplier_name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Match % Row */}
                <tr className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-700">Match %</td>
                  {sortedSuppliers.map((supplier) => {
                    const matchPercentage = supplier.table_view_summary.match_percentage;
                    const color = getMatchColor(matchPercentage);

                    return (
                      <td key={supplier.company_uuid || supplier.supplier_name} className="p-4">
                        <div className="flex justify-center">
                          <div className="relative w-20 h-20">
                            <svg
                              className="w-full h-full transform -rotate-90"
                              viewBox="0 0 80 80"
                            >
                              {/* Background circle */}
                              <circle
                                cx="40"
                                cy="40"
                                r="30"
                                fill="none"
                                stroke="#e5e7eb"
                                strokeWidth="6"
                              />
                              {/* Progress circle */}
                              <circle
                                cx="40"
                                cy="40"
                                r="30"
                                fill="none"
                                stroke={color}
                                strokeWidth="6"
                                strokeDasharray={getStrokeDasharray(matchPercentage)}
                                strokeLinecap="round"
                              />
                            </svg>
                            {/* Percentage text in center */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-lg font-bold" style={{ color }}>
                                {matchPercentage}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Quality Grade Row */}
                <tr className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-700">Quality grade</td>
                  {sortedSuppliers.map((supplier) => {
                    const grade = supplier.quality_of_proposal.letter_grade;
                    const color = getGradeColor(grade);

                    return (
                      <td key={supplier.company_uuid || supplier.supplier_name} className="p-4 text-center">
                        <span className="text-5xl font-bold" style={{ color }}>
                          {grade}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Total Price / TCO Row */}
                <tr className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-700">Total price / TCO</td>
                  {sortedSuppliers.map((supplier) => {
                    const price = supplier.table_view_summary.total_price_for_table;
                    const currency = supplier.table_view_summary.currency || '$';

                    return (
                      <td key={supplier.company_uuid || supplier.supplier_name} className="p-4 text-center">
                        <span className="text-xl font-bold text-[#22183a]">
                          {price ? `${currency}${price.toLocaleString()}` : 'N/A'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Lead Time Row */}
                <tr className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-700">Lead time</td>
                  {sortedSuppliers.map((supplier) => {
                    const leadTime = supplier.table_view_summary.lead_time_text_for_table;

                    return (
                      <td key={supplier.company_uuid || supplier.supplier_name} className="p-4 text-center">
                        <span className="text-base text-gray-700">{leadTime}</span>
                      </td>
                    );
                  })}
                </tr>

                {/* Main Risks Row */}
                <tr className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-4 font-medium text-gray-700">Main risks</td>
                  {sortedSuppliers.map((supplier) => {
                    const risks = supplier.table_view_summary.main_risks_short;
                    const hasRisks = risks && risks.toLowerCase() !== 'none identified';

                    return (
                      <td key={supplier.company_uuid || supplier.supplier_name} className="p-4 text-center">
                        <div className="flex items-start justify-center gap-2">
                          {hasRisks && (
                            <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="text-sm text-gray-700">
                            <MarkdownText>{risks}</MarkdownText>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SupplierComparisonMatrix;

