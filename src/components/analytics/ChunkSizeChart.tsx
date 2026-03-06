import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database } from 'lucide-react';

interface EmbeddingStats {
  embedding_id: string;
  usage_count: number;
  positions: string;
  match_percentages: string;
  vector_similarities: string;
  text: string;
  source_type: 'company' | 'product';
  company_name?: string;
  product_name?: string;
  chunk_size?: number | null;
  avg_match_percentage: number;
  avg_position: number;
  std_dev_match_percentage: number;
  std_dev_position: number;
}

interface ChunkSizeChartProps {
  stats: EmbeddingStats[];
  loading: boolean;
}

const COLORS = {
  null: '#6b7280',
  '250': '#3b82f6',
  '500': '#10b981',
  '1000': '#f59e0b'
};

const ChunkSizeChart: React.FC<ChunkSizeChartProps> = ({ stats, loading }) => {
  const [displayMode, setDisplayMode] = React.useState<'count' | 'percentage'>('count');

  // Process data for chunk size analysis
  const processChunkSizeData = React.useMemo(() => {
    if (loading || !stats.length) return { heatmapData: [], chunkSizes: [], matchRanges: [] };

    // Create position-match pairs for each embedding
    const allPairs: { chunkSize: string; matchPercentage: number }[] = [];

    stats.forEach(stat => {
      if (stat.match_percentages && stat.chunk_size !== undefined) {
        const matchPercentages = stat.match_percentages
          .split(',')
          .map(p => parseFloat(p.trim()))
          .filter(p => !isNaN(p));

        matchPercentages.forEach(matchPercentage => {
          allPairs.push({
            chunkSize: stat.chunk_size?.toString() || 'null',
            matchPercentage
          });
        });
      }
    });

    // Define match percentage ranges (4 ranges from 0-100)
    const matchRanges = [
      { label: '0-25%', min: 0, max: 25 },
      { label: '25-50%', min: 25, max: 50 },
      { label: '50-75%', min: 50, max: 75 },
      { label: '75-100%', min: 75, max: 100 }
    ];

    // Define chunk sizes
    const chunkSizes = [
      { label: 'No Chunk Size', value: 'null' },
      { label: 'Chunk 250', value: '250' },
      { label: 'Chunk 500', value: '500' },
      { label: 'Chunk 1000', value: '1000' }
    ];

    // Create heatmap data
    const heatmapData: { matchRange: string; chunkSize: string; count: number }[] = [];

    matchRanges.forEach(matchRange => {
      chunkSizes.forEach(chunkSize => {
        const count = allPairs.filter(pair => 
          pair.chunkSize === chunkSize.value && 
          pair.matchPercentage >= matchRange.min && 
          pair.matchPercentage <= matchRange.max
        ).length;

        heatmapData.push({
          matchRange: matchRange.label,
          chunkSize: chunkSize.label,
          count
        });
      });
    });

    return { heatmapData, chunkSizes, matchRanges };
  }, [stats, loading]);

  // Calculate column totals for percentage calculations
  const columnTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    processChunkSizeData.chunkSizes.forEach(chunkSize => {
      totals[chunkSize.label] = processChunkSizeData.heatmapData
        .filter(d => d.chunkSize === chunkSize.label)
        .reduce((sum, d) => sum + d.count, 0);
    });
    return totals;
  }, [processChunkSizeData]);

  // Calculate total counts
  const totalCount = processChunkSizeData.heatmapData.reduce((sum, item) => sum + item.count, 0);

  // Get color intensity function (similar to heatmap)
  const getColorIntensity = (value: number, maxValue: number) => {
    if (maxValue === 0) return 0;
    return (value / maxValue) * 100;
  };

  // Get color based on intensity using the same HSL scale as other heatmaps
  const getColor = (intensity: number) => {
    if (intensity === 0) return 'transparent';
    return `hsl(${240 - intensity * 2.4}, 70%, ${50 - intensity * 0.3}%)`;
  };

  const maxValue = displayMode === 'count' 
    ? Math.max(...processChunkSizeData.heatmapData.map(d => d.count))
    : Math.max(...processChunkSizeData.heatmapData.map(d => {
        const columnTotal = columnTotals[d.chunkSize];
        return columnTotal > 0 ? (d.count / columnTotal * 100) : 0;
      }));

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3"></div>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Chunk Size vs Match Percentage Distribution
        </CardTitle>
        <CardDescription>
          Distribution of embeddings by chunk size and match percentage ranges
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex gap-4 items-center">
            <Select value={displayMode} onValueChange={(value: any) => setDisplayMode(value)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select display mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="count">Absolute Counts</SelectItem>
                <SelectItem value="percentage">Column Percentages</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Heatmap Table */}
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Main grid container with proper alignment */}
              <div className="grid gap-1" style={{ 
                gridTemplateColumns: `100px repeat(${processChunkSizeData.chunkSizes.length}, minmax(100px, 1fr))`,
                gridTemplateRows: `repeat(${processChunkSizeData.matchRanges.length + 2}, 40px)`
              }}>
                
                {/* Top-left empty cell */}
                <div className="w-24"></div>
                
                {/* X-axis labels (top row) */}
                {processChunkSizeData.chunkSizes.map((chunkSize) => (
                  <div key={chunkSize.value} className="flex items-center justify-center text-xs font-medium text-muted-foreground border-b">
                    {chunkSize.label}
                  </div>
                ))}
                
                {/* Y-axis labels and data cells */}
                {processChunkSizeData.matchRanges.map((matchRange) => (
                  <div key={matchRange.label} className="contents">
                    {/* Y-axis label */}
                    <div className="flex items-center justify-end pr-2 text-xs font-medium text-muted-foreground border-r">
                      {matchRange.label}
                    </div>
                    
                    {/* Data cells for this match range */}
                    {processChunkSizeData.chunkSizes.map((chunkSize) => {
                      const cellData = processChunkSizeData.heatmapData.find(
                        d => d.matchRange === matchRange.label && d.chunkSize === chunkSize.label
                      );
                      const count = cellData?.count || 0;
                      const columnTotal = columnTotals[chunkSize.label];
                      
                      // Calculate display value and percentage
                      const displayValue = displayMode === 'count' ? count : (columnTotal > 0 ? (count / columnTotal * 100) : 0);
                      const displayPercentage = displayMode === 'count' 
                        ? (totalCount > 0 ? (count / totalCount * 100) : 0)
                        : (columnTotal > 0 ? (count / columnTotal * 100) : 0);
                      
                      const intensity = getColorIntensity(displayValue, maxValue);
                      
                      return (
                        <div
                          key={`${matchRange.label}-${chunkSize.value}`}
                          className="rounded border flex items-center justify-center text-xs font-medium transition-all duration-200 cursor-pointer hover:ring-2 hover:ring-blue-300 hover:scale-105"
                          style={{
                            backgroundColor: displayValue > 0 ? getColor(intensity) : 'transparent',
                            color: displayValue > 0 ? 'white' : '#6b7280'
                          }}
                          title={displayMode === 'count' 
                            ? `${count} embeddings with ${matchRange.label} match in ${chunkSize.label}`
                            : `${displayValue.toFixed(1)}% of ${chunkSize.label} embeddings have ${matchRange.label} match`
                          }
                        >
                          <div className="text-center">
                            <div className="text-lg font-bold">
                              {displayMode === 'count' ? count : displayValue.toFixed(1)}
                            </div>
                            {displayValue > 0 && (
                              <div className="text-xs opacity-75">
                                {displayPercentage.toFixed(1)}%
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Totals row */}
                <div className="contents">
                  {/* Y-axis label for totals */}
                  <div className="flex items-center justify-end pr-2 text-sm font-bold text-muted-foreground border-r border-t-2">
                    TOTAL
                  </div>
                  
                  {/* Total cells for each chunk size */}
                  {processChunkSizeData.chunkSizes.map((chunkSize) => {
                    const columnTotal = processChunkSizeData.heatmapData
                      .filter(d => d.chunkSize === chunkSize.label)
                      .reduce((sum, d) => sum + d.count, 0);
                    
                    return (
                      <div
                        key={`total-${chunkSize.value}`}
                        className="rounded border border-t-2 border-blue-500 flex items-center justify-center text-sm font-bold transition-all duration-200 cursor-pointer hover:ring-2 hover:ring-blue-300 hover:scale-105 bg-blue-50"
                        title={`Total: ${columnTotal} embeddings for ${chunkSize.label}`}
                      >
                        <div className="text-center">
                          <div className="text-lg font-bold text-blue-700">{columnTotal}</div>
                          {totalCount > 0 && (
                            <div className="text-xs text-blue-600">
                              {((columnTotal / totalCount) * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4">
            <div className="text-center text-sm font-medium text-muted-foreground mb-2">
              {displayMode === 'count' ? 'Number of Embeddings per Cell' : 'Percentage of Column Total per Cell'}
            </div>
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Low</span>
                <div className="flex h-3 w-32 rounded overflow-hidden">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div
                      key={i}
                      className="flex-1"
                      style={{
                        backgroundColor: `hsl(${240 - i * 24}, 70%, ${50 - i * 3}%)`
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">High</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChunkSizeChart; 