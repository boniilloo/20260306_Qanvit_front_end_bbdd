import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Activity, 
  BarChart3,
  Clock,
  Info
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

interface MetricsDashboardProps {
  stats: EmbeddingStats[];
  loading: boolean;
  totalEmbeddingsInTable?: number;
}

const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ stats, loading, totalEmbeddingsInTable }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-100 rounded animate-pulse mb-2"></div>
              <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Calculate metrics
  const totalEmbeddings = stats.length;
  const totalUsage = stats.reduce((sum, stat) => sum + stat.usage_count, 0);
  const avgMatchPercentage = stats.length > 0 ? 
    stats.reduce((sum, stat) => sum + stat.avg_match_percentage, 0) / stats.length : 0;
  const avgPosition = stats.length > 0 ? 
    stats.reduce((sum, stat) => sum + stat.avg_position, 0) / stats.length : 0;

  // Usage distribution
  const highUsage = stats.filter(s => s.usage_count >= 50).length;
  const mediumUsage = stats.filter(s => s.usage_count >= 10 && s.usage_count < 50).length;
  const lowUsage = stats.filter(s => s.usage_count < 10).length;

  // Match quality distribution
  const excellentMatch = stats.filter(s => s.avg_match_percentage >= 80).length;
  const goodMatch = stats.filter(s => s.avg_match_percentage >= 60 && s.avg_match_percentage < 80).length;
  const fairMatch = stats.filter(s => s.avg_match_percentage >= 40 && s.avg_match_percentage < 60).length;
  const poorMatch = stats.filter(s => s.avg_match_percentage < 40).length;



  // Source type distribution
  const companyEmbeddings = stats.filter(s => s.source_type === 'company').length;
  const productEmbeddings = stats.filter(s => s.source_type === 'product').length;

  const getTrendIndicator = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Clock className="h-4 w-4 text-gray-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Usage Metrics */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Usage Distribution</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-w-xs">
                      <p className="font-medium mb-1">Usage Distribution Categories:</p>
                      <ul className="text-sm space-y-1">
                        <li><strong>High Usage:</strong> 50+ times used</li>
                        <li><strong>Medium Usage:</strong> 10-49 times used</li>
                        <li><strong>Low Usage:</strong> Less than 10 times used</li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        Based on total usage count from embedding_usage_counters table
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">High Usage</span>
                <Badge variant="destructive">{highUsage}</Badge>
              </div>
              <Progress value={(highUsage / totalEmbeddings) * 100} className="h-2" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Medium Usage</span>
                <Badge variant="secondary">{mediumUsage}</Badge>
              </div>
              <Progress value={(mediumUsage / totalEmbeddings) * 100} className="h-2" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Low Usage</span>
                <Badge variant="outline">{lowUsage}</Badge>
              </div>
              <Progress value={(lowUsage / totalEmbeddings) * 100} className="h-2" />
            </div>
            <div className="mt-4 pt-3 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Total Embeddings</span>
                <Badge variant="default">
                  {totalEmbeddings}{totalEmbeddingsInTable ? `/${totalEmbeddingsInTable}` : ''}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Match Quality */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Match Quality</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="max-w-xs">
                      <p className="font-medium mb-1">Match Quality Categories:</p>
                      <ul className="text-sm space-y-1">
                        <li><strong>Excellent (80%+):</strong> Outstanding relevance</li>
                        <li><strong>Good (60-79%):</strong> High relevance</li>
                        <li><strong>Fair (40-59%):</strong> Moderate relevance</li>
                        <li><strong>Poor (&lt;40%):</strong> Low relevance</li>
                      </ul>
                      <p className="text-xs text-muted-foreground mt-2">
                        Based on trimmed mean (10% outliers removed) of match percentages from embedding_usage_counters
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Excellent (80%+)</span>
                <Badge className="bg-green-100 text-green-800">{excellentMatch}</Badge>
              </div>
              <Progress value={(excellentMatch / totalEmbeddings) * 100} className="h-2 bg-green-100" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Good (60-79%)</span>
                <Badge className="bg-blue-100 text-blue-800">{goodMatch}</Badge>
              </div>
              <Progress value={(goodMatch / totalEmbeddings) * 100} className="h-2 bg-blue-100" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Fair (40-59%)</span>
                <Badge className="bg-yellow-100 text-yellow-800">{fairMatch}</Badge>
              </div>
              <Progress value={(fairMatch / totalEmbeddings) * 100} className="h-2 bg-yellow-100" />
              
                              <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Poor (&lt;40%)</span>
                  <Badge className="bg-red-100 text-red-800">{poorMatch}</Badge>
                </div>
              <Progress value={(poorMatch / totalEmbeddings) * 100} className="h-2 bg-red-100" />
            </div>
          </CardContent>
        </Card>



        {/* Source Distribution */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Source Distribution</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Company</span>
                <Badge className="bg-blue-100 text-blue-800">{companyEmbeddings}</Badge>
              </div>
              <Progress value={(companyEmbeddings / totalEmbeddings) * 100} className="h-2 bg-blue-100" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Product</span>
                <Badge className="bg-green-100 text-green-800">{productEmbeddings}</Badge>
              </div>
              <Progress value={(productEmbeddings / totalEmbeddings) * 100} className="h-2 bg-green-100" />
            </div>
          </CardContent>
        </Card>
      </div>


    </div>
  );
};

export default MetricsDashboard; 