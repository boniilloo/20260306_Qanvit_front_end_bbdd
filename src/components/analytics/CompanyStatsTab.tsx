import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Building2, 
  TrendingUp, 
  BarChart3, 
  Activity,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CompanyStats {
  company_id: string;
  company_name: string;
  total_retrievals: number;
  product_retrievals: number;
  company_revision_retrievals: number;
  avg_match_percentage: number;
  avg_position: number;
  best_match_percentage: number;
  worst_match_percentage: number;
  unique_embeddings: number;
  position_distribution: Record<number, number>;
  match_percentage_distribution: Record<string, number>;
}

interface CompanyAnalytics {
  totalCompanies: number;
  totalRetrievals: number;
  avgRetrievalsPerCompany: number;
  topPerformingCompanies: number;
  performanceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  positionHeatmap: Record<number, number>;
  matchPercentageHeatmap: Record<string, number>;
}

export default function CompanyStatsTab() {
  const [stats, setStats] = useState<CompanyStats[]>([]);
  const [analytics, setAnalytics] = useState<CompanyAnalytics>({
    totalCompanies: 0,
    totalRetrievals: 0,
    avgRetrievalsPerCompany: 0,
    topPerformingCompanies: 0,
    performanceDistribution: { high: 0, medium: 0, low: 0 },
    positionHeatmap: {},
    matchPercentageHeatmap: {}
  });
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('total_retrievals');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const loadCompanyStats = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress('Starting company statistics load...');

    try {
      const batchSize = 100;

      // Step 1: Load all embedding usage statistics with pagination
      setLoadingProgress('Loading embedding usage statistics...');
      
      const allUsageCounters: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error: batchError } = await supabase
          .from('embedding_usage_counters')
          .select('*')
          .range(from, from + pageSize - 1);

        if (batchError) {
          console.error('Error loading usage counters:', batchError);
          throw new Error(`Error loading statistics: ${batchError.message}`);
        }

        if (batch && batch.length > 0) {
          allUsageCounters.push(...batch);
          from += pageSize;
          setLoadingProgress(`Loading embedding statistics... (${allUsageCounters.length} loaded)`);
        } else {
          hasMore = false;
        }
      }

      console.log('Cargados', allUsageCounters.length, 'contadores de uso');

      // Paso 2: Cargar embeddings que tienen estadísticas
      const embeddingIds = [...new Set(allUsageCounters.map(counter => counter.embedding_id))] as string[];
      
      setLoadingProgress(`Cargando ${embeddingIds.length} embeddings...`);
      
      const allEmbeddings: any[] = [];
      for (let i = 0; i < embeddingIds.length; i += batchSize) {
        const batch = embeddingIds.slice(i, i + batchSize);
        const { data: batchData, error: batchError } = await supabase
          .from('embedding')
          .select('id, id_product_revision, id_company_revision')
          .in('id', batch);

        if (batchError) {
          console.error('Error cargando lote de embeddings:', batchError);
          throw new Error(`Error cargando embeddings: ${batchError.message}`);
        }

        if (batchData) {
          allEmbeddings.push(...batchData);
        }
      }

      console.log('Cargados', allEmbeddings.length, 'embeddings');

      // Paso 3: Separar embeddings por tipo y obtener company_ids
      const productEmbeddings = allEmbeddings.filter(emb => emb.id_product_revision !== null);
      const companyRevisionEmbeddings = allEmbeddings.filter(emb => emb.id_company_revision !== null);

      console.log('Embeddings con productos:', productEmbeddings.length);
      console.log('Embeddings con revisiones de empresa:', companyRevisionEmbeddings.length);

      // Paso 4: Obtener product_revision IDs únicos
      const productRevisionIds = [...new Set(productEmbeddings.map(emb => emb.id_product_revision))] as string[];
      console.log('Product revision IDs únicos:', productRevisionIds.length);

      // Paso 5: Cargar product_revision records
      setLoadingProgress(`Cargando ${productRevisionIds.length} revisiones de productos...`);
      
      const allProductRevisions: any[] = [];
      for (let i = 0; i < productRevisionIds.length; i += batchSize) {
        const batch = productRevisionIds.slice(i, i + batchSize);
        const { data: batchData, error: batchError } = await supabase
          .from('product_revision')
          .select('id, product_id')
          .in('id', batch);

        if (batchError) {
          console.error('Error cargando lote de product revisions:', batchError);
          throw new Error(`Error cargando revisiones de productos: ${batchError.message}`);
        }

        if (batchData) {
          allProductRevisions.push(...batchData);
        }
      }

      console.log('Cargadas', allProductRevisions.length, 'revisiones de productos');

      // Paso 6: Obtener product IDs únicos
      const productIds = [...new Set(allProductRevisions.map(pr => pr.product_id))] as string[];
      console.log('Product IDs únicos:', productIds.length);

      // Paso 7: Cargar products para obtener company_ids
      setLoadingProgress(`Cargando ${productIds.length} productos...`);
      
      const allProducts: any[] = [];
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        const { data: batchData, error: batchError } = await supabase
          .from('product')
          .select('id, company_id')
          .in('id', batch);

        if (batchError) {
          console.error('Error cargando lote de productos:', batchError);
          throw new Error(`Error cargando productos: ${batchError.message}`);
        }

        if (batchData) {
          allProducts.push(...batchData);
        }
      }

      console.log('Cargados', allProducts.length, 'productos');

      // Paso 8: Obtener company_revision IDs únicos
      const companyRevisionIds = [...new Set(companyRevisionEmbeddings.map(emb => emb.id_company_revision))] as string[];
      console.log('Company revision IDs únicos:', companyRevisionIds.length);

      // Paso 9: Cargar company_revision records
      setLoadingProgress(`Cargando ${companyRevisionIds.length} revisiones de empresas...`);
      
      const allCompanyRevisions: any[] = [];
      for (let i = 0; i < companyRevisionIds.length; i += batchSize) {
        const batch = companyRevisionIds.slice(i, i + batchSize);
        const { data: batchData, error: batchError } = await supabase
          .from('company_revision')
          .select('id, nombre_empresa, company_id')
          .in('id', batch);

        if (batchError) {
          console.error('Error cargando lote de company revisions:', batchError);
          throw new Error(`Error cargando revisiones de empresas: ${batchError.message}`);
        }

        if (batchData) {
          allCompanyRevisions.push(...batchData);
        }
      }

      console.log('Cargadas', allCompanyRevisions.length, 'revisiones de empresas');

      // Paso 10: Crear mapas para búsquedas eficientes
      const productRevisionMap = new Map();
      allProductRevisions.forEach(pr => {
        productRevisionMap.set(pr.id, pr.product_id);
      });

      const productMap = new Map();
      allProducts.forEach(product => {
        productMap.set(product.id, product.company_id);
      });

      const companyRevisionMap = new Map();
      allCompanyRevisions.forEach(cr => {
        companyRevisionMap.set(cr.id, { company_id: cr.company_id, nombre_empresa: cr.nombre_empresa });
      });

      // Paso 11: Obtener todos los company_ids únicos
      const allCompanyIds = new Set();
      
      // Company IDs desde productos
      productEmbeddings.forEach(emb => {
        const productRevisionId = emb.id_product_revision;
        const productId = productRevisionMap.get(productRevisionId);
        if (productId) {
          const companyId = productMap.get(productId);
          if (companyId) {
            allCompanyIds.add(companyId);
          }
        }
      });

      // Company IDs desde company_revision
      companyRevisionEmbeddings.forEach(emb => {
        const companyRevisionId = emb.id_company_revision;
        const companyData = companyRevisionMap.get(companyRevisionId);
        if (companyData && companyData.company_id) {
          allCompanyIds.add(companyData.company_id);
        }
      });

      const uniqueCompanyIds = Array.from(allCompanyIds) as string[];
      console.log('Total unique Company IDs:', uniqueCompanyIds.length);

      // Step 12: Load company records to get names
      setLoadingProgress(`Loading ${uniqueCompanyIds.length} companies...`);
      
      const allCompanies: any[] = [];
      for (let i = 0; i < uniqueCompanyIds.length; i += batchSize) {
        const batch = uniqueCompanyIds.slice(i, i + batchSize);
        const { data: batchData, error: batchError } = await supabase
          .from('company')
          .select('id, nombre_empresa')
          .in('id', batch);

        if (batchError) {
          console.error('Error loading company batch:', batchError);
          throw new Error(`Error loading companies: ${batchError.message}`);
        }

        if (batchData) {
          allCompanies.push(...batchData);
        }
      }

      console.log('Loaded', allCompanies.length, 'companies');

      // Step 13: Create company map
      const companyMap = new Map();
      allCompanies.forEach(company => {
        companyMap.set(company.id, company.nombre_empresa);
      });

      // Step 14: Create usage counters map by embedding
      const usageByEmbedding = new Map();
      allUsageCounters.forEach(counter => {
        usageByEmbedding.set(counter.embedding_id, counter);
      });

      // Step 15: Process statistics by company
      const companyStatsMap = new Map();

      // Process product embeddings
      productEmbeddings.forEach(emb => {
        const usageCounter = usageByEmbedding.get(emb.id);
        if (!usageCounter) return;

        const productRevisionId = emb.id_product_revision;
        const productId = productRevisionMap.get(productRevisionId);
        if (!productId) return;

        const companyId = productMap.get(productId);
        if (!companyId) return;

        const companyName = companyMap.get(companyId) || 'Unknown Company';
        
        if (!companyStatsMap.has(companyId)) {
          companyStatsMap.set(companyId, {
            company_id: companyId,
            company_name: companyName,
            total_retrievals: 0,
            product_retrievals: 0,
            company_revision_retrievals: 0,
            match_percentages: [],
            positions: [],
            embeddings: new Set()
          });
        }

        const stats = companyStatsMap.get(companyId);
        stats.total_retrievals += usageCounter.usage_count;
        stats.product_retrievals += usageCounter.usage_count;
        stats.match_percentages.push(usageCounter.avg_match_percentage);
        stats.positions.push(usageCounter.avg_position);
        stats.embeddings.add(emb.id);
      });

      // Process company_revision embeddings
      companyRevisionEmbeddings.forEach(emb => {
        const usageCounter = usageByEmbedding.get(emb.id);
        if (!usageCounter) return;

        const companyRevisionId = emb.id_company_revision;
        const companyData = companyRevisionMap.get(companyRevisionId);
        if (!companyData || !companyData.company_id) return;

        const companyId = companyData.company_id;
        const companyName = companyData.nombre_empresa || companyMap.get(companyId) || 'Unknown Company';
        
        if (!companyStatsMap.has(companyId)) {
          companyStatsMap.set(companyId, {
            company_id: companyId,
            company_name: companyName,
            total_retrievals: 0,
            product_retrievals: 0,
            company_revision_retrievals: 0,
            match_percentages: [],
            positions: [],
            embeddings: new Set()
          });
        }

        const stats = companyStatsMap.get(companyId);
        stats.total_retrievals += usageCounter.usage_count;
        stats.company_revision_retrievals += usageCounter.usage_count;
        stats.match_percentages.push(usageCounter.avg_match_percentage);
        stats.positions.push(usageCounter.avg_position);
        stats.embeddings.add(emb.id);
      });

      // Step 16: Convert to array and calculate final statistics
      const finalStats: CompanyStats[] = Array.from(companyStatsMap.values()).map(stats => {
        const avgMatchPercentage = stats.match_percentages.length > 0 
          ? stats.match_percentages.reduce((a, b) => a + b, 0) / stats.match_percentages.length 
          : 0;
        
        const avgPosition = stats.positions.length > 0 
          ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length 
          : 0;

        const bestMatchPercentage = Math.max(...stats.match_percentages, 0);
        const worstMatchPercentage = Math.min(...stats.match_percentages, 100);

        // Calculate distributions
        const positionDistribution: Record<number, number> = {};
        stats.positions.forEach(pos => {
          const roundedPos = Math.round(pos);
          positionDistribution[roundedPos] = (positionDistribution[roundedPos] || 0) + 1;
        });

        const matchPercentageDistribution: Record<string, number> = {};
        stats.match_percentages.forEach(match => {
          let range = '';
          if (match >= 80) range = '80-100%';
          else if (match >= 60) range = '60-79%';
          else if (match >= 40) range = '40-59%';
          else if (match >= 20) range = '20-39%';
          else range = '0-19%';
          matchPercentageDistribution[range] = (matchPercentageDistribution[range] || 0) + 1;
        });

        return {
          company_id: stats.company_id,
          company_name: stats.company_name,
          total_retrievals: stats.total_retrievals,
          product_retrievals: stats.product_retrievals,
          company_revision_retrievals: stats.company_revision_retrievals,
          avg_match_percentage: avgMatchPercentage,
          avg_position: avgPosition,
          best_match_percentage: bestMatchPercentage,
          worst_match_percentage: worstMatchPercentage,
          unique_embeddings: stats.embeddings.size,
          position_distribution: positionDistribution,
          match_percentage_distribution: matchPercentageDistribution
        };
      });

      setStats(finalStats);

      // Step 17: Calculate general analytics
      const totalRetrievals = finalStats.reduce((sum, company) => sum + company.total_retrievals, 0);
      const avgRetrievalsPerCompany = finalStats.length > 0 ? totalRetrievals / finalStats.length : 0;
      
      const highPerforming = finalStats.filter(c => c.avg_match_percentage >= 70).length;
      const mediumPerforming = finalStats.filter(c => c.avg_match_percentage >= 40 && c.avg_match_percentage < 70).length;
      const lowPerforming = finalStats.filter(c => c.avg_match_percentage < 40).length;

      // Calculate global heatmaps
      const globalPositionHeatmap: Record<number, number> = {};
      const globalMatchPercentageHeatmap: Record<string, number> = {};

      finalStats.forEach(company => {
        Object.entries(company.position_distribution).forEach(([pos, count]) => {
          const position = parseInt(pos);
          globalPositionHeatmap[position] = (globalPositionHeatmap[position] || 0) + count;
        });

        Object.entries(company.match_percentage_distribution).forEach(([range, count]) => {
          globalMatchPercentageHeatmap[range] = (globalMatchPercentageHeatmap[range] || 0) + count;
        });
      });

      setAnalytics({
        totalCompanies: finalStats.length,
        totalRetrievals,
        avgRetrievalsPerCompany,
        topPerformingCompanies: highPerforming,
        performanceDistribution: {
          high: highPerforming,
          medium: mediumPerforming,
          low: lowPerforming
        },
        positionHeatmap: globalPositionHeatmap,
        matchPercentageHeatmap: globalMatchPercentageHeatmap
      });

      setLoadingProgress('Load completed');
      console.log('Company statistics loaded:', finalStats.length);

    } catch (err) {
      console.error('Error loading company statistics:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setRetryCount(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanyStats();
  }, []);

  const handleRetry = () => {
    loadCompanyStats();
  };

  const handleRefresh = () => {
    setRetryCount(0);
    loadCompanyStats();
  };

  // Filtrar y ordenar estadísticas
  const filteredStats = stats.filter(company => {
    const matchesSearch = company.company_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const sortedStats = [...filteredStats].sort((a, b) => {
    const aValue = a[sortBy as keyof CompanyStats];
    const bValue = b[sortBy as keyof CompanyStats];
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortOrder === 'asc' 
        ? aValue.localeCompare(bValue) 
        : bValue.localeCompare(aValue);
    }
    
    return 0;
  });

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Error loading statistics
            </CardTitle>
            <CardDescription>
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button onClick={handleRetry} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con controles */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Company Statistics</h2>
          <p className="text-muted-foreground">
            Analysis of company retrievals from product embeddings and company revisions
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Update
        </Button>
      </div>

      {/* Indicador de progreso */}
      {loading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>{loadingProgress}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalCompanies}</div>
            <p className="text-xs text-muted-foreground">
              Companies with embeddings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Retrievals</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalRetrievals.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Total times retrieved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average per Company</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(analytics.avgRetrievalsPerCompany)}</div>
            <p className="text-xs text-muted-foreground">
              Average retrievals
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Performance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.topPerformingCompanies}</div>
            <p className="text-xs text-muted-foreground">
              &gt;70% average match
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribución de Rendimiento */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Distribution</CardTitle>
          <CardDescription>
            Company classification by average match percentage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm">High Performance (&gt;70%)</span>
              <Badge variant="secondary">{analytics.performanceDistribution.high}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-sm">Medium Performance (40-70%)</span>
              <Badge variant="secondary">{analytics.performanceDistribution.medium}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-sm">Low Performance (&lt;40%)</span>
              <Badge variant="secondary">{analytics.performanceDistribution.low}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controles de filtrado y ordenación */}
      <Card>
        <CardHeader>
          <CardTitle>Filters and Sorting</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Search company</Label>
              <Input
                id="search"
                placeholder="Company name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <div>
                <Label htmlFor="sort-by">Ordenar por</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total_retrievals">Total Retrievals</SelectItem>
                    <SelectItem value="product_retrievals">Product Retrievals</SelectItem>
                    <SelectItem value="company_revision_retrievals">Revision Retrievals</SelectItem>
                    <SelectItem value="avg_match_percentage">Average Match</SelectItem>
                    <SelectItem value="avg_position">Average Position</SelectItem>
                    <SelectItem value="company_name">Company Name</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sort-order">Orden</Label>
                <Select value={sortOrder} onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Descending</SelectItem>
                    <SelectItem value="asc">Ascending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de estadísticas */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Statistics by Company</CardTitle>
          <CardDescription>
            {sortedStats.length} companies found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Company</th>
                  <th className="text-left p-2">Total Retrievals</th>
                  <th className="text-left p-2">From Products</th>
                  <th className="text-left p-2">From Revisions</th>
                  <th className="text-left p-2">Average Match</th>
                  <th className="text-left p-2">Average Position</th>
                  <th className="text-left p-2">Unique Embeddings</th>
                </tr>
              </thead>
              <tbody>
                {sortedStats.map((company) => (
                  <tr key={company.company_id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{company.company_name}</td>
                    <td className="p-2">{company.total_retrievals.toLocaleString()}</td>
                    <td className="p-2">{company.product_retrievals.toLocaleString()}</td>
                    <td className="p-2">{company.company_revision_retrievals.toLocaleString()}</td>
                    <td className="p-2">
                      <Badge variant={company.avg_match_percentage >= 70 ? "default" : company.avg_match_percentage >= 40 ? "secondary" : "destructive"}>
                        {company.avg_match_percentage.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="p-2">{company.avg_position.toFixed(1)}</td>
                    <td className="p-2">{company.unique_embeddings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Heatmaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Heatmap de Posiciones */}
        <Card>
          <CardHeader>
            <CardTitle>Position Distribution</CardTitle>
            <CardDescription>
              Frequency of positions in search results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(analytics.positionHeatmap)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([position, count]) => (
                  <div key={position} className="flex items-center gap-2">
                    <span className="text-sm w-8">Pos {position}</span>
                    <div className="flex-1 bg-muted rounded-full h-4">
                      <div 
                        className="bg-primary h-4 rounded-full transition-all"
                        style={{ 
                          width: `${(count / Math.max(...Object.values(analytics.positionHeatmap))) * 100}%` 
                        }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-12">{count}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Heatmap de Match Percentage */}
        <Card>
          <CardHeader>
            <CardTitle>Match Percentage Distribution</CardTitle>
            <CardDescription>
              Frequency of match percentage ranges
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {['80-100%', '60-79%', '40-59%', '20-39%', '0-19%'].map((range) => (
                <div key={range} className="flex items-center gap-2">
                  <span className="text-sm w-16">{range}</span>
                  <div className="flex-1 bg-muted rounded-full h-4">
                    <div 
                      className="bg-primary h-4 rounded-full transition-all"
                      style={{ 
                        width: `${(analytics.matchPercentageHeatmap[range] || 0) / Math.max(...Object.values(analytics.matchPercentageHeatmap), 1) * 100}%` 
                      }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-12">{analytics.matchPercentageHeatmap[range] || 0}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 