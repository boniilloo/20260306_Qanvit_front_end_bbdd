import React, { useEffect, useState, useMemo } from 'react';
import { X, Check, Eye, ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ProductDocument } from '@/types/product';
import { ProductDocumentViewCard } from '@/components/products/ProductDocumentViewCard';
import { useValidatedProductImages } from '@/hooks/useValidatedProductImages';

interface ProductRevision {
  id: string;
  product_id: string;
  product_name: string;
  main_category?: string;
  subcategories?: string;
  short_description?: string;
  long_description?: string;
  key_features?: string;
  use_cases?: string;
  target_industries?: string;
  is_active: boolean;
  created_at: string;
  source: string;
  definition_score?: string;
  comment?: string;
  created_by?: string;
  creator_name?: string;
  creator_surname?: string;
  image?: string;
  [key: string]: any;
}

interface ProductRevisionPreviewModalProps {
  revision: ProductRevision | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProductRevisionPreviewModal: React.FC<ProductRevisionPreviewModalProps> = ({
  revision,
  isOpen,
  onClose
}) => {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [productDocuments, setProductDocuments] = useState<ProductDocument[]>([]);
  const [productDocumentsLoading, setProductDocumentsLoading] = useState(false);
  const [companyWebsite, setCompanyWebsite] = useState<string | undefined>(undefined);

  // Fetch company website for this product
  useEffect(() => {
    const fetchCompanyWebsite = async () => {
      if (!revision?.product_id) {
        setCompanyWebsite(undefined);
        return;
      }
      try {
        // Get company_id from product
        const { data: productData, error: productError } = await supabase
          .from('product')
          .select('company_id')
          .eq('id', revision.product_id)
          .single();

        if (productError || !productData?.company_id) {
          console.error('Error fetching company_id:', productError);
          return;
        }

        // Get company website from company_revision
        const { data: companyData, error: companyError } = await supabase
          .from('company_revision')
          .select('website')
          .eq('company_id', productData.company_id)
          .eq('is_active', true)
          .single();

        if (!companyError && companyData?.website) {
          setCompanyWebsite(companyData.website);
        }
      } catch (err) {
        console.error('Exception fetching company website:', err);
      }
    };
    fetchCompanyWebsite();
  }, [revision?.product_id]);

  // Fetch product documents for the product in this revision
  useEffect(() => {
    const fetchProductDocuments = async () => {
      if (!revision?.product_id) {
        setProductDocuments([]);
        return;
      }
      setProductDocumentsLoading(true);
      try {
        const { data, error } = await supabase
          .from('product_documents')
          .select('*')
          .eq('product_id', revision.product_id)
          .order('created_at', { ascending: false });
        if (!error) setProductDocuments((data as any) || []);
      } finally {
        setProductDocumentsLoading(false);
      }
    };
    fetchProductDocuments();
  }, [revision?.product_id]);

  // Helper function to safely parse JSON or return as array
  const safeParse = (value: any, defaultValue: any = []) => {
    if (!value) return defaultValue;
    
    if (typeof value !== 'string') {
      return Array.isArray(value) ? value : defaultValue;
    }
    
    // Check if it looks like JSON
    if (value.startsWith('[') || value.startsWith('{')) {
      try {
        return JSON.parse(value);
      } catch (e) {
        return [value];
      }
    } else {
      // Plain text - split by common delimiters for arrays
      if (Array.isArray(defaultValue)) {
        // First try to split by comma followed by uppercase letter (e.g., "item1,Item2,Item3")
        const upperCaseItems = value.split(/,(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 0);
        
        // If pattern matched and we have multiple items, use it
        if (upperCaseItems.length > 1 || (upperCaseItems.length === 1 && !value.includes(','))) {
          return upperCaseItems;
        }
        
        // Otherwise fall back to standard delimiters
        const split = value.split(/[,;|]/).map(s => s.trim()).filter(s => s.length > 0);
        return split.length > 0 ? split : [value];
      } else {
        return value;
      }
    }
  };

  // Memoize parsed arrays to prevent unnecessary re-renders
  const keyFeatures = useMemo(() => safeParse(revision?.key_features, []), [revision?.key_features]);
  const useCases = useMemo(() => safeParse(revision?.use_cases, []), [revision?.use_cases]);
  const targetIndustries = useMemo(() => safeParse(revision?.target_industries, []), [revision?.target_industries]);
  const subcategories = useMemo(() => safeParse(revision?.subcategories, []), [revision?.subcategories]);
  const images = useMemo(() => safeParse(revision?.image, []), [revision?.image]);

  // Validate and compose image URLs
  const { validImages, isValidating } = useValidatedProductImages(
    images,
    companyWebsite,
    isOpen // Only validate when modal is open
  );

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % validImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + validImages.length) % validImages.length);
  };

  const handleProductDocumentDownload = async (doc: ProductDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('product-documents')
        .download(doc.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {}
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!revision) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-navy">Product Preview</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-8">
            <div className="grid grid-cols-12 gap-8">
              {/* Product Info - 8/12 on desktop */}
              <div className="col-span-12 lg:col-span-8">
                <Card className="shadow-lg border-0">
                  <CardHeader className="bg-gradient-to-r from-navy/5 to-sky/5">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-3xl text-navy mb-2">{revision.product_name}</CardTitle>
                        <Badge className="bg-navy text-white text-sm px-3 py-1">{revision.main_category}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 space-y-6">
                    {/* Short description (if present) */}
                    {revision.short_description && (
                      <p className="text-charcoal leading-relaxed">
                        {revision.short_description}
                      </p>
                    )}

                    {/* Long description */}
                    {revision.long_description && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-3">Description</h3>
                        <p className="text-charcoal leading-relaxed">
                          {revision.long_description}
                        </p>
                      </div>
                    )}

                    {/* Product Images */}
                    {isValidating ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">Validating images...</p>
                      </div>
                    ) : validImages.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-3">Product Images</h3>
                        <div className="flex gap-4">
                          {validImages.map((imageUrl: string, index: number) => (
                            <div
                              key={index}
                              className="flex-1 cursor-pointer group relative overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200"
                              onClick={() => {
                                setCurrentImageIndex(index);
                                setImageModalOpen(true);
                              }}
                            >
                              <img
                                src={imageUrl}
                                alt={`${revision.product_name} - Image ${index + 1}`}
                                className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Features */}
                    {keyFeatures.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-3">Key Features</h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {keyFeatures.map((feature: string, index: number) => (
                            <div key={index} className="flex items-center gap-2 p-3 bg-mint/10 rounded-lg">
                              <Check className="w-4 h-4 text-mint flex-shrink-0" />
                              <span className="text-navy text-sm">{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Subcategories */}
                    {subcategories.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-3">Categories</h3>
                        <div className="flex flex-wrap gap-2">
                          {subcategories.map((category: string, index: number) => (
                            <Badge key={index} variant="outline" className="border-sky text-sky">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Sidebar - 4/12 on desktop */}
              <div className="col-span-12 lg:col-span-4">
                <Card className="shadow-lg border-0 lg:sticky lg:top-8">
                  <CardHeader>
                    <CardTitle className="text-navy">Product Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Use Cases */}
                    {useCases.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-2">Use Cases</h3>
                        <div className="space-y-2">
                          {useCases.map((useCase: string, index: number) => (
                            <div
                              key={index}
                              className="flex items-start gap-2 p-3 rounded-lg"
                              style={{ backgroundColor: 'rgba(128, 200, 240, 0.15)' }}
                            >
                              <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: '#f4a9aa' }} />
                              <span className="text-sm" style={{ color: '#242424' }}>{useCase}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Target Industries */}
                    {targetIndustries.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-navy mb-2">Target Industries</h4>
                        <div className="space-y-2">
                          {targetIndustries.map((industry: string, index: number) => (
                            <Badge key={index} variant="secondary" className="text-xs block w-fit">
                              {industry}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Product Documents */}
                    {productDocuments.length > 0 && (
                      <div>
                        <h3 className="text-xl font-semibold text-navy mb-2">Product Documents</h3>
                        <div className="grid grid-cols-1 gap-4">
                          {productDocuments.map((doc) => (
                            <ProductDocumentViewCard
                              key={doc.id}
                              document={doc}
                              onDownload={handleProductDocumentDownload}
                              formatFileSize={formatFileSize}
                            />
                          ))}
                        </div>
                        {productDocumentsLoading && (
                          <div className="text-center py-4">
                            <p className="text-muted-foreground">Loading documents...</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Contact CTA */}
                    <div className="pt-4 border-t">
                      <Button className="w-full bg-mint hover:bg-mint/90 text-navy font-semibold">
                        <Mail className="w-4 h-4 mr-2" />
                        Request Quote
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Modal */}
      {imageModalOpen && validImages.length > 0 && (
        <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 z-50 bg-black/50 text-white hover:bg-black/70"
                onClick={() => setImageModalOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
              
              {validImages.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 z-50 bg-black/50 text-white hover:bg-black/70"
                    onClick={prevImage}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 z-50 bg-black/50 text-white hover:bg-black/70"
                    onClick={nextImage}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  
                  <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/50 text-white px-3 py-1 rounded text-sm">
                    {currentImageIndex + 1} / {validImages.length}
                  </div>
                </>
              )}
              
              <img
                src={validImages[currentImageIndex]}
                alt={`${revision.product_name} - Image ${currentImageIndex + 1}`}
                className="w-full h-auto max-h-[90vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};