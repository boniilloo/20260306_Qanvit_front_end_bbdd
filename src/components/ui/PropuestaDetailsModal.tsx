import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { ChevronLeft, ChevronRight, ExternalLink, AlertTriangle, CheckCircle, X, FileText, BarChart } from 'lucide-react';
import SmartLogo from './SmartLogo';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Propuesta } from '@/types/chat';

interface PropuestaDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propuesta: Propuesta;
  onSaveCompany?: () => void;
  isSaved?: boolean;
  saving?: boolean;
  showSaveButton?: boolean;
}

// Extrae y normaliza la justificación desde los distintos formatos posibles
const DEFAULT_NO_SUMMARY = 'No summary available.';
const getJustificationData = (propuesta: Propuesta, noSummaryLabel: string = DEFAULT_NO_SUMMARY) => {
  if (propuesta.justification_sentence || propuesta.justification_pros || propuesta.justification_cons) {
    return {
      sentence: propuesta.justification_sentence || noSummaryLabel,
      pros: propuesta.justification_pros || [],
      cons: propuesta.justification_cons || []
    };
  }
  if (propuesta.justification) {
    if (typeof propuesta.justification === 'object' && propuesta.justification !== null) {
      return {
        sentence: (propuesta.justification as any).sentence || noSummaryLabel,
        pros: (propuesta.justification as any).pros || [],
        cons: (propuesta.justification as any).cons || []
      };
    }
    if (typeof propuesta.justification === 'string') {
      try {
        const parsed = JSON.parse(propuesta.justification);
        return {
          sentence: parsed?.sentence || noSummaryLabel,
          pros: parsed?.pros || [],
          cons: parsed?.cons || []
        };
      } catch (_err) {
        return { sentence: propuesta.justification, pros: [], cons: [] };
      }
    }
  }
  return { sentence: noSummaryLabel, pros: [], cons: [] };
};

const PropuestaDetailsModal: React.FC<PropuestaDetailsModalProps> = ({ 
  open, 
  onOpenChange, 
  propuesta,
  onSaveCompany,
  isSaved = false,
  saving = false,
  showSaveButton = false
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  const technicalMatch = propuesta.match;
  const companyMatch = propuesta.company_match ?? propuesta.match;
  const overallMatch = (propuesta.company_match !== undefined && propuesta.company_match !== null)
    ? Math.round((propuesta.match + propuesta.company_match) / 2)
    : propuesta.match;

  useEffect(() => {
    if (!open) return;

    const checkImageUrl = (url: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
        setTimeout(() => resolve(false), 5000);
      });
    };

    const validateAndSetImages = async (imageArrays: string[]) => {
      const allValid: string[] = [];
      for (const imageData of imageArrays) {
        try {
          if (imageData.startsWith('http') || imageData.startsWith('data:')) {
            const ok = await checkImageUrl(imageData);
            if (ok) allValid.push(imageData);
          } else {
            const parsed = JSON.parse(imageData);
            if (Array.isArray(parsed)) {
              for (const url of parsed) {
                if (typeof url === 'string' && url.trim()) {
                  const ok = await checkImageUrl(url);
                  if (ok) allValid.push(url);
                }
              }
            }
          }
        } catch (_e) {}
      }
      setProductImages(allValid);
    };

    const load = async () => {
      try {
        setCompanyLogo(null);
        setCompanyWebsite(null);
        setProductImages([]);

        const { data: companyData } = await supabase
          .from('company_revision')
          .select('logo, website')
          .eq('id', propuesta.id_company_revision)
          .single();
        if (companyData) {
          setCompanyLogo(companyData.logo || null);
          setCompanyWebsite(companyData.website || null);
        }

        if (propuesta.id_product_revision) {
          const { data: productData } = await supabase
            .from('product_revision')
            .select('image')
            .eq('id', propuesta.id_product_revision)
            .eq('is_active', true)
            .single();
          if (productData?.image) await validateAndSetImages([productData.image]);
        } else if (propuesta.id_company_revision) {
          const { data: allProducts } = await supabase.rpc('get_products_by_company_revision', {
            p_company_revision_id: propuesta.id_company_revision,
            p_only_active: true,
          });
          if (allProducts && allProducts.length > 0) {
            const productIds = allProducts.map((p: any) => p.id_product_revision);
            const { data: imgs } = await supabase
              .from('product_revision')
              .select('image')
              .in('id', productIds)
              .eq('is_active', true);
            if (imgs && imgs.length > 0) {
              const arr = imgs.map((p: any) => p.image).filter(Boolean);
              await validateAndSetImages(arr);
            }
          }
        }
      } catch (_err) {}
    };

    load();
  }, [open, propuesta.id_company_revision, propuesta.id_product_revision]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="max-w-6xl max-h-[90vh] overflow-y-auto p-0"
          data-onboarding-target="fq-match-justification-modal"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t('rfxs.reasoningModal_title', { company: propuesta.empresa })}</DialogTitle>
          </DialogHeader>

          {/* Header */}
          <div className="p-6 border-b bg-gray-50">
            <div className="flex items-center gap-4">
              <SmartLogo
                logoUrl={companyLogo}
                websiteUrl={companyWebsite || propuesta.website}
                companyName={propuesta.empresa}
                size="md"
                className="rounded-xl flex-shrink-0"
                isSupplierRoute={true}
              />
              <div className="flex-1">
                {propuesta.website ? (
                  <a
                    href={propuesta.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer inline-flex items-center gap-2"
                  >
                    {propuesta.empresa}
                    <ExternalLink size={16} className="text-gray-500 hover:text-blue-600" />
                  </a>
                ) : (
                  <h2 className="text-xl font-bold text-gray-900">{propuesta.empresa}</h2>
                )}
                {propuesta.producto && (
                  <p className="text-gray-600 text-sm mt-1">{propuesta.producto}</p>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 p-6 space-y-6">
              {/* Mobile score */}
              <div className="lg:hidden">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex flex-col items-center">
                    {/* Circular Progress */}
                    <div className="relative w-32 h-32 mb-4">
                      <svg className="transform -rotate-90 w-32 h-32">
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#e5e7eb"
                          strokeWidth="12"
                          fill="none"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#f4a9aa"
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 56}`}
                          strokeDashoffset={`${2 * Math.PI * 56 * (1 - overallMatch / 100)}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-[#f4a9aa]">{overallMatch}%</div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-gray-600 mb-4">{t('rfxs.reasoningModal_overallMatch')}</div>
                    <div className="grid grid-cols-2 gap-6 w-full">
                      <div className="text-center">
                        <div className="text-xl font-bold text-gray-900 mb-1">{technicalMatch}%</div>
                        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">{t('rfxs.reasoningModal_technical')}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-gray-900 mb-1">{companyMatch}%</div>
                        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">{t('rfxs.reasoningModal_company')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div>
                <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#f4a9aa]" />
                  {t('rfxs.reasoningModal_summary')}
                </h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-1">{t('rfxs.reasoningModal_technicalLabel')}</p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {getJustificationData(propuesta, t('rfxs.reasoningModal_noSummary')).sentence}
                    </p>
                  </div>
                  {propuesta.company_match_justification && (
                    <div>
                      <p className="text-sm font-medium text-gray-900 mb-1">{t('rfxs.reasoningModal_companyAnalysis')}</p>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {propuesta.company_match_justification}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Match analysis */}
              <div>
                <h4 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <BarChart className="h-5 w-5 text-[#f4a9aa]" />
                  {t('rfxs.reasoningModal_matchAnalysis')}
                </h4>
                {(() => {
                  const data = getJustificationData(propuesta, t('rfxs.reasoningModal_noSummary'));
                  if (data.pros.length === 0 && data.cons.length === 0) {
                    return (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-sm text-gray-700 leading-relaxed">{data.sentence}</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-4">
                      {data.pros.length > 0 && (
                        <div className="border border-gray-200 rounded-lg p-4">
                          <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                            <CheckCircle size={16} className="text-green-600" />
                            {t('rfxs.reasoningModal_strengthsAlignments')}
                          </h5>
                          <ul className="space-y-2">
                            {data.pros.map((pro: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                <CheckCircle size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
                                <span>{pro}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {data.cons.length > 0 && (
                        <div className="border border-gray-200 rounded-lg p-4">
                          <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                            <AlertTriangle size={16} className="text-orange-600" />
                            {t('rfxs.reasoningModal_considerationsGaps')}
                          </h5>
                          <ul className="space-y-2">
                            {data.cons.map((con: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                                <AlertTriangle size={14} className="text-orange-600 mt-0.5 flex-shrink-0" />
                                <span>{con}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Right column */}
            <div className="w-full lg:w-80 bg-gray-50 border-t lg:border-t-0 lg:border-l p-6 space-y-6">
              <div className="hidden lg:block" data-onboarding-target="match-percentages-section">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex flex-col items-center">
                    {/* Circular Progress */}
                    <div className="relative w-32 h-32 mb-4">
                      <svg className="transform -rotate-90 w-32 h-32">
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#e5e7eb"
                          strokeWidth="12"
                          fill="none"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#f4a9aa"
                          strokeWidth="12"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 56}`}
                          strokeDashoffset={`${2 * Math.PI * 56 * (1 - overallMatch / 100)}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-[#f4a9aa]">{overallMatch}%</div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-gray-600 mb-4">{t('rfxs.reasoningModal_overallMatch')}</div>
                    <div className="grid grid-cols-2 gap-6 w-full">
                      <div className="text-center">
                        <div className="text-xl font-bold text-gray-900 mb-1">{technicalMatch}%</div>
                        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">{t('rfxs.reasoningModal_technical')}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-gray-900 mb-1">{companyMatch}%</div>
                        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">{t('rfxs.reasoningModal_company')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 mb-4">{t('rfxs.reasoningModal_productPreview')}</h5>
                <div className="bg-gray-100 rounded-lg border border-gray-200">
                  {productImages && productImages.length > 0 ? (
                    <div data-onboarding-target="carousel-arrows-container" className="relative">
                      <Carousel className="w-full">
                        <CarouselContent>
                          {productImages.map((imageUrl, index) => (
                            <CarouselItem key={index}>
                              <div className="p-4 text-center">
                                <img
                                  src={imageUrl}
                                  alt={`Product ${index + 1}`}
                                  className="w-full h-40 mx-auto object-contain rounded-lg cursor-pointer hover:scale-105 transition-transform"
                                  onClick={() => setSelectedImageIndex(index)}
                                />
                              </div>
                            </CarouselItem>
                          ))}
                        </CarouselContent>
                        {productImages.length > 1 && (
                          <>
                            <CarouselPrevious 
                              className="left-2" 
                              data-onboarding-target="carousel-arrow-left"
                            />
                            <CarouselNext 
                              className="right-2" 
                              data-onboarding-target="carousel-arrow-right"
                            />
                          </>
                        )}
                      </Carousel>
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <div className="w-20 h-20 mx-auto bg-gray-200 rounded-lg flex items-center justify-center mb-3">📦</div>
                      <p className="text-xs text-gray-500">{t('rfxs.reasoningModal_notAvailable')}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={async () => {
                    try {
                      if (!user) {
                        toast({ title: t('rfxs.reasoningModal_authRequired'), description: t('rfxs.reasoningModal_authRequiredDesc'), variant: 'destructive' });
                        return;
                      }
                      const { data: companyData, error } = await supabase
                        .from('company_revision')
                        .select('slug')
                        .eq('id', propuesta.id_company_revision)
                        .single();
                      if (error || !companyData?.slug) {
                        toast({ title: t('rfxs.reasoningModal_error'), description: t('rfxs.reasoningModal_errorLoadCompany'), variant: 'destructive' });
                        return;
                      }
                      window.open(`/suppliers/${companyData.slug}`, '_blank');
                    } catch (_err) {
                      toast({ title: t('rfxs.reasoningModal_error'), description: t('rfxs.reasoningModal_errorOpenCompany'), variant: 'destructive' });
                    }
                  }}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  {t('rfxs.reasoningModal_viewCompanyDetails')}
                </button>
                {showSaveButton && onSaveCompany && (
                  <button 
                    onClick={onSaveCompany}
                    disabled={saving}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                      isSaved 
                        ? 'border border-green-300 bg-green-50 text-green-700 hover:bg-green-100' 
                        : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    } disabled:opacity-50`}
                  >
                    {saving ? t('rfxs.reasoningModal_saving') : 
                     isSaved ? t('rfxs.reasoningModal_saved') : 
                     t('rfxs.reasoningModal_saveCompany')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedImageIndex !== null && productImages[selectedImageIndex] && (
        <Dialog open={selectedImageIndex !== null} onOpenChange={() => setSelectedImageIndex(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0 bg-black/90">
            <DialogHeader className="sr-only">
              <DialogTitle>{t('rfxs.reasoningModal_productImage', { n: selectedImageIndex + 1 })}</DialogTitle>
            </DialogHeader>
            <div className="relative w-full h-full flex items-center justify-center min-h-[60vh]">
              <button onClick={() => setSelectedImageIndex(null)} className="absolute top-4 right-4 z-10 text-white hover:text-gray-300 transition-colors">
                <X size={24} />
              </button>
              <img src={productImages[selectedImageIndex]} alt={`Product ${selectedImageIndex + 1}`} className="max-w-full max-h-[80vh] object-contain" />
              {productImages.length > 1 && (
                <>
                  <button onClick={() => setSelectedImageIndex(selectedImageIndex > 0 ? selectedImageIndex - 1 : productImages.length - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors">
                    <ChevronLeft size={32} />
                  </button>
                  <button onClick={() => setSelectedImageIndex(selectedImageIndex < productImages.length - 1 ? selectedImageIndex + 1 : 0)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors">
                    <ChevronRight size={32} />
                  </button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default PropuestaDetailsModal;


