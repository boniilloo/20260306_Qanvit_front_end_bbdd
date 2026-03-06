
import React, { useState, useEffect } from 'react';
import { ExternalLink, Save, Bookmark } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import SaveToListModal from '@/components/SaveToListModal';
import SmartLogo from './SmartLogo';

interface SupplierCardProps {
  logo?: string | null;
  name: string;
  country: string;
  flag: string;
  tagline: string;
  score: number;
  companyId?: string;
  onSave?: () => void;
  onView?: () => void;
}

const SupplierCard = ({
  logo,
  name,
  country,
  flag,
  tagline,
  score,
  companyId,
  onSave,
  onView
}: SupplierCardProps) => {
  const { user } = useAuth();
  const [isSaved, setIsSaved] = useState(false);
  const [savedListName, setSavedListName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [currentLists, setCurrentLists] = useState<Array<{id: string | null, name: string, color?: string}>>([]);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState<string | null>(null);

  // Load company logo
  useEffect(() => {
    const loadCompanyLogo = async () => {
      if (!companyId) return;
      
      try {
        const { data: companyData, error } = await supabase
          .from('company_revision')
          .select('logo, website')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .single();

        if (!error && companyData) {
          if (companyData.logo) {
            setCompanyLogo(companyData.logo);
          }
          if (companyData.website) {
            setCompanyWebsite(companyData.website);
          }
        }
      } catch (error) {
        console.error('Error loading company logo:', error);
      }
    };

    loadCompanyLogo();
  }, [companyId]);

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

  const handleSaveCompany = () => {
    if (user && companyId) {
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
  return (
    <>
      <div className="
        bg-white w-full max-w-[320px] mx-auto
        flex flex-col justify-between
        rounded-3xl border border-[#dfe5f0]
        overflow-hidden
        hover:shadow-md transition
        h-full
      ">
      <div className="pt-5 pb-6 px-6">
        {/* avatar */}
        <SmartLogo
          logoUrl={companyLogo || logo}
          websiteUrl={companyWebsite}
          companyName={name}
          size="lg"
          className="rounded-full flex-shrink-0"
          isSupplierRoute={true}
        />
        
        {/* name + flag */}
        <div className="mt-2 flex items-baseline gap-1">
          <h3 className="font-semibold text-[16px] text-[#032751]">{name}</h3>
          <span className="text-[11px] font-bold tracking-wide">{flag}</span>
        </div>
        <div className="text-[13px] text-slate-500">{country}</div>

        {/* tagline */}
        <p className="text-[14px] mt-1 mb-3 line-clamp-3">{tagline}</p>

        {/* view link */}
        <button
          onClick={onView}
          className="mt-3 flex items-center gap-1 text-[13px] text-[#032751] hover:underline underline-offset-2"
        >
          View supplier <ExternalLink size={14} />
        </button>
      </div>

      {/* footer save */}
      <button
        onClick={handleSaveCompany}
        className="h-12 w-full bg-mint hover:bg-mint/90 text-white flex items-center justify-center gap-2 rounded-b-3xl transition-colors duration-200"
        disabled={!user || !companyId}
      >
        <Bookmark size={18} />
        <span className="text-[17px] font-semibold">
          {isSaved ? `Saved in ${savedListName}` : 'Save Supplier'}
        </span>
      </button>
    </div>

    {showSaveModal && companyId && (
      <SaveToListModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        companyId={companyId}
        companyName={name}
        userId={user?.id || ''}
        currentLists={currentLists}
        onSaveSuccess={handleSaveSuccess}
      />
    )}
  </>
  );
};

export default SupplierCard;
