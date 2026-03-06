import React, { useState, useEffect } from 'react';
import { ExternalLink, Bookmark, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import SaveToListModal from '@/components/SaveToListModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import SmartLogo from './SmartLogo';
import PropuestaDetailsModal from './PropuestaDetailsModal';
import type { Propuesta } from '@/types/chat';

// Función auxiliar para extraer información de justificación de manera compatible
const getJustificationData = (propuesta: Propuesta) => {
  // Nuevo formato: campos separados
  if (propuesta.justification_sentence || propuesta.justification_pros || propuesta.justification_cons) {
    return {
      sentence: propuesta.justification_sentence || 'No summary available.',
      pros: propuesta.justification_pros || [],
      cons: propuesta.justification_cons || []
    };
  }
  
  // Formato legacy: objeto justification
  if (propuesta.justification) {
    // Si justification es un objeto (formato correcto)
    if (typeof propuesta.justification === 'object' && propuesta.justification !== null) {
      return {
        sentence: propuesta.justification.sentence || 'No summary available.',
        pros: propuesta.justification.pros || [],
        cons: propuesta.justification.cons || []
      };
    }
    
    // Si justification es un string (formato legacy con JSON string)
    if (typeof propuesta.justification === 'string') {
      try {
        const parsed = JSON.parse(propuesta.justification);
        return {
          sentence: parsed?.sentence || 'No summary available.',
          pros: parsed?.pros || [],
          cons: parsed?.cons || []
        };
      } catch (error) {
        // Si no es JSON válido, tratar como texto plano
        return {
          sentence: propuesta.justification,
          pros: [],
          cons: []
        };
      }
    }
  }
  
  // Fallback
  return {
    sentence: 'No summary available.',
    pros: [],
    cons: []
  };
};

type SortType = 'overall' | 'technical' | 'company';

interface PropuestaCardProps {
  propuesta: Propuesta;
  sortType?: SortType;
  onSave?: () => void;
  onView?: () => void;
  // Selection support
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
}

const PropuestaCard = ({
  propuesta,
  sortType = 'overall',
  onSave,
  onView,
  selected = false,
  onSelectChange
}: PropuestaCardProps) => {
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedInList, setSavedInList] = useState<string | null>(null);
  const [currentLists, setCurrentLists] = useState<Array<{ id: string | null; name: string }>>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [companyIdForSaving, setCompanyIdForSaving] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [companyCountries, setCompanyCountries] = useState<string[]>([]);
  const [isLoadingCountries, setIsLoadingCountries] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Función para cargar países de la empresa desde la base de datos
  const loadCompanyCountries = async () => {
    if (!propuesta.id_company_revision || isLoadingCountries) return;
    
    setIsLoadingCountries(true);
    try {
      const { data, error } = await supabase
        .from('company_revision')
        .select('countries')
        .eq('id', propuesta.id_company_revision)
        .single();

      if (error) {
        console.error('Error loading company countries:', error);
        return;
      }

      if (data?.countries) {
        // Parse countries data - it could be a string or array
        let countries: string[] = [];
        
        if (typeof data.countries === 'string') {
          try {
            // Try to parse as JSON first
            const parsed = JSON.parse(data.countries);
            if (Array.isArray(parsed)) {
              countries = parsed.map(country => 
                typeof country === 'string' ? country : country.name || country.country || String(country)
              );
            } else {
              // If not JSON, split by comma
              countries = data.countries.split(',').map(c => c.trim()).filter(c => c);
            }
          } catch {
            // If JSON parsing fails, split by comma
            countries = data.countries.split(',').map(c => c.trim()).filter(c => c);
          }
        } else if (Array.isArray(data.countries)) {
          countries = data.countries.map(country => {
            if (typeof country === 'string') return country;
            if (typeof country === 'object' && country !== null) {
              const countryObj = country as { name?: string; country?: string };
              return countryObj.name || countryObj.country || String(country);
            }
            return String(country);
          });
        }
        
        // Remove duplicates and filter out empty strings
        countries = [...new Set(countries.map(c => c.trim()).filter(c => c))];
        
        setCompanyCountries(countries);
      }
    } catch (error) {
      console.error('Error in loadCompanyCountries:', error);
    } finally {
      setIsLoadingCountries(false);
    }
  };

  // Cargar países cuando se monta el componente
  useEffect(() => {
    loadCompanyCountries();
  }, [propuesta.id_company_revision]);

  // Función para verificar estado guardado (reutilizable)
  const checkSavedStatus = async () => {
    if (!user || !propuesta.empresa) return;

    try {
      // Buscar la empresa por nombre
      const { data: companyData, error: companyError } = await supabase
        .from('company_revision')
        .select('company_id')
        .eq('nombre_empresa', propuesta.empresa)
        .eq('is_active', true)
        .maybeSingle();

      if (companyError || !companyData) return;

      setCompanyIdForSaving(companyData.company_id);

      // Verificar si está guardada y en qué listas
      const { data: savedData, error: savedError } = await supabase
        .from('saved_companies')
        .select(`
          list_id,
          supplier_lists (
            name
          )
        `)
        .eq('user_id', user.id)
        .eq('company_id', companyData.company_id);

      if (!savedError && savedData && savedData.length > 0) {
        setIsSaved(true);
        
        // Crear el array de listas actuales
        const lists = savedData.map(item => ({
          id: item.list_id,
          name: item.list_id ? item.supplier_lists?.name || 'Unknown List' : 'Uncategorized'
        }));
        setCurrentLists(lists);
        
        // Siempre mostrar el conteo de listas, incluso cuando es solo 1
        setSavedInList(`${savedData.length} list${savedData.length === 1 ? '' : 's'}`);
      } else {
        setIsSaved(false);
        setSavedInList(null);
        setCurrentLists([]);
      }
    } catch (error) {
      console.error('Error checking saved status:', error);
    }
  };

  // Función para verificar si una imagen se puede cargar
  const checkImageUrl = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
      // Timeout after 5 seconds
      setTimeout(() => resolve(false), 5000);
    });
  };

  // Cargar imágenes del logo y producto
  useEffect(() => {
    const loadImages = async () => {
      try {
        // Reset logo state when propuesta changes
        setCompanyLogo(null);
        setCompanyWebsite(null);
        setProductImages([]);
        
        // Cargar logo de la empresa y website si no está disponible
        const { data: companyData, error: companyError } = await supabase
          .from('company_revision')
          .select('logo, website')
          .eq('id', propuesta.id_company_revision)
          .single();

        if (!companyError && companyData) {
          if (companyData.logo) {
            setCompanyLogo(companyData.logo);
          }
          if (companyData.website) {
            setCompanyWebsite(companyData.website);
          }
          // Si no tenemos website en la propuesta, lo obtenemos de la base de datos
          if (!propuesta.website && companyData.website) {
            propuesta.website = companyData.website;
          }
        }

        // Cargar imágenes de productos
        if (propuesta.id_product_revision) {
          // Caso 1: Hay un product revision específico
          const { data: productData, error: productError } = await supabase
            .from('product_revision')
            .select('image')
            .eq('id', propuesta.id_product_revision)
            .eq('is_active', true)
            .single();

          if (!productError && productData?.image) {
            await validateAndSetImages([productData.image]);
          }
        } else if (propuesta.id_company_revision) {
          // Caso 2: Solo hay company revision, buscar todos los productos de la empresa
          const { data: allProducts, error: productsError } = await supabase
            .rpc('get_products_by_company_revision', {
              p_company_revision_id: propuesta.id_company_revision,
              p_only_active: true
            });

          if (!productsError && allProducts && allProducts.length > 0) {
            // Obtener las imágenes de todos los productos
            const productIds = allProducts.map(p => p.id_product_revision);
            
            const { data: productImages, error: imagesError } = await supabase
              .from('product_revision')
              .select('image')
              .in('id', productIds)
              .eq('is_active', true);

            if (!imagesError && productImages && productImages.length > 0) {
              const allImageArrays = productImages
                .map(p => p.image)
                .filter(img => img); // Filtrar nulls
              
              await validateAndSetImages(allImageArrays);
            }
          }
        }
      } catch (error) {
        console.error('Error loading images:', error);
      }
    };

    // Función auxiliar para validar y establecer imágenes
    const validateAndSetImages = async (imageArrays: string[]) => {
      
      const allValidImages: string[] = [];
      
      for (const imageData of imageArrays) {
        try {
          // Verificar si es una URL directa o un JSON
          if (imageData.startsWith('http') || imageData.startsWith('data:')) {
            // Es una URL directa, validarla directamente
            const isValid = await checkImageUrl(imageData);
            if (isValid) {
              allValidImages.push(imageData);
            }
          } else {
            // Intentar parsear como JSON
            const imageArray = JSON.parse(imageData);
            
            if (Array.isArray(imageArray) && imageArray.length > 0) {
              // Validar cada imagen en el array
              for (const imageUrl of imageArray) {
                if (typeof imageUrl === 'string' && imageUrl.trim()) {
                  const isValid = await checkImageUrl(imageUrl);
                  if (isValid) {
                    allValidImages.push(imageUrl);
                  } 
                }
              }
            }
          }
        } catch (parseError) {
          console.error('Error parsing image JSON:', parseError, 'Raw data:', imageData);
        }
      }
      
      setProductImages(allValidImages);
      
    };

    loadImages();
  }, [propuesta.id_company_revision, propuesta.id_product_revision]);

  // Verificar si la empresa ya está guardada al cargar
  useEffect(() => {
    checkSavedStatus();
  }, [user, propuesta.empresa]);

  // Listener para cuando la ventana gaina foco (cambio de pestaña)
  useEffect(() => {
    const handleFocus = () => {
      // Refrescar estado cuando el usuario vuelve a la pestaña
      checkSavedStatus();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Listener de tiempo real para cambios en saved_companies
  useEffect(() => {
    if (!user || !companyIdForSaving) return;

    const channel = supabase
      .channel('saved-companies-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'saved_companies',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // Si el cambio afecta a esta empresa, refrescar estado
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;
          if (newRecord?.company_id === companyIdForSaving || 
              oldRecord?.company_id === companyIdForSaving) {
            // Múltiples intentos para asegurar la actualización
            setTimeout(() => checkSavedStatus(), 200);
            setTimeout(() => checkSavedStatus(), 500);
            setTimeout(() => checkSavedStatus(), 1000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, companyIdForSaving]);

  const handleSaveCompany = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to save companies",
        variant: "destructive",
      });
      return;
    }

    if (!companyIdForSaving) {
      toast({
        title: "Error",
        description: "Company information not available",
        variant: "destructive",
      });
      return;
    }

    // Siempre mostrar modal, tanto para guardar como para gestionar empresa ya guardada
    setShowSaveModal(true);
  };

  const handleSaveSuccess = (listName: string) => {
    if (listName === '') {
      // Company was removed
      setIsSaved(false);
      setSavedInList(null);
    } else {
      // Company was saved/added to list - refresh status to get accurate count
      checkSavedStatus();
    }
    setShowSaveModal(false);
  };

  // Get the first three countries from loaded company countries with "X more" format
  const getDisplayCountries = () => {
    
    // If still loading, show fallback from country_hq
    if (isLoadingCountries) {
      const fallback = propuesta.country_hq || '';
      return fallback;
    }
    
    // Use loaded countries if available, otherwise fallback to country_hq
    let countries = companyCountries.length > 0 ? companyCountries : (propuesta.country_hq ? propuesta.country_hq.split(',').map(c => c.trim()).filter(c => c) : []);
    
    // Remove duplicates from fallback countries as well
    countries = [...new Set(countries.map(c => c.trim()).filter(c => c))];
    
    if (countries.length === 0) return '';
    if (countries.length <= 3) return countries.join(', ');
    
    const firstThree = countries.slice(0, 3);
    const remainingCount = countries.length - 3;
    const result = `${firstThree.join(', ')}, ${remainingCount} more`;
    return result;
  };
  
  const displayCountries = getDisplayCountries();

  // Calculate overall match as average of technical (match) and company match
  const technicalMatch = propuesta.match; // match is the technical score
  const companyMatch = propuesta.company_match ?? propuesta.match; // fallback to technical if company_match is null/undefined
  const overallMatch = (propuesta.company_match !== undefined && propuesta.company_match !== null)
    ? Math.round((propuesta.match + propuesta.company_match) / 2)
    : propuesta.match; // if no company match value, overall = technical

  return (
    <div className="bg-white w-full flex flex-col rounded-2xl border border-gray-200/50 overflow-hidden hover:shadow-xl hover:border-sky/20 hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative">
      {/* Selection checkbox in top-left when enabled */}
      {onSelectChange && (
        <div className="absolute top-3 left-3 z-10">
          <label className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-sm px-2 py-1.5 rounded-md border border-gray-200 shadow-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected}
              onChange={(e) => onSelectChange(e.target.checked)}
            />
            <span className="text-xs font-medium text-gray-700">Select</span>
          </label>
        </div>
      )}
      {/* Match Scores Badge - Posición absoluta en esquina superior derecha */}
      <div className="absolute top-3 right-3 z-10">
        <div className="bg-white/70 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-gray-200/30 min-w-[80px]">
          {sortType === 'overall' && (
            <>
              <div className="text-xs text-charcoal/60 text-center mb-1">Overall</div>
              <div className="text-2xl font-bold text-navy text-center mb-1">
                {overallMatch}%
              </div>
              <div className="text-xs text-charcoal/60 text-center">match</div>
            </>
          )}
          
          {sortType === 'technical' && (
            <>
              <div className="text-xs text-charcoal/60 text-center mb-1">Tech Match</div>
              <div className="text-lg font-bold text-navy text-center mb-1">
                {technicalMatch}%
              </div>
              <div className="text-xs text-charcoal/70 text-center mt-1">
                <div className="font-medium">Company</div>
                <div className="text-navy font-semibold">
                  {companyMatch}%
                </div>
              </div>
            </>
          )}
          
          {sortType === 'company' && (
            <>
              <div className="text-xs text-charcoal/60 text-center mb-1">Company Match</div>
              <div className="text-lg font-bold text-navy text-center mb-1">
                {companyMatch}%
              </div>
              <div className="text-xs text-charcoal/70 text-center mt-1">
                <div className="font-medium">Tech</div>
                <div className="text-navy font-semibold">
                  {technicalMatch}%
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Header - Información principal horizontal */}
      <div className="px-5 pt-5 pb-4 bg-gradient-to-r from-gray-50/30 to-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            {/* Logo de la empresa - Smart Logo */}
            <SmartLogo
              logoUrl={companyLogo}
              websiteUrl={companyWebsite || propuesta.website}
              companyName={propuesta.empresa}
              size="md"
              className="rounded-xl flex-shrink-0"
              isSupplierRoute={true}
            />
            
            {/* Información de la empresa y producto */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <a 
                  href={propuesta.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-bold text-lg text-navy hover:text-sky transition-colors cursor-pointer truncate"
                >
                  {propuesta.empresa}
                </a>
                <CheckCircle size={14} className="text-mint flex-shrink-0" />
              </div>
              
              {/* País y producto con iconos */}
              <div className="space-y-1">
                {displayCountries && (
                  <div className="flex items-center gap-1.5 text-sm text-charcoal/70">
                    <span className="text-xs">🌍</span>
                    <span>{displayCountries}</span>
                  </div>
                )}
                {propuesta.producto && (
                  <button 
                    onClick={async () => {
                      try {
                        // Get the company slug using the company revision id
                        const { data: companyData, error } = await supabase
                          .from('company_revision')
                          .select('slug')
                          .eq('id', propuesta.id_company_revision)
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

                        if (!propuesta.producto || propuesta.producto.trim() === '') {
                          // Navigate to supplier view if producto is empty
                          window.open(`/suppliers/${companyData.slug}`, '_blank');
                        } else {
                          // Navigate to product view within supplier if producto exists
                          window.open(`/suppliers/${companyData.slug}/product/${encodeURIComponent(propuesta.producto)}`, '_blank');
                        }
                      } catch (err) {
                        console.error('Error navigating:', err);
                        toast({
                          title: "Error",
                          description: "Could not navigate to product details",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="flex items-center gap-1.5 text-sm hover:text-sky transition-colors text-left"
                  >
                    <span className="text-xs">🎯</span>
                    <span className="text-navy/80 hover:text-sky font-medium truncate">
                      {propuesta.producto}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botones de acción - Diseño mejorado */}
      <div className="px-5 pb-5 flex flex-col gap-3 pt-4">
        {/* Botón See FQ Match Justification - Diseño mejorado y más llamativo */}
        <button 
          onClick={() => setShowModal(true)}
          data-onboarding-target="see-fq-match-justification"
          className="w-full py-3 px-4 bg-gradient-to-r from-sky to-sky/80 hover:from-sky/90 hover:to-sky text-navy text-base font-bold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-sky/25 hover:-translate-y-0.5 hover:scale-[1.02] group relative overflow-hidden"
        >
          {/* Efecto de brillo animado */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          <span className="flex items-center justify-center gap-2 relative z-10">
            See FQ Match Justification
          </span>
        </button>

        {/* Contenedor para botones principales */}
        <div className="flex gap-3">
          <button 
            onClick={async () => {
              try {
                // Check if user is authenticated before proceeding
                if (!user) {
                  toast({
                    title: "Authentication Required",
                    description: "Please sign in to view supplier details",
                    variant: "destructive",
                  });
                  return;
                }

                // Get the company slug using the company revision id
                const { data: companyData, error } = await supabase
                  .from('company_revision')
                  .select('slug')
                  .eq('id', propuesta.id_company_revision)
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

                if (!propuesta.producto || propuesta.producto.trim() === '') {
                  // Navigate to supplier view if producto is empty
                  window.open(`/suppliers/${companyData.slug}`, '_blank');
                } else {
                  // Navigate to product view within supplier if producto exists
                  window.open(`/suppliers/${companyData.slug}/product/${encodeURIComponent(propuesta.producto)}`, '_blank');
                }
              } catch (err) {
                console.error('Error navigating:', err);
                toast({
                  title: "Error",
                  description: "Could not navigate to company details",
                  variant: "destructive",
                });
              }
            }} 
            className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-300/50 rounded-xl text-navy hover:bg-gray-50/50 hover:border-gray-400/50 transition-all duration-200 hover:shadow-sm group"
          >
            <ExternalLink size={16} className="group-hover:text-sky transition-colors" />
            <span className="font-medium">View Details</span>
          </button>
          
          <button 
            onClick={handleSaveCompany} 
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-300/50 hover:bg-gray-50 hover:border-gray-400/50 disabled:opacity-50 text-navy rounded-xl transition-all duration-200 hover:shadow-sm group"
          >
            <Bookmark size={16} className="group-hover:scale-110 transition-transform" />
            <span className="font-semibold">
              {saving ? 'Saving...' : 
               isSaved ? (savedInList ? `Saved in ${savedInList}` : 'Saved') : 
               'Save Company'}
            </span>
          </button>
        </div>
      </div>

      {showSaveModal && companyIdForSaving && user && (
        <SaveToListModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          companyId={companyIdForSaving}
          companyName={propuesta.empresa}
          userId={user.id}
          onSaveSuccess={handleSaveSuccess}
          currentLists={currentLists}
        />
      )}

      {/* Modal con detalles completos - Usando PropuestaDetailsModal */}
      <PropuestaDetailsModal
        open={showModal}
        onOpenChange={setShowModal}
        propuesta={propuesta}
        onSaveCompany={handleSaveCompany}
        isSaved={isSaved}
        saving={saving}
        showSaveButton={true}
      />

      {/* Image Lightbox Modal */}
      {selectedImageIndex !== null && productImages[selectedImageIndex] && (
        <Dialog open={selectedImageIndex !== null} onOpenChange={() => setSelectedImageIndex(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0 bg-black/90">
            <DialogHeader className="sr-only">
              <DialogTitle>Product Image {selectedImageIndex + 1}</DialogTitle>
            </DialogHeader>
            <div className="relative w-full h-full flex items-center justify-center min-h-[60vh]">
              <button
                onClick={() => setSelectedImageIndex(null)}
                className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 transition-colors"
              >
                <X size={24} />
              </button>
              
              <img
                src={productImages[selectedImageIndex]}
                alt={`Product ${selectedImageIndex + 1}`}
                className="max-w-full max-h-[80vh] object-contain"
              />
              
              {productImages.length > 1 && (
                <>
                  <button
                    onClick={() => setSelectedImageIndex(selectedImageIndex > 0 ? selectedImageIndex - 1 : productImages.length - 1)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors"
                  >
                    <ChevronLeft size={32} />
                  </button>
                  <button
                    onClick={() => setSelectedImageIndex(selectedImageIndex < productImages.length - 1 ? selectedImageIndex + 1 : 0)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors"
                  >
                    <ChevronRight size={32} />
                  </button>
                </>
              )}
              
              {productImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {productImages.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`w-3 h-3 rounded-full transition-colors ${
                        index === selectedImageIndex ? 'bg-white' : 'bg-white/50'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default PropuestaCard;
