import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Globe, Loader2, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAntiScraping } from '@/hooks/useAntiScraping';
import { obfuscateSupplierData, deobfuscateText } from '@/utils/antiScrapingUtils';
import { ProgressiveSmartSupplierCard } from '@/components/ui/ProgressiveSmartSupplierCard';
import VerticalSelector from '@/components/ui/VerticalSelector';
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis
} from '@/components/ui/pagination';


interface Supplier {
  id: string;
  slug: string | null;
  nombre_empresa: string;
  description: string | null;
  countries: any;
  cities: any;
  sectors: string | null;
  website: string | null;
  main_activities: string | null;
  strengths: string | null;
  logo: string | null;
}

const SupplierSearch = () => {
  const navigate = useNavigate();
  const { isSuspicious, checkSuspiciousBehavior } = useAntiScraping();
  
  // Agregar estilos CSS para skeleton loading, spinner y tres puntos
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
      
      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
      
      @keyframes bounce {
        0%, 80%, 100% {
          transform: scale(0);
        }
        40% {
          transform: scale(1);
        }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalCountLoading, setTotalCountLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [lastPage, setLastPage] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const suppliersPerPage = 12;

  const searchSuppliers = useCallback(async (query: string, page: number = 1, skipCache: boolean = false) => {
    // Optimización 4: Evitar consultas duplicadas (solo si no se fuerza skip)
    if (!skipCache && query === lastQuery && page === lastPage && suppliers.length > 0) {
      return;
    }

    setLoading(true);
    
    // Solo mostrar loader si la búsqueda toma más de 150ms
    const loaderTimeout = setTimeout(() => {
      setShowLoader(true);
    }, 150);

    try {
      const from = (page - 1) * suppliersPerPage;
      const to = from + suppliersPerPage - 1;

      // Optimización 1: Eliminar count: 'exact' de la consulta principal
      // Esto reduce significativamente el tiempo de respuesta
      let queryBuilder = supabase
        .from('company_revision')
        .select(`
          id,
          slug,
          nombre_empresa,
          description,
          countries,
          cities,
          sectors,
          website,
          main_activities,
          strengths,
          logo
        `) // Removido { count: 'exact' } para mejorar rendimiento
        .eq('is_active', true) // Usa el índice idx_company_revision_active_name
        .range(from, to)
        .order('nombre_empresa'); // Usa el índice (is_active, nombre_empresa)

      if (query.trim()) {
        queryBuilder = queryBuilder.ilike('nombre_empresa', `%${query}%`);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        console.error('Error searching suppliers:', error);
        toast({
          title: "Search Error",
          description: "Failed to search suppliers. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Optimización 2: Mostrar resultados inmediatamente, contar en segundo plano
      // Solo resetear el conteo cuando cambia la query, no cuando cambia la página
      if (query !== lastQuery) {
        setTotalCount(0); // 0 indica que está cargando
      }

      // Contar el total real en segundo plano (solo cuando cambia la query o es primera página)
      if (page === 1 || query !== lastQuery) {
        setTotalCountLoading(true);
        // Ejecutar conteo en segundo plano sin bloquear la UI
        setTimeout(async () => {
          try {
            let countQuery = supabase
              .from('company_revision')
              .select('*', { count: 'exact', head: true })
              .eq('is_active', true);
            
            // Aplicar el mismo filtro de búsqueda para el conteo
            if (query.trim()) {
              countQuery = countQuery.ilike('nombre_empresa', `%${query}%`);
            }
            
            const { count } = await countQuery;
            setTotalCount(count || 0);
          } catch (error) {
            console.error('Error counting total suppliers:', error);
            // Mantener el conteo estimado si falla
          } finally {
            setTotalCountLoading(false);
          }
        }, 100); // Pequeño delay para no bloquear la UI
      }

      // Aplicar ofuscación si es necesario
      const processedData = isSuspicious ? obfuscateSupplierData(data || []) : (data || []);
      setSuppliers(processedData);
      
      // Actualizar cache de consultas
      setLastQuery(query);
      setLastPage(page);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Search Error", 
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      clearTimeout(loaderTimeout);
      setLoading(false);
      setShowLoader(false);
    }
  }, [suppliersPerPage, isSuspicious, lastQuery, lastPage, suppliers.length]);

  // Load all suppliers on initial render
  useEffect(() => {
    searchSuppliers('', 1);
  }, []); // Removido searchSuppliers de las dependencias para evitar re-renders

  // Optimización 3: Búsqueda con debounce mejorado
  useEffect(() => {
    // Si la búsqueda está vacía, cargar inmediatamente
    if (!searchQuery.trim()) {
      setCurrentPage(1);
      setIsSearching(false);
      searchSuppliers('', 1, true); // skipCache = true para forzar nueva búsqueda
      return;
    }

    // Mostrar indicador de búsqueda inmediatamente para evitar parpadeo
    setIsSearching(true);

    // Para búsquedas con texto, usar debounce más agresivo
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      searchSuppliers(searchQuery, 1, true); // skipCache = true para forzar nueva búsqueda
      setIsSearching(false);
    }, searchQuery.length > 2 ? 300 : 600); // Debounce más suave

    return () => {
      clearTimeout(timeoutId);
      setIsSearching(false);
    };
  }, [searchQuery]); // Removido searchSuppliers de las dependencias

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    searchSuppliers(searchQuery, page, false); // skipCache = false para usar cache si es la misma query
  };

  const getCountryNames = (countries: any) => {
    if (!countries) return 'Location not specified';
    
    // Si es un string que parece ser un array JSON, parsearlo
    if (typeof countries === 'string' && countries.startsWith('[')) {
      try {
        const parsed = JSON.parse(countries);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : 'Location not specified';
      } catch {
        return countries; // Si falla el parse, usar el string tal como está
      }
    }
    
    // Si es un string simple, devolverlo directamente
    if (typeof countries === 'string') {
      return countries;
    }
    
    // Si es un array real, tomar el primer elemento
    if (Array.isArray(countries)) {
      return countries[0] || 'Location not specified';
    }
    
    return 'Location not specified';
  };

  const getCityNames = (cities: any) => {
    if (!cities || !Array.isArray(cities)) return '';
    return cities.slice(0, 2).join(', ');
  };

  const getSpecialties = (sectors: string | null) => {
    const specialties = [];
    if (sectors) specialties.push(sectors);
    return specialties.slice(0, 3);
  };

  const getSupplierPath = (supplier: Supplier) => {
    const identifier = supplier.slug || supplier.id;
    return `/suppliers/${identifier}`;
  };

  const handleViewProfile = (supplier: Supplier) => {
    navigate(getSupplierPath(supplier));
  };

  const handleOpenProfileInNewTab = (supplier: Supplier) => {
    const supplierPath = getSupplierPath(supplier);
    window.open(supplierPath, '_blank', 'noopener,noreferrer');
  };

  // Función para renderizar tarjetas con carga progresiva
  const renderSupplierCards = () => {
    // Mostrar skeleton mientras carga y no hay datos, o mientras se está buscando
    if ((loading && suppliers.length === 0) || (isSearching && suppliers.length === 0)) {
      return (
        <div style={{
          columnCount: 'auto',
          columnWidth: '320px',
          columnGap: '24px',
          columnFill: 'balance'
        }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                border: '1px solid #e5e5e5',
                height: 'fit-content',
                display: 'flex',
                flexDirection: 'column',
                marginBottom: '24px',
                breakInside: 'avoid',
                width: '100%',
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              }}
            >
              {/* Header con logo y nombre */}
              <div style={{display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '12px'}}>
                {/* Logo skeleton */}
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '8px',
                    flexShrink: 0
                  }}
                />
                
                {/* Nombre y website skeleton */}
                <div style={{flex: 1}}>
                  <div
                    style={{
                      height: '18px',
                      backgroundColor: '#e5e7eb',
                      borderRadius: '4px',
                      width: '75%',
                      marginBottom: '4px'
                    }}
                  />
                  <div
                    style={{
                      height: '12px',
                      backgroundColor: '#e5e7eb',
                      borderRadius: '4px',
                      width: '50%'
                    }}
                  />
                </div>
              </div>

              {/* Descripción skeleton */}
              <div style={{marginBottom: '12px'}}>
                <div
                  style={{
                    height: '14px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '4px',
                    width: '100%',
                    marginBottom: '6px'
                  }}
                />
                <div
                  style={{
                    height: '14px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '4px',
                    width: '85%',
                    marginBottom: '6px'
                  }}
                />
                <div
                  style={{
                    height: '14px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '4px',
                    width: '70%'
                  }}
                />
              </div>

              {/* Ubicación skeleton */}
              <div style={{display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px'}}>
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '2px'
                  }}
                />
                <div
                  style={{
                    height: '14px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '4px',
                    width: '40%'
                  }}
                />
              </div>

              {/* Botón skeleton */}
              <div
                style={{
                  width: '100%',
                  height: '32px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  marginTop: 'auto'
                }}
              />
            </div>
          ))}
        </div>
      );
    }

    // Mostrar mensaje si no hay resultados (solo si no está cargando ni buscando)
    if (!loading && !isSearching && suppliers.length === 0) {
      return (
        <div style={{
          textAlign: 'center', 
          padding: '48px', 
          backgroundColor: 'white', 
          borderRadius: '8px',
          maxWidth: '400px',
          width: '100%'
        }}>
          <div style={{color: '#666', marginBottom: '8px'}}>No suppliers found</div>
          <div style={{fontSize: '14px', color: '#666'}}>
            {searchQuery ? 'Try searching with a different company name' : 'No suppliers available'}
          </div>
        </div>
      );
    }

    // Mostrar tarjetas con carga progresiva de imágenes
    return (
      <div style={{
        columnCount: 'auto',
        columnWidth: '320px',
        columnGap: '24px',
        columnFill: 'balance'
      }}>
        {suppliers.map((supplier) => (
          <ProgressiveSmartSupplierCard
            key={supplier.id}
            supplier={supplier}
            onView={() => handleViewProfile(supplier)}
            onOpenInNewTab={() => handleOpenProfileInNewTab(supplier)}
            isSuspicious={isSuspicious}
            deobfuscateText={deobfuscateText}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <VerticalSelector showPromptLibrary={false} />
      <div className="container mx-auto px-4 py-8" data-onboarding-target="supplier-search-page">
        <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div style={{marginBottom: '32px'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
            <h1 style={{fontSize: '32px', fontWeight: '800', color: '#333'}}>
              Supplier Search
            </h1>
            {isSuspicious && (
              <div style={{display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#fef3c7', borderRadius: '4px', fontSize: '12px', color: '#92400e'}}>
                <Shield style={{width: '12px', height: '12px'}} />
                Protegido
              </div>
            )}
          </div>
          <p style={{color: '#666'}}>
            Find and connect with suppliers that match your requirements
            {isSuspicious && (
              <span style={{color: '#92400e', fontSize: '14px', marginLeft: '8px'}}>
                (Modo de seguridad activo)
              </span>
            )}
          </p>
        </div>

        {/* Search and Filters */}
        <div style={{marginBottom: '32px'}}>
          <div style={{display: 'flex', gap: '16px', marginBottom: '16px'}}>
            <div style={{position: 'relative', flex: 1}}>
              <Search style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#666',
                width: '16px',
                height: '16px'
              }} />
              <input
                type="text"
                placeholder="Search suppliers by name, product, or service..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 40px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '16px'
                }}
                
              />
            </div>
          </div>

        </div>

        {/* Results */}
        <div>
          <div style={{marginBottom: '24px'}}>
            <h2 style={{fontSize: '20px', fontWeight: '600', color: '#333', display: 'flex', alignItems: 'center', gap: '8px'}}>
              {searchQuery ? 'Search Results' : 'All Suppliers'}
              {totalCount > 0 && ` (${totalCount})`}
              {totalCount === 0 && (
                <div style={{display: 'flex', alignItems: 'center', gap: '2px'}}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    backgroundColor: '#3b82f6',
                    borderRadius: '50%',
                    animation: 'bounce 1.4s ease-in-out infinite both'
                  }} />
                  <div style={{
                    width: '4px',
                    height: '4px',
                    backgroundColor: '#3b82f6',
                    borderRadius: '50%',
                    animation: 'bounce 1.4s ease-in-out infinite both',
                    animationDelay: '0.16s'
                  }} />
                  <div style={{
                    width: '4px',
                    height: '4px',
                    backgroundColor: '#3b82f6',
                    borderRadius: '50%',
                    animation: 'bounce 1.4s ease-in-out infinite both',
                    animationDelay: '0.32s'
                  }} />
                </div>
              )}
              {totalCountLoading && totalCount > 0 && (
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #e5e7eb',
                  borderTop: '2px solid #3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
            </h2>
          </div>

          <div style={{minHeight: '400px'}}>
            {renderSupplierCards()}
          </div>

          {/* Pagination */}
          {suppliers.length > 0 && (totalCount > suppliersPerPage || (totalCount === 0 && suppliers.length === suppliersPerPage)) && (
            <div className="mt-8 flex justify-center" style={{ position: 'relative' }}>
              {loading && (
                <div style={{
                  position: 'absolute',
                  top: '-30px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#666',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid #e5e5e5'
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    border: '2px solid #e5e7eb',
                    borderTop: '2px solid #3b82f6',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  Loading...
                </div>
              )}
              <Pagination>
                <PaginationContent>
                  {currentPage > 1 && (
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => handlePageChange(currentPage - 1)}
                        style={{ cursor: 'pointer' }}
                      />
                    </PaginationItem>
                  )}
                  
                  {(() => {
                    const totalPages = Math.ceil(totalCount / suppliersPerPage);
                    const maxVisible = 5;
                    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
                    
                    // Adjust start if we're near the end
                    if (endPage - startPage + 1 < maxVisible) {
                      startPage = Math.max(1, endPage - maxVisible + 1);
                    }
                    
                    return Array.from({ length: endPage - startPage + 1 }, (_, i) => {
                      const page = startPage + i;
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => handlePageChange(page)}
                            isActive={currentPage === page}
                            style={{ cursor: 'pointer' }}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    });
                  })()}
                  
                  {Math.ceil(totalCount / suppliersPerPage) > 5 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  
                  {currentPage < Math.ceil(totalCount / suppliersPerPage) && (
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => handlePageChange(currentPage + 1)}
                        style={{ cursor: 'pointer' }}
                      />
                    </PaginationItem>
                  )}
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
};

export default SupplierSearch;