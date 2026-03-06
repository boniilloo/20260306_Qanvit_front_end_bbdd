import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Grid3X3,
  Target,
  Activity,
  TrendingUp
} from 'lucide-react';

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
  avg_match_percentage: number;
  avg_position: number;
  std_dev_match_percentage: number;
  std_dev_position: number;
}

interface EmbeddingHeatmapProps {
  stats: EmbeddingStats[];
  loading: boolean;
}

const EmbeddingHeatmap: React.FC<EmbeddingHeatmapProps> = ({ stats, loading }) => {
  const [selectedDimension, setSelectedDimension] = React.useState<'usage-match' | 'usage-position' | 'match-position'>('match-position');

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

  // Generate heatmap data
  const generateHeatmapData = () => {
    const data: { x: string; y: string; value: number; count: number; items: EmbeddingStats[] }[] = [];

    if (selectedDimension === 'usage-match') {
      // Usage ranges: 0-9, 10-49, 50+
      // Match ranges: 0-39%, 40-59%, 60-79%, 80-100%
      const usageRanges = ['0-9', '10-49', '50+'];
      const matchRanges = ['0-39%', '40-59%', '60-79%', '80-100%'];

      usageRanges.forEach(usageRange => {
        matchRanges.forEach(matchRange => {
          let filteredStats: EmbeddingStats[] = [];
          
          // Filter by usage range
          if (usageRange === '0-9') {
            filteredStats = stats.filter(s => s.usage_count < 10);
          } else if (usageRange === '10-49') {
            filteredStats = stats.filter(s => s.usage_count >= 10 && s.usage_count < 50);
          } else {
            filteredStats = stats.filter(s => s.usage_count >= 50);
          }

          // Filter by match range
          if (matchRange === '0-39%') {
            filteredStats = filteredStats.filter(s => s.avg_match_percentage < 40);
          } else if (matchRange === '40-59%') {
            filteredStats = filteredStats.filter(s => s.avg_match_percentage >= 40 && s.avg_match_percentage < 60);
          } else if (matchRange === '60-79%') {
            filteredStats = filteredStats.filter(s => s.avg_match_percentage >= 60 && s.avg_match_percentage < 80);
          } else {
            filteredStats = filteredStats.filter(s => s.avg_match_percentage >= 80);
          }

          const avgValue = filteredStats.length > 0 ? 
            filteredStats.reduce((sum, s) => sum + s.avg_position, 0) / filteredStats.length : 0;

          data.push({
            x: usageRange,
            y: matchRange,
            value: avgValue,
            count: filteredStats.length,
            items: filteredStats
          });
        });
      });
    } else if (selectedDimension === 'usage-position') {
      // Usage ranges: 0-9, 10-49, 50+
      // Position ranges: 0-10, 11-20, 21-30, 31-40, 41-50, 51-60, 61-70, 71-80, 81-90, 91-100
      const usageRanges = ['0-9', '10-49', '50+'];
      const positionRanges = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'];

      usageRanges.forEach(usageRange => {
        positionRanges.forEach(positionRange => {
          let filteredStats: EmbeddingStats[] = [];
          
          // Filter by usage range
          if (usageRange === '0-9') {
            filteredStats = stats.filter(s => s.usage_count < 10);
          } else if (usageRange === '10-49') {
            filteredStats = stats.filter(s => s.usage_count >= 10 && s.usage_count < 50);
          } else {
            filteredStats = stats.filter(s => s.usage_count >= 50);
          }

          // Filter by position range
          const [minPos, maxPos] = positionRange.split('-').map(Number);
          filteredStats = filteredStats.filter(s => s.avg_position >= minPos && s.avg_position <= maxPos);

          const avgValue = filteredStats.length > 0 ? 
            filteredStats.reduce((sum, s) => sum + s.avg_match_percentage, 0) / filteredStats.length : 0;

          data.push({
            x: usageRange,
            y: positionRange,
            value: avgValue,
            count: filteredStats.length,
            items: filteredStats
          });
        });
      });
    } else {
      // match-position: Process individual position-match pairs from the raw data
      const matchRanges = ['0-39%', '40-59%', '60-79%', '80-100%'];
      const positionRanges = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'];

      // Create a map to store position-match pairs
      const positionMatchPairs: { position: number; matchPercentage: number; usageCount: number }[] = [];

      // Process each embedding's raw position and match percentage data
      stats.forEach(stat => {
        if (stat.positions && stat.match_percentages) {
          const positions = stat.positions.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
          const matchPercentages = stat.match_percentages.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
          
          // Pair each position with its corresponding match percentage
          const minLength = Math.min(positions.length, matchPercentages.length);
          for (let i = 0; i < minLength; i++) {
            positionMatchPairs.push({
              position: positions[i],
              matchPercentage: matchPercentages[i],
              usageCount: stat.usage_count
            });
          }
        }
      });

      // Now create the heatmap data based on these pairs
      matchRanges.forEach(matchRange => {
        positionRanges.forEach(positionRange => {
          const [minPos, maxPos] = positionRange.split('-').map(Number);
          const [minMatch, maxMatch] = matchRange.replace('%', '').split('-').map(Number);
          
          // Filter pairs that fall within this range
          const filteredPairs = positionMatchPairs.filter(pair => 
            pair.position >= minPos && pair.position <= maxPos &&
            pair.matchPercentage >= minMatch && pair.matchPercentage <= maxMatch
          );

          // Calculate average usage for this combination
          const avgValue = filteredPairs.length > 0 ? 
            filteredPairs.reduce((sum, pair) => sum + pair.usageCount, 0) / filteredPairs.length : 0;

          data.push({
            x: matchRange,
            y: positionRange,
            value: avgValue,
            count: filteredPairs.length,
            items: [] // We don't need to store the individual items for this view
          });
        });
      });
    }

    return data;
  };

  const heatmapData = generateHeatmapData();

  // Get unique x and y values for grid
  const xValues = [...new Set(heatmapData.map(d => d.x))];
  const yValues = [...new Set(heatmapData.map(d => d.y))];

  // Calculate color intensity based on count (number of embeddings)
  const getColorIntensity = (count: number, maxCount: number) => {
    if (maxCount === 0) return 0;
    return (count / maxCount) * 100;
  };

  // Get color based on intensity using the same HSL scale as individual heatmaps
  const getColor = (intensity: number) => {
    if (intensity === 0) return 'transparent';
    return `hsl(${240 - intensity * 2.4}, 70%, ${50 - intensity * 0.3}%)`;
  };

  const maxCount = Math.max(...heatmapData.map(d => d.count));

  const getDimensionTitle = () => {
    switch (selectedDimension) {
      case 'usage-match':
        return 'Usage vs Match Percentage (Count)';
      case 'usage-position':
        return 'Usage vs Position (Count)';
      case 'match-position':
        return 'Match % vs Position (Count)';
      default:
        return '';
    }
  };

  const getAxisLabels = () => {
    switch (selectedDimension) {
      case 'usage-match':
        return { x: 'Match Percentage', y: 'Usage Count' };
      case 'usage-position':
        return { x: 'Position Range', y: 'Usage Count' };
      case 'match-position':
        return { x: 'Position Range', y: 'Match Percentage' };
      default:
        return { x: '', y: '' };
    }
  };

  const getValueLabel = (value: number) => {
    switch (selectedDimension) {
      case 'usage-match':
        return `${value.toFixed(1)} pos`;
      case 'usage-position':
        return `${value.toFixed(1)}%`;
      case 'match-position':
        return `${value.toFixed(0)} uses`;
      default:
        return value.toFixed(1);
    }
  };

  const getLegendTitle = () => {
    switch (selectedDimension) {
      case 'usage-match':
        return 'Number of Embeddings';
      case 'usage-position':
        return 'Number of Embeddings';
      case 'match-position':
        return 'Number of Embeddings';
      default:
        return 'Number of Embeddings';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Grid3X3 className="h-5 w-5" />
          Performance Heatmap
        </CardTitle>
        <CardDescription>
          {getDimensionTitle()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Dimension Selector */}
          <div className="flex gap-2">
            <Badge 
              variant={selectedDimension === 'match-position' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedDimension('match-position')}
            >
              Match vs Position
            </Badge>
            <Badge 
              variant={selectedDimension === 'usage-match' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedDimension('usage-match')}
            >
              Usage vs Match
            </Badge>
            <Badge 
              variant={selectedDimension === 'usage-position' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedDimension('usage-position')}
            >
              Usage vs Position
            </Badge>
          </div>

          {/* Heatmap Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Main grid container with proper alignment */}
              <div className="grid gap-1" style={{ 
                gridTemplateColumns: `80px repeat(${xValues.length}, minmax(100px, 1fr))`,
                gridTemplateRows: `repeat(${yValues.length + 1}, 40px)`
              }}>
                
                {/* Top-left empty cell */}
                <div className="w-20"></div>
                
                {/* X-axis labels (top row) */}
                {xValues.map((x) => (
                  <div key={x} className="flex items-center justify-center text-xs font-medium text-muted-foreground border-b">
                    {x}
                  </div>
                ))}
                
                {/* Y-axis labels and heatmap cells */}
                {yValues.map((y, yIndex) => (
                  <div key={y} className="contents">
                    {/* Y-axis label */}
                    <div className="flex items-center justify-end pr-2 text-xs font-medium text-muted-foreground border-r">
                      {y}
                    </div>
                    
                    {/* Heatmap cells for this row */}
                    {xValues.map((x) => {
                      const cell = heatmapData.find(d => d.x === x && d.y === y);
                      const intensity = cell ? getColorIntensity(cell.count, maxCount) : 0;
                      
                      return (
                        <div
                          key={`${x}-${y}`}
                          className={`
                            rounded border flex items-center justify-center text-xs font-medium transition-all duration-200
                            ${cell && cell.count > 0 ? 'cursor-pointer hover:ring-2 hover:ring-blue-300 hover:scale-105' : ''}
                          `}
                          style={{
                            backgroundColor: cell && cell.count > 0 
                              ? getColor(intensity)
                              : 'transparent',
                            color: cell && cell.count > 0 ? 'white' : '#6b7280'
                          }}
                          title={cell ? `${cell.count} embeddings` : 'No data'}
                        >
                          {cell && cell.count > 0 ? (
                            <div className="text-center">
                              <div className="text-lg font-bold">{cell.count}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Axis Labels */}
          <div className="mt-4 text-center text-sm text-muted-foreground">
            <div className="flex justify-between items-center">
              <span>{getAxisLabels().y}</span>
              <span>{getAxisLabels().x}</span>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4">
            <div className="text-center text-sm font-medium text-muted-foreground mb-2">
              {getLegendTitle()}
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

export default EmbeddingHeatmap; 