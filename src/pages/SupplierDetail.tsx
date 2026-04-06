import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Globe, MapPin, Award, Calendar, Building2, Users, DollarSign, FileText, Settings, TrendingUp, Package, Star, Check, Clock, Eye, Search, Mail, BarChart3, Filter, ChevronLeft, ChevronRight, X, Save, Heart, HeartOff, Edit, Download, Phone, Info, Linkedin, Newspaper } from 'lucide-react';
import RevenueChart from '@/components/ui/RevenueChart';
import CompanyOverviewLeft from '@/components/company/CompanyOverviewLeft';
import CompanyOverviewRightContact from '@/components/company/CompanyOverviewRightContact';
import ManageCompanyTabRefactored from '@/components/company/ManageCompanyTabRefactored';
import { CompanyDocumentViewCard } from '@/components/company/CompanyDocumentViewCard';
import { ProductDocumentViewCard } from '@/components/products/ProductDocumentViewCard';
import ProductsServicesTab from '@/components/products/ProductsServicesTab';
import { LinkedInPeopleTab } from '@/components/company/LinkedInPeopleTab';
import ProductImageModal from '@/components/products/ProductImageModal';
import { Product, ProductDocument } from '@/types/product';
import { usePendingCompanyRFXInvitations } from '@/hooks/usePendingCompanyRFXInvitations';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import SupplierMap from '@/components/SupplierMap';
import ProductCarousel from '@/components/ProductCarousel';
import SaveToListModal from '@/components/SaveToListModal';
import { useAuth } from '@/contexts/AuthContext';
import { useIsCompanyAdmin } from '@/hooks/useIsCompanyAdmin';
import { usePendingCompanyAdminRequests } from '@/hooks/usePendingCompanyAdminRequests';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { toast } from '@/hooks/use-toast';
import ProgressiveSmartLogo from '@/components/ui/ProgressiveSmartLogo';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
interface Supplier {
  id: string;
  company_id: string;
  nombre_empresa: string;
  countries: any;
  cities?: any;
  gps_coordinates?: any;
  main_activities: string;
  description: string;
  website: string;
  /** From public.company via join */
  linkedin_url?: string | null;
  source: string;
  created_at: string;
  revenues?: any;
  certifications?: any;
  main_customers?: any;
  sectors?: string;
  score?: number;
  score_rationale?: string;
  strengths?: string;
  logo?: string;
  contact_emails?: any;
  contact_phones?: any;
  youtube_url?: string;
}
interface CompanyDocument {
  id: string;
  company_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
}
interface CompanyNews {
  id: string;
  title: string | null;
  url: string | null;
  source: string | null;
  time: string | null;
  snippet: string | null;
  scraped_at: string;
  related: string | null;
}
const SupplierDetail = () => {
  const {
    slug,
    productName
  } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [basicInfoLoaded, setBasicInfoLoaded] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [coverImageLoading, setCoverImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isSaved, setIsSaved] = useState(false);
  const [savedLists, setSavedLists] = useState<Array<{id: string | null, name: string, color?: string}>>([]);
  const [isCheckingSaved, setIsCheckingSaved] = useState(false);
  const [showUnsaveDialog, setShowUnsaveDialog] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [companyDocuments, setCompanyDocuments] = useState<CompanyDocument[]>([]);
  const [productDocuments, setProductDocuments] = useState<ProductDocument[]>([]);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [productDocumentsLoading, setProductDocumentsLoading] = useState(false);
  const [latestNews, setLatestNews] = useState<CompanyNews[]>([]);
  const [latestNewsLoading, setLatestNewsLoading] = useState(false);
  const [newsThumbnailAttempt, setNewsThumbnailAttempt] = useState<Record<string, number>>({});
  const hasProductsWithImages = products.some(product => {
    const productImages = (product as any)?.image;
    if (Array.isArray(productImages)) {
      return productImages.some(img => typeof img === 'string' && img.trim().length > 0);
    }
    return typeof productImages === 'string' && productImages.trim().length > 0;
  });
  const shouldShowProductCarousel = !coverImageUrl && hasProductsWithImages;
  
  const { user } = useAuth();
  const { isAdmin: isOwnerAdmin } = useIsCompanyAdmin(supplier?.company_id);
  const { count: pendingForCompany } = usePendingCompanyAdminRequests(supplier?.company_id);
  const { count: pendingRfxForCompany } = usePendingCompanyRFXInvitations(supplier?.company_id);
  const { isAdmin: isGeneralAdmin } = useIsAdmin();
  

  // Fetch product documents when selected product changes
  useEffect(() => {
    if (selectedProduct) {
      // We need to get the actual product_id from the product table
      // since selectedProduct.id is actually the product_revision id
      const fetchProductId = async () => {
        try {
          const { data, error } = await supabase
            .from('product_revision')
            .select('product_id, pdf_url')
            .eq('id', selectedProduct.id)
            .single();

          if (error) {
            console.error('Error fetching product_id:', error);
            return;
          }

          if (data?.product_id) {
            await fetchProductDocuments(data.product_id, data.pdf_url);
          }
        } catch (err) {
          console.error('Exception fetching product_id:', err);
        }
      };

      fetchProductId();
    } else {
      setProductDocuments([]);
    }
  }, [selectedProduct]);

  // Check if supplier is saved when component loads or user changes
  useEffect(() => {
    const checkIfSaved = async () => {
      if (!user || !supplier) return;
      
      setIsCheckingSaved(true);
      try {
        const { data, error } = await supabase
          .from('saved_companies')
          .select(`
            id,
            list_id,
            supplier_lists (
              id,
              name,
              color
            )
          `)
          .eq('user_id', user.id)
          .eq('company_id', supplier.company_id);
        
        if (error) {
          console.error('Error checking saved status:', error);
          return;
        }
        
        setIsSaved(!!data && data.length > 0);
        if (data && data.length > 0) {
          const lists = data.map(item => ({
            id: item.list_id,
            name: item.supplier_lists?.name || "Uncategorized",
            color: item.supplier_lists?.color || "#3B82F6"
          }));
          setSavedLists(lists);
        } else {
          setSavedLists([]);
        }
      } catch (err) {
        console.error('Exception checking saved status:', err);
      } finally {
        setIsCheckingSaved(false);
      }
    };

    checkIfSaved();
  }, [user, supplier]);

  const getYoutubeEmbedUrl = (url?: string | null): string | null => {
    if (!url || typeof url !== 'string') return null;
    try {
      const trimmed = url.trim();
      const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
      if (shortMatch && shortMatch[1]) return `https://www.youtube.com/embed/${shortMatch[1]}`;
      const urlObj = new URL(trimmed, window.location.origin);
      const v = urlObj.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (trimmed.includes('/embed/')) return trimmed;
    } catch {}
    return null;
  };

  const embedUrl = React.useMemo(() => getYoutubeEmbedUrl((supplier as any)?.youtube_url), [supplier]);

  React.useEffect(() => {
  }, [supplier, embedUrl]);

  // Handle save/unsave supplier
  const handleSaveSupplier = async () => {
    if (!user) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to save suppliers",
        variant: "destructive",
      });
      return;
    }

    if (!supplier) return;

    // Always show the modal to manage lists
    setShowSaveModal(true);
  };

  // Handle successful save from modal
  const handleSaveSuccess = (listName?: string, listId?: string | null) => {
    setIsSaved(true);
    // Update the saved lists array with the new list
    setSavedLists(prev => [...prev, { 
      id: listId || null, 
      name: listName || "Uncategorized", 
      color: "#3B82F6" 
    }]);
  };

  // Handle unsave confirmation
  const handleUnsaveConfirm = async () => {
    if (!user || !supplier) return;

    try {
      const { error } = await supabase
        .from('saved_companies')
        .delete()
        .eq('user_id', user.id)
        .eq('company_id', supplier.company_id);

      if (error) {
        throw error;
      }

      setIsSaved(false);
      setSavedLists([]);
      setShowUnsaveDialog(false);
      toast({
        title: "Supplier removed",
        description: "Supplier has been removed from all your lists",
      });
    } catch (err) {
      console.error('Error removing supplier:', err);
      toast({
        title: "Error",
        description: "Could not remove supplier. Please try again.",
        variant: "destructive",
      });
    }
  };
  const fetchProducts = async (companyId: string) => {
    setProductsLoading(true);
    setProducts([]);
    try {
      // First, get the product IDs that belong to this company
      const {
        data: productIds,
        error: productError
      } = await supabase.from('product').select('id').eq('company_id', companyId);
      
      if (productError) {
        console.error('❌ Error fetching product IDs:', productError);
        return;
      }
      
      if (!productIds || productIds.length === 0) {
        setProducts([]);
        return;
      }

      // Then get the product_revision data for these products where is_active = true
      const productIdList = productIds.map(p => p.id);
      
      const {
        data,
        error
      } = await supabase.from('product_revision').select(`
          id,
          product_name,
          main_category,
          subcategories,
          short_description,
          long_description,
          key_features,
          use_cases,
          target_industries,
          definition_score,
          image,
          youtube_url,
          product_url,
          source
        `).in('product_id', productIdList).eq('is_active', true);
        
      if (error) {
        console.error('❌ Error fetching product revisions:', error);
        return;
      }

      // Transform the data to match our interface
      const transformedProducts = (data || []).map(item => {
        
        // Helper function to safely parse JSON or return as single item/string
        const safeParse = (value: any, fieldName: string, defaultValue: any = []) => {
          if (!value) {
            return defaultValue;
          }
          
          if (typeof value !== 'string') {
            return Array.isArray(value) ? value : defaultValue;
          }
          
          // Check if it looks like JSON (starts with [ or {)
          if (value.startsWith('[') || value.startsWith('{')) {
            try {
              const parsed = JSON.parse(value);
              return parsed;
            } catch (e) {
              return [value]; // Wrap in array if it was supposed to be an array
            }
          } else {
            // Plain text - for arrays, split by common delimiters
            if (fieldName === 'image') {
              return [value];
            } else if (Array.isArray(defaultValue)) {
              // First try to split by comma followed by uppercase letter (e.g., "item1,Item2,Item3")
              const upperCaseItems = value.split(/,(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 0);
              
              // If pattern matched and we have multiple items, use it
              if (upperCaseItems.length > 1 || (upperCaseItems.length === 1 && !value.includes(','))) {
                return upperCaseItems;
              }
              
              // Otherwise fall back to standard delimiters (commas, semicolons, or pipes)
              const split = value.split(/[,;|]/).map(s => s.trim()).filter(s => s.length > 0);
              return split.length > 0 ? split : [value];
            } else {
              return value;
            }
          }
        };
        
        const transformedProduct = {
          id: item.id,
          product_name: item.product_name,
          main_category: item.main_category,
          subcategories: safeParse(item.subcategories, 'subcategories', []),
          short_description: item.short_description,
          long_description: item.long_description,
          key_features: safeParse(item.key_features, 'key_features', []),
          use_cases: safeParse(item.use_cases, 'use_cases', []),
          target_industries: safeParse(item.target_industries, 'target_industries', []),
          definition_score: typeof item.definition_score === 'string' ? parseInt(item.definition_score) : item.definition_score,
          image: safeParse(item.image, 'image', []),
          youtube_url: (item as any)?.youtube_url,
          product_url: (item as any)?.product_url,
          source: (item as any)?.source
        };
        
        return transformedProduct;
      });
      
      setProducts(transformedProducts);
      
        // If we have a productName in URL, select that product
        if (productName && transformedProducts.length > 0) {
          const product = transformedProducts.find(p => 
            p.product_name === decodeURIComponent(productName)
          );
          if (product) {
            setSelectedProduct(product);
          }
        }
    } catch (err) {
      console.error('💥 Exception in fetchProducts:', err);
    } finally {
      setProductsLoading(false);
    }
  };

  // Fetch company cover image
  const fetchCoverImage = async (companyId: string) => {
    setCoverImageLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_cover_images' as any)
        .select('image_url')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        console.error('❌ Error fetching cover image:', error);
        setCoverImageUrl(null);
        return;
      }

      setCoverImageUrl((data as any)?.image_url || null);
    } catch (err) {
      console.error('💥 Exception fetching cover image:', err);
      setCoverImageUrl(null);
    } finally {
      setCoverImageLoading(false);
    }
  };

  // Fetch latest related company news (related = true)
  const fetchLatestNews = async (companyId: string) => {
    setLatestNewsLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_news')
        .select('id, title, url, source, time, snippet, scraped_at, related')
        .eq('company_id', companyId)
        .ilike('related', 'true')
        .order('scraped_at', { ascending: false });

      if (error) {
        console.error('Error fetching latest related news:', error);
        setLatestNews([]);
        return;
      }

      setLatestNews((data as CompanyNews[]) || []);
    } catch (err) {
      console.error('Exception in fetchLatestNews:', err);
      setLatestNews([]);
    } finally {
      setLatestNewsLoading(false);
    }
  };

  // Fetch company documents
  const fetchCompanyDocuments = async (companyId: string) => {
    setDocumentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching company documents:', error);
        return;
      }

      setCompanyDocuments(data || []);
    } catch (err) {
      console.error('Exception in fetchCompanyDocuments:', err);
    } finally {
      setDocumentsLoading(false);
    }
  };

  // Handle document download
  const handleDocumentDownload = async (doc: CompanyDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('company-documents')
        .download(doc.file_path);

      if (error) {
        throw error;
      }

      // Create download link
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Document downloaded",
        description: `${doc.file_name} has been downloaded successfully`,
      });
    } catch (error: any) {
      console.error('Error downloading document:', error);
      toast({
        title: "Download failed",
        description: error.message || "Failed to download the document",
        variant: "destructive",
      });
    }
  };

  // Handle product document download
  const handleProductDocumentDownload = async (doc: ProductDocument) => {
    // Don't download scraped documents (they're external URLs)
    if (doc.is_scraped || doc.external_url) {
      toast({
        title: "Info",
        description: "This is an externally hosted document. Click to view it.",
      });
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('product-documents')
        .download(doc.file_path);

      if (error) {
        throw error;
      }

      // Create download link
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Document downloaded",
        description: `${doc.file_name} has been downloaded successfully`,
      });
    } catch (error: any) {
      console.error('Error downloading document:', error);
      toast({
        title: "Download failed",
        description: error.message || "Failed to download the document",
        variant: "destructive",
      });
    }
  };

  // Fetch product documents
  const fetchProductDocuments = async (productId: string, pdfUrl?: string | null) => {
    setProductDocumentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_documents')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching product documents:', error);
        return;
      }

      const documents = data || [];
      
      // If there's a scraped PDF URL, add it as a virtual document
      if (pdfUrl) {
        const scrapedDoc: ProductDocument = {
          id: `scraped-${productId}`,
          product_id: productId,
          file_name: 'Product Datasheet (Auto-scraped)',
          file_path: '', // Not used for external URLs
          file_size: 0, // Unknown size for external PDFs
          source: 'auto-scraped',
          created_at: new Date().toISOString(),
          uploaded_by: null,
          product_revision_id: selectedProduct?.id || null,
          is_scraped: true,
          external_url: pdfUrl,
        };
        
        // Add the scraped document at the beginning
        documents.unshift(scrapedDoc);
      }

      setProductDocuments(documents);
    } catch (err) {
      console.error('Exception in fetchProductDocuments:', err);
    } finally {
      setProductDocumentsLoading(false);
    }
  };

  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return 'Size unknown';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getDomainFromUrl = (rawUrl?: string | null): string | null => {
    if (!rawUrl) return null;
    try {
      const parsed = new URL(rawUrl);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  };

  const getNewsImageCandidates = (news: CompanyNews): string[] => {
    const domain = getDomainFromUrl(news.url);
    if (!domain) return [];

    return [
      `https://logo.clearbit.com/${domain}`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://www.google.com/s2/favicons?sz=128&domain=${domain}`,
    ];
  };
  useEffect(() => {
    const fetchSupplier = async () => {
      if (!slug) return;
      
      try {
        let data, error;

        // First try to find by slug
        const slugResult = await supabase.from('company_revision').select(`
          *,
          contact_emails,
          contact_phones,
          company!company_revision_company_id_fkey (
            linkedin_url
          )
        `).eq('slug', slug).eq('is_active', true).single();
        
        if (slugResult.data) {
          data = slugResult.data;
          error = slugResult.error;
        } else {
          // Fallback: try to find by id (for backward compatibility)
          const idResult = await supabase.from('company_revision').select(`
            *,
            contact_emails,
            contact_phones,
            company!company_revision_company_id_fkey (
              linkedin_url
            )
          `).eq('id', slug).eq('is_active', true).single();
          data = idResult.data;
          error = idResult.error;
        }
        
        if (error) {
          console.error('Error fetching supplier:', error);
          setError('Supplier not found');
          return;
        }
        
        if (!data) {
          setError('Supplier not found');
          return;
        }

        const { company: companyJoin, ...revisionRest } = data as typeof data & {
          company?: { linkedin_url: string | null } | null;
        };
        
        // Mostrar información básica inmediatamente
        setSupplier({
          ...revisionRest,
          linkedin_url: companyJoin?.linkedin_url ?? null,
        });
        setBasicInfoLoaded(true);
        setLoading(false);

        // Cargar contenido adicional en segundo plano
        if (data.company_id) {
          // Cargar productos, documentos e imagen de portada de forma independiente
          fetchProducts(data.company_id);
          fetchCompanyDocuments(data.company_id);
          fetchCoverImage(data.company_id);
          fetchLatestNews(data.company_id);
        }
      } catch (err) {
        console.error('❌ Exception:', err);
        setError('Failed to load supplier details');
        setLoading(false);
      }
    };
    fetchSupplier();
  }, [slug, productName]);




  if (loading) {
    return <>
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
              <div className="h-12 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-8"></div>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="h-64 bg-gray-200 rounded"></div>
                <div className="h-64 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </>;
  }
  if (error || !supplier) {
    return <>
        <div className="p-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="mt-20">
              <h1 className="text-2xl font-extrabold text-gray-900 mb-4">Supplier Not Found</h1>
              <p className="text-gray-600 mb-4">{error || 'The supplier you are looking for does not exist.'}</p>
              <p className="text-gray-500 text-sm mb-8 max-w-2xl mx-auto">
                The supplier you're looking for might have changed their company name. In case you are a company admin just look again at the My Company section. Otherwise, you can search for them in the database or try searching with different keywords.
              </p>
              <Link to="/supplier-search">
                <Button>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Search
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </>;
  }
  return <>
      <div className="min-h-screen bg-white">
        {/* Header Section - 64px */}
        <header className="h-16 border-b border-gray-100 px-6 flex items-center justify-between hidden lg:flex">
          <div className="flex items-center gap-4">
            <div className="text-2xl font-bold text-navy">Qanvit</div>
            <nav className="flex items-center text-sm text-charcoal">
              <Link to="/supplier-search" className="hover:text-navy transition-colors">Search</Link>
              <span className="mx-2 text-gray-300">/</span>
              <span className="text-navy font-medium">{supplier.nombre_empresa}</span>
            </nav>
          </div>
        </header>

          <div className="max-w-7xl mx-auto px-6">
          {/* Company Cover Image banner (if available) */}
          {coverImageUrl && (
            <div className="mt-6 w-full rounded-xl border overflow-hidden bg-white">
              <div className="relative w-full" style={{ paddingTop: `${(270/1280)*100}%` }}>
                <img
                  src={coverImageUrl}
                  alt="Company cover"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
            </div>
          )}
          {/* Hero Section - More Compact */}
          <section className="py-12 flex items-center">
            <div className="grid grid-cols-12 gap-8 w-full">
              {/* Mobile Layout - Two columns top, single column bottom */}
              <div className="col-span-12 lg:hidden flex flex-col space-y-6">
                {/* Top section - Two columns */}
                <div className="flex items-start gap-4">
                  {/* Left column - Logo */}
                  <ProgressiveSmartLogo
                    logoUrl={supplier.logo}
                    websiteUrl={supplier.website}
                    companyName={supplier.nombre_empresa}
                    size="lg"
                    className="rounded-2xl cursor-pointer flex-shrink-0"
                    onClick={() => setImageModalOpen(true)}
                    isSupplierRoute={true}
                  />
                  
                  {/* Right column - Name and location */}
                  <div className="flex-1 min-w-0">
                    {/* Company Name (H1) - Smaller on mobile with Verified badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-2xl font-inter font-extrabold text-navy uppercase tracking-tight" style={{fontFamily: 'Inter, sans-serif', fontWeight: '800'}}>
                        {supplier.nombre_empresa}
                      </h1>
                      {((supplier.source && supplier.source.toLowerCase() === 'member') || products.some(p => (p as any)?.source?.toLowerCase?.() === 'member')) && (
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center justify-center w-[34px] h-[34px] cursor-help" aria-label="Verified" role="img">
                                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 2L19 5V11C19 15.97 16.11 20.44 12 22C7.89 20.44 5 15.97 5 11V5L12 2Z" fill="#f4a9aa"/>
                                  <path d="M16.59 8.58L10.25 14.92L7.41 12.08" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Company information was completed by the company and verified by Qanvit
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    
                    {/* Status Badges */}
                    <div className="flex items-center">
                      <Badge variant="outline" className="border-navy text-navy px-3 py-1 text-sm">
                        <MapPin className="w-3 h-3 mr-1" />
                        {(() => {
                        try {
                          // Handle both string and array formats safely
                          let cities, countries;
                          if (supplier.cities) {
                            if (typeof supplier.cities === 'string') {
                              cities = supplier.cities.startsWith('[') ? JSON.parse(supplier.cities) : [supplier.cities];
                            } else {
                              cities = supplier.cities;
                            }
                          } else {
                            cities = [];
                          }
                          if (supplier.countries) {
                            if (typeof supplier.countries === 'string') {
                              countries = supplier.countries.startsWith('[') ? JSON.parse(supplier.countries) : [supplier.countries];
                            } else {
                              countries = supplier.countries;
                            }
                          } else {
                            countries = [];
                          }
                          const firstCity = Array.isArray(cities) ? cities[0] : cities;
                          const firstCountry = Array.isArray(countries) ? countries[0] : countries;
                          return [firstCity, firstCountry].filter(Boolean).join(', ') || 'Global';
                        } catch (error) {
                          console.error('Error parsing location data:', error);
                          return 'Global';
                        }
                      })()}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                {/* Product Carousel - Full width on mobile (hidden if cover image exists) */}
                {shouldShowProductCarousel && (
                  <div className="w-full">
                    <ProductCarousel companyId={supplier.company_id} />
                  </div>
                )}
                
                {/* Action Buttons - Centered and stacked */}
                <div className="flex flex-col items-center gap-3 w-full max-w-xs mx-auto">
                  {/* Save Supplier Button */}
                  <Button
                    onClick={handleSaveSupplier}
                    disabled={isCheckingSaved}
                    className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-200 w-full ${
                      isSaved 
                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                        : 'bg-sky hover:bg-sky/90 text-white'
                    }`}
                  >
                    {isCheckingSaved ? (
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : isSaved ? (
                      <Heart className="w-4 h-4 fill-current" />
                    ) : (
                      <Heart className="w-4 h-4" />
                    )}
                    {isSaved ? 'Saved' : 'Save Supplier'}
                  </Button>
                  
                  {/* Visit Website Button */}
                  {supplier.website && (
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 px-6 py-3 font-semibold border-navy text-navy hover:bg-navy hover:text-white transition-all duration-200 w-full"
                      onClick={() => window.open(supplier.website, '_blank', 'noopener,noreferrer')}
                    >
                      <Globe className="w-4 h-4" />
                      Visit Website
                    </Button>
                  )}
                  {supplier.linkedin_url?.trim() && (
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 px-6 py-3 font-semibold border-navy text-navy hover:bg-navy hover:text-white transition-all duration-200 w-full"
                      onClick={() => {
                        const u = supplier.linkedin_url!.trim();
                        window.open(u.startsWith('http') ? u : `https://${u}`, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Linkedin className="w-4 h-4" />
                      Visit LinkedIn
                    </Button>
                  )}
                  
                  {/* Show list names if saved */}
                  {isSaved && savedLists.length > 0 && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-4 py-3 mt-3 shadow-sm w-full">
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <Check className="w-4 h-4 text-green-600" />
                        <span className="text-green-700 font-medium">
                          Saved in {savedLists.length} list{savedLists.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {savedLists.map((list, index) => (
                          <Badge 
                            key={index} 
                            variant="secondary" 
                            className="bg-white/60 text-green-800 border border-green-300 font-semibold"
                            style={{ backgroundColor: `${list.color}20`, borderColor: list.color }}
                          >
                            {list.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Layout - Original Grid */}
              <div className="hidden lg:block col-span-9">
                <div className="flex items-start gap-6">
                  {/* Company Logo - 56px */}
                  <ProgressiveSmartLogo
                    logoUrl={supplier.logo}
                    websiteUrl={supplier.website}
                    companyName={supplier.nombre_empresa}
                    size="lg"
                    className="rounded-2xl cursor-pointer"
                    onClick={() => setImageModalOpen(true)}
                    isSupplierRoute={true}
                  />
                  
                  <div className="flex-1">
                    {/* Company Name (H1) with Verified badge (desktop) */}
                    <div className="flex items-center gap-3 mb-4">
                      <h1 className="text-5xl font-inter font-extrabold text-navy uppercase tracking-tight" style={{fontFamily: 'Inter, sans-serif', fontWeight: '800'}}>
                        {supplier.nombre_empresa}
                      </h1>
                      {((supplier.source && supplier.source.toLowerCase() === 'member') || products.some(p => (p as any)?.source?.toLowerCase?.() === 'member')) && (
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center justify-center w-[41px] h-[41px] cursor-help" aria-label="Verified" role="img">
                                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M12 2L19 5V11C19 15.97 16.11 20.44 12 22C7.89 20.44 5 15.97 5 11V5L12 2Z" fill="#f4a9aa"/>
                                  <path d="M16.59 8.58L10.25 14.92L7.41 12.08" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Company information was completed by the company and verified by Qanvit
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    
                    {/* Status Badges */}
                    <div className="flex items-center gap-3 mb-6">
                      <Badge variant="outline" className="border-navy text-navy px-4 py-2">
                        <MapPin className="w-4 h-4 mr-2" />
                        {(() => {
                        try {
                          // Handle both string and array formats safely
                          let cities, countries;
                          if (supplier.cities) {
                            if (typeof supplier.cities === 'string') {
                              cities = supplier.cities.startsWith('[') ? JSON.parse(supplier.cities) : [supplier.cities];
                            } else {
                              cities = supplier.cities;
                            }
                          } else {
                            cities = [];
                          }
                          if (supplier.countries) {
                            if (typeof supplier.countries === 'string') {
                              countries = supplier.countries.startsWith('[') ? JSON.parse(supplier.countries) : [supplier.countries];
                            } else {
                              countries = supplier.countries;
                            }
                          } else {
                            countries = [];
                          }
                          const firstCity = Array.isArray(cities) ? cities[0] : cities;
                          const firstCountry = Array.isArray(countries) ? countries[0] : countries;
                          return [firstCity, firstCountry].filter(Boolean).join(', ') || 'Global';
                        } catch (error) {
                          console.error('Error parsing location data:', error);
                          return 'Global';
                        }
                      })()}
                      </Badge>
                    </div>
                    
                    {/* Product Carousel - Below name and location (hidden if cover image exists) */}
                    {shouldShowProductCarousel && (
                      <div className="mt-6">
                        <ProductCarousel companyId={supplier.company_id} />
                      </div>
                    )}
                    
                    {/* Rating Cluster */}
                    
                  </div>
                </div>
              </div>
              
              {/* Right Column - 3/12 - Desktop Only */}
              <div className="hidden lg:block col-span-3">
                <div className="flex flex-col items-end gap-4">
                  {/* Save Supplier Button */}
                  <Button
                    onClick={handleSaveSupplier}
                    disabled={isCheckingSaved}
                    className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-200 ${
                      isSaved 
                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                        : 'bg-sky hover:bg-sky/90 text-white'
                    }`}
                  >
                    {isCheckingSaved ? (
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : isSaved ? (
                      <Heart className="w-4 h-4 fill-current" />
                    ) : (
                      <Heart className="w-4 h-4" />
                    )}
                    {isSaved ? 'Saved' : 'Save Supplier'}
                  </Button>
                  
                  {/* Visit Website Button */}
                  {supplier.website && (
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 px-6 py-3 font-semibold border-navy text-navy hover:bg-navy hover:text-white transition-all duration-200"
                      onClick={() => window.open(supplier.website, '_blank', 'noopener,noreferrer')}
                    >
                      <Globe className="w-4 h-4" />
                      Visit Website
                    </Button>
                  )}
                  {supplier.linkedin_url?.trim() && (
                    <Button
                      variant="outline"
                      className="flex items-center gap-2 px-6 py-3 font-semibold border-navy text-navy hover:bg-navy hover:text-white transition-all duration-200"
                      onClick={() => {
                        const u = supplier.linkedin_url!.trim();
                        window.open(u.startsWith('http') ? u : `https://${u}`, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Linkedin className="w-4 h-4" />
                      Visit LinkedIn
                    </Button>
                  )}
                  
                  {/* Show list names if saved */}
                  {isSaved && savedLists.length > 0 && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-4 py-3 mt-3 shadow-sm">
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <Check className="w-4 h-4 text-green-600" />
                        <span className="text-green-700 font-medium">
                          Saved in {savedLists.length} list{savedLists.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {savedLists.map((list, index) => (
                          <Badge 
                            key={index} 
                            variant="secondary" 
                            className="bg-white/60 text-green-800 border border-green-300 font-semibold"
                            style={{ backgroundColor: `${list.color}20`, borderColor: list.color }}
                          >
                            {list.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
            </div>
          </section>

          {/* Tabs Navigation - 56px */}
          <Tabs defaultValue={searchParams.get('tab') || (productName ? "products" : "overview")} className="w-full">
            <TabsList className={`grid w-full ${isOwnerAdmin ? 'grid-cols-5' : 'grid-cols-4'} h-14 bg-[#f1f1f1] rounded-2xl p-1.5 mb-8 border border-white/60 shadow-inner`}>
              <TabsTrigger value="overview" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
                <Building2 className="w-4 h-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="products" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
                <Package className="w-4 h-4" />
                Products & Services
              </TabsTrigger>
              <TabsTrigger value="people" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
                <Users className="w-4 h-4" />
                People
              </TabsTrigger>
              <TabsTrigger value="latest-news" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
                <Newspaper className="w-4 h-4" />
                Latest News
              </TabsTrigger>
              {isOwnerAdmin && (
                <TabsTrigger value="manage" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#22183a]/70 hover:bg-white/70 hover:text-[#22183a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#22183a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#f4a9aa]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#f4a9aa]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4a9aa]/60">
                  <div className="relative">
                    <Settings className="w-4 h-4" />
                    {(pendingForCompany > 0 || pendingRfxForCompany > 0) && (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                  </div>
                  Manage Company
                </TabsTrigger>
              )}
            </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="space-y-8">
              {/* Supplier Snapshot */}
              <Card className="shadow-sm border-0 bg-white">
                <CardContent className="p-8">
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Left Column - Main Content (3/4 width) */}
                    <div className="lg:col-span-3 space-y-4">
                      {/* Company YouTube Video (shown above Company Overview) */}
                      {embedUrl && (
                        <div>
                          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                            <iframe
                              className="absolute inset-0 w-full h-full rounded-lg border"
                              src={embedUrl as string}
                              title="Company video"
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      )}
                      <CompanyOverviewLeft data={supplier} />
                    </div>

                    {/* Right Column - Contact Info and Documents (1/4 width) */}
                    <div className="lg:col-span-1 space-y-6">
                      {/* Company Logo */}
                      <div className="hidden lg:block">
                        <ProgressiveSmartLogo
                          logoUrl={supplier.logo}
                          websiteUrl={supplier.website}
                          companyName={supplier.nombre_empresa}
                          size="xl"
                          className="rounded-3xl cursor-pointer mx-auto"
                          onClick={() => setImageModalOpen(true)}
                          isSupplierRoute={true}
                        />
                      </div>

                      {/* Contact Information */}
                      <CompanyOverviewRightContact data={supplier} />

                      {/* Company Documents */}
                      {companyDocuments.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-navy mb-3">Company Documents</h3>
                          <div className="grid grid-cols-1 gap-4">
                            {companyDocuments.map((doc) => (
                              <CompanyDocumentViewCard
                                key={doc.id}
                                document={doc}
                                onDownload={handleDocumentDownload}
                                formatFileSize={formatFileSize}
                              />
                            ))}
                          </div>
                          {documentsLoading && (
                            <div className="text-center py-4">
                              <p className="text-muted-foreground">Loading documents...</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Engagement Dashboard */}
              

              {/* Capability Matrix */}
              <Card className="shadow-sm border-0">
                
                <CardContent>
                  <div className="space-y-4">
                    {/* Content moved to Company Overview section above */}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Products & Services Tab */}
          <ProductsServicesTab
            products={products}
            selectedProduct={selectedProduct}
            setSelectedProduct={setSelectedProduct}
            productsLoading={productsLoading}
            productDocuments={productDocuments}
            productDocumentsLoading={productDocumentsLoading}
            handleProductDocumentDownload={handleProductDocumentDownload}
            formatFileSize={formatFileSize}
            companyWebsite={supplier?.website}
          />

          {/* People Tab - LinkedIn people data */}
          <TabsContent value="people" className="mt-0">
            <LinkedInPeopleTab companyId={supplier.company_id} />
          </TabsContent>

          {/* Latest News Tab - only related news */}
          <TabsContent value="latest-news" className="mt-0">
            <Card className="shadow-sm border-0 bg-white">
              <CardHeader>
                <CardTitle className="text-navy">Latest News</CardTitle>
              </CardHeader>
              <CardContent>
                {latestNewsLoading ? (
                  <div className="space-y-4">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="rounded-lg border p-4">
                        <div className="flex gap-4">
                          <Skeleton className="h-16 w-16 rounded-lg flex-shrink-0" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : latestNews.length === 0 ? (
                  <p className="text-muted-foreground">No related news available for this supplier.</p>
                ) : (
                  <div className="space-y-4">
                    {latestNews.map((news) => (
                      <div key={news.id} className="rounded-lg border p-4">
                        <div className="flex items-start gap-4">
                          <div className="w-16 h-16 rounded-lg border bg-gray-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                            {(() => {
                              const candidates = getNewsImageCandidates(news);
                              const currentAttempt = newsThumbnailAttempt[news.id] ?? 0;
                              const currentImage = candidates[currentAttempt];
                              if (!currentImage) {
                                return <Newspaper className="w-6 h-6 text-gray-400" />;
                              }

                              return (
                                <img
                                  src={currentImage}
                                  alt={news.title || 'News source'}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  onError={() => {
                                    setNewsThumbnailAttempt((prev) => ({
                                      ...prev,
                                      [news.id]: currentAttempt + 1,
                                    }));
                                  }}
                                />
                              );
                            })()}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-navy">
                              {news.url ? (
                                <a
                                  href={news.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline inline-flex items-center gap-2"
                                >
                                  {news.title || 'Untitled news'}
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              ) : (
                                news.title || 'Untitled news'
                              )}
                            </h3>
                            {(news.source || news.time) && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {[news.source, news.time].filter(Boolean).join(' - ')}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {getDomainFromUrl(news.url) || 'Unknown source'}
                            </p>
                            {news.snippet && (
                              <p className="text-sm text-gray-700 mt-3">{news.snippet}</p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(news.scraped_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manage Company Tab - Only visible to company admins */}
          {isOwnerAdmin && (
            <TabsContent value="manage" className="mt-0">
              <ManageCompanyTabRefactored
                companyId={supplier.company_id}
                companyName={supplier.nombre_empresa}
                companySlug={slug}
              />
            </TabsContent>
          )}

          </Tabs>
        </div>

        {/* Logo Modal */}
        {imageModalOpen && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setImageModalOpen(false)}>
            <div className="relative max-w-2xl max-h-[90vh] w-full h-full flex items-center justify-center">
              <button 
                onClick={() => setImageModalOpen(false)} 
                className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              {supplier?.logo && (
                <img
                  src={supplier.logo}
                  alt={`${supplier.nombre_empresa} logo`}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save to List Modal */}
      {user && supplier && (
        <SaveToListModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          companyId={supplier.company_id}
          companyName={supplier.nombre_empresa}
          userId={user.id}
          currentLists={savedLists}
          onSaveSuccess={(listName, listId) => {
            // Refresh the saved lists
            const checkIfSaved = async () => {
              if (!user || !supplier) return;
              
              try {
                const { data, error } = await supabase
                  .from('saved_companies')
                  .select(`
                    id,
                    list_id,
                    supplier_lists (
                      id,
                      name,
                      color
                    )
                  `)
                  .eq('user_id', user.id)
                  .eq('company_id', supplier.company_id);
                
                if (error) {
                  console.error('Error checking saved status:', error);
                  return;
                }
                
                setIsSaved(!!data && data.length > 0);
                if (data && data.length > 0) {
                  const lists = data.map(item => ({
                    id: item.list_id,
                    name: item.supplier_lists?.name || "Uncategorized",
                    color: item.supplier_lists?.color || "#3B82F6"
                  }));
                  setSavedLists(lists);
                } else {
                  setSavedLists([]);
                }
              } catch (err) {
                console.error('Exception checking saved status:', err);
              }
            };
            
            checkIfSaved();
          }}
        />
      )}

      {/* Unsave Confirmation Dialog */}
      <AlertDialog open={showUnsaveDialog} onOpenChange={setShowUnsaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from saved suppliers?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {supplier?.nombre_empresa} from your saved suppliers list?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnsaveConfirm} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>;
};
export default SupplierDetail;