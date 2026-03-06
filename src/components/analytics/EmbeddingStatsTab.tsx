import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { 
  BarChart3, 
  TrendingUp, 
  Database, 
  Filter, 
  Download,
  RefreshCw,
  Building2,
  Package,
  Target,
  Activity,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import MetricsDashboard from './MetricsDashboard';
import EmbeddingHeatmap from './EmbeddingHeatmap';
import ChunkSizeChart from './ChunkSizeChart';

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

interface EmbeddingStatsTabProps {}

const EmbeddingStatsTab: React.FC<EmbeddingStatsTabProps> = () => {
  const [stats, setStats] = useState<EmbeddingStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filteredStats, setFilteredStats] = useState<EmbeddingStats[]>([]);
  const [paginatedStats, setPaginatedStats] = useState<EmbeddingStats[]>([]);
  const [totalEmbeddingsInTable, setTotalEmbeddingsInTable] = useState<number>(0);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'company' | 'product'>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'usage' | 'match' | 'position'>('usage');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedEmbedding, setExpandedEmbedding] = useState<string | null>(null);

  // Function to calculate trimmed mean (discard 10% top and bottom values)
  const calculateTrimmedMean = (values: number[]): number => {
    if (values.length === 0) return 0;
    if (values.length <= 2) return values.reduce((a, b) => a + b, 0) / values.length;
    
    // Sort values
    const sortedValues = [...values].sort((a, b) => a - b);
    
    // Calculate how many values to trim from each end (10%)
    const trimCount = Math.floor(values.length * 0.1);
    
    // Remove top and bottom 10%
    const trimmedValues = sortedValues.slice(trimCount, sortedValues.length - trimCount);
    
    // Calculate mean of remaining values
    return trimmedValues.reduce((a, b) => a + b, 0) / trimmedValues.length;
  };

  const loadEmbeddingStats = async () => {
    try {
      setLoading(true);
      
      // Get total count of embeddings in the table
      const { count: totalEmbeddings, error: countError } = await supabase
        .from('embedding')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      if (countError) {
        console.error('Error getting total embeddings count:', countError);
      } else {
        setTotalEmbeddingsInTable(totalEmbeddings || 0);
      }
      
      // Get embedding usage counters with pagination to load all records
      let allUsageData: any[] = [];
      let from = 0;
      const pageSize = 1000; // Supabase default limit
      let hasMore = true;

      // First, get the total count to show progress
      const { count: totalUsageCounters, error: usageCountError } = await supabase
        .from('embedding_usage_counters')
        .select('*', { count: 'exact', head: true });

      if (usageCountError) {
        console.error('Error getting total usage counters count:', usageCountError);
      } else {
        console.log(`Total usage counters to load: ${totalUsageCounters}`);
      }

      setLoadingProgress('Loading embedding usage counters...');

      while (hasMore) {
        const { data: usageData, error: usageError } = await supabase
          .from('embedding_usage_counters')
          .select('*')
          .order('usage_count', { ascending: false })
          .range(from, from + pageSize - 1);

        if (usageError) {
          console.error('Error loading embedding usage counters:', usageError);
          toast({
            title: "Error",
            description: "Failed to load embedding usage data.",
            variant: "destructive",
          });
          return;
        }

        if (usageData && usageData.length > 0) {
          allUsageData = [...allUsageData, ...usageData];
          from += pageSize;
          setLoadingProgress(`Loaded ${allUsageData.length} usage counters...`);
        } else {
          hasMore = false;
        }
      }

      setLoadingProgress(`Total usage counters loaded: ${allUsageData.length}. Loading embedding details...`);

      // Get embedding details in batches to avoid URL length issues
      const embeddingIds = allUsageData?.map(item => item.embedding_id) || [];
      
      if (embeddingIds.length === 0) {
        setStats([]);
        setFilteredStats([]);
        return;
      }

      // Process embeddings in batches of 100 to avoid URL length limits
      const batchSize = 100;
      let allEmbeddingData: any[] = [];
      
      setLoadingProgress(`Processing ${embeddingIds.length} embeddings in batches...`);
      
      for (let i = 0; i < embeddingIds.length; i += batchSize) {
        const batch = embeddingIds.slice(i, i + batchSize);
        
        const { data: batchData, error: batchError } = await supabase
          .from('embedding')
          .select(`
            id,
            text,
            id_company_revision,
            id_product_revision,
            is_active,
            chunk_size
          `)
          .in('id', batch)
          .eq('is_active', true);

        if (batchError) {
          console.error('Error loading embedding batch:', batchError);
          toast({
            title: "Error",
            description: "Failed to load embedding details.",
            variant: "destructive",
          });
          return;
        }

        allEmbeddingData = [...allEmbeddingData, ...(batchData || [])];
        setLoadingProgress(`Processed ${allEmbeddingData.length}/${embeddingIds.length} embeddings...`);
      }

      const embeddingData = allEmbeddingData;
      setLoadingProgress('Loading company and product data...');

      // Get company and product names in batches
      const companyRevisionIds = embeddingData
        ?.filter(e => e.id_company_revision)
        .map(e => e.id_company_revision) || [];
      
      const productRevisionIds = embeddingData
        ?.filter(e => e.id_product_revision)
        .map(e => e.id_product_revision) || [];

      let companyData: any[] = [];
      let productData: any[] = [];

      // Process company revisions in batches
      if (companyRevisionIds.length > 0) {
        for (let i = 0; i < companyRevisionIds.length; i += batchSize) {
          const batch = companyRevisionIds.slice(i, i + batchSize);
          const { data: batchData } = await supabase
            .from('company_revision')
            .select('id, nombre_empresa')
            .in('id', batch);
          companyData = [...companyData, ...(batchData || [])];
        }
      }

      // Process product revisions in batches
      if (productRevisionIds.length > 0) {
        for (let i = 0; i < productRevisionIds.length; i += batchSize) {
          const batch = productRevisionIds.slice(i, i + batchSize);
          const { data: batchData } = await supabase
            .from('product_revision')
            .select('id, product_name')
            .in('id', batch);
          productData = [...productData, ...(batchData || [])];
        }
      }

      // Combine data and calculate statistics
      const combinedStats: EmbeddingStats[] = (allUsageData || []).map(usage => {
        const embedding = embeddingData?.find(e => e.id === usage.embedding_id);
        if (!embedding) return null;

        // Parse positions and match percentages
        const positions = usage.positions ? usage.positions.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p)) : [];
        const matchPercentages = usage.match_percentages ? usage.match_percentages.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p)) : [];
        const vectorSimilarities = usage.vector_similarities ? usage.vector_similarities.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p)) : [];

        // Calculate statistics using trimmed mean for match percentages
        const avgMatchPercentage = calculateTrimmedMean(matchPercentages);
        const avgPosition = positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : 0;
        
        const stdDevMatchPercentage = matchPercentages.length > 0 ? 
          Math.sqrt(matchPercentages.reduce((sum, val) => sum + Math.pow(val - avgMatchPercentage, 2), 0) / matchPercentages.length) : 0;
        const stdDevPosition = positions.length > 0 ? 
          Math.sqrt(positions.reduce((sum, val) => sum + Math.pow(val - avgPosition, 2), 0) / positions.length) : 0;

        // Determine source type and get names
        let sourceType: 'company' | 'product' = 'company';
        let companyName = '';
        let productName = '';

        if (embedding.id_company_revision) {
          const company = companyData.find(c => c.id === embedding.id_company_revision);
          companyName = company?.nombre_empresa || 'Unknown Company';
        } else if (embedding.id_product_revision) {
          sourceType = 'product';
          const product = productData.find(p => p.id === embedding.id_product_revision);
          productName = product?.product_name || 'Unknown Product';
        }

        return {
          embedding_id: usage.embedding_id,
          usage_count: usage.usage_count,
          positions: usage.positions,
          match_percentages: usage.match_percentages,
          vector_similarities: usage.vector_similarities,
          text: embedding.text,
          source_type: sourceType,
          company_name: companyName,
          product_name: productName,
          chunk_size: embedding.chunk_size,
          avg_match_percentage: avgMatchPercentage,
          avg_position: avgPosition,
          std_dev_match_percentage: stdDevMatchPercentage,
          std_dev_position: stdDevPosition,
        };
      }).filter(Boolean) as EmbeddingStats[];

      setStats(combinedStats);
      setFilteredStats(combinedStats);
      setLoadingProgress('');
    } catch (error) {
      console.error('Error loading embedding stats:', error);
      toast({
        title: "Error",
        description: "Failed to load embedding statistics.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmbeddingStats();
  }, []);

  useEffect(() => {
    let filtered = [...stats];

    // Apply source filter
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(stat => stat.source_type === sourceFilter);
    }

    // Apply usage filter
    if (usageFilter !== 'all') {
      const usageThresholds = {
        high: 50,
        medium: 10,
        low: 0
      };
      
      if (usageFilter === 'high') {
        filtered = filtered.filter(stat => stat.usage_count >= usageThresholds.high);
      } else if (usageFilter === 'medium') {
        filtered = filtered.filter(stat => 
          stat.usage_count >= usageThresholds.medium && stat.usage_count < usageThresholds.high
        );
      } else if (usageFilter === 'low') {
        filtered = filtered.filter(stat => stat.usage_count < usageThresholds.medium);
      }
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(stat => 
        stat.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stat.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stat.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortBy) {
        case 'usage':
          aValue = a.usage_count;
          bValue = b.usage_count;
          break;
        case 'match':
          aValue = a.avg_match_percentage;
          bValue = b.avg_match_percentage;
          break;
        case 'position':
          aValue = a.avg_position;
          bValue = b.avg_position;
          break;
        default:
          aValue = a.usage_count;
          bValue = b.usage_count;
      }

      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    setFilteredStats(filtered);
    
    // Reset to first page when filters change
    setCurrentPage(1);
  }, [stats, sourceFilter, usageFilter, searchTerm, sortBy, sortOrder]);

  // Handle pagination
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginated = filteredStats.slice(startIndex, endIndex);
    setPaginatedStats(paginated);
  }, [filteredStats, currentPage, pageSize]);

  const getUsageBadge = (count: number) => {
    if (count >= 50) return <Badge className="bg-green-100 text-green-800">High</Badge>;
    if (count >= 10) return <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>;
    return <Badge className="bg-gray-100 text-gray-800">Low</Badge>;
  };

  const getMatchBadge = (percentage: number) => {
    if (percentage >= 80) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (percentage >= 60) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
    if (percentage >= 40) return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>;
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>;
  };

  // Function to generate individual embedding heatmap data
  const generateIndividualHeatmap = (stat: EmbeddingStats) => {
    const positions = stat.positions ? stat.positions.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p)) : [];
    const matchPercentages = stat.match_percentages ? stat.match_percentages.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p)) : [];
    
    if (positions.length === 0 || matchPercentages.length === 0) {
      return null;
    }

    // Create position-match pairs
    const pairs = positions.map((position, index) => ({
      position,
      matchPercentage: matchPercentages[index] || 0
    })).filter(pair => !isNaN(pair.position) && !isNaN(pair.matchPercentage));

    // Define ranges
    const positionRanges = ['0-39%', '40-59%', '60-79%', '80-100%'];
    const matchRanges = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'];

    // Generate heatmap data
    const heatmapData: { x: string; y: string; count: number }[] = [];

    matchRanges.forEach(matchRange => {
      positionRanges.forEach(positionRange => {
        const [minPos, maxPos] = positionRange.replace('%', '').split('-').map(Number);
        const [minMatch, maxMatch] = matchRange.split('-').map(Number);
        
        const count = pairs.filter(pair => 
          pair.position >= minPos && pair.position <= maxPos &&
          pair.matchPercentage >= minMatch && pair.matchPercentage <= maxMatch
        ).length;

        heatmapData.push({
          x: positionRange,
          y: matchRange,
          count
        });
      });
    });

    return { heatmapData, pairs };
  };

  const exportData = () => {
    const csvContent = [
      ['Embedding ID', 'Source Type', 'Company/Product', 'Usage Count', 'Avg Match %', 'Avg Position', 'Std Dev Match %', 'Std Dev Position', 'Text Preview'],
      ...filteredStats.map(stat => [
        stat.embedding_id,
        stat.source_type,
        stat.source_type === 'company' ? stat.company_name : stat.product_name,
        stat.usage_count.toString(),
        stat.avg_match_percentage.toFixed(2),
        stat.avg_position.toFixed(2),
        stat.std_dev_match_percentage.toFixed(2),
        stat.std_dev_position.toFixed(2),
        stat.text.substring(0, 100) + (stat.text.length > 100 ? '...' : '')
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `embedding-stats-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalEmbeddings = stats.length;
  const totalUsage = stats.reduce((sum, stat) => sum + stat.usage_count, 0);
  const avgMatchPercentage = stats.length > 0 ? 
    stats.reduce((sum, stat) => sum + stat.avg_match_percentage, 0) / stats.length : 0;
  const avgPosition = stats.length > 0 ? 
    stats.reduce((sum, stat) => sum + stat.avg_position, 0) / stats.length : 0;

  return (
    <div className="space-y-6">
      {/* Loading Progress */}
      {loadingProgress && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-700">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">{loadingProgress}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metrics Dashboard */}
      <MetricsDashboard stats={stats} loading={loading} totalEmbeddingsInTable={totalEmbeddingsInTable} />

      {/* Heatmap Section */}
      <EmbeddingHeatmap stats={stats} loading={loading} />

      {/* Chunk Size Chart Section */}
      <ChunkSizeChart stats={stats} loading={loading} />

      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Embedding List</CardTitle>
              <CardDescription>
                Showing {paginatedStats.length} of {filteredStats.length} filtered embeddings (Total: {totalEmbeddings})
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="page-size" className="text-sm">Page Size:</Label>
              <Select value={pageSize.toString()} onValueChange={(value) => {
                setPageSize(parseInt(value));
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters and Controls */}
          <div className="space-y-4 mb-6 pb-6 border-b">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  placeholder="Search by text, company, or product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="source-filter">Source Type</Label>
                <Select value={sourceFilter} onValueChange={(value: any) => setSourceFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="company">Company Only</SelectItem>
                    <SelectItem value="product">Product Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="usage-filter">Usage Level</Label>
                <Select value={usageFilter} onValueChange={(value: any) => setUsageFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Usage</SelectItem>
                    <SelectItem value="high">High (50+)</SelectItem>
                    <SelectItem value="medium">Medium (10-49)</SelectItem>
                    <SelectItem value="low">Low (0-9)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="sort-by">Sort By</Label>
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usage">Usage Count</SelectItem>
                    <SelectItem value="match">Match Percentage</SelectItem>
                    <SelectItem value="position">Position</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? '↑' : '↓'} {sortBy === 'usage' ? 'Usage Count' : sortBy === 'match' ? 'Match %' : 'Position'}
              </Button>

              <Button variant="outline" onClick={loadEmbeddingStats}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>

              <Button variant="outline" onClick={exportData}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading embedding statistics...</div>
            </div>
          ) : filteredStats.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">No embeddings found matching the current filters.</div>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedStats.map((stat) => {
                const heatmapData = generateIndividualHeatmap(stat);
                const isExpanded = expandedEmbedding === stat.embedding_id;
                
                return (
                <div key={stat.embedding_id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {stat.source_type === 'company' ? (
                          <Building2 className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Package className="h-4 w-4 text-green-500" />
                        )}
                        <span className="font-medium">
                          {stat.source_type === 'company' ? stat.company_name : stat.product_name}
                        </span>
                        <Badge variant="outline">{stat.source_type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {stat.text}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedEmbedding(isExpanded ? null : stat.embedding_id)}
                      className="ml-2"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Usage:</span>
                        {getUsageBadge(stat.usage_count)}
                      </div>
                      <div className="text-muted-foreground">{stat.usage_count} times</div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Match:</span>
                        {getMatchBadge(stat.avg_match_percentage)}
                      </div>
                      <div className="text-muted-foreground">
                        {stat.avg_match_percentage.toFixed(1)}% ± {stat.std_dev_match_percentage.toFixed(1)}
                      </div>
                    </div>

                    <div>
                      <div className="font-medium">Position:</div>
                      <div className="text-muted-foreground">
                        {stat.avg_position.toFixed(1)} ± {stat.std_dev_position.toFixed(1)}
                      </div>
                    </div>

                    <div>
                      <div className="font-medium">Chunk Size:</div>
                      <div className="text-muted-foreground">
                        {stat.chunk_size || 'Null'}
                      </div>
                    </div>

                    <div>
                      <div className="font-medium">ID:</div>
                      <div className="text-muted-foreground text-xs font-mono">
                        {stat.embedding_id.substring(0, 8)}...
                      </div>
                    </div>
                  </div>

                  {/* Expandable Heatmap */}
                  {isExpanded && heatmapData && (
                    <div className="pt-4 border-t">
                      <div className="mb-4">
                        <h4 className="text-sm font-medium mb-2">Match % vs Position Heatmap</h4>
                        <p className="text-xs text-muted-foreground">
                          Showing {heatmapData.pairs.length} data points for this embedding
                        </p>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <div className="inline-block min-w-full">
                          {/* Header row with position ranges */}
                          <div className="grid grid-cols-5 gap-1 mb-2">
                            <div className="text-xs font-medium text-center">Match %</div>
                            {['0-39%', '40-59%', '60-79%', '80-100%'].map((range) => (
                              <div key={range} className="text-xs font-medium text-center">
                                {range}
                              </div>
                            ))}
                          </div>
                          
                          {/* Heatmap rows */}
                          {['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'].map((matchRange) => (
                            <div key={matchRange} className="grid grid-cols-5 gap-1 mb-1">
                              <div className="text-xs text-muted-foreground text-center py-1">
                                {matchRange}
                              </div>
                              {['0-39%', '40-59%', '60-79%', '80-100%'].map((positionRange) => {
                                const cell = heatmapData.heatmapData.find(
                                  d => d.x === positionRange && d.y === matchRange
                                );
                                const count = cell?.count || 0;
                                const maxCount = Math.max(...heatmapData.heatmapData.map(d => d.count));
                                const intensity = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                
                                return (
                                  <div
                                    key={positionRange}
                                    className={`text-xs text-center py-1 rounded ${
                                      count > 0 
                                        ? 'text-white font-medium' 
                                        : 'text-muted-foreground'
                                    }`}
                                    style={{
                                      backgroundColor: count > 0 
                                        ? `hsl(${240 - intensity * 2.4}, 70%, ${50 - intensity * 0.3}%)`
                                        : 'transparent'
                                    }}
                                    title={`${count} embeddings in ${matchRange} match % and ${positionRange} position range`}
                                  >
                                    {count > 0 ? count : '-'}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Color legend */}
                      <div className="mt-3 flex items-center justify-center">
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
                  )}
                </div>
              );
            })}
              
              {/* Pagination Controls */}
              {filteredStats.length > pageSize && (
                <div className="flex items-center justify-between pt-6 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {Math.ceil(filteredStats.length / pageSize)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(Math.ceil(filteredStats.length / pageSize), currentPage + 1))}
                      disabled={currentPage === Math.ceil(filteredStats.length / pageSize)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmbeddingStatsTab; 