import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Sparkles, Calendar } from 'lucide-react';
import RFXTodoList from '@/components/rfx/RFXTodoList';
import NextStep from '@/components/rfx/NextStep';
import { usePublicRFXCrypto } from '@/hooks/usePublicRFXCrypto';

interface PublicRfxMeta {
  id: string;
  rfx_id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  is_featured: boolean;
}

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
}

const RFXPublicExample: React.FC = () => {
  const { id: rfxId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const DEFAULT_PUBLIC_RFX_EXAMPLE_ID = 'eac78558-4c3e-4d05-847e-a954c469868a';

  const [meta, setMeta] = useState<PublicRfxMeta | null>(null);
  const [rfx, setRfx] = useState<RfxInfo | null>(null);
  const [specs, setSpecs] = useState<SpecsData | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTodoItem, setSelectedTodoItem] = useState<string | undefined>(undefined);
  
  // Use public crypto hook to decrypt RFX content
  const publicCrypto = usePublicRFXCrypto(rfxId || null);

  // Listen for onboarding events to select items programmatically
  useEffect(() => {
    const handleOnboardingSelectItem = (event: CustomEvent) => {
      const itemId = event.detail?.itemId;
      if (itemId) {
        setSelectedTodoItem(itemId);
      }
    };

    window.addEventListener('onboarding-select-item', handleOnboardingSelectItem as EventListener);
    return () => {
      window.removeEventListener('onboarding-select-item', handleOnboardingSelectItem as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!rfxId || !publicCrypto.isReady) return;

    const loadData = async () => {
      try {
        setLoading(true);

        // Verify this RFX is public and get metadata
        const { data: publicData, error: publicError } = await supabase
          .from('public_rfxs' as any)
          .select('id, rfx_id, title, description, category, is_featured')
          .eq('rfx_id', rfxId)
          .maybeSingle();

        if (publicError || !publicData) {
          toast({
            title: 'Access Denied',
            description: 'This RFX is not available as a public example.',
            variant: 'destructive',
          });
          if (rfxId && rfxId !== DEFAULT_PUBLIC_RFX_EXAMPLE_ID) {
            navigate(`/rfx-example/${DEFAULT_PUBLIC_RFX_EXAMPLE_ID}`, { replace: true });
          } else {
            navigate('/');
          }
          return;
        }

        setMeta(publicData as any);

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
          if (rfxId && rfxId !== DEFAULT_PUBLIC_RFX_EXAMPLE_ID) {
            navigate(`/rfx-example/${DEFAULT_PUBLIC_RFX_EXAMPLE_ID}`, { replace: true });
          } else {
            navigate('/');
          }
          return;
        }

        setRfx(rfxData as any);

        // Load specs: prefer committed version if sent_commit_id exists
        let specsData: any = null;

        if ((rfxData as any).sent_commit_id) {
          const { data: commitData, error: commitError } = await supabase
            .from('rfx_specs_commits' as any)
            .select('description, technical_requirements, company_requirements, timeline')
            .eq('id', (rfxData as any).sent_commit_id)
            .maybeSingle();

          if (commitError && commitError.code !== 'PGRST116') {
            console.error('Error loading RFX specs commit for public example:', commitError);
          } else if (commitData) {
            specsData = {
              description: commitData.description || '',
              technical_requirements: commitData.technical_requirements || '',
              company_requirements: commitData.company_requirements || '',
              project_timeline: commitData.timeline || null,
            };
          }
        }

        // Fallback to current specs
        if (!specsData) {
          const { data: currentSpecsData, error: specsError } = await supabase
            .from('rfx_specs' as any)
            .select('description, technical_requirements, company_requirements, project_timeline')
            .eq('rfx_id', rfxId)
            .maybeSingle();

          if (specsError && specsError.code !== 'PGRST116') {
            console.error('Error loading RFX specs for public example:', specsError);
          } else {
            specsData = currentSpecsData;
          }
        }

        if (specsData) {
          // Decrypt the specs using the public crypto hook
          const decryptedDescription = await publicCrypto.decrypt(specsData.description || '');
          const decryptedTechnicalReq = await publicCrypto.decrypt(specsData.technical_requirements || '');
          const decryptedCompanyReq = await publicCrypto.decrypt(specsData.company_requirements || '');

          setSpecs({
            description: decryptedDescription,
            technical_requirements: decryptedTechnicalReq,
            company_requirements: decryptedCompanyReq,
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

        // Increment public view count (best-effort)
        try {
          await supabase.rpc('increment_public_rfx_view_count', { p_rfx_id: rfxId });
        } catch (viewError) {
          console.error('Error incrementing public RFX view count:', viewError);
        }
      } catch (error) {
        console.error('Error loading public RFX example:', error);
        toast({
          title: 'Error',
          description: 'Failed to load public RFX example',
          variant: 'destructive',
        });
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [rfxId, navigate, toast, publicCrypto.isReady]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl w-full flex-1 flex items-center justify-center min-h-[calc(100vh-300px)]">
          <div className="flex flex-col justify-center items-center">
            <Loader2 className="h-12 w-12 animate-spin text-[#22183a] mb-4" />
            <p className="text-gray-600">Loading public RFX example...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!meta || !rfx) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl w-full flex-1 flex items-center justify-center min-h-[calc(100vh-300px)]">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-600">Public RFX example not found.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col min-h-full bg-background">
      <div className="container mx-auto px-4 py-8 flex-1">
        <div className="max-w-7xl mx-auto">
        {/* Header - similar to RFXDetail */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-white to-[#f1f1f1] border-l-4 border-l-[#f4a9aa] rounded-xl shadow-sm px-4 md:px-6 py-4 md:py-5">
            <div className="flex items-start md:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-[#f4a9aa]" />
                  <Badge variant="outline" className="text-xs bg-white border-[#f4a9aa] text-[#22183a]">
                    Public RFX Example
                  </Badge>
                  {meta.is_featured && (
                    <Badge className="bg-[#f4a9aa] text-[#22183a] text-xs">Featured</Badge>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#22183a] font-intro tracking-tight mb-1">
                  {meta.title || rfx.name}
                </h1>
                {meta.description && (
                  <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed max-w-3xl font-inter">
                    {meta.description}
                  </p>
                )}
                {!meta.description && rfx.description && (
                  <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed max-w-3xl font-inter">
                    {rfx.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      Created on{' '}
                      {new Date(rfx.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  {meta.category && (
                    <Badge variant="secondary" className="text-xs">
                      {meta.category}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="bg-[#22183a] hover:bg-[#22183a]/90 text-white border-[#22183a]"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress & Next Step section - similar to RFXDetail overview */}
        <div className="space-y-6 mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-[40%_calc(60%-1.5rem)] gap-6">
            {/* Left: RFX Progress steps */}
            <RFXTodoList
              specsCompletion={{
                description: !!specs?.description?.trim(),
                technical_requirements: !!specs?.technical_requirements?.trim(),
                company_requirements: !!specs?.company_requirements?.trim(),
              }}
              candidatesCompletion={false}
              candidatesProgress={{
                hasEvaluationResults: false,
                hasSelectedCandidates: false,
              }}
              activeItem={selectedTodoItem}
              onItemClick={(itemId) =>
                setSelectedTodoItem((current) => (current === itemId ? undefined : itemId))
              }
              forceAllCompleted={true}
            />

            {/* Right: Next Step details card */}
            <NextStep
              specsCompletion={{
                description: !!specs?.description?.trim(),
                technical_requirements: !!specs?.technical_requirements?.trim(),
                company_requirements: !!specs?.company_requirements?.trim(),
              }}
              candidatesCompletion={false}
              candidatesProgress={{
                hasEvaluationResults: false,
                hasSelectedCandidates: false,
              }}
              onGoToSpecs={() => rfxId && navigate(`/rfx-example/specs/${rfxId}`)}
              onGoToCandidates={() => rfxId && navigate(`/rfx-example/candidates/${rfxId}`)}
              onGoToWorkflow={() => rfxId && navigate(`/rfx-example/startups_workflow/${rfxId}`)}
              rfxId={rfxId}
              selectedItem={selectedTodoItem}
              forceButtonsEnabled={true}
            />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default RFXPublicExample;


