import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Package, TrendingUp, BarChart3, PieChart, 
  Search, Filter, Calendar, Building2,
  ArrowUpDown, ArrowDownUp, Activity, Target,
  MapPin, Star, Zap, RefreshCw, AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProductStats {
  id: string;
  product_name: string;
  company_name: string;
  main_category: string;
  subcategories: string;
  short_description: string;
  target_industries: string;
  definition_score: string;
  created_at: string;
  embedding_count: number;
  total_usage_count: number;
  avg_match_percentage: number;
  avg_position: number;
  best_match_percentage: number;
  worst_match_percentage: number;
  usage_frequency: number;
  position_distribution: Record<number, number>;
  match_percentage_distribution: Record<string, number>;
}

interface ProductAnalytics {
  totalProducts: number;
  embeddedProducts: number;
  activeProducts: number;
  avgEmbeddingsPerProduct: number;
  topCategories: Array<{ category: string; count: number }>;
  topCompanies: Array<{ company: string; count: number }>;
  performanceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  positionHeatmap: Record<number, number>;
  matchPercentageHeatmap: Record<string, number>;
}



const ProductStatsTab: React.FC = () => {
  const [stats, setStats] = useState<ProductStats[]>([]);
  const [analytics, setAnalytics] = useState<ProductAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<keyof ProductStats>('total_usage_count');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const loadProductStats = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadingProgress('Starting product statistics load...');

      // Verify Supabase connection
      setLoadingProgress('Verifying database connection...');
      const { data: testData, error: testError } = await supabase
        .from('embedding_usage_counters')
        .select('count', { count: 'exact', head: true });

      if (testError) {
        throw new Error(`Connection error: ${testError.message}`);
      }

      // Step 1: Load all embedding statistics from embedding_usage_counters
      setLoadingProgress('Loading embedding statistics...');
      
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

      console.log(`Loaded ${allUsageCounters.length} usage counters`);
      setLoadingProgress(`Loaded ${allUsageCounters.length} usage counters, getting embeddings...`);

      // Step 2: Get embeddings for which we have statistics
      const embeddingIds = allUsageCounters.map(counter => counter.embedding_id);
      
      // Process embeddings in batches of 100 to avoid URL length issues
      const batchSize = 100;
      let allEmbeddings: any[] = [];
      
      setLoadingProgress(`Processing ${embeddingIds.length} embeddings in batches...`);
      
      for (let i = 0; i < embeddingIds.length; i += batchSize) {
        const batch = embeddingIds.slice(i, i + batchSize);
        
        const { data: batchData, error: batchError } = await supabase
        .from('embedding')
          .select('id, id_product_revision, id_company_revision')
          .in('id', batch)
        .eq('is_active', true);

        if (batchError) {
          console.error('Error loading embedding batch:', batchError);
          throw new Error(`Error loading embeddings: ${batchError.message}`);
        }

        allEmbeddings = [...allEmbeddings, ...(batchData || [])];
        setLoadingProgress(`Processed ${allEmbeddings.length}/${embeddingIds.length} embeddings...`);
      }

      const embeddings = allEmbeddings;

      console.log(`Loaded ${embeddings?.length || 0} embeddings`);
      setLoadingProgress(`Loaded ${embeddings?.length || 0} embeddings, filtering products...`);

      // Step 3: Remove embeddings that have id_product_revision as null
      const validEmbeddings = embeddings?.filter(emb => emb.id_product_revision !== null) || [];
      console.log(`Valid embeddings with products: ${validEmbeddings.length}`);

      // Step 4: Get unique id_product_revision
      const productRevisionIds = [...new Set(validEmbeddings.map(emb => emb.id_product_revision))];
      console.log(`Unique products found: ${productRevisionIds.length}`);

      if (productRevisionIds.length === 0) {
        console.log('No valid products found');
        setStats([]);
        setAnalytics({
          totalProducts: 0,
          embeddedProducts: 0,
          activeProducts: 0,
          avgEmbeddingsPerProduct: 0,
          topCategories: [],
          topCompanies: [],
          performanceDistribution: { high: 0, medium: 0, low: 0 },
          positionHeatmap: {},
          matchPercentageHeatmap: {}
        });
        setLoading(false);
        return;
      }

      // Step 5: Load products from product_revision
      setLoadingProgress(`Loading ${productRevisionIds.length} products...`);
      
      // Process products in batches to avoid URL length issues
      let allProductRevisions: any[] = [];
      
      for (let i = 0; i < productRevisionIds.length; i += batchSize) {
        const batch = productRevisionIds.slice(i, i + batchSize);
        
        const { data: batchData, error: batchError } = await supabase
          .from('product_revision')
          .select('*')
          .in('id', batch)
          .eq('is_active', true);

        if (batchError) {
          console.error('Error loading product batch:', batchError);
          throw new Error(`Error loading products: ${batchError.message}`);
        }

        allProductRevisions = [...allProductRevisions, ...(batchData || [])];
        setLoadingProgress(`Loaded ${allProductRevisions.length}/${productRevisionIds.length} products...`);
      }

      const productRevisions = allProductRevisions;

      console.log(`Loaded ${productRevisions?.length || 0} products`);
      setLoadingProgress(`Loaded ${productRevisions?.length || 0} products, calculating statistics...`);

      // Step 6: Load company information to get names
      // First we get the product_ids from the products
      const productIds = productRevisions.map(pr => pr.product_id);
      
      // Then we get the company_ids from the products in batches
      let allProducts: any[] = [];
      
      setLoadingProgress(`Loading ${productIds.length} products to get company_ids...`);
      
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);
        
        const { data: batchData, error: batchError } = await supabase
          .from('product')
          .select('id, company_id')
          .in('id', batch);

        if (batchError) {
          console.error('Error loading product batch for company_ids:', batchError);
          // Continue without these products
          continue;
        }

        allProducts = [...allProducts, ...(batchData || [])];
        setLoadingProgress(`Loaded ${allProducts.length}/${productIds.length} products for company_ids...`);
      }

      const products = allProducts;

      // Get unique company_ids
      const companyIds = [...new Set(products?.map(p => p.company_id).filter(id => id !== null) || [])];
      
      // Process companies in batches to avoid URL length issues
      let allCompanyRevisions: any[] = [];
      
      if (companyIds.length > 0) {
        setLoadingProgress(`Loading ${companyIds.length} companies...`);
        
        for (let i = 0; i < companyIds.length; i += batchSize) {
          const batch = companyIds.slice(i, i + batchSize);
          
          const { data: batchData, error: batchError } = await supabase
            .from('company_revision')
            .select('company_id, nombre_empresa')
            .in('company_id', batch);

          if (batchError) {
            console.error('Error loading company batch:', batchError);
            // Don't throw error, continue without company names
            break;
          }

          allCompanyRevisions = [...allCompanyRevisions, ...(batchData || [])];
          setLoadingProgress(`Loaded ${allCompanyRevisions.length}/${companyIds.length} companies...`);
        }
      }

      const companyRevisions = allCompanyRevisions;

      // Create company map by company_id
      const companyMap = new Map();
      companyRevisions?.forEach(company => {
        companyMap.set(company.company_id, company.nombre_empresa);
      });

      // Create product map by product_id to get company_id
      const productCompanyMap = new Map();
      products?.forEach(product => {
        productCompanyMap.set(product.id, product.company_id);
      });

      console.log('Debug - Company map keys:', Array.from(companyMap.keys()).slice(0, 5));
      console.log('Debug - Product company map keys:', Array.from(productCompanyMap.keys()).slice(0, 5));
      console.log('Debug - Product company map values:', Array.from(productCompanyMap.values()).slice(0, 5));

      // Debug logs
      console.log('Debug - Company revisions loaded:', companyRevisions?.length || 0);
      console.log('Debug - Products loaded:', products?.length || 0);
      console.log('Debug - Unique Company IDs:', companyIds.length);
      console.log('Debug - First 5 company revisions:', companyRevisions?.slice(0, 5));
      console.log('Debug - First 5 products:', products?.slice(0, 5));

      // Create usage counters map by embedding
      const usageByEmbedding = new Map();
      allUsageCounters.forEach(counter => {
        usageByEmbedding.set(counter.embedding_id, counter);
      });

      // Create embeddings map by product
      const embeddingsByProduct = new Map();
      validEmbeddings.forEach(emb => {
        if (!embeddingsByProduct.has(emb.id_product_revision)) {
          embeddingsByProduct.set(emb.id_product_revision, []);
        }
        embeddingsByProduct.get(emb.id_product_revision).push(emb);
      });

      setLoadingProgress('Calculating final statistics...');

      // Step 7: Calculate product statistics
      const productStats: ProductStats[] = productRevisions?.map(product => {
        const productEmbeddings = embeddingsByProduct.get(product.id) || [];
        const embeddingCount = productEmbeddings.length;
        
        let totalUsageCount = 0;
        let allMatchPercentages: number[] = [];
        let allPositions: number[] = [];
        let positionDistribution: Record<number, number> = {};
        let matchPercentageDistribution: Record<string, number> = {};

        productEmbeddings.forEach(emb => {
          const usage = usageByEmbedding.get(emb.id);
          if (usage) {
            totalUsageCount += usage.usage_count || 0;
            
            // Parse match percentages
            if (usage.match_percentages) {
              const percentages = usage.match_percentages.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
              allMatchPercentages.push(...percentages);
              
                          // Group by percentage ranges
            percentages.forEach(p => {
              const range = p >= 80 ? '80-100%' : p >= 60 ? '60-79%' : p >= 40 ? '40-59%' : '0-39%';
              matchPercentageDistribution[range] = (matchPercentageDistribution[range] || 0) + 1;
            });
            }
            
            // Parse positions
            if (usage.positions) {
              const positions = usage.positions.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
              allPositions.push(...positions);
              
                          // Group by position
            positions.forEach(pos => {
              const position = Math.floor(pos);
              positionDistribution[position] = (positionDistribution[position] || 0) + 1;
            });
            }
          }
        });

        const avgMatchPercentage = allMatchPercentages.length > 0 
          ? allMatchPercentages.reduce((sum, p) => sum + p, 0) / allMatchPercentages.length 
          : 0;
        
        const avgPosition = allPositions.length > 0 
          ? allPositions.reduce((sum, p) => sum + p, 0) / allPositions.length 
          : 0;

        const bestMatchPercentage = allMatchPercentages.length > 0 ? Math.max(...allMatchPercentages) : 0;
        const worstMatchPercentage = allMatchPercentages.length > 0 ? Math.min(...allMatchPercentages) : 0;

        // Get company name
        const productCompanyId = productCompanyMap.get(product.product_id);
        const companyName = productCompanyId 
          ? companyMap.get(productCompanyId) || 'Unknown Company'
          : 'Unknown Company';

        // Debug log (only for first 3 products)
        if (productRevisions.indexOf(product) < 3) {
          console.log('Debug - Product:', {
            product_id: product.product_id,
            product_name: product.product_name,
            productCompanyId,
            companyName,
            companyMapHasKey: productCompanyId ? companyMap.has(productCompanyId) : false
          });
        }

        return {
          id: product.id,
          product_name: product.product_name || 'Unknown Product',
          company_name: companyName,
          main_category: product.main_category || 'No Category',
          subcategories: product.subcategories || '',
          short_description: product.short_description || '',
          target_industries: product.target_industries || '',
          definition_score: product.definition_score || '',
          created_at: product.created_at,
          embedding_count: embeddingCount,
          total_usage_count: totalUsageCount,
          avg_match_percentage: avgMatchPercentage,
          avg_position: avgPosition,
          best_match_percentage: bestMatchPercentage,
          worst_match_percentage: worstMatchPercentage,
          usage_frequency: totalUsageCount / Math.max(embeddingCount, 1),
          position_distribution: positionDistribution,
          match_percentage_distribution: matchPercentageDistribution
        };
      }) || [];

      setStats(productStats);

      // Step 8: Calculate general analytics
      const totalProducts = productStats.length;
      const embeddedProducts = productStats.filter(p => p.embedding_count > 0).length;
      const activeProducts = productStats.filter(p => p.total_usage_count > 0).length;
      const avgEmbeddingsPerProduct = totalProducts > 0 
        ? productStats.reduce((sum, p) => sum + p.embedding_count, 0) / totalProducts 
        : 0;

      // Top categories
      const categoryCounts = productStats.reduce((acc, product) => {
        acc[product.main_category] = (acc[product.main_category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topCategories = Object.entries(categoryCounts)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top companies
      const companyCounts = productStats.reduce((acc, product) => {
        acc[product.company_name] = (acc[product.company_name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const topCompanies = Object.entries(companyCounts)
        .map(([company, count]) => ({ company, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Performance distribution
      const performanceDistribution = {
        high: productStats.filter(p => p.avg_match_percentage >= 70).length,
        medium: productStats.filter(p => p.avg_match_percentage >= 40 && p.avg_match_percentage < 70).length,
        low: productStats.filter(p => p.avg_match_percentage < 40).length
      };

      // Position heatmap
      const positionHeatmap: Record<number, number> = {};
      productStats.forEach(product => {
        Object.entries(product.position_distribution).forEach(([position, count]) => {
          const pos = parseInt(position);
          positionHeatmap[pos] = (positionHeatmap[pos] || 0) + count;
        });
      });

      // Match percentage heatmap
      const matchPercentageHeatmap: Record<string, number> = {};
      productStats.forEach(product => {
        Object.entries(product.match_percentage_distribution).forEach(([range, count]) => {
          matchPercentageHeatmap[range] = (matchPercentageHeatmap[range] || 0) + count;
        });
      });

      setAnalytics({
        totalProducts,
        embeddedProducts,
        activeProducts,
        avgEmbeddingsPerProduct,
        topCategories,
        topCompanies,
        performanceDistribution,
        positionHeatmap,
        matchPercentageHeatmap
      });

      setLoadingProgress('Load completed!');
      setRetryCount(0); // Reset retry count on success

    } catch (error) {
      console.error('Error loading product statistics:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      setRetryCount(prev => prev + 1);
      
      setStats([]);
      setAnalytics({
        totalProducts: 0,
        embeddedProducts: 0,
        activeProducts: 0,
        avgEmbeddingsPerProduct: 0,
        topCategories: [],
        topCompanies: [],
        performanceDistribution: { high: 0, medium: 0, low: 0 },
        positionHeatmap: {},
        matchPercentageHeatmap: {}
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProductStats();
  }, []);

  const handleRetry = () => {
    loadProductStats();
  };

  const filteredStats = stats.filter(product => {
    const matchesSearch = product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.main_category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || product.main_category === categoryFilter;
    const matchesCompany = companyFilter === 'all' || product.company_name === companyFilter;
    
    return matchesSearch && matchesCategory && matchesCompany;
  });

  const sortedStats = [...filteredStats].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    return 0;
  });

  // Pagination logic
  const totalPages = Math.ceil(sortedStats.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStats = sortedStats.slice(startIndex, endIndex);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, companyFilter, sortBy, sortOrder]);

  const categories = ['all', ...Array.from(new Set(stats.map(p => p.main_category)))];
  const companies = ['all', ...Array.from(new Set(stats.map(p => p.company_name)))];

  // Mostrar error si hay problemas de conexión
  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent>
                    <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-500" />
          <div className="text-center">
            <h3 className="text-lg font-semibold text-red-600">Connection Error</h3>
            <p className="text-sm text-gray-600 mt-2">{error}</p>
            <p className="text-xs text-gray-500 mt-1">
              Failed connection attempt {retryCount}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRetry} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </div>
          <div className="text-xs text-gray-500 text-center max-w-md">
            <p>If the problem persists, check:</p>
            <ul className="list-disc list-inside mt-1">
              <li>Your internet connection</li>
              <li>That the Supabase service is available</li>
              <li>The database configuration</li>
            </ul>
          </div>
        </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent>
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-sm text-muted-foreground">{loadingProgress}</p>
              {retryCount > 0 && (
                <p className="text-xs text-orange-600">
                  Retry {retryCount} in progress...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              {analytics?.embeddedProducts} with embeddings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Products</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.activeProducts}</div>
            <p className="text-xs text-muted-foreground">
              {analytics?.totalProducts ? ((analytics.activeProducts / analytics.totalProducts) * 100).toFixed(1) : 0}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Embeddings</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.avgEmbeddingsPerProduct.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">
              per product
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Performance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.performanceDistribution.high}</div>
            <p className="text-xs text-muted-foreground">
              ≥70% match
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Product Search and Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search Products</Label>
              <Input
                id="search"
                placeholder="Search by name, company, category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category === 'all' ? 'All Categories' : category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(company => (
                    <SelectItem key={company} value={company}>
                      {company === 'all' ? 'All Companies' : company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort">Sort By</Label>
              <Select value={sortBy} onValueChange={(value: keyof ProductStats) => setSortBy(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product_name">Product Name</SelectItem>
                  <SelectItem value="company_name">Company</SelectItem>
                  <SelectItem value="total_usage_count">Usage Count</SelectItem>
                  <SelectItem value="avg_match_percentage">Average Match %</SelectItem>
                  <SelectItem value="avg_position">Average Position</SelectItem>
                  <SelectItem value="embedding_count">Embeddings</SelectItem>
                  <SelectItem value="created_at">Creation Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? <ArrowUpDown className="h-4 w-4" /> : <ArrowDownUp className="h-4 w-4" />}
              {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Product Statistics Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Product Statistics
          </CardTitle>
          <CardDescription>
            Detailed statistics for {sortedStats.length} products (showing {startIndex + 1}-{Math.min(endIndex, sortedStats.length)} of {sortedStats.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Product</th>
                  <th className="text-left p-2">Company</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-center p-2">Embeddings</th>
                  <th className="text-center p-2">Usage Count</th>
                  <th className="text-center p-2">Average Match %</th>
                  <th className="text-center p-2">Average Position</th>
                  <th className="text-center p-2">Best Match %</th>
                  <th className="text-center p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStats.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <div>
                        <div className="font-medium">{product.product_name}</div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {product.short_description}
                        </div>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        {product.company_name}
                      </div>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline">{product.main_category}</Badge>
                    </td>
                    <td className="p-2 text-center">
                      <div className="font-medium">{product.embedding_count}</div>
                      <div className="text-xs text-gray-500">
                        {product.usage_frequency.toFixed(1)} usage/embedding
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <div className="font-medium">{product.total_usage_count}</div>
                    </td>
                    <td className="p-2 text-center">
                      <div className="font-medium">{product.avg_match_percentage.toFixed(1)}%</div>
                      <div className="text-xs text-gray-500">
                        {product.worst_match_percentage.toFixed(1)} - {product.best_match_percentage.toFixed(1)}
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <div className="font-medium">{product.avg_position.toFixed(1)}</div>
                    </td>
                    <td className="p-2 text-center">
                      <div className="font-medium text-green-600">{product.best_match_percentage.toFixed(1)}%</div>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex flex-col gap-1">
                        <Badge variant={product.embedding_count > 0 ? "default" : "secondary"}>
                          {product.embedding_count > 0 ? "With Embeddings" : "Without Embeddings"}
                        </Badge>
                        <Badge variant={product.total_usage_count > 0 ? "default" : "outline"}>
                          {product.total_usage_count > 0 ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, sortedStats.length)} of {sortedStats.length} products
              </div>
              <div className="flex items-center gap-2">
                                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analytics Charts */}
      <Tabs defaultValue="categories" className="space-y-4">
        <TabsList>
          <TabsTrigger value="categories">Top Categories</TabsTrigger>
          <TabsTrigger value="companies">Top Companies</TabsTrigger>
          <TabsTrigger value="performance">Performance Distribution</TabsTrigger>
          <TabsTrigger value="positions">Position Heatmap</TabsTrigger>
          <TabsTrigger value="matches">Match % Heatmap</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Product Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analytics?.topCategories.map((category, index) => (
                  <div key={category.category} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{index + 1}</Badge>
                      <span className="font-medium">{category.category}</span>
                    </div>
                    <div className="text-sm text-gray-600">{category.count} products</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="companies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Companies by Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analytics?.topCompanies.map((company, index) => (
                  <div key={company.company} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{index + 1}</Badge>
                      <span className="font-medium">{company.company}</span>
                    </div>
                    <div className="text-sm text-gray-600">{company.count} products</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">{analytics?.performanceDistribution.high}</div>
                  <div className="text-sm text-green-600">High Performance</div>
                  <div className="text-xs text-gray-500">≥70% match</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded">
                  <div className="text-2xl font-bold text-yellow-600">{analytics?.performanceDistribution.medium}</div>
                  <div className="text-sm text-yellow-600">Medium Performance</div>
                  <div className="text-xs text-gray-500">40-70% match</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded">
                  <div className="text-2xl font-bold text-red-600">{analytics?.performanceDistribution.low}</div>
                  <div className="text-sm text-red-600">Low Performance</div>
                  <div className="text-xs text-gray-500">&lt;40% match</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader>
                          <CardTitle>Position Heatmap</CardTitle>
            <CardDescription>
              Distribution of positions where products appear
            </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 20 }, (_, i) => {
                  const position = i + 1;
                  const count = analytics?.positionHeatmap[position] || 0;
                  const maxCount = Math.max(...Object.values(analytics?.positionHeatmap || {}));
                  const intensity = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  
                  return (
                    <div
                      key={position}
                      className="aspect-square flex items-center justify-center text-xs font-medium rounded"
                      style={{
                        backgroundColor: `rgba(59, 130, 246, ${intensity / 100})`,
                        color: intensity > 50 ? 'white' : 'black'
                      }}
                      title={`Posición ${position}: ${count} apariciones`}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Positions 1-20: Intensity based on appearance frequency
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches" className="space-y-4">
          <Card>
            <CardHeader>
                          <CardTitle>Match Percentage Heatmap</CardTitle>
            <CardDescription>
              Distribution of match percentages that products achieve
            </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {['80-100%', '60-79%', '40-59%', '0-39%'].map((range) => {
                  const count = analytics?.matchPercentageHeatmap[range] || 0;
                  const maxCount = Math.max(...Object.values(analytics?.matchPercentageHeatmap || {}));
                  const intensity = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  
                  return (
                    <div key={range} className="flex items-center gap-4">
                      <div className="w-20 text-sm font-medium">{range}</div>
                      <div className="flex-1 bg-gray-200 rounded-full h-6">
                        <div
                          className="h-6 rounded-full transition-all duration-300"
                          style={{
                            width: `${intensity}%`,
                            backgroundColor: range === '80-100%' ? '#10b981' : 
                                           range === '60-79%' ? '#3b82f6' : 
                                           range === '40-59%' ? '#f59e0b' : '#ef4444'
                          }}
                        />
                      </div>
                      <div className="w-16 text-sm text-gray-600">{count}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProductStatsTab; 