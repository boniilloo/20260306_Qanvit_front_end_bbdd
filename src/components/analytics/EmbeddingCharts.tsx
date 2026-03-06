import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  ComposedChart,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart3, 
  TrendingUp, 
  Target, 
  Activity,
  PieChart as PieChartIcon,
  ScatterChart as ScatterChartIcon,
  BarChart as BarChartIcon,
  LineChart as LineChartIcon
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

interface EmbeddingChartsProps {
  stats: EmbeddingStats[];
  loading: boolean;
}

const COLORS = {
  company: '#3B82F6',
  product: '#10B981',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#6B7280',
  excellent: '#10B981',
  good: '#3B82F6',
  fair: '#F59E0B',
  poor: '#EF4444',
};

const EmbeddingCharts: React.FC<EmbeddingChartsProps> = ({ stats, loading }) => {
  const [selectedChart, setSelectedChart] = React.useState<'usage' | 'match' | 'position' | 'distribution'>('usage');
  const [chartType, setChartType] = React.useState<'bar' | 'line' | 'scatter' | 'area'>('bar');

  // Prepare data for charts - ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const usageDistribution = React.useMemo(() => {
    if (loading || !stats.length) {
      return [
        { range: '0-9', count: 0, label: 'Low Usage' },
        { range: '10-49', count: 0, label: 'Medium Usage' },
        { range: '50+', count: 0, label: 'High Usage' },
      ];
    }

    const distribution = [
      { range: '0-9', count: 0, label: 'Low Usage' },
      { range: '10-49', count: 0, label: 'Medium Usage' },
      { range: '50+', count: 0, label: 'High Usage' },
    ];

    stats.forEach(stat => {
      if (stat.usage_count < 10) distribution[0].count++;
      else if (stat.usage_count < 50) distribution[1].count++;
      else distribution[2].count++;
    });

    return distribution;
  }, [stats, loading]);

  const sourceTypeDistribution = React.useMemo(() => {
    if (loading || !stats.length) {
      return [
        { name: 'Company', value: 0, color: COLORS.company },
        { name: 'Product', value: 0, color: COLORS.product },
      ];
    }

    const companyCount = stats.filter(s => s.source_type === 'company').length;
    const productCount = stats.filter(s => s.source_type === 'product').length;
    
    return [
      { name: 'Company', value: companyCount, color: COLORS.company },
      { name: 'Product', value: productCount, color: COLORS.product },
    ];
  }, [stats, loading]);

  const topUsageData = React.useMemo(() => {
    if (loading || !stats.length) return [];

    return stats
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 10)
      .map(stat => ({
        name: stat.source_type === 'company' ? stat.company_name : stat.product_name,
        usage: stat.usage_count,
        match: stat.avg_match_percentage,
        position: stat.avg_position,
        type: stat.source_type,
        text: stat.text.substring(0, 50) + '...',
      }));
  }, [stats, loading]);

  const matchVsPositionData = React.useMemo(() => {
    if (loading || !stats.length) return [];

    return stats.map(stat => ({
      match: stat.avg_match_percentage,
      position: stat.avg_position,
      usage: stat.usage_count,
      type: stat.source_type,
      name: stat.source_type === 'company' ? stat.company_name : stat.product_name,
    }));
  }, [stats, loading]);

  const matchDistribution = React.useMemo(() => {
    if (loading || !stats.length) {
      return [
        { range: '0-39%', count: 0, label: 'Poor' },
        { range: '40-59%', count: 0, label: 'Fair' },
        { range: '60-79%', count: 0, label: 'Good' },
        { range: '80-100%', count: 0, label: 'Excellent' },
      ];
    }

    const distribution = [
      { range: '0-39%', count: 0, label: 'Poor' },
      { range: '40-59%', count: 0, label: 'Fair' },
      { range: '60-79%', count: 0, label: 'Good' },
      { range: '80-100%', count: 0, label: 'Excellent' },
    ];

    stats.forEach(stat => {
      if (stat.avg_match_percentage < 40) distribution[0].count++;
      else if (stat.avg_match_percentage < 60) distribution[1].count++;
      else if (stat.avg_match_percentage < 80) distribution[2].count++;
      else distribution[3].count++;
    });

    return distribution;
  }, [stats, loading]);

  const positionDistribution = React.useMemo(() => {
    if (loading || !stats.length) {
      return [
        { range: '1-5', count: 0, label: 'Top 5' },
        { range: '6-10', count: 0, label: 'Top 10' },
        { range: '11-20', count: 0, label: 'Top 20' },
        { range: '20+', count: 0, label: 'Lower' },
      ];
    }

    const distribution = [
      { range: '1-5', count: 0, label: 'Top 5' },
      { range: '6-10', count: 0, label: 'Top 10' },
      { range: '11-20', count: 0, label: 'Top 20' },
      { range: '20+', count: 0, label: 'Lower' },
    ];

    stats.forEach(stat => {
      if (stat.avg_position <= 5) distribution[0].count++;
      else if (stat.avg_position <= 10) distribution[1].count++;
      else if (stat.avg_position <= 20) distribution[2].count++;
      else distribution[3].count++;
    });

    return distribution;
  }, [stats, loading]);

  // Loading state - NOW AFTER ALL HOOKS
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3"></div>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-gray-100 rounded animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const renderChart = () => {
    switch (selectedChart) {
      case 'usage':
        return (
          <ResponsiveContainer width="100%" height={400}>
            {chartType === 'bar' ? (
              <BarChart data={topUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white p-3 border rounded-lg shadow-lg">
                          <p className="font-medium">{label}</p>
                          <p className="text-sm text-gray-600">{payload[0].payload.text}</p>
                          <p className="text-sm">Usage: {payload[0].value}</p>
                          <p className="text-sm">Match: {payload[0].payload.match.toFixed(1)}%</p>
                          <p className="text-sm">Position: {payload[0].payload.position.toFixed(1)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar dataKey="usage" fill={COLORS.company} name="Usage Count" />
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={topUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="usage" stroke={COLORS.company} strokeWidth={2} />
              </LineChart>
            ) : (
              <AreaChart data={topUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="usage" fill={COLORS.company} stroke={COLORS.company} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        );

      case 'match':
        return (
          <ResponsiveContainer width="100%" height={400}>
            {chartType === 'bar' ? (
              <BarChart data={matchDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill={COLORS.good} name="Embeddings Count" />
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={topUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="match" stroke={COLORS.good} strokeWidth={2} />
              </LineChart>
            ) : (
              <ScatterChart data={matchVsPositionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="match" name="Match %" />
                <YAxis dataKey="position" name="Position" />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border rounded-lg shadow-lg">
                          <p className="font-medium">{data.name}</p>
                          <p className="text-sm">Match: {data.match.toFixed(1)}%</p>
                          <p className="text-sm">Position: {data.position.toFixed(1)}</p>
                          <p className="text-sm">Usage: {data.usage}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Scatter 
                  dataKey="position" 
                  fill={COLORS.company} 
                  name="Position vs Match"
                />
              </ScatterChart>
            )}
          </ResponsiveContainer>
        );

      case 'position':
        return (
          <ResponsiveContainer width="100%" height={400}>
            {chartType === 'bar' ? (
              <BarChart data={positionDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill={COLORS.medium} name="Embeddings Count" />
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={topUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="position" stroke={COLORS.medium} strokeWidth={2} />
              </LineChart>
            ) : (
              <ComposedChart data={topUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="usage" fill={COLORS.company} name="Usage" />
                <Line yAxisId="right" type="monotone" dataKey="position" stroke={COLORS.medium} strokeWidth={2} name="Position" />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        );

      case 'distribution':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Usage Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={usageDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {usageDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={[COLORS.low, COLORS.medium, COLORS.high][index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Source Type Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={sourceTypeDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {sourceTypeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Chart Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Interactive Charts
          </CardTitle>
          <CardDescription>
            Visualize embedding performance and usage patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Chart Type:</span>
              <Select value={selectedChart} onValueChange={(value: any) => setSelectedChart(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usage">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Usage Statistics
                    </div>
                  </SelectItem>
                  <SelectItem value="match">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Match Performance
                    </div>
                  </SelectItem>
                  <SelectItem value="position">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Position Analysis
                    </div>
                  </SelectItem>
                  <SelectItem value="distribution">
                    <div className="flex items-center gap-2">
                      <PieChartIcon className="h-4 w-4" />
                      Distribution Overview
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedChart !== 'distribution' && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Visualization:</span>
                <Select value={chartType} onValueChange={(value: any) => setChartType(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">
                      <div className="flex items-center gap-2">
                        <BarChartIcon className="h-4 w-4" />
                        Bar Chart
                      </div>
                    </SelectItem>
                    <SelectItem value="line">
                      <div className="flex items-center gap-2">
                        <LineChartIcon className="h-4 w-4" />
                        Line Chart
                      </div>
                    </SelectItem>
                    <SelectItem value="scatter">
                      <div className="flex items-center gap-2">
                        <ScatterChartIcon className="h-4 w-4" />
                        Scatter Plot
                      </div>
                    </SelectItem>
                    <SelectItem value="area">
                      <div className="flex items-center gap-2">
                        <AreaChart className="h-4 w-4" />
                        Area Chart
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {renderChart()}
        </CardContent>
      </Card>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">High Usage</p>
                <p className="text-2xl font-bold text-red-600">
                  {usageDistribution[2].count}
                </p>
              </div>
              <Badge variant="destructive">50+ uses</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Excellent Match</p>
                <p className="text-2xl font-bold text-green-600">
                  {matchDistribution[3].count}
                </p>
              </div>
              <Badge variant="default" className="bg-green-100 text-green-800">80%+</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Top 5 Position</p>
                <p className="text-2xl font-bold text-blue-600">
                  {positionDistribution[0].count}
                </p>
              </div>
              <Badge variant="secondary">Top 5</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Company Sources</p>
                <p className="text-2xl font-bold text-blue-600">
                  {sourceTypeDistribution[0].value}
                </p>
              </div>
              <Badge variant="outline">Companies</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmbeddingCharts; 