import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Building, Globe, ExternalLink, Tag, Target, Bookmark } from 'lucide-react';
import EnhancedCard from './EnhancedCard';
import SaveToListModal from '../SaveToListModal';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface AdditionalInfo {
  description?: string;
  specifications?: string[];
  questions?: string[];
}

interface ProductProfileCardProps {
  product: {
    id?: string;
    product_id?: string;
    product_name?: string;
    long_description?: string;
    short_description?: string;
    main_category?: string;
    subcategories?: string;
    target_industries?: string;
    key_features?: string;
    use_cases?: string;
    product_url?: string;
    image?: string;
    source_urls?: string;
  };
  company?: {
    nombre_empresa?: string;
    website?: string;
    countries?: any;
  };
  additionalInfo?: AdditionalInfo;
}

const ProductProfileCard = ({ product, company, additionalInfo }: ProductProfileCardProps) => {
  const { user } = useAuth();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [currentLists, setCurrentLists] = useState<Array<{id: string | null, name: string, color?: string}>>([]);
  const [savedListName, setSavedListName] = useState<string>('');

  useEffect(() => {
    if (product.image) {
      setProductImageUrl(product.image);
      
      // Log product image to console
      console.log(`🖼️ ProductProfileCard - Product: "${product.product_name}" - Image:`, product.image);
    }
  }, [product.image, product.product_name]);

  // Fetch company ID and name based on product_id
  useEffect(() => {
    const fetchCompanyInfo = async () => {
      if (!product.product_id) return;
      
      // First get the company_id from product table
      const { data: productData } = await supabase
        .from('product')
        .select('company_id')
        .eq('id', product.product_id)
        .single();
      
      if (productData?.company_id) {
        setCompanyId(productData.company_id);
        
        // Then get the company name from company_revision table
        const { data: companyData } = await supabase
          .from('company_revision')
          .select('nombre_empresa')
          .eq('company_id', productData.company_id)
          .eq('is_active', true)
          .single();
        
        if (companyData?.nombre_empresa) {
          setCompanyName(companyData.nombre_empresa);
        }
      }
    };

    fetchCompanyInfo();
  }, [product.product_id]);

  // Check if supplier is saved and get current lists
  useEffect(() => {
    const checkSavedStatus = async () => {
      if (!user || !companyId) return;
      
      try {
        const { data: savedData, error } = await supabase
          .from('saved_companies')
          .select(`
            list_id,
            supplier_lists (
              name,
              color
            )
          `)
          .eq('user_id', user.id)
          .eq('company_id', companyId);

        if (!error && savedData && savedData.length > 0) {
          setIsSaved(true);
          
          // Crear el array de listas actuales
          const lists = savedData.map(item => ({
            id: item.list_id,
            name: item.list_id ? item.supplier_lists?.name || 'Unknown List' : 'Uncategorized',
            color: item.list_id ? item.supplier_lists?.color : '#9CA3AF'
          }));
          setCurrentLists(lists);
          
          // Siempre mostrar el conteo de listas, incluso cuando es solo 1
          setSavedListName(`${savedData.length} list${savedData.length === 1 ? '' : 's'}`);
        } else {
          setIsSaved(false);
          setCurrentLists([]);
          setSavedListName('');
        }
      } catch (error) {
        console.error('Error checking saved status:', error);
      }
    };

    checkSavedStatus();
  }, [user, companyId]);

  const handleViewDetails = async () => {
    try {
      // Check if user is authenticated before proceeding
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to view product details",
          variant: "destructive",
        });
        return;
      }

      // First get the company_id from the product table using product_id
      const { data: productData, error: productError } = await supabase
        .from('product')
        .select('company_id')
        .eq('id', product.product_id)
        .single();

      if (productError || !productData?.company_id) {
        console.error('Error fetching product company_id:', productError);
        toast({
          title: "Error",
          description: "Could not load product details",
          variant: "destructive",
        });
        return;
      }

      // Then get the company slug from company_revision using the company_id
      const { data: companyData, error } = await supabase
        .from('company_revision')
        .select('slug')
        .eq('company_id', productData.company_id)
        .eq('is_active', true)
        .single();

      if (error || !companyData?.slug) {
        console.error('Error fetching company slug:', error);
        toast({
          title: "Error",
          description: "Could not load company details",
          variant: "destructive",
        });
        return;
      }

      if (!product.product_name || product.product_name.trim() === '') {
        // Navigate to supplier view if product name is empty
        window.open(`/suppliers/${companyData.slug}`, '_blank');
      } else {
        // Navigate to product view within supplier if product name exists
        window.open(`/suppliers/${companyData.slug}/product/${encodeURIComponent(product.product_name)}`, '_blank');
      }
    } catch (err) {
      console.error('Error navigating:', err);
      toast({
        title: "Error",
        description: "Could not navigate to product details",
        variant: "destructive",
      });
    }
  };

  const handleSaveCompany = () => {
    if (user && companyId && companyName) {
      setShowSaveModal(true);
    }
  };

  const handleSaveSuccess = () => {
    // Refresh the saved status after saving
    const checkSavedStatus = async () => {
      if (!user || !companyId) return;
      
      try {
        const { data: savedData, error } = await supabase
          .from('saved_companies')
          .select(`
            list_id,
            supplier_lists (
              name,
              color
            )
          `)
          .eq('user_id', user.id)
          .eq('company_id', companyId);

        if (!error && savedData && savedData.length > 0) {
          setIsSaved(true);
          
          // Crear el array de listas actuales
          const lists = savedData.map(item => ({
            id: item.list_id,
            name: item.list_id ? item.supplier_lists?.name || 'Unknown List' : 'Uncategorized',
            color: item.list_id ? item.supplier_lists?.color : '#9CA3AF'
          }));
          setCurrentLists(lists);
          
          // Siempre mostrar el conteo de listas, incluso cuando es solo 1
          setSavedListName(`${savedData.length} list${savedData.length === 1 ? '' : 's'}`);
        } else {
          setIsSaved(false);
          setCurrentLists([]);
          setSavedListName('');
        }
      } catch (error) {
        console.error('Error checking saved status:', error);
      }
    };
    
    checkSavedStatus();
    setShowSaveModal(false);
  };

  // Helper to parse comma-separated fields with uppercase pattern
  const parseArrayField = (field: string | undefined): string[] => {
    if (!field) return [];
    
    // Remove brackets and quotes
    const cleaned = field.replace(/[\[\]"]/g, '');
    
    // Split by comma followed by uppercase letter (e.g., "item1,Item2,Item3")
    const items = cleaned.split(/,(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 0);
    
    // If no items found with the uppercase pattern, try regular comma split
    if (items.length === 0 || (items.length === 1 && cleaned.includes(','))) {
      return cleaned.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    
    return items;
  };

  const targetIndustries = parseArrayField(product.target_industries);

  const countries = company?.countries ? 
    (Array.isArray(company.countries) ? company.countries : [company.countries]) : [];

  return (
    <>
      <EnhancedCard className="w-full p-6">
        <div className="space-y-6">
          {/* Header Section */}
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              {productImageUrl ? (
                <img 
                  src={productImageUrl} 
                  alt={`${product.product_name} image`}
                  className="w-20 h-20 object-contain rounded-lg border border-gray-200"
                  onError={() => setProductImageUrl(null)}
                />
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-mint/30 to-mint/50 rounded-lg flex items-center justify-center border border-gray-200">
                  <Package className="w-8 h-8 text-navy" />
                </div>
              )}
            </div>
            
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {product.product_name || 'Product Profile'}
              </h2>
              
              {company?.nombre_empresa && (
                <div className="flex items-center gap-2 mb-2">
                  <Building className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600 font-medium">
                    {company.nombre_empresa}
                  </span>
                </div>
              )}

              {product.main_category && (
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-gray-500" />
                  <Badge variant="secondary" className="bg-mint/20 text-mint-dark border-mint/40">
                    {product.main_category}
                  </Badge>
                </div>
              )}

              {(product.product_url || company?.website) && (
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-500" />
                  <a 
                    href={product.product_url || company?.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary-dark hover:underline"
                  >
                    {product.product_url || company?.website}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {(product.long_description || product.short_description) && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Product Description</h3>
              <p className="text-gray-700 leading-relaxed">
                {product.long_description || product.short_description}
              </p>
            </div>
          )}



          {/* Target Industries */}
          {targetIndustries.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Target Industries
              </h3>
              <div className="flex flex-wrap gap-2">
                {targetIndustries.slice(0, 6).map((industry, index) => (
                  <Badge key={index} variant="outline" className="border-navy/30 text-navy">
                    {industry}
                  </Badge>
                ))}
              </div>
            </div>
          )}



          {/* Agent Analysis Description */}
          {additionalInfo?.description && (
            <div className="bg-gradient-to-r from-sky-light/10 to-mint/10 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-navy mb-4 flex items-center gap-2">
                🤖 Agent Analysis
              </h3>
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {additionalInfo.description}
                </p>
              </div>
            </div>
          )}

          {/* Key Specifications */}
          {additionalInfo?.specifications && additionalInfo.specifications.length > 0 && (
            <div className="bg-gradient-to-r from-primary/10 to-sky-light/15 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-navy mb-4 flex items-center gap-2">
                🔍 Key Specifications
              </h3>
              <ul className="space-y-2">
                {additionalInfo.specifications.map((spec, index) => (
                  <li key={index} className="text-primary leading-relaxed">• {spec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions to Consider */}
          {additionalInfo?.questions && additionalInfo.questions.length > 0 && (
            <div className="bg-gradient-to-r from-mint/10 to-sky-light/15 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-navy mb-4 flex items-center gap-2">
                ❓ Questions to Consider
              </h3>
              <ul className="space-y-2">
                {additionalInfo.questions.map((question, index) => (
                  <li key={index} className="text-navy leading-relaxed">• {question}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
          <Button
            onClick={handleViewDetails}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-navy font-semibold transition-colors"
            disabled={false}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View Details
          </Button>
          
          <Button
            onClick={handleSaveCompany}
            className={`flex-1 font-semibold transition-colors ${
              isSaved 
                ? 'bg-mint hover:bg-mint/90 text-navy' 
                : 'bg-mint hover:bg-mint/90 text-navy'
            }`}
            disabled={!user || !companyId || !companyName}
          >
            <Bookmark className="w-4 h-4 mr-2" />
            {isSaved ? `Saved in ${savedListName}` : 'Save Supplier'}
          </Button>
        </div>
      </EnhancedCard>

      {showSaveModal && companyId && companyName && (
        <SaveToListModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          companyId={companyId}
          companyName={companyName}
          userId={user?.id || ''}
          currentLists={currentLists}
          onSaveSuccess={handleSaveSuccess}
        />
      )}
    </>
  );
};

export default ProductProfileCard;