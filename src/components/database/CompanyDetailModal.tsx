import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Building2, Package, Globe, Calendar, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import ProductDetailModal from './ProductDetailModal';

interface CompanyData {
  id: string;
  url_root: string;
  created_at: string;
  processed: boolean | null;
  role: string;
}

interface CompanyRevision {
  id: string;
  company_id: string;
  created_at: string;
  is_active: boolean;
  nombre_empresa: string;
  description: string;
  main_activities: string;
  strengths: string;
  sectors: string;
  website: string;
  score_rationale: string;
  score: number;
  logo: string;
  source: string;
  cities: any;
  countries: any;
  revenues: any;
  certifications: any;
}

interface Product {
  id_product_revision: string;
  product_id: string;
  product_name: string;
}

interface Chunk {
  id: string;
  text: string;
  chunk_size: number | null;
}

interface CompanyDetailModalProps {
  company: CompanyData | null;
  isOpen: boolean;
  onClose: () => void;
}

const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({ company, isOpen, onClose }) => {
  const [companyRevision, setCompanyRevision] = useState<CompanyRevision | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  const loadCompanyDetails = async (companyId: string) => {
    try {
      setLoading(true);
      
      // Get the latest active company revision
      const { data: revisionData, error: revisionError } = await supabase
        .from('company_revision')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();

      if (revisionError) {
        console.error('Error loading company revision:', revisionError);
        toast({
          title: "Error",
          description: "Failed to load company details.",
          variant: "destructive",
        });
        return;
      }

      setCompanyRevision(revisionData);

      // Get products for this company using the database function
      if (revisionData) {
        const { data: productsData, error: productsError } = await supabase
          .rpc('get_products_by_company_revision', {
            p_company_revision_id: revisionData.id,
            p_only_active: true
          });

        if (productsError) {
          console.error('Error loading products:', productsError);
        } else {
          setProducts(productsData || []);
        }
        
        // Load chunks for this company
        await loadCompanyChunks(revisionData.id);
      }
    } catch (error) {
      console.error('Error loading company details:', error);
      toast({
        title: "Error",
        description: "Failed to load company details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyChunks = async (companyRevisionId: string) => {
    try {
      const { data, error } = await supabase
        .from('embedding')
        .select('id, text, chunk_size')
        .eq('id_company_revision', companyRevisionId)
        .eq('is_active', true);

      if (error) {
        console.error('Error loading company chunks:', error);
        return;
      }

      setChunks(data || []);
    } catch (error) {
      console.error('Error loading company chunks:', error);
    }
  };

  useEffect(() => {
    if (company && isOpen) {
      loadCompanyDetails(company.id);
    } else {
      setCompanyRevision(null);
      setProducts([]);
      setChunks([]);
    }
  }, [company, isOpen]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatJSONField = (data: any) => {
    if (!data) return 'N/A';
    if (Array.isArray(data)) {
      return data.join(', ');
    }
    if (typeof data === 'object') {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  };

  const getProcessedIcon = (processed: boolean | null) => {
    if (processed === null) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return processed ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <AlertCircle className="h-4 w-4 text-yellow-500" />
    );
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  };

  const handleCloseProductModal = () => {
    setIsProductModalOpen(false);
    setSelectedProduct(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Details
          </DialogTitle>
          <DialogDescription>
            Detailed information for {company?.url_root}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading company details...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Basic Company Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">URL Root</p>
                    <p className="text-sm">{company?.url_root}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Role</p>
                    <Badge variant="outline" className="capitalize">
                      {company?.role}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Created</p>
                    <p className="text-sm">{company ? formatDate(company.created_at) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Processing Status</p>
                    <div className="flex items-center gap-2">
                      {getProcessedIcon(company?.processed || null)}
                      <span className="text-sm">
                        {company?.processed === null ? 'Error' : company?.processed ? 'Processed' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Company Revision Details */}
            {companyRevision && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Company Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Company Name</p>
                      <p className="text-sm">{companyRevision.nombre_empresa || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Website</p>
                      <p className="text-sm">{companyRevision.website || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Score</p>
                      <p className="text-sm">{companyRevision.score || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Source</p>
                      <p className="text-sm">{companyRevision.source}</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Description</p>
                    <p className="text-sm text-gray-700">{companyRevision.description || 'N/A'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Main Activities</p>
                    <p className="text-sm text-gray-700">{companyRevision.main_activities || 'N/A'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Strengths</p>
                    <p className="text-sm text-gray-700">{companyRevision.strengths || 'N/A'}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Sectors</p>
                    <p className="text-sm text-gray-700">{companyRevision.sectors || 'N/A'}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Cities</p>
                      <p className="text-sm text-gray-700">{formatJSONField(companyRevision.cities)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Countries</p>
                      <p className="text-sm text-gray-700">{formatJSONField(companyRevision.countries)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Revenues</p>
                      <p className="text-sm text-gray-700">{formatJSONField(companyRevision.revenues)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Certifications</p>
                      <p className="text-sm text-gray-700">{formatJSONField(companyRevision.certifications)}</p>
                    </div>
                  </div>

                  {companyRevision.score_rationale && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Score Rationale</p>
                      <p className="text-sm text-gray-700">{companyRevision.score_rationale}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Products */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Products ({products.length})
                </CardTitle>
                <CardDescription>
                  Products registered for this company
                </CardDescription>
              </CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No products found</p>
                ) : (
                  <div className="space-y-2">
                    {products.map((product, index) => (
                      <div 
                        key={product.id_product_revision} 
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => handleProductClick(product)}
                      >
                        <div>
                          <p className="text-sm font-medium text-blue-600 hover:text-blue-800">{product.product_name}</p>
                          <p className="text-xs text-gray-500">ID: {product.product_id}</p>
                        </div>
                        <Badge variant="secondary">#{index + 1}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Company Chunks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Company Embeddings / Chunks ({chunks.length})
                </CardTitle>
                <CardDescription>
                  Text chunks from company information used for AI embeddings and search
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chunks.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No chunks found</p>
                ) : (
                  <div className="space-y-4">
                    {chunks.map((chunk, index) => (
                      <div key={chunk.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500">
                            Chunk #{index + 1}
                          </span>
                          <div className="flex gap-2">
                            {chunk.chunk_size && (
                              <Badge variant="outline" className="text-xs">
                                {chunk.chunk_size} chars
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {chunk.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
        
        <ProductDetailModal
          product={selectedProduct}
          isOpen={isProductModalOpen}
          onClose={handleCloseProductModal}
        />
      </DialogContent>
    </Dialog>
  );
};

export default CompanyDetailModal;