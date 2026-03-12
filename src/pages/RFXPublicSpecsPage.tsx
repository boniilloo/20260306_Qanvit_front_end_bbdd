import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Download } from 'lucide-react';
import RFXChatSidebar from '@/components/rfx/RFXChatSidebar';
import { useRFXSpecsPDFGenerator } from '@/hooks/useRFXSpecsPDFGenerator';
import RFXSpecs from '@/components/rfx/RFXSpecs';
import { NDAPdfViewerModal } from '@/components/rfx/NDAPdfViewerModal';
import RFXFooter from '@/components/rfx/RFXFooter';
import { usePublicRFXCrypto } from '@/hooks/usePublicRFXCrypto';
import { useSidebar } from '@/components/ui/sidebar';

interface RfxInfo {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  sent_commit_id?: string | null;
}

interface SpecsData {
  description?: string;
  technical_requirements?: string;
  company_requirements?: string;
  project_timeline?: any;
  image_categories?: any;
  pdf_customization?: any;
  pdf_header_bg_color?: string | null;
  pdf_header_text_color?: string | null;
  pdf_section_header_bg_color?: string | null;
  pdf_section_header_text_color?: string | null;
  pdf_logo_url?: string | null;
  pdf_logo_bg_color?: string | null;
  pdf_logo_bg_enabled?: boolean | null;
  pdf_pages_logo_url?: string | null;
  pdf_pages_logo_bg_color?: string | null;
  pdf_pages_logo_bg_enabled?: boolean | null;
  pdf_pages_logo_use_header?: boolean | null;
}

const RFXPublicSpecsPage: React.FC = () => {
  const { id: rfxId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rfx, setRfx] = useState<RfxInfo | null>(null);
  const [specs, setSpecs] = useState<SpecsData | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  
  // Sidebar state management
  const { setOpen: setSidebarOpen, state: sidebarState } = useSidebar();
  const [sidebarWasCollapsedByUser, setSidebarWasCollapsedByUser] = useState(false);
  
  // Use public crypto hook to decrypt RFX content
  const publicCrypto = usePublicRFXCrypto(rfxId || null);
  
  // Pass publicCrypto to PDF generator so it can decrypt data for PDFs
  const { generatePDF, isGenerating } = useRFXSpecsPDFGenerator(rfxId || null, true, publicCrypto);

  useEffect(() => {
    if (!rfxId || !publicCrypto.isReady) return;

    const loadData = async () => {
      try {
        setLoading(true);

        // Verify this RFX is public
        const { data: publicData, error: publicError } = await supabase
          .from('public_rfxs' as any)
          .select('id, rfx_id')
          .eq('rfx_id', rfxId)
          .maybeSingle();

        if (publicError || !publicData) {
          toast({
            title: 'Access Denied',
            description: 'This RFX is not available as a public example.',
            variant: 'destructive',
          });
          navigate('/');
          return;
        }

        // Load RFX basic info
        const { data: rfxData, error: rfxError } = await supabase
          .from('rfxs' as any)
          .select('id, name, description, created_at, sent_commit_id')
          .eq('id', rfxId)
          .single();

        if (rfxError || !rfxData) {
          toast({
            title: 'Error',
            description: 'RFX not found',
            variant: 'destructive',
          });
          navigate('/');
          return;
        }

        setRfx(rfxData as any);

        // Load specs: prefer committed version if sent_commit_id exists
        let specsData: any = null;

        if ((rfxData as any).sent_commit_id) {
          const { data: commitData, error: commitError } = await supabase
            .from('rfx_specs_commits' as any)
            .select('description, technical_requirements, company_requirements, timeline, images, pdf_customization')
            .eq('id', (rfxData as any).sent_commit_id)
            .maybeSingle();

          if (commitError && commitError.code !== 'PGRST116') {
            console.error('Error loading RFX specs commit for public specs page:', commitError);
          } else if (commitData) {
            specsData = {
              description: commitData.description || '',
              technical_requirements: commitData.technical_requirements || '',
              company_requirements: commitData.company_requirements || '',
              project_timeline: commitData.timeline || null,
              image_categories: commitData.images || null,
              pdf_customization: commitData.pdf_customization || null,
            };
          }
        }

        // Fallback to current specs
        if (!specsData) {
          const { data: currentSpecsData, error: specsError } = await supabase
            .from('rfx_specs' as any)
            .select(
              [
                'description',
                'technical_requirements',
                'company_requirements',
                'project_timeline',
                'image_categories',
                'pdf_header_bg_color',
                'pdf_header_text_color',
                'pdf_section_header_bg_color',
                'pdf_section_header_text_color',
                'pdf_logo_url',
                'pdf_logo_bg_color',
                'pdf_logo_bg_enabled',
                'pdf_pages_logo_url',
                'pdf_pages_logo_bg_color',
                'pdf_pages_logo_bg_enabled',
                'pdf_pages_logo_use_header',
              ].join(', ')
            )
            .eq('rfx_id', rfxId)
            .maybeSingle();

          if (specsError && specsError.code !== 'PGRST116') {
            console.error('Error loading RFX specs for public specs page:', specsError);
          } else {
            specsData = currentSpecsData;
          }
        }

        if (specsData) {
          // Decrypt the specs using the public crypto hook
          const decryptedDescription = await publicCrypto.decrypt(specsData.description || '');
          const decryptedTechnicalReq = await publicCrypto.decrypt(specsData.technical_requirements || '');
          const decryptedCompanyReq = await publicCrypto.decrypt(specsData.company_requirements || '');
          const pdfCustomization = specsData.pdf_customization ?? {
            pdf_header_bg_color: specsData.pdf_header_bg_color,
            pdf_header_text_color: specsData.pdf_header_text_color,
            pdf_section_header_bg_color: specsData.pdf_section_header_bg_color,
            pdf_section_header_text_color: specsData.pdf_section_header_text_color,
            pdf_logo_url: specsData.pdf_logo_url,
            pdf_logo_bg_color: specsData.pdf_logo_bg_color,
            pdf_logo_bg_enabled: specsData.pdf_logo_bg_enabled,
            pdf_pages_logo_url: specsData.pdf_pages_logo_url,
            pdf_pages_logo_bg_color: specsData.pdf_pages_logo_bg_color,
            pdf_pages_logo_bg_enabled: specsData.pdf_pages_logo_bg_enabled,
            pdf_pages_logo_use_header: specsData.pdf_pages_logo_use_header,
          };

          setSpecs({
            description: decryptedDescription,
            technical_requirements: decryptedTechnicalReq,
            company_requirements: decryptedCompanyReq,
            project_timeline: specsData.project_timeline,
            image_categories: specsData.image_categories,
            pdf_customization: pdfCustomization,
          });

          let timelineData = specsData.project_timeline;
          if (typeof timelineData === 'string') {
            try {
              timelineData = JSON.parse(timelineData);
            } catch {
              // ignore parse error
            }
          }
          setTimeline(Array.isArray(timelineData) ? timelineData : []);
        }
      } catch (error) {
        console.error('Error loading public RFX specs:', error);
        toast({
          title: 'Error',
          description: 'Failed to load public RFX specifications',
          variant: 'destructive',
        });
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [rfxId, navigate, toast, publicCrypto.isReady]);

  // Sidebar management: collapse on mount, expand on unmount (if user didn't collapse it)
  useEffect(() => {
    // Check if sidebar was already collapsed by user before entering this page
    const wasCollapsed = sidebarState === 'collapsed';
    setSidebarWasCollapsedByUser(wasCollapsed);
    
    // Collapse sidebar when entering RFX Specs page
    if (!wasCollapsed) {
      setSidebarOpen(false);
    }

    // Cleanup function: expand sidebar when leaving (if user didn't collapse it)
    return () => {
      if (!wasCollapsed) {
        setSidebarOpen(true);
      }
    };
  }, [rfxId]); // Solo dependemos de rfxId para evitar el bucle infinito

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl w-full flex-1 flex items-center justify-center min-h-[calc(100vh-300px)]">
          <div className="flex flex-col justify-center items-center">
            <Loader2 className="h-12 w-12 animate-spin text-[#22183a] mb-4" />
            <p className="text-gray-600">Loading RFX specifications...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!rfx) {
  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl w-full flex-1 flex items-center justify-center minh-[calc(100vh-300px)]">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600">RFX not found.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
  }

  return (
    <div className="flex flex-row-reverse h-screen overflow-hidden bg-background">
      {/* RFX Assistant - read-only, shows history but no input */}
      <RFXChatSidebar
        rfxId={rfxId!}
        rfxName={rfx.name}
        rfxDescription={rfx.description || ''}
        currentSpecs={{
          description: specs?.description || '',
          technical_requirements: specs?.technical_requirements || '',
          company_requirements: specs?.company_requirements || '',
        }}
        getCurrentSpecs={() => ({
          description: specs?.description || '',
          technical_requirements: specs?.technical_requirements || '',
          company_requirements: specs?.company_requirements || '',
        })}
        onSpecsChange={() => {}}
        readOnly={true}
        publicCrypto={publicCrypto}
      />

      {/* Main Content - reuse RFXSpecs in read-only mode */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-full">
        <div className="container mx-auto px-4 py-8 max-w-5xl flex-1">
          {/* Header styled like RFXSpecsPage, but Back returns to public overview */}
          <div className="mb-6 md:mb-8 bg-gradient-to-r from-white to-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-xl shadow-sm px-4 md:px-6 py-4 md:py-5">
            <div className="flex items-start md:items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-extrabold text-black font-intro tracking-tight truncate">
                  {rfx.name} - Specifications
                </h1>
                {rfx.description && (
                  <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed max-w-3xl font-inter line-clamp-2">
                    {rfx.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => navigate(rfxId ? `/rfx-example/${rfxId}` : '/')}
                    className="bg-[#22183a] hover:bg-[#22183a]/90 text-white border-[#22183a]"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={async () => {
                      if (!rfx) return;
                      const result = await generatePDF(rfx.id, rfx.name, true); // Pass true to return blob
                      if (result instanceof Blob) {
                        const url = URL.createObjectURL(result);
                        setPdfBlobUrl(url);
                        setShowPDFModal(true);
                      }
                    }}
                    disabled={isGenerating}
                    variant="outline"
                    className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-white border-[#f4a9aa]"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generating PDF...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Generate PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Reuse full RFXSpecs component, but in read-only mode */}
          {specs && (
            <RFXSpecs
              rfxId={rfxId!}
              projectName={rfx.name}
              currentSpecs={{
                description: specs.description || '',
                technical_requirements: specs.technical_requirements || '',
                company_requirements: specs.company_requirements || '',
              }}
              onSpecsChange={() => {}}
              pendingProposals={[]}
              hiddenProposals={{ description: new Set(), technical_specifications: new Set(), company_requirements: new Set() }}
              isAutoSaving={false}
              isGeneratingProposals={false}
              isArchived={false}
              readOnly={true}
              initialTimeline={timeline}
              initialImageCategories={specs.image_categories}
              initialPdfCustomization={specs.pdf_customization}
              onPDFBlobGenerated={(blob) => {
                const url = URL.createObjectURL(blob);
                setPdfBlobUrl(url);
                setShowPDFModal(true);
              }}
              publicCrypto={publicCrypto}
            />
          )}
        </div>
        {/* Footer solo en la columna izquierda */}
        <RFXFooter />
      </div>

      {/* PDF Viewer Modal */}
      <NDAPdfViewerModal
        open={showPDFModal}
        onOpenChange={(open) => {
          setShowPDFModal(open);
          if (!open && pdfBlobUrl) {
            // Clean up blob URL when modal closes
            URL.revokeObjectURL(pdfBlobUrl);
            setPdfBlobUrl(null);
          }
        }}
        pdfUrl={pdfBlobUrl}
        title="RFX Specifications PDF"
      />
    </div>
  );
};

export default RFXPublicSpecsPage;



