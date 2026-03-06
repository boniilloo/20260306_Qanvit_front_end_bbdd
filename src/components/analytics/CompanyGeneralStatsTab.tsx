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
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Package
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

export default function CompanyGeneralStatsTab() {
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [companyEmbeddings, setCompanyEmbeddings] = useState<Map<string, any[]>>(new Map());
  const [loadingEmbeddings, setLoadingEmbeddings] = useState<Set<string>>(new Set());
  const [embeddingFilter, setEmbeddingFilter] = useState<'all' | 'with_usage'>('with_usage');

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
          console.error('Error cargando usage counters:', batchError);
          throw new Error(`Error cargando estadísticas: ${batchError.message}`);
        }

        if (batch && batch.length > 0) {
          allUsageCounters.push(...batch);
          from += pageSize;
          setLoadingProgress(`Cargando estadísticas de embeddings... (${allUsageCounters.length} cargados)`);
        } else {
          hasMore = false;
        }
      }

      console.log('Cargados', allUsageCounters.length, 'contadores de uso');

      // Paso 2: Cargar embeddings que tienen estadísticas
      const embeddingIds = [...new Set(allUsageCounters.map(counter => counter.embedding_id))];
      
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
      const productRevisionIds = [...new Set(productEmbeddings.map(emb => emb.id_product_revision))];
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
      const productIds = [...new Set(allProductRevisions.map(pr => pr.product_id))];
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
      const companyRevisionIds = [...new Set(companyRevisionEmbeddings.map(emb => emb.id_company_revision))];
      console.log('Company revision IDs únicos:', companyRevisionIds.length);

      // Paso 9: Cargar company_revision records
      setLoadingProgress(`Cargando ${companyRevisionIds.length} revisiones de empresas...`);
      
      const embeddingCompanyRevisions: any[] = [];
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
          embeddingCompanyRevisions.push(...batchData);
        }
      }

      console.log('Cargadas', embeddingCompanyRevisions.length, 'revisiones de empresas');

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
      embeddingCompanyRevisions.forEach(cr => {
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

      const uniqueCompanyIds = Array.from(allCompanyIds);
      console.log('Company IDs únicos totales:', uniqueCompanyIds.length);

      // Paso 12: Cargar company_revision records activos para obtener nombres
      setLoadingProgress(`Cargando revisiones activas de ${uniqueCompanyIds.length} empresas...`);
      
      const activeCompanyRevisions: any[] = [];
      for (let i = 0; i < uniqueCompanyIds.length; i += batchSize) {
        const batch = uniqueCompanyIds.slice(i, i + batchSize);
        const { data: batchData, error: batchError } = await supabase
          .from('company_revision')
          .select('id, nombre_empresa, company_id, is_active')
          .in('company_id', batch as string[])
          .eq('is_active', true);

        if (batchError) {
          console.error('Error cargando lote de revisiones de empresas:', batchError);
          throw new Error(`Error cargando revisiones de empresas: ${batchError.message}`);
        }

        if (batchData) {
          activeCompanyRevisions.push(...batchData);
        }
      }

      console.log('Cargadas', activeCompanyRevisions.length, 'revisiones activas de empresas');

      // Paso 13: Crear mapa de empresas con nombres de revisiones activas
      const companyMap = new Map();
      activeCompanyRevisions.forEach(companyRevision => {
        companyMap.set(companyRevision.company_id, companyRevision.nombre_empresa);
      });

      // Paso 14: Crear mapa de usage counters por embedding
      const usageByEmbedding = new Map();
      allUsageCounters.forEach(counter => {
        usageByEmbedding.set(counter.embedding_id, counter);
      });

      // Debug: mostrar algunos ejemplos de usage counters
      console.log('Debug: Ejemplos de usage counters:', allUsageCounters.slice(0, 3).map(counter => ({
        embedding_id: counter.embedding_id,
        usage_count: counter.usage_count,
        match_percentages: counter.match_percentages,
        positions: counter.positions
      })));

      // Paso 15: Procesar estadísticas por empresa
      const companyStatsMap = new Map();

      // Procesar embeddings de productos
      productEmbeddings.forEach(emb => {
        const usageCounter = usageByEmbedding.get(emb.id);
        if (!usageCounter) return;

        const productRevisionId = emb.id_product_revision;
        const productId = productRevisionMap.get(productRevisionId);
        if (!productId) return;

        const companyId = productMap.get(productId);
        if (!companyId) return;

        const companyName = companyMap.get(companyId) || 'Empresa Desconocida';
        
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
        
        // Parsear y agregar valores válidos para los cálculos
        if (usageCounter.match_percentages && typeof usageCounter.match_percentages === 'string') {
          const percentages = usageCounter.match_percentages.split(',')
            .map(p => parseFloat(p.trim()))
            .filter(p => !isNaN(p));
          stats.match_percentages.push(...percentages);
        }
        if (usageCounter.positions && typeof usageCounter.positions === 'string') {
          const positions = usageCounter.positions.split(',')
            .map(p => parseFloat(p.trim()))
            .filter(p => !isNaN(p));
          stats.positions.push(...positions);
        }
        
        stats.embeddings.add(emb.id);
      });

      // Procesar embeddings de company_revision
      companyRevisionEmbeddings.forEach(emb => {
        const usageCounter = usageByEmbedding.get(emb.id);
        if (!usageCounter) return;

        const companyRevisionId = emb.id_company_revision;
        const companyData = companyRevisionMap.get(companyRevisionId);
        if (!companyData || !companyData.company_id) return;

        const companyId = companyData.company_id;
        const companyName = companyData.nombre_empresa || companyMap.get(companyId) || 'Empresa Desconocida';
        
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
        
        // Parsear y agregar valores válidos para los cálculos
        if (usageCounter.match_percentages && typeof usageCounter.match_percentages === 'string') {
          const percentages = usageCounter.match_percentages.split(',')
            .map(p => parseFloat(p.trim()))
            .filter(p => !isNaN(p));
          stats.match_percentages.push(...percentages);
        }
        if (usageCounter.positions && typeof usageCounter.positions === 'string') {
          const positions = usageCounter.positions.split(',')
            .map(p => parseFloat(p.trim()))
            .filter(p => !isNaN(p));
          stats.positions.push(...positions);
        }
        
        stats.embeddings.add(emb.id);
      });

      // Paso 16: Convertir a array y calcular estadísticas finales
      const finalStats: CompanyStats[] = Array.from(companyStatsMap.values()).map(stats => {
        // Debug: mostrar algunos ejemplos de datos
        if (stats.company_name === 'JLI vision a/s') {
          console.log('Debug JLI vision:', {
            match_percentages: stats.match_percentages,
            positions: stats.positions,
            total_retrievals: stats.total_retrievals
          });
        }
        
        const avgMatchPercentage = stats.match_percentages.length > 0 
          ? stats.match_percentages.reduce((a, b) => a + b, 0) / stats.match_percentages.length 
          : 0;
        
        const avgPosition = stats.positions.length > 0 
          ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length 
          : 0;

        const bestMatchPercentage = stats.match_percentages.length > 0 ? Math.max(...stats.match_percentages) : 0;
        const worstMatchPercentage = stats.match_percentages.length > 0 ? Math.min(...stats.match_percentages) : 0;

        // Calcular distribuciones
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

      // Paso 17: Calcular analytics generales
      const totalRetrievals = finalStats.reduce((sum, company) => sum + company.total_retrievals, 0);
      const avgRetrievalsPerCompany = finalStats.length > 0 ? totalRetrievals / finalStats.length : 0;
      
      const highPerforming = finalStats.filter(c => c.avg_match_percentage >= 70).length;
      const mediumPerforming = finalStats.filter(c => c.avg_match_percentage >= 40 && c.avg_match_percentage < 70).length;
      const lowPerforming = finalStats.filter(c => c.avg_match_percentage < 40).length;

      // Calcular heatmaps globales
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

      setLoadingProgress('Carga completada');
      console.log('Estadísticas de empresas cargadas:', finalStats.length);

    } catch (err) {
      console.error('Error cargando estadísticas de empresas:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido');
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

  const toggleCompanyExpansion = async (companyId: string) => {
    const newExpanded = new Set(expandedCompanies);
    if (newExpanded.has(companyId)) {
      newExpanded.delete(companyId);
    } else {
      newExpanded.add(companyId);
      // Cargar embeddings si no están ya cargados
      if (!companyEmbeddings.has(companyId)) {
        await loadCompanyEmbeddings(companyId);
      }
    }
    setExpandedCompanies(newExpanded);
  };

  const loadCompanyEmbeddings = async (companyId: string) => {
    if (loadingEmbeddings.has(companyId)) return;
    
    setLoadingEmbeddings(prev => new Set(prev).add(companyId));
    
    try {
      // 1. Obtener todos los product_id que pertenecen a esta empresa
      const { data: products, error: productsError } = await supabase
        .from('product')
        .select('id')
        .eq('company_id', companyId);

      if (productsError) {
        console.error('Error cargando productos de la empresa:', productsError);
        return;
      }

      const productIds = products?.map(p => p.id) || [];
      console.log(`Productos encontrados para empresa ${companyId}:`, productIds.length);

      // 2. Obtener todos los id_product_revision que corresponden a esos productos
      let allProductRevisionIds: string[] = [];
      if (productIds.length > 0) {
        // Procesar en lotes de 100 para evitar URLs muy largas
        for (let i = 0; i < productIds.length; i += 100) {
          const batch = productIds.slice(i, i + 100);
          const { data: productRevisions, error: productRevisionsError } = await supabase
            .from('product_revision')
            .select('id')
            .in('product_id', batch);

          if (productRevisionsError) {
            console.error('Error cargando revisiones de productos:', productRevisionsError);
          } else {
            allProductRevisionIds.push(...(productRevisions?.map(pr => pr.id) || []));
          }
        }
      }
      console.log(`Revisiones de productos encontradas:`, allProductRevisionIds.length);

      // 3. Obtener todos los id_company_revision que pertenecen a esta empresa
      const { data: companyRevisions, error: companyRevisionsError } = await supabase
        .from('company_revision')
        .select('id')
        .eq('company_id', companyId);

      if (companyRevisionsError) {
        console.error('Error cargando revisiones de empresa:', companyRevisionsError);
      }

      const companyRevisionIds = companyRevisions?.map(cr => cr.id) || [];
      console.log(`Revisiones de empresa encontradas:`, companyRevisionIds.length);

      // 4. Obtener todos los embeddings que corresponden a estos IDs
      let allEmbeddings: any[] = [];

      // Embeddings de productos
      if (allProductRevisionIds.length > 0) {
        for (let i = 0; i < allProductRevisionIds.length; i += 100) {
          const batch = allProductRevisionIds.slice(i, i + 100);
          const { data: productEmbeddings, error: productEmbeddingsError } = await supabase
            .from('embedding')
            .select('id, text, chunk_size, id_product_revision')
            .in('id_product_revision', batch)
            .eq('is_active', true);

          if (productEmbeddingsError) {
            console.error('Error cargando embeddings de productos:', productEmbeddingsError);
          } else {
            allEmbeddings.push(...(productEmbeddings?.map(emb => ({
              ...emb,
              source_type: 'product' as const,
              source_name: 'Producto'
            })) || []));
          }
        }
      }

      // Embeddings de revisiones de empresa
      if (companyRevisionIds.length > 0) {
        for (let i = 0; i < companyRevisionIds.length; i += 100) {
          const batch = companyRevisionIds.slice(i, i + 100);
          const { data: companyEmbeddings, error: companyEmbeddingsError } = await supabase
            .from('embedding')
            .select('id, text, chunk_size, id_company_revision')
            .in('id_company_revision', batch)
            .eq('is_active', true);

          if (companyEmbeddingsError) {
            console.error('Error cargando embeddings de revisiones de empresa:', companyEmbeddingsError);
          } else {
            allEmbeddings.push(...(companyEmbeddings?.map(emb => ({
              ...emb,
              source_type: 'company_revision' as const,
              source_name: 'Revisión de Empresa'
            })) || []));
          }
        }
      }

      console.log(`Total de embeddings encontrados:`, allEmbeddings.length);

      // 5. Obtener estadísticas de uso para estos embeddings
      if (allEmbeddings.length > 0) {
        const embeddingIds = allEmbeddings.map(emb => emb.id);
        let allUsageStats: any[] = [];

        // Procesar estadísticas en lotes de 100
        for (let i = 0; i < embeddingIds.length; i += 100) {
          const batch = embeddingIds.slice(i, i + 100);
          const { data: usageStats, error: usageError } = await supabase
            .from('embedding_usage_counters')
            .select('*')
            .in('embedding_id', batch);

          if (usageError) {
            console.error('Error cargando estadísticas de uso:', usageError);
          } else {
            allUsageStats.push(...(usageStats || []));
          }
        }

        // Combinar embeddings con sus estadísticas y filtrar por uso > 1
        const embeddingsWithStats = allEmbeddings
          .map(emb => {
            const usage = allUsageStats.find(u => u.embedding_id === emb.id);
            
            // Calcular promedio de match percentages
            let avgMatchPercentage = 0;
            if (usage?.match_percentages) {
              const percentages = usage.match_percentages.split(',')
                .map(p => parseFloat(p.trim()))
                .filter(p => !isNaN(p));
              avgMatchPercentage = percentages.length > 0 
                ? percentages.reduce((a, b) => a + b, 0) / percentages.length 
                : 0;
            }
            
            // Calcular promedio de positions
            let avgPosition = 0;
            if (usage?.positions) {
              const positions = usage.positions.split(',')
                .map(p => parseFloat(p.trim()))
                .filter(p => !isNaN(p));
              avgPosition = positions.length > 0 
                ? positions.reduce((a, b) => a + b, 0) / positions.length 
                : 0;
            }
            
            return {
              ...emb,
              usage_count: usage?.usage_count || 0,
              avg_match_percentage: avgMatchPercentage,
              avg_position: avgPosition,
              match_percentages: usage?.match_percentages || '',
              positions: usage?.positions || ''
            };
          })
          .filter(emb => embeddingFilter === 'all' || emb.usage_count > 0); // Filtrar según selección

        console.log(`Embeddings filtrados (${embeddingFilter}):`, embeddingsWithStats.length);
        
        // Recalcular estadísticas de la empresa basándose solo en embeddings con más de 1 uso
        if (embeddingsWithStats.length > 0) {
          const totalRetrievals = embeddingsWithStats.reduce((sum, emb) => sum + emb.usage_count, 0);
          const productRetrievals = embeddingsWithStats
            .filter(emb => emb.source_type === 'product')
            .reduce((sum, emb) => sum + emb.usage_count, 0);
          const companyRevisionRetrievals = embeddingsWithStats
            .filter(emb => emb.source_type === 'company_revision')
            .reduce((sum, emb) => sum + emb.usage_count, 0);
          
          console.log(`Estadísticas recalculadas para ${companyId}:`, {
            totalRetrievals,
            productRetrievals,
            companyRevisionRetrievals,
            uniqueEmbeddings: embeddingsWithStats.length
          });
        }
        
        setCompanyEmbeddings(prev => new Map(prev).set(companyId, embeddingsWithStats));
      } else {
        setCompanyEmbeddings(prev => new Map(prev).set(companyId, []));
      }

    } catch (error) {
      console.error('Error cargando embeddings de empresa:', error);
    } finally {
      setLoadingEmbeddings(prev => {
        const newSet = new Set(prev);
        newSet.delete(companyId);
        return newSet;
      });
    }
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

  // Calcular paginación
  const totalPages = Math.ceil(sortedStats.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStats = sortedStats.slice(startIndex, endIndex);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, sortOrder]);

  // Limpiar embeddings cargados cuando cambia el filtro
  useEffect(() => {
    setCompanyEmbeddings(new Map());
    setExpandedCompanies(new Set());
  }, [embeddingFilter]);

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Error al cargar estadísticas
            </CardTitle>
            <CardDescription>
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button onClick={handleRetry} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Reintentar
              </Button>
              <Button onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Recargar
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
          <h2 className="text-2xl font-semibold">General Company Statistics</h2>
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



      {/* Cards de empresas con desplegables */}
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                              <CardTitle>Detailed Statistics by Company</CardTitle>
              <CardDescription>
                {sortedStats.length} companies found
              </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="items-per-page">Show:</Label>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(parseInt(value))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Filtros y controles */}
            <div className="flex flex-col lg:flex-row gap-4 pt-4 border-t">
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
                  <Label htmlFor="sort-by">Sort by</Label>
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
                  <Label htmlFor="sort-order">Order</Label>
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
                <div>
                  <Label htmlFor="embedding-filter">Show embeddings:</Label>
                  <Select value={embeddingFilter} onValueChange={(value: 'all' | 'with_usage') => setEmbeddingFilter(value)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="with_usage">With usage</SelectItem>
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {paginatedStats.map((company) => {
              const isExpanded = expandedCompanies.has(company.company_id);
              
              return (
                <div key={company.company_id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">{company.company_name}</span>
                        <Badge variant="outline">company</Badge>
                      </div>
                                              <p className="text-sm text-muted-foreground">
                          Company with {company.unique_embeddings} unique embeddings
                        </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCompanyExpansion(company.company_id)}
                      className="ml-2"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Total:</span>
                        <Badge variant="outline">{company.total_retrievals.toLocaleString()}</Badge>
                      </div>
                      <div className="text-muted-foreground">Retrievals</div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Products:</span>
                        <Badge variant="outline">{company.product_retrievals.toLocaleString()}</Badge>
                      </div>
                      <div className="text-muted-foreground">From products</div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Revisions:</span>
                        <Badge variant="outline">{company.company_revision_retrievals.toLocaleString()}</Badge>
                      </div>
                      <div className="text-muted-foreground">From revisions</div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Match:</span>
                        <Badge variant={company.avg_match_percentage >= 70 ? "default" : company.avg_match_percentage >= 40 ? "secondary" : "destructive"}>
                          {company.avg_match_percentage.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">Average</div>
                    </div>

                    <div>
                      <div className="font-medium">Position:</div>
                      <div className="text-muted-foreground">
                        {company.avg_position.toFixed(1)}
                      </div>
                    </div>

                    <div>
                      <div className="font-medium">Embeddings:</div>
                      <div className="text-muted-foreground">
                        {company.unique_embeddings}
                      </div>
                    </div>
                  </div>

                  {/* Sección desplegable con embeddings */}
                  {isExpanded && (
                    <div className="pt-4 border-t">
                      <div className="mb-4">
                        <h4 className="text-sm font-medium mb-2">Embeddings for this company</h4>
                        <p className="text-xs text-muted-foreground">
                          Showing embeddings associated with {company.company_name}
                        </p>
                      </div>
                      
                      {loadingEmbeddings.has(company.company_id) ? (
                        <div className="flex items-center justify-center py-4">
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">Loading embeddings...</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {(() => {
                            const embeddings = companyEmbeddings.get(company.company_id) || [];
                            if (embeddings.length === 0) {
                              return (
                                <div className="text-sm text-muted-foreground text-center py-4">
                                  {embeddingFilter === 'with_usage' 
                                    ? 'No embeddings with usage found for this company'
                                    : 'No embeddings found for this company'
                                  }
                                </div>
                              );
                            }
                            
                            return embeddings.map((embedding) => (
                              <div key={embedding.id} className="border rounded-lg p-3 space-y-2">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      {embedding.source_type === 'product' ? (
                                        <Package className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <Building2 className="h-3 w-3 text-blue-500" />
                                      )}
                                      <span className="text-xs font-medium">
                                        {embedding.source_name}
                                      </span>
                                      <Badge variant="outline" className="text-xs">
                                        {embedding.source_type}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {embedding.text}
                                    </p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  <div>
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">Usage:</span>
                                      <Badge variant="outline" className="text-xs">
                                        {embedding.usage_count}
                                      </Badge>
                                    </div>
                                    <div className="text-muted-foreground">times</div>
                                  </div>

                                  <div>
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">Match:</span>
                                      <Badge 
                                        variant={embedding.avg_match_percentage >= 70 ? "default" : embedding.avg_match_percentage >= 40 ? "secondary" : "destructive"}
                                        className="text-xs"
                                      >
                                        {embedding.avg_match_percentage.toFixed(1)}%
                                      </Badge>
                                    </div>
                                    <div className="text-muted-foreground">average</div>
                                  </div>

                                  <div>
                                    <div className="font-medium">Position:</div>
                                    <div className="text-muted-foreground">
                                      {embedding.avg_position.toFixed(1)}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="font-medium">Chunk Size:</div>
                                    <div className="text-muted-foreground">
                                      {embedding.chunk_size || 'Null'}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-xs text-muted-foreground font-mono">
                                  ID: {embedding.id.substring(0, 8)}...
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Controles de paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, sortedStats.length)} of {sortedStats.length} companies
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
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
                        className="w-8 h-8"
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
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
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