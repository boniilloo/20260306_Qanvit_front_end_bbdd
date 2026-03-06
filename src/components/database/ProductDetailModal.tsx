import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Package, Globe, Star, Target, Lightbulb, FileText, ExternalLink } from "lucide-react";

interface Product {
  id_product_revision: string;
  product_id: string;
  product_name: string;
}

interface ProductRevision {
  id: string;
  product_name: string;
  long_description: string;
  main_category: string;
  subcategories: string;
  target_industries: string;
  key_features: string;
  use_cases: string;
  definition_score: string;
  improvement_advice: string;
  image: string;
  source_urls: string;
}

interface Chunk {
  id: string;
  text: string;
  chunk_size: number | null;
}

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, isOpen, onClose }) => {
  const [productRevision, setProductRevision] = useState<ProductRevision | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProductDetails = async (productRevisionId: string) => {
    try {
      setLoading(true);
      
      // Use the get_product_revision_clean function
      const { data, error } = await supabase
        .rpc('get_product_revision_clean', {
          p_id: productRevisionId
        });

      if (error) {
        console.error('Error loading product details:', error);
        toast({
          title: "Error",
          description: "Failed to load product details.",
          variant: "destructive",
        });
        return;
      }

      if (data && data.length > 0) {
        setProductRevision(data[0]);
        
        // Load chunks for this product
        await loadProductChunks(productRevisionId);
      } else {
        toast({
          title: "No data",
          description: "No product details found.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error loading product details:', error);
      toast({
        title: "Error",
        description: "Failed to load product details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProductChunks = async (productRevisionId: string) => {
    try {
      const { data, error } = await supabase
        .from('embedding')
        .select('id, text, chunk_size')
        .eq('id_product_revision', productRevisionId)
        .eq('is_active', true);

      if (error) {
        console.error('Error loading chunks:', error);
        return;
      }

      setChunks(data || []);
    } catch (error) {
      console.error('Error loading chunks:', error);
    }
  };

  useEffect(() => {
    if (product && isOpen) {
      loadProductDetails(product.id_product_revision);
    } else {
      setProductRevision(null);
      setChunks([]);
    }
  }, [product, isOpen]);

  const renderMultilineText = (text: string | null) => {
    if (!text) return 'N/A';
    return text.split('\n').map((line, index) => (
      <span key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  // Helper to parse array fields (use_cases, target_industries, etc.)
  const parseArrayField = (field: string | null): string[] => {
    if (!field) return [];
    
    // Try to parse as JSON array
    if (field.startsWith('[')) {
      try {
        const parsed = JSON.parse(field);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // Fall through to comma split
      }
    }
    
    // Split by comma followed by uppercase letter (e.g., "item1,Item2,Item3")
    // Using regex to split on comma followed by capital letter
    const items = field.split(/,(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 0);
    
    // If no items found with the uppercase pattern, try regular comma split
    if (items.length === 0 || (items.length === 1 && field.includes(','))) {
      return field.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    
    return items;
  };

  const renderArrayField = (field: string | null) => {
    const items = parseArrayField(field);
    if (items.length === 0) return <span className="text-gray-500">N/A</span>;
    
    return (
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="text-sky mt-1">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  };

  const renderSourceUrls = (urls: string | null) => {
    if (!urls) return 'N/A';
    
    // Try to parse as JSON array first
    try {
      const urlArray = JSON.parse(urls);
      if (Array.isArray(urlArray)) {
        return (
          <div className="space-y-1">
            {urlArray.map((url, index) => (
              <div key={index}>
                <a 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 text-sm"
                >
                  <ExternalLink className="h-3 w-3" />
                  {url}
                </a>
              </div>
            ))}
          </div>
        );
      }
    } catch (e) {
      // If not JSON, treat as single URL or comma-separated
      const urlList = urls.split(',').map(url => url.trim()).filter(url => url);
      if (urlList.length > 1) {
        return (
          <div className="space-y-1">
            {urlList.map((url, index) => (
              <div key={index}>
                <a 
                  href={url.startsWith('http') ? url : `https://${url}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 text-sm"
                >
                  <ExternalLink className="h-3 w-3" />
                  {url}
                </a>
              </div>
            ))}
          </div>
        );
      } else {
        return (
          <a 
            href={urls.startsWith('http') ? urls : `https://${urls}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 text-sm"
          >
            <ExternalLink className="h-3 w-3" />
            {urls}
          </a>
        );
      }
    }
    
    return urls;
  };

  const getScoreColor = (score: string | null) => {
    if (!score) return 'bg-gray-100 text-gray-800';
    
    const numScore = parseFloat(score);
    if (numScore >= 8) return 'bg-green-100 text-green-800';
    if (numScore >= 6) return 'bg-yellow-100 text-yellow-800';
    if (numScore >= 4) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Product Details
          </DialogTitle>
          <DialogDescription>
            Detailed information for {product?.product_name}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading product details...
          </div>
        ) : productRevision ? (
          <div className="space-y-6">
            {/* Basic Product Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Product Name</p>
                    <p className="text-sm font-semibold">{productRevision.product_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Main Category</p>
                    <Badge variant="outline">{productRevision.main_category || 'N/A'}</Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Definition Score</p>
                    {productRevision.definition_score ? (
                      <Badge className={getScoreColor(productRevision.definition_score)}>
                        {productRevision.definition_score}/10
                      </Badge>
                    ) : (
                      <span className="text-sm text-gray-500">N/A</span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Product ID</p>
                    <p className="text-xs text-gray-500 font-mono">{product?.product_id}</p>
                  </div>
                </div>

                {productRevision.image && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-2">Product Image</p>
                    <img 
                      src={productRevision.image} 
                      alt={productRevision.product_name}
                      className="max-w-xs h-auto rounded-lg border"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-700">
                  {renderMultilineText(productRevision.long_description)}
                </div>
              </CardContent>
            </Card>

            {/* Categories and Industries */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Categories & Industries
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Subcategories</p>
                  <div className="text-sm text-gray-700">
                    {renderArrayField(productRevision.subcategories)}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Target Industries</p>
                  <div className="text-sm text-gray-700">
                    {renderArrayField(productRevision.target_industries)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Features and Use Cases */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Features & Use Cases
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Key Features</p>
                  <div className="text-sm text-gray-700">
                    {renderArrayField(productRevision.key_features)}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Use Cases</p>
                  <div className="text-sm text-gray-700">
                    {renderArrayField(productRevision.use_cases)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Improvement and Sources */}
            {(productRevision.improvement_advice || productRevision.source_urls) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Additional Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {productRevision.improvement_advice && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Improvement Advice</p>
                      <div className="text-sm text-gray-700">
                        {renderMultilineText(productRevision.improvement_advice)}
                      </div>
                    </div>
                  )}
                  
                  {productRevision.source_urls && (
                    <>
                      {productRevision.improvement_advice && <Separator />}
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">Source URLs</p>
                        <div className="text-sm text-gray-700">
                          {renderSourceUrls(productRevision.source_urls)}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Chunks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Embeddings / Chunks ({chunks.length})
                </CardTitle>
                <CardDescription>
                  Text chunks used for AI embeddings and search
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
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No product details available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailModal;