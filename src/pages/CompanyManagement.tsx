import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Globe, MapPin, Award, Calendar, Building2, Users, DollarSign, FileText, Settings, TrendingUp, Package, Star, Check, Clock, Eye, Search, Mail, BarChart3, Filter, ChevronLeft, ChevronRight, X, Save, Heart, HeartOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import SupplierMap from '@/components/SupplierMap';
import ProductCarousel from '@/components/ProductCarousel';
import SaveToListModal from '@/components/SaveToListModal';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
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

interface Company {
  id: string;
  company_id: string;
  nombre_empresa: string;
  countries: any;
  cities?: any;
  gps_coordinates?: any;
  main_activities: string;
  description: string;
  website: string;
  source: string;
  created_at: string;
  revenues?: any;
  certifications?: any;
  sectors?: string;
  score?: number;
  score_rationale?: string;
  strengths?: string;
  logo?: string;
}

interface Product {
  id: string;
  product_name: string;
  main_category: string;
  subcategories?: string[];
  short_description: string;
  long_description: string;
  key_features?: string[];
  use_cases?: string[];
  target_industries?: string[];
  definition_score?: number;
  image?: string[];
}

const CompanyManagement = () => {
  const {
    slug,
    productName
  } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { user } = useAuth();

  const fetchProducts = async (companyId: string) => {
    setProductsLoading(true);
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
          image
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
          image: safeParse(item.image, 'image', [])
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

  useEffect(() => {
    const fetchCompany = async () => {
      if (!slug) return;
      
      try {
        let data, error;

        // First try to find by slug
        const slugResult = await supabase.from('company_revision').select('*').eq('slug', slug).eq('is_active', true).single();
        
        if (slugResult.data) {
          data = slugResult.data;
          error = slugResult.error;
        } else {
          // Fallback: try to find by id (for backward compatibility)
          const idResult = await supabase.from('company_revision').select('*').eq('id', slug).eq('is_active', true).single();
          data = idResult.data;
          error = idResult.error;
        }
        
        if (error) {
          console.error('Error fetching company:', error);
          setError('Company not found');
          return;
        }
        
        if (!data) {
          setError('Company not found');
          return;
        }
        
        setCompany(data);

        // Fetch products for this company
        if (data.company_id) {
          await fetchProducts(data.company_id);
        }
      } catch (err) {
        console.error('❌ Exception:', err);
        setError('Failed to load company details');
      } finally {
        setLoading(false);
      }
    };
    fetchCompany();
  }, [slug, productName]);

  if (loading) {
    return (
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
    );
  }

  if (error || !company) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mt-20">
            <h1 className="text-2xl font-extrabold text-gray-900 mb-4">Company Not Found</h1>
            <p className="text-gray-600 mb-8">{error || 'The company you are looking for does not exist.'}</p>
            <Link to="/">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Search
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header Section */}
      <header className="h-16 border-b border-gray-100 px-6 flex items-center justify-between hidden lg:flex">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold text-navy">FQ</div>
          <nav className="flex items-center text-sm text-charcoal">
            <Link to="/" className="hover:text-navy transition-colors">Search</Link>
            <span className="mx-2 text-gray-300">/</span>
            <span className="text-navy font-medium">Company Management</span>
            <span className="mx-2 text-gray-300">/</span>
            <span className="text-navy font-medium">{company.nombre_empresa}</span>
          </nav>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6">
        {/* Hero Section */}
        <section className="py-12 flex items-center">
          <div className="grid grid-cols-12 gap-8 w-full">
            {/* Mobile Layout */}
            <div className="col-span-12 lg:hidden flex flex-col space-y-6">
              <div className="flex items-start gap-4">
                <div className={`w-16 h-16 flex items-center justify-center text-xl font-bold shadow-lg overflow-hidden flex-shrink-0 ${
                  company.logo 
                    ? 'bg-white border border-gray-200' 
                    : 'bg-gradient-to-br from-navy to-sky rounded-2xl text-white'
                }`}>
                  {company.logo ? (
                    <img 
                      src={company.logo} 
                      alt={company.nombre_empresa}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => company.logo && setImageModalOpen(true)}
                    />
                  ) : (
                    company.nombre_empresa.charAt(0)
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-inter font-extrabold text-navy uppercase tracking-tight mb-2" style={{fontFamily: 'Inter, sans-serif', fontWeight: '800'}}>
                    {company.nombre_empresa}
                    <Badge variant="outline" className="ml-2 border-orange-500 text-orange-500 px-2 py-1 text-xs">
                      ADMIN VIEW
                    </Badge>
                  </h1>
                  
                  <div className="flex items-center">
                    <Badge variant="outline" className="border-navy text-navy px-3 py-1 text-sm">
                      <MapPin className="w-3 h-3 mr-1" />
                      {(() => {
                        try {
                          let cities, countries;
                          if (company.cities) {
                            if (typeof company.cities === 'string') {
                              cities = company.cities.startsWith('[') ? JSON.parse(company.cities) : [company.cities];
                            } else {
                              cities = company.cities;
                            }
                          } else {
                            cities = [];
                          }
                          if (company.countries) {
                            if (typeof company.countries === 'string') {
                              countries = company.countries.startsWith('[') ? JSON.parse(company.countries) : [company.countries];
                            } else {
                              countries = company.countries;
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
              
              {/* Product Carousel */}
              <div className="w-full">
                <ProductCarousel companyId={company.company_id} />
              </div>
              
              {/* Admin Action Buttons */}
              <div className="flex flex-col items-center gap-3 w-full max-w-xs mx-auto">
                <Button
                  className="flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-200 w-full bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Settings className="w-4 h-4" />
                  Edit Company
                </Button>
                
                <Button
                  variant="outline"
                  className="flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-200 w-full border-navy text-navy hover:bg-navy hover:text-white"
                >
                  <Eye className="w-4 h-4" />
                  View Public Profile
                </Button>
              </div>
            </div>

            {/* Desktop Layout - Similar structure but adapted for desktop */}
            <div className="hidden lg:flex lg:col-span-12 items-center justify-between">
              <div className="flex items-center gap-6">
                <div className={`w-20 h-20 flex items-center justify-center text-2xl font-bold shadow-lg overflow-hidden ${
                  company.logo 
                    ? 'bg-white border border-gray-200' 
                    : 'bg-gradient-to-br from-navy to-sky rounded-2xl text-white'
                }`}>
                  {company.logo ? (
                    <img 
                      src={company.logo} 
                      alt={company.nombre_empresa}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={() => company.logo && setImageModalOpen(true)}
                    />
                  ) : (
                    company.nombre_empresa.charAt(0)
                  )}
                </div>
                
                <div>
                  <h1 className="text-3xl font-inter font-extrabold text-navy uppercase tracking-tight mb-2" style={{fontFamily: 'Inter, sans-serif', fontWeight: '800'}}>
                    {company.nombre_empresa}
                    <Badge variant="outline" className="ml-3 border-orange-500 text-orange-500 px-3 py-1 text-sm">
                      ADMIN VIEW
                    </Badge>
                  </h1>
                  
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="border-navy text-navy px-3 py-1">
                      <MapPin className="w-4 h-4 mr-2" />
                      Global Operations
                    </Badge>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <Button
                  className="flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-200 bg-orange-500 hover:bg-orange-600 text-white"
                >
                  <Settings className="w-4 h-4" />
                  Edit Company
                </Button>
                
                <Button
                  variant="outline"
                  className="flex items-center gap-2 px-6 py-3 font-semibold transition-all duration-200 border-navy text-navy hover:bg-navy hover:text-white"
                >
                  <Eye className="w-4 h-4" />
                  View Public Profile
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Rest of the content - keeping the same structure as SupplierDetail but with admin context */}
        <div className="pb-12">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Company Overview</TabsTrigger>
              <TabsTrigger value="products">Products & Services</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="space-y-8">
              {/* Company Description */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Company Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 leading-relaxed">
                    {company.description || 'No description available.'}
                  </p>
                </CardContent>
              </Card>

              {/* Core Activities */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Core Activities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 leading-relaxed">
                    {company.main_activities || 'No core activities information available.'}
                  </p>
                </CardContent>
              </Card>

              {/* Location Map */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" />
                    Location
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SupplierMap 
                    gpsCoordinates={company.gps_coordinates}
                    cities={company.cities}
                    countries={company.countries}
                    companyName={company.nombre_empresa}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="space-y-6">
              {productsLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy"></div>
                </div>
              ) : products.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Products Available</h3>
                    <p className="text-gray-600">This company hasn't added any products yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {products.map((product) => (
                    <Card key={product.id} className="hover:shadow-lg transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                              {product.product_name}
                            </h3>
                            <Badge variant="secondary" className="mb-3">
                              {product.main_category}
                            </Badge>
                            <p className="text-gray-700 mb-4">
                              {product.short_description}
                            </p>
                          </div>
                          
                          {product.image && product.image.length > 0 && (
                            <div className="ml-4 flex-shrink-0">
                              <img 
                                src={product.image[0]} 
                                alt={product.product_name}
                                className="w-24 h-24 object-cover rounded-lg border"
                              />
                            </div>
                          )}
                        </div>

                        {product.key_features && product.key_features.length > 0 && (
                          <div className="mb-4">
                            <h4 className="font-medium text-gray-900 mb-2">Key Features:</h4>
                            <div className="flex flex-wrap gap-2">
                              {product.key_features.slice(0, 3).map((feature, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {feature}
                                </Badge>
                              ))}
                              {product.key_features.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{product.key_features.length - 3} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-4">
                            {product.definition_score && (
                              <div className="flex items-center gap-2">
                                <Star className="w-4 h-4 text-yellow-500" />
                                <span className="text-sm text-gray-600">
                                  Score: {product.definition_score}/10
                                </span>
                              </div>
                            )}
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-orange-600 border-orange-600 hover:bg-orange-600 hover:text-white"
                          >
                            <Settings className="w-4 h-4 mr-2" />
                            Edit Product
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default CompanyManagement;
