
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { ExternalLink, Bookmark, ThumbsUp, ThumbsDown } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import AccessibleButton from '@/components/ui/AccessibleButton';
import EnhancedCard from '@/components/ui/EnhancedCard';
import SaveToListModal from '@/components/SaveToListModal';

interface EnhancedSupplierCardProps {
  supplier: {
    id: string;
    name: string;
    country: string;
    core_capability: string;
    fit_score: number;
    slug: string;
    data_source?: string;
  };
  conversationId?: string;
  onAddToRFX?: (supplier: any) => void;
}

const EnhancedSupplierCard = ({ supplier, conversationId, onAddToRFX }: EnhancedSupplierCardProps) => {
  const [feedbackSent, setFeedbackSent] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedListName, setSavedListName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const { user } = useAuth();

  // Función para verificar estado guardado (reutilizable)
  const checkSavedStatus = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase
        .from('saved_companies')
        .select(`
          list_id,
          supplier_lists (
            name
          )
        `)
        .eq('user_id', user.id)
        .eq('company_id', supplier.id);

      console.log('EnhancedSupplierCard - checkSavedStatus:', { 
        companyId: supplier.id, 
        dataLength: data?.length, 
        data 
      });

      if (data && data.length > 0) {
        setIsSaved(true);
        // Siempre mostrar el conteo de listas, incluso cuando es solo 1
        setSavedListName(`${data.length} list${data.length === 1 ? '' : 's'}`);
        console.log('EnhancedSupplierCard - Setting savedListName:', savedListName);
      } else {
        setIsSaved(false);
        setSavedListName('');
      }
    } catch (error) {
      console.error('Error checking saved status:', error);
    }
  };

  useEffect(() => {
    checkSavedStatus();
  }, [user, supplier.id]);

  // Listener para cuando la ventana gania foco (cambio de pestaña)
  useEffect(() => {
    const handleFocus = () => {
      checkSavedStatus();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('saved-companies-changes-enhanced')
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
          if (newRecord?.company_id === supplier.id || 
              oldRecord?.company_id === supplier.id) {
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
  }, [user, supplier.id]);

  // Listener de tiempo real para cambios en saved_companies

  const sendFeedback = async (value: number) => {
    // Feedback functionality temporarily disabled - no feedback table in database
    setFeedbackSent(value);
    toast({
      title: "Feedback sent",
      description: `Thank you for rating ${supplier.name}`,
    });
  };

  const handleSaveCompany = () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to save companies",
        variant: "destructive",
      });
      return;
    }

    setShowSaveModal(true);
  };

  const handleModalClose = () => {
    setShowSaveModal(false);
    // El listener en tiempo real se encargará de actualizar el estado
  };

  return (
    <EnhancedCard className="w-full h-full flex flex-col border border-gray-200 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 group">
      <CardContent className="p-4 flex flex-col h-full">
        {/* Header compacto */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Logo de la empresa más pequeño */}
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {supplier.name.charAt(0)}
              </span>
            </div>
            
            {/* Información de la empresa */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-base text-navy truncate">
                  {supplier.name}
                </h3>
                {supplier.data_source === 'web_search' && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 px-1 py-0">
                    ✓
                  </Badge>
                )}
              </div>
              <p className="text-xs text-charcoal/70 truncate">{supplier.country}</p>
            </div>
          </div>

          {/* Match Score compacto */}
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-charcoal/60">Score</div>
            <div className={`text-lg font-bold ${
              supplier.fit_score >= 80 ? 'text-emerald-600' : 
              supplier.fit_score >= 60 ? 'text-blue-600' : 'text-amber-600'
            }`}>
              {supplier.fit_score}%
            </div>
          </div>
        </div>

        {/* Capacidades principales */}
        <div className="flex-1 mb-3">
          <div className="text-xs text-charcoal leading-relaxed line-clamp-3">
            {supplier.core_capability}
          </div>
        </div>

        {/* Botones de acción compactos */}
        <div className="flex gap-2 mt-auto">
          {/* Botón See More prominente */}
          <Button
            asChild
            className="flex-1 bg-gradient-to-r from-sky to-mint text-navy font-semibold hover:from-sky/90 hover:to-mint/90 text-sm py-2"
          >
            <Link to={`/suppliers/${supplier.slug}`} className="flex items-center justify-center gap-1">
              <ExternalLink className="w-3 h-3" />
              See More
            </Link>
          </Button>
          
          <AccessibleButton
            onClick={handleSaveCompany}
            loading={saving}
            variant="outline"
            className="px-3 py-2"
          >
            <Bookmark className="w-3 h-3" />
          </AccessibleButton>

          {/* Botones de feedback compactos */}
          {conversationId && (
            <>
              <AccessibleButton
                onClick={() => sendFeedback(1)}
                disabled={feedbackSent !== null}
                variant="ghost"
                size="sm"
                className={`p-2 rounded-lg transition-all duration-300 ${
                  feedbackSent === 1 
                    ? 'text-emerald-600 bg-emerald-50' 
                    : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                } ${feedbackSent !== null && feedbackSent !== 1 ? 'opacity-50' : ''}`}
              >
                <ThumbsUp className="w-3 h-3" />
              </AccessibleButton>
              <AccessibleButton
                onClick={() => sendFeedback(-1)}
                disabled={feedbackSent !== null}
                variant="ghost"
                size="sm"
                className={`p-2 rounded-lg transition-all duration-300 ${
                  feedbackSent === -1 
                    ? 'text-red-600 bg-red-50' 
                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                } ${feedbackSent !== null && feedbackSent !== -1 ? 'opacity-50' : ''}`}
              >
                <ThumbsDown className="w-3 h-3" />
              </AccessibleButton>
            </>
          )}
        </div>
      </CardContent>

      <SaveToListModal
        isOpen={showSaveModal}
        onClose={handleModalClose}
        companyId={supplier.id}
        companyName={supplier.name}
        userId={user?.id || ''}
        onSaveSuccess={() => {
          // Refresh the saved status after saving
          checkSavedStatus();
        }}
      />
    </EnhancedCard>
  );
};

export default EnhancedSupplierCard;
