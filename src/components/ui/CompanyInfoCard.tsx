import React, { useEffect, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Eye, Bookmark } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import SaveToListModal from '@/components/SaveToListModal';

interface CompanyData {
  id?: string;
  nombre_empresa: string;
  main_activities?: string;
  sectors?: string;
  countries?: string[] | string;
  website?: string;
  slug?: string;
  company_revision_id?: string;
}

interface CompanyInfoCardProps {
  company: CompanyData;
}

const CompanyInfoCard = ({ company }: CompanyInfoCardProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [companySlug, setCompanySlug] = useState<string | null>(company.slug || null);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [companyIdForSaving, setCompanyIdForSaving] = useState<string | null>(null);
  const [savedListName, setSavedListName] = useState<string>('');
  const [currentLists, setCurrentLists] = useState<Array<{ id: string | null; name: string }>>([]);

  // Obtener el slug desde Supabase si tenemos company_revision_id pero no slug
  useEffect(() => {
    const fetchSlug = async () => {
      if (!companySlug && company.company_revision_id) {
        try {
          const { data, error } = await supabase
            .from('company_revision')
            .select('slug, company_id')
            .eq('id', company.company_revision_id)
            .single();

          if (error) {
            return;
          }

          if (data?.slug) {
            setCompanySlug(data.slug);
          } else {
            setCompanySlug(data?.company_id || null);
          }
        } catch (error) {
          // Error handling
        }
      }
    };

    fetchSlug();
  }, [company.company_revision_id, companySlug]);

  // Verificar si la empresa ya está guardada
  useEffect(() => {
    const checkIfSaved = async () => {
      if (!user || !companyIdForSaving) {
        return;
      }

      try {
        // Consulta con JOIN para obtener información de todas las listas
        const { data: savedData, error: savedError } = await supabase
          .from('saved_companies')
          .select(`
            id,
            list_id,
            supplier_lists (
              name
            )
          `)
          .eq('user_id', user.id)
          .eq('company_id', companyIdForSaving);

        if (!savedError && savedData && savedData.length > 0) {
          setIsSaved(true);
          
          // Crear el array de listas actuales
          const lists = savedData.map(item => ({
            id: item.list_id,
            name: item.list_id ? item.supplier_lists?.name || 'Unknown List' : 'Uncategorized'
          }));
          setCurrentLists(lists);
          
          // Siempre mostrar el conteo de listas, incluso cuando es solo 1
          setSavedListName(`${savedData.length} list${savedData.length === 1 ? '' : 's'}`);
        } else {
          setIsSaved(false);
          setSavedListName('');
          setCurrentLists([]);
        }
      } catch (error) {
        console.error('❌ Error checking saved status:', error);
      }
    };

    checkIfSaved();
  }, [user, companyIdForSaving]);

  // Listener para cuando la ventana gana foco (cambio de pestaña)
  useEffect(() => {
    const handleFocus = () => {
      // Refrescar estado cuando el usuario vuelve a la pestaña
      const checkIfSaved = async () => {
        if (!user || !companyIdForSaving) return;
        try {
          const { data: savedData, error: savedError } = await supabase
            .from('saved_companies')
            .select(`
              id,
              list_id,
              supplier_lists (
                name
              )
            `)
            .eq('user_id', user.id)
            .eq('company_id', companyIdForSaving);

          if (!savedError && savedData && savedData.length > 0) {
            setIsSaved(true);
            
            // Crear el array de listas actuales
            const lists = savedData.map(item => ({
              id: item.list_id,
              name: item.list_id ? item.supplier_lists?.name || 'Unknown List' : 'Uncategorized'
            }));
            setCurrentLists(lists);
            
            // Siempre mostrar el conteo de listas, incluso cuando es solo 1
            setSavedListName(`${savedData.length} list${savedData.length === 1 ? '' : 's'}`);
          } else {
            setIsSaved(false);
            setSavedListName('');
            setCurrentLists([]);
          }
        } catch (error) {
          console.error('❌ Error checking saved status:', error);
        }
      };
      checkIfSaved();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, companyIdForSaving]);

  // Listener de tiempo real para cambios en saved_companies
  useEffect(() => {
    if (!user || !companyIdForSaving) return;

    const channel = supabase
      .channel('saved-companies-changes-company-info')
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
            setTimeout(() => {
              const checkIfSaved = async () => {
                if (!user || !companyIdForSaving) return;
                try {
                  const { data: savedData, error: savedError } = await supabase
                    .from('saved_companies')
                    .select(`
                      id,
                      list_id,
                      supplier_lists (
                        name
                      )
                    `)
                    .eq('user_id', user.id)
                    .eq('company_id', companyIdForSaving);

                  if (!savedError && savedData && savedData.length > 0) {
                    setIsSaved(true);
                    
                    // Crear el array de listas actuales
                    const lists = savedData.map(item => ({
                      id: item.list_id,
                      name: item.list_id ? item.supplier_lists?.name || 'Unknown List' : 'Uncategorized'
                    }));
                    setCurrentLists(lists);
                    
                    // Siempre mostrar el conteo de listas, incluso cuando es solo 1
                    setSavedListName(`${savedData.length} list${savedData.length === 1 ? '' : 's'}`);
                  } else {
                    setIsSaved(false);
                    setSavedListName('');
                    setCurrentLists([]);
                  }
                } catch (error) {
                  console.error('❌ Error checking saved status:', error);
                }
              };
              checkIfSaved();
            }, 200);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, companyIdForSaving]);

  // Efecto separado para obtener company_id
  useEffect(() => {
    const getCompanyId = async () => {
      if (!company.company_revision_id) {
        return;
      }

      try {
        const { data: companyData, error: companyError } = await supabase
          .from('company_revision')
          .select('company_id')
          .eq('id', company.company_revision_id)
          .single();

        if (!companyError && companyData) {
          setCompanyIdForSaving(companyData.company_id);
        } else {
          console.log("❌ Error obteniendo company_id:", companyError);
        }
      } catch (error) {
        console.error('❌ Error getting company_id:', error);
      }
    };

    getCompanyId();
  }, [company.company_revision_id]);

  const handleViewMore = () => {
    if (companySlug) {
      navigate(`/suppliers/${companySlug}`);
    } else if (company.id) {
      navigate(`/suppliers/${company.id}`);
    }
  };

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

  const handleSaveSuccess = () => {
    // Refresh the saved status after saving
    const checkIfSaved = async () => {
      if (!user || !companyIdForSaving) {
        return;
      }

      try {
        const { data: savedData, error: savedError } = await supabase
          .from('saved_companies')
          .select(`
            id,
            list_id,
            supplier_lists (
              name
            )
          `)
          .eq('user_id', user.id)
          .eq('company_id', companyIdForSaving);

        if (!savedError && savedData && savedData.length > 0) {
          setIsSaved(true);
          
          // Crear el array de listas actuales
          const lists = savedData.map(item => ({
            id: item.list_id,
            name: item.list_id ? item.supplier_lists?.name || 'Unknown List' : 'Uncategorized'
          }));
          setCurrentLists(lists);
          
          // Siempre mostrar el conteo de listas, incluso cuando es solo 1
          setSavedListName(`${savedData.length} list${savedData.length === 1 ? '' : 's'}`);
        } else {
          setIsSaved(false);
          setSavedListName('');
          setCurrentLists([]);
        }
      } catch (error) {
        console.error('❌ Error checking saved status:', error);
      }
    };

    checkIfSaved();
    setShowSaveModal(false);
  };

  return (
    <div className="bg-white w-[260px] md:w-[300px] xl:w-[320px] flex flex-col justify-between rounded-3xl border border-sky/20 overflow-hidden hover:shadow-md transition mx-3 md:mx-0 h-full">
      <div className="flex flex-col h-full pt-5 pb-6 px-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h4 className="font-semibold text-[16px] text-navy leading-tight flex-1">{company.nombre_empresa}</h4>
        </div>

        {/* Content sections */}
        <div className="space-y-3 flex-1">
          {company.main_activities && (
            <div className="bg-sky/10 rounded-lg p-3">
              <span className="text-[13px] font-semibold text-navy">Activities:</span>
              <p className="text-[12px] text-charcoal leading-relaxed mt-1 line-clamp-3">{company.main_activities}</p>
            </div>
          )}
          
          {company.sectors && (
            <div className="bg-sky/10 rounded-lg p-3">
              <span className="text-[13px] font-semibold text-navy">Sectors:</span>
              <p className="text-[12px] text-charcoal leading-relaxed mt-1 line-clamp-3">{company.sectors}</p>
            </div>
          )}
          
          {company.countries && (
            <div className="bg-sky/10 rounded-lg p-3">
              <span className="text-[13px] font-semibold text-navy">Countries:</span>
              <p className="text-[12px] text-charcoal leading-relaxed mt-1 line-clamp-3">
                {Array.isArray(company.countries) ? company.countries.join(', ') : company.countries}
              </p>
            </div>
          )}
        </div>

        {/* Website link */}
        {company.website && (
          <div className="mt-4">
            <a 
              href={company.website} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-1 text-[13px] text-navy hover:underline underline-offset-2"
            >
              Visit Website <ExternalLink size={14} />
            </a>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="flex">
        <button
          onClick={handleViewMore}
          className="h-12 flex-1 bg-gray-100 hover:bg-gray-200 text-navy flex items-center justify-center gap-2 rounded-bl-3xl transition-colors"
        >
          <Eye size={18} />
          <span className="text-[15px] font-semibold">View More</span>
        </button>
        
        <button
          onClick={handleSaveCompany}
          disabled={isLoading}
          className="h-12 flex-1 bg-mint hover:bg-mint/90 disabled:opacity-50 text-navy flex items-center justify-center gap-2 rounded-br-3xl transition-colors"
        >
          <Bookmark size={18} />
          <span className="text-[15px] font-semibold">
            {isLoading ? 'Loading...' : isSaved ? `Saved in ${savedListName}` : 'Save Company'}
          </span>
        </button>
      </div>

      {/* Save to List Modal */}
      <SaveToListModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        companyId={companyIdForSaving || ''}
        companyName={company.nombre_empresa}
        userId={user?.id || ''}
        onSaveSuccess={handleSaveSuccess}
        currentLists={currentLists}
      />
    </div>
  );
};

export default CompanyInfoCard;