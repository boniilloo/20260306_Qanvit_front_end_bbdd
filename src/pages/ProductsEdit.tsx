import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, Trash2, Save, X, Sparkles, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyAdminStatus } from '@/hooks/useCompanyAdminStatus';
import ProductImageUpload from '@/components/ProductImageUpload';
import ProductAutoFillModal from '@/components/products/ProductAutoFillModal';

import { ProductCommentModal } from '@/components/products/ProductCommentModal';
import { ProductRevisionPreviewModal } from '@/components/company/ProductRevisionPreviewModal';
import { generateUUID } from '@/utils/uuidUtils';

interface Product {
  id: string;
  product_id: string;
  product_name: string;
  main_category: string;
  subcategories: string[];
  short_description: string;
  long_description: string;
  key_features: string[];
  use_cases: string[];
  target_industries: string[];
  image: string[];
  source_urls: string[];
  youtube_url?: string;
}

const ProductsEdit: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { companySlug: adminCompanySlug, companyId: adminCompanyId } = useCompanyAdminStatus();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('companyId');
  const companyName = searchParams.get('companyName');
  const returnPath = searchParams.get('returnPath') || '/my-company';
  const selectedProductId = searchParams.get('selectedProductId'); // New param for direct product editing
  const openAutoFill = searchParams.get('openAutoFill') === 'true'; // New param to auto-open AI modal
  
  const [products, setProducts] = useState<Product[]>([]);
  const [originalProducts, setOriginalProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProductIndex, setSelectedProductIndex] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [productToDelete, setProductToDelete] = useState<number | null>(null);
  const [isAutoFillModalOpen, setIsAutoFillModalOpen] = useState(false);
  
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [currentCompanySlug, setCurrentCompanySlug] = useState<string | null>(null);

  // Redirect if no company ID
  useEffect(() => {
    if (!companyId) {
      navigate('/my-company');
    }
  }, [companyId, navigate]);

  // Fetch company slug for navigation
  useEffect(() => {
    const fetchCompanySlug = async () => {
      if (!companyId) return;
      
      try {
        const { data, error } = await supabase
          .from('company_revision')
          .select('slug')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .maybeSingle();

        if (error) {
          console.error('Error fetching company slug:', error);
          return;
        }

        if (data) {
          setCurrentCompanySlug(data.slug);
        }
      } catch (error) {
        console.error('Error in fetchCompanySlug:', error);
      }
    };

    fetchCompanySlug();
  }, [companyId]);

  // Fetch products for this company
  useEffect(() => {
    if (!companyId) return;

    const fetchProducts = async () => {
      try {
        // Get product IDs for this company
        const { data: productIds, error: productError } = await supabase
          .from('product')
          .select('id')
          .eq('company_id', companyId);

        if (productError) throw productError;

        if (!productIds || productIds.length === 0) {
          // No existing products → create a placeholder and select it so AI modal can open
          const newProduct: Product = {
            id: generateUUID(),
            product_id: '',
            product_name: '',
            main_category: '',
            subcategories: [],
            short_description: '',
            long_description: '',
            key_features: [],
            use_cases: [],
            target_industries: [],
            image: [],
            source_urls: [],
            youtube_url: ''
          };
          setProducts([newProduct]);
          setOriginalProducts([newProduct]);
          setSelectedProductIndex(0);
          setLoading(false);
          return;
        }

        // Get product revisions
        const { data: productRevisions, error: revisionError } = await supabase
          .from('product_revision')
          .select('*')
          .in('product_id', productIds.map(p => p.id))
          .eq('is_active', true);

        if (revisionError) throw revisionError;

        // Transform data
        const transformedProducts = (productRevisions || []).map(item => ({
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name || '',
          main_category: item.main_category || '',
          subcategories: Array.isArray(item.subcategories) ? item.subcategories : 
            (typeof item.subcategories === 'string' && item.subcategories.startsWith('[')) ?
            JSON.parse(item.subcategories) : [],
          short_description: item.short_description || '',
          long_description: item.long_description || '',
          key_features: Array.isArray(item.key_features) ? item.key_features :
            (typeof item.key_features === 'string' && item.key_features.startsWith('[')) ?
            JSON.parse(item.key_features) : [],
          use_cases: Array.isArray(item.use_cases) ? item.use_cases :
            (typeof item.use_cases === 'string' && item.use_cases.startsWith('[')) ?
            JSON.parse(item.use_cases) : [],
          target_industries: Array.isArray(item.target_industries) ? item.target_industries :
            (typeof item.target_industries === 'string' && item.target_industries.startsWith('[')) ?
            JSON.parse(item.target_industries) : [],
          image: Array.isArray(item.image) ? item.image.filter(url => 
            url.includes('supabase.co/storage/') || url.includes('storage.supabase.co/')
          ) : (typeof item.image === 'string' && item.image.startsWith('[')) ?
            JSON.parse(item.image).filter(url => 
              url.includes('supabase.co/storage/') || url.includes('storage.supabase.co/')
            ) : [],
          source_urls: Array.isArray(item.source_urls) ? item.source_urls :
            (typeof item.source_urls === 'string' && item.source_urls.startsWith('[')) ?
            JSON.parse(item.source_urls) : [],
          youtube_url: (item as any)?.youtube_url || ''
        }));

        setProducts(transformedProducts);
        setOriginalProducts(JSON.parse(JSON.stringify(transformedProducts))); // Deep clone
        
        // Auto-select product if selectedProductId is provided
        if (selectedProductId && transformedProducts.length > 0) {
          const productIndex = transformedProducts.findIndex(p => p.product_id === selectedProductId);
          if (productIndex !== -1) {
            setSelectedProductIndex(productIndex);
          } else {
            setSelectedProductIndex(0);
          }
        } else if (!selectedProductId) {
          // If no selectedProductId, always create a new product automatically (replicating handleAddProduct logic)
          const newProduct: Product = {
            id: generateUUID(),
            product_id: '',
            product_name: '',
            main_category: '',
            subcategories: [],
            short_description: '',
            long_description: '',
            key_features: [],
            use_cases: [],
            target_industries: [],
            image: [],
            source_urls: [],
            youtube_url: ''
          };
          const newProducts = [...transformedProducts, newProduct];
          setProducts(newProducts);
          setSelectedProductIndex(newProducts.length - 1);
        } else if (transformedProducts.length > 0) {
          setSelectedProductIndex(0);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        toast({
          title: 'Error',
          description: 'Failed to load products',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [companyId]);

  // Auto-open AutoFill modal when openAutoFill parameter is true
  useEffect(() => {
    if (openAutoFill && !loading && selectedProductIndex !== null) {
      setIsAutoFillModalOpen(true);
    }
  }, [openAutoFill, loading, selectedProductIndex]);

  // Deep compare products to detect changes
  const deepCompareProducts = (current: Product[], original: Product[]): boolean => {
    if (current.length !== original.length) return true;
    
    for (let i = 0; i < current.length; i++) {
      const currentProduct = current[i];
      const originalProduct = original[i];
      
      // Check if product exists in original (new products have empty product_id)
      if (!currentProduct.product_id && currentProduct.product_name.trim()) {
        return true; // New product with content
      }
      
      // Skip comparison for empty new products
      if (!currentProduct.product_id && !currentProduct.product_name.trim()) {
        continue;
      }
      
      // Find corresponding original product by product_id
      const matchingOriginal = original.find(p => p.product_id === currentProduct.product_id);
      if (!matchingOriginal) return true;
      
      // Compare string fields
      const stringFields: ('product_name' | 'main_category' | 'short_description' | 'long_description' | 'youtube_url')[] = [
        'product_name', 'main_category', 'short_description', 'long_description', 'youtube_url'
      ];
      
      for (const field of stringFields) {
        const currentValue = currentProduct[field] as string;
        const originalValue = matchingOriginal[field] as string;
        if (currentValue.trim() !== originalValue.trim()) {
          return true;
        }
      }
      
      // Compare array fields
      const arrayFields: ('subcategories' | 'key_features' | 'use_cases' | 'target_industries' | 'image' | 'source_urls')[] = [
        'subcategories', 'key_features', 'use_cases', 'target_industries', 'image', 'source_urls'
      ];
      
      for (const field of arrayFields) {
        const currentArray = currentProduct[field].filter(Boolean);
        const originalArray = matchingOriginal[field].filter(Boolean);
        
        if (currentArray.length !== originalArray.length) {
          return true;
        }
        
        for (let j = 0; j < currentArray.length; j++) {
          if (currentArray[j].trim() !== originalArray[j].trim()) {
            return true;
          }
        }
      }
    }
    
    return false;
  };

  // Check if there are any changes
  const hasChanges = (): boolean => {
    
    // Check for removed products
    const currentProductIds = products.filter(p => p.product_id).map(p => p.product_id);
    const originalProductIds = originalProducts.map(p => p.product_id);
    const removedProducts = originalProductIds.filter(id => !currentProductIds.includes(id));
    
    if (removedProducts.length > 0) return true;
    
    // Check for new products or modifications
    return deepCompareProducts(products, originalProducts);
  };

  const handleAddProduct = () => {
    const newProduct: Product = {
      id: generateUUID(),
      product_id: '',
      product_name: '',
      main_category: '',
      subcategories: [],
      short_description: '',
      long_description: '',
      key_features: [],
      use_cases: [],
      target_industries: [],
      image: [],
      source_urls: [],
      youtube_url: ''
    };
    const newProducts = [...products, newProduct];
    setProducts(newProducts);
    setSelectedProductIndex(newProducts.length - 1);
  };

  const confirmRemoveProduct = (productIndex: number) => {
    setProductToDelete(productIndex);
    setShowDeleteDialog(true);
  };

  const handleRemoveProduct = async () => {
    if (productToDelete === null) return;
    
    const productIndex = productToDelete;
    const product = products[productIndex];
    
    if (product.product_id) {
      try {
        // 1. Get all product revisions to understand what we're deleting
        const { data: productRevisions, error: getRevisionsError } = await supabase
          .from('product_revision')
          .select('id')
          .eq('product_id', product.product_id);

        if (getRevisionsError) throw getRevisionsError;
        
        // 2. Delete embeddings in chunks to avoid issues
        if (productRevisions && productRevisions.length > 0) {
          const revisionIds = productRevisions.map(pr => pr.id);
          
          // Use security definer function to delete embeddings
          for (const revisionId of revisionIds) {
            const { error: embeddingError } = await supabase.rpc('delete_product_embeddings', {
              p_product_revision_id: revisionId
            });

            if (embeddingError) {
              throw embeddingError;
            }
          }
        }

        // 3. Wait a moment to ensure all embedding deletions are processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // 4. Delete product revisions one by one to avoid FK constraint issues
        if (productRevisions && productRevisions.length > 0) {
          for (const revision of productRevisions) {
            const { error: revisionError } = await supabase
              .from('product_revision')
              .delete()
              .eq('id', revision.id);

            if (revisionError) {
              throw revisionError;
            }
          }
        }

        // 5. Finally delete the product
        const { error: productError } = await supabase
          .from('product')
          .delete()
          .eq('id', product.product_id);

        if (productError) {
          throw productError;
        }
        toast({
          title: 'Success',
          description: 'Product removed successfully'
        });
      } catch (error) {
        console.error('Error removing product:', error);
        toast({
          title: 'Error',
          description: `Failed to remove product: ${error.message || 'Unknown error'}`,
          variant: 'destructive'
        });
        return;
      }
    }

    const newProducts = products.filter((_, index) => index !== productIndex);
    setProducts(newProducts);
    
    // Adjust selected product index
    if (selectedProductIndex === productIndex) {
      setSelectedProductIndex(newProducts.length > 0 ? 0 : null);
    } else if (selectedProductIndex !== null && selectedProductIndex > productIndex) {
      setSelectedProductIndex(selectedProductIndex - 1);
    }
    
    setShowDeleteDialog(false);
    setProductToDelete(null);
  };

  const handleProductChange = (index: number, field: keyof Product, value: any) => {
    const updatedProducts = [...products];
    updatedProducts[index] = { ...updatedProducts[index], [field]: value };
    setProducts(updatedProducts);
  };

  const handleArrayFieldAdd = (productIndex: number, field: 'subcategories' | 'key_features' | 'use_cases' | 'target_industries' | 'image' | 'source_urls') => {
    const updatedProducts = [...products];
    updatedProducts[productIndex] = {
      ...updatedProducts[productIndex],
      [field]: [...updatedProducts[productIndex][field], '']
    };
    setProducts(updatedProducts);
  };

  const handleArrayFieldChange = (productIndex: number, field: 'subcategories' | 'key_features' | 'use_cases' | 'target_industries' | 'image' | 'source_urls', itemIndex: number, value: string) => {
    const updatedProducts = [...products];
    const newArray = [...updatedProducts[productIndex][field]];
    newArray[itemIndex] = value;
    updatedProducts[productIndex] = { ...updatedProducts[productIndex], [field]: newArray };
    setProducts(updatedProducts);
  };

  const handleArrayFieldRemove = (productIndex: number, field: 'subcategories' | 'key_features' | 'use_cases' | 'target_industries' | 'image' | 'source_urls', itemIndex: number) => {
    const updatedProducts = [...products];
    const newArray = updatedProducts[productIndex][field].filter((_, i) => i !== itemIndex);
    updatedProducts[productIndex] = { ...updatedProducts[productIndex], [field]: newArray };
    setProducts(updatedProducts);
  };

  const handleAutoFillResult = (data: any) => {
    if (selectedProductIndex === null) return;

    const updatedProducts = [...products];
    const currentProduct = updatedProducts[selectedProductIndex];
    
    // Update the selected product with auto-filled data
    updatedProducts[selectedProductIndex] = {
      ...currentProduct,
      product_name: data.product_name || currentProduct.product_name,
      main_category: data.main_category || currentProduct.main_category,
      short_description: data.short_description || currentProduct.short_description,
      long_description: data.long_description || currentProduct.long_description,
      subcategories: data.subcategories && data.subcategories.length > 0 ? data.subcategories : currentProduct.subcategories,
      key_features: data.key_features && data.key_features.length > 0 ? data.key_features : currentProduct.key_features,
      use_cases: data.use_cases && data.use_cases.length > 0 ? data.use_cases : currentProduct.use_cases,
      target_industries: data.target_industries && data.target_industries.length > 0 ? data.target_industries : currentProduct.target_industries,
      image: data.image && data.image.length > 0 ? data.image : currentProduct.image,
      source_urls: data.source_urls && data.source_urls.length > 0 ? data.source_urls : currentProduct.source_urls
    };
    
    setProducts(updatedProducts);
  };

  // Save individual product and return product revision ID
  const saveProductIfNeeded = async (productIndex: number, comment?: string): Promise<string> => {
    const product = products[productIndex];
    
    // Use default name if no name is provided
    if (!product.product_name) {
      const updatedProducts = [...products];
      updatedProducts[productIndex].product_name = 'Unknown product';
      setProducts(updatedProducts);
      product.product_name = 'Unknown product';
    }

    let productId = product.product_id;

    // Create new product if it doesn't exist
    if (!productId) {
      const { data: newProduct, error: productError } = await supabase
        .from('product')
        .insert({ company_id: companyId })
        .select('id')
        .single();

      if (productError) throw productError;
      productId = newProduct.id;

      // Update local state with new product_id
      const updatedProducts = [...products];
      updatedProducts[productIndex].product_id = productId;
      setProducts(updatedProducts);
    }

    // Deactivate existing active revisions
    await supabase
      .from('product_revision')
      .update({ is_active: false })
      .eq('product_id', productId)
      .eq('is_active', true);

    // Create new revision and return the revision ID
    const { data: newRevision, error: revisionError } = await supabase
      .from('product_revision')
      .insert({
        product_id: productId,
        product_name: product.product_name,
        main_category: product.main_category,
        subcategories: JSON.stringify(product.subcategories.filter(Boolean)),
        short_description: product.short_description,
        long_description: product.long_description,
        key_features: JSON.stringify(product.key_features.filter(Boolean)),
        use_cases: JSON.stringify(product.use_cases.filter(Boolean)),
        target_industries: JSON.stringify(product.target_industries.filter(Boolean)),
        image: JSON.stringify(product.image.filter(url => 
          url && (url.includes('supabase.co/storage/') || url.includes('storage.supabase.co/'))
        )),
        source_urls: JSON.stringify(product.source_urls.filter(Boolean)),
        youtube_url: (product.youtube_url || '').trim() || null,
        source: 'member',
        comment: comment || null,
        created_by: user.id,
        is_active: true
      })
      .select('id')
      .single();

    if (revisionError) throw revisionError;

    // Record the activation in the product history table (for new active revisions)
    const { error: activationLogError } = await supabase
      .from('product_revision_history')
      .insert({
        product_revision_id: newRevision.id,
        action_by: user.id,
        action_type: 'activation'
      });
    
    if (activationLogError) {
      console.error('Error logging product activation for new revision:', activationLogError);
      // Don't throw here - the revision is already created successfully
    }

    return newRevision.id; // Return the product revision ID
  };

  const handleSave = async () => {
    if (!user || !companyId) return;
    setIsCommentModalOpen(true);
  };

  const handleSaveWithComment = async (comment: string): Promise<string | void> => {
    if (selectedProductIndex === null) return;
    
    setSaving(true);
    try {
      const product = products[selectedProductIndex];
      if (!product.product_name) {
        toast({
          title: 'Error',
          description: 'Product name is required',
          variant: 'destructive'
        });
        return;
      }
      
      const revisionId = await saveProductIfNeeded(selectedProductIndex, comment);

      toast({
        title: 'Success',
        description: 'Product saved successfully'
      });

      // Return the revision ID for embedding generation
      return revisionId;
    } catch (error) {
      console.error('Error saving product:', error);
      toast({
        title: 'Error',
        description: 'Failed to save product',
        variant: 'destructive'
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleCommentModalClose = () => {
    setIsCommentModalOpen(false);
    // After saving and generating embeddings, go back to the same destination as Back
    const targetSlug = currentCompanySlug || undefined;
    const targetId = companyId || undefined;
    const selectedParam = selectedProductId ? `&selectedProduct=${selectedProductId}` : '';
    if (targetSlug) {
      navigate(`/suppliers/${targetSlug}?tab=manage&subtab=products-info${selectedParam}`);
    } else if (targetId) {
      navigate(`/suppliers/${targetId}?tab=manage&subtab=products-info${selectedParam}`);
    } else {
      navigate(returnPath);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => {
                // Go back to supplier page → manage/products-info (prefer current company slug, fallback to id)
                const targetSlug = currentCompanySlug || undefined;
                const targetId = companyId || undefined;
                const selectedParam = selectedProductId ? `&selectedProduct=${selectedProductId}` : '';
                if (targetSlug) {
                  navigate(`/suppliers/${targetSlug}?tab=manage&subtab=products-info${selectedParam}`);
                } else if (targetId) {
                  navigate(`/suppliers/${targetId}?tab=manage&subtab=products-info${selectedParam}`);
                } else {
                  navigate(returnPath);
                }
              }} 
              variant="outline" 
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground">Edit Products</h1>
              <p className="text-muted-foreground">{companyName}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => setIsPreviewOpen(true)}
              variant="outline"
              disabled={selectedProductIndex === null}
            >
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasChanges()}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : hasChanges() ? 'Save Changes' : 'No Changes'}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {products.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No products found</p>
                <Button onClick={handleAddProduct}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Product
                </Button>
              </CardContent>
            </Card>
          ) : (
            selectedProductIndex !== null && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Edit: {products[selectedProductIndex!]?.product_name || `Product ${selectedProductIndex! + 1}`}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setIsAutoFillModalOpen(true)}
                        variant="outline"
                        size="sm"
                        className="text-primary hover:text-primary-foreground"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Auto-fill
                      </Button>
                      <Button
                        onClick={() => confirmRemoveProduct(selectedProductIndex)}
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove Product
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Product Name *</label>
                      <Input
                        value={products[selectedProductIndex!]?.product_name || ''}
                        onChange={(e) => handleProductChange(selectedProductIndex, 'product_name', e.target.value)}
                        placeholder="Enter product name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Main Category</label>
                      <Input
                        value={products[selectedProductIndex!]?.main_category || ''}
                        onChange={(e) => handleProductChange(selectedProductIndex, 'main_category', e.target.value)}
                        placeholder="Enter main category"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Short Description</label>
                    <Textarea
                      value={products[selectedProductIndex!]?.short_description || ''}
                      onChange={(e) => handleProductChange(selectedProductIndex, 'short_description', e.target.value)}
                      placeholder="Brief description of the product"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Long Description</label>
                    <Textarea
                      value={products[selectedProductIndex!]?.long_description || ''}
                      onChange={(e) => handleProductChange(selectedProductIndex, 'long_description', e.target.value)}
                      placeholder="Detailed description of the product"
                      rows={4}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">YouTube video URL</label>
                    <Input
                      value={products[selectedProductIndex!]?.youtube_url || ''}
                      onChange={(e) => handleProductChange(selectedProductIndex, 'youtube_url', e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      type="url"
                    />
                  </div>

                  {/* Product Images - Special component */}
                  <ProductImageUpload
                    images={products[selectedProductIndex!]?.image || []}
                    onImagesChange={(images) => handleProductChange(selectedProductIndex!, 'image', images)}
                    productId={products[selectedProductIndex!]?.product_id}
                    maxImages={5}
                    maxSizeInMB={1}
                  />


                  {(['subcategories', 'key_features', 'use_cases', 'target_industries', 'source_urls'] as const).map((field) => (
                    <div key={field}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium">
                          {field.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        </label>
                        <Button
                          onClick={() => handleArrayFieldAdd(selectedProductIndex, field)}
                          variant="outline"
                          size="sm"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {products[selectedProductIndex!]?.[field].map((item, itemIndex) => (
                          <div key={itemIndex} className="flex gap-2">
                            <Input
                              value={item}
                              onChange={(e) => handleArrayFieldChange(selectedProductIndex, field, itemIndex, e.target.value)}
                              placeholder={`Enter ${field.slice(0, -1)}`}
                            />
                            <Button
                              onClick={() => handleArrayFieldRemove(selectedProductIndex, field, itemIndex)}
                              variant="outline"
                              size="sm"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que quieres eliminar este producto de la base de datos? 
                Esta acción no se puede deshacer y el producto será eliminado permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowDeleteDialog(false);
                setProductToDelete(null);
              }}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveProduct}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar producto
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Auto-fill Modal */}
        <ProductAutoFillModal
          isOpen={isAutoFillModalOpen}
          onClose={() => setIsAutoFillModalOpen(false)}
          onResult={handleAutoFillResult}
          productId={selectedProductIndex !== null && selectedProductIndex >= 0 && products[selectedProductIndex]?.product_id ? products[selectedProductIndex]!.product_id : undefined}
        />

        {/* Product Comment Modal */}
        <ProductCommentModal
          isOpen={isCommentModalOpen}
          onClose={handleCommentModalClose}
          onSave={handleSaveWithComment}
          isSaving={saving}
        />

        {/* Product Preview Modal */}
        <ProductRevisionPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          revision={selectedProductIndex !== null ? {
            id: products[selectedProductIndex]?.id || '',
            product_id: products[selectedProductIndex]?.product_id || '',
            product_name: products[selectedProductIndex]?.product_name || '',
            main_category: products[selectedProductIndex]?.main_category || '',
            subcategories: JSON.stringify(products[selectedProductIndex]?.subcategories || []),
            short_description: products[selectedProductIndex]?.short_description || '',
            long_description: products[selectedProductIndex]?.long_description || '',
            key_features: JSON.stringify(products[selectedProductIndex]?.key_features || []),
            use_cases: JSON.stringify(products[selectedProductIndex]?.use_cases || []),
            target_industries: JSON.stringify(products[selectedProductIndex]?.target_industries || []),
            is_active: true,
            created_at: new Date().toISOString(),
            source: 'member',
            image: JSON.stringify(products[selectedProductIndex]?.image || []),
          } as any : null}
        />
      </div>
    </div>
  );
};

export default ProductsEdit;