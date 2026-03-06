import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIsDeveloper } from '@/hooks/useIsDeveloper';
import { BarChart3, Package, Building2 } from 'lucide-react';
import EmbeddingStatsTab from '@/components/analytics/EmbeddingStatsTab';
import ProductStatsTab from '@/components/analytics/ProductStatsTab';
import CompanyStatsTab from '@/components/analytics/CompanyStatsTab';
import CompanyGeneralStatsTab from '@/components/analytics/CompanyGeneralStatsTab';

const EmbeddingAnalytics = () => {
  const { isDeveloper, loading } = useIsDeveloper();

  if (loading) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-muted-foreground">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!isDeveloper) {
    return (
      <div className="flex-1 bg-background min-h-screen overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-2xl font-semibold text-foreground mb-2">Access Denied</div>
              <div className="text-muted-foreground">You need developer access to view this page.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background min-h-screen overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-foreground mb-2">Embedding Analytics</h1>
          <p className="text-muted-foreground">
            Advanced analytics and insights for embedding performance and usage patterns.
          </p>
        </div>

        <Tabs defaultValue="embedding-stats" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="embedding-stats" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Embedding Stats
            </TabsTrigger>
            <TabsTrigger value="product-stats" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Product Stats
            </TabsTrigger>
            <TabsTrigger value="company-stats" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company Revision Stats
            </TabsTrigger>
            <TabsTrigger value="company-general-stats" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="embedding-stats" className="space-y-6">
            <EmbeddingStatsTab />
          </TabsContent>

          <TabsContent value="product-stats" className="space-y-6">
            <ProductStatsTab />
          </TabsContent>

          <TabsContent value="company-stats" className="space-y-6">
            <CompanyStatsTab />
          </TabsContent>

          <TabsContent value="company-general-stats" className="space-y-6">
            <CompanyGeneralStatsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default EmbeddingAnalytics; 