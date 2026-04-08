import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2, Link2, Rocket, Sparkles, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { usePublicRFXs } from '@/hooks/usePublicRFXs';
import { useAuth } from '@/contexts/AuthContext';
import { useRFXs } from '@/hooks/useRFXs';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import { useCreateRfxWorkspace, useRfxWorkspaces } from '@/hooks/useRfxWorkspaces';
import { getRfxAgentHttpBaseUrl } from '@/utils/rfxAgentHttpBaseUrl';
import { writeRfxSpecsBootstrapToStorage } from '@/utils/rfxSpecsBootstrap';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from '@/components/ui/carousel';
import RFXFooter from '@/components/rfx/RFXFooter';
import ExampleCard from '@/components/ExampleCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';

const Home = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { userProfile } = useUserProfile();
  const { createRFX } = useRFXs();
  const createWorkspaceMutation = useCreateRfxWorkspace();
  const { data: workspaces = [], isFetching: isFetchingWorkspaces, refetch: refetchWorkspaces } = useRfxWorkspaces();
  const { publicRfxs, loading: rfxsLoading } = usePublicRFXs();
  const DEFAULT_PUBLIC_RFX_EXAMPLE_ID = 'eac78558-4c3e-4d05-847e-a954c469868a';
  const {
    data: landingStats = {
      workspacesCreated: 0,
      rfxsCreated: 0,
      companiesRecommended: 0,
      companiesConnected: 0,
    },
    isLoading: isLoadingLandingStats,
  } = useQuery({
    queryKey: ['landing-user-stats', user?.id],
    enabled: !!user && !authLoading,
    queryFn: async () => {
      const [workspaceResult, rfxResult] = await Promise.all([
        (supabase.from('rfx_workspaces' as any) as any)
          .select('id', { count: 'exact', head: true })
          .eq('owner_user_id', user!.id),
        (supabase.from('rfxs' as any) as any)
          .select('id', { count: 'exact' })
          .eq('user_id', user!.id),
      ]);

      if (workspaceResult.error) throw workspaceResult.error;
      if (rfxResult.error) throw rfxResult.error;

      const rfxRows = (rfxResult.data || []) as Array<{ id: string }>;
      const rfxIds = rfxRows.map((row) => row.id);

      if (rfxIds.length === 0) {
        return {
          workspacesCreated: workspaceResult.count || 0,
          rfxsCreated: rfxResult.count || 0,
          companiesRecommended: 0,
          companiesConnected: 0,
        };
      }

      const invitationsResult = await (supabase.from('rfx_company_invitations' as any) as any)
        .select('company_id,status')
        .in('rfx_id', rfxIds);

      if (invitationsResult.error) throw invitationsResult.error;

      const invitationRows = (invitationsResult.data || []) as Array<{ company_id: string; status: string }>;
      const connectedStatuses = new Set([
        'waiting NDA signing',
        'waiting for NDA signature validation',
        'NDA signed by supplier',
        'supplier evaluating RFX',
        'submitted',
      ]);

      const recommendedCompanies = new Set<string>();
      const connectedCompanies = new Set<string>();

      invitationRows.forEach((invitation) => {
        if (!invitation.company_id) return;
        recommendedCompanies.add(invitation.company_id);
        if (connectedStatuses.has(invitation.status)) {
          connectedCompanies.add(invitation.company_id);
        }
      });

      return {
        workspacesCreated: workspaceResult.count || 0,
        rfxsCreated: rfxResult.count || 0,
        companiesRecommended: recommendedCompanies.size,
        companiesConnected: connectedCompanies.size,
      };
    },
  });

  const [intent, setIntent] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isBootstrapRequestPending, setIsBootstrapRequestPending] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [pendingIntent, setPendingIntent] = useState('');
  const [workspaceChoice, setWorkspaceChoice] = useState<string>('none');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [intentPrompt, setIntentPrompt] = useState('');
  const [bootstrapData, setBootstrapData] = useState<{
    title: string;
    description: string;
    initialAgentPrompt: string;
  } | null>(null);
  const bootstrapPromiseRef = useRef<Promise<{
    title: string;
    description: string;
    initialAgentPrompt: string;
  }> | null>(null);
  const bootstrapRequestIdRef = useRef(0);
  const intentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastPromptSourceKeyRef = useRef<string>('');

  const adjustIntentTextareaHeight = (target?: HTMLTextAreaElement | null) => {
    const textarea = target ?? intentTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const computedStyles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyles.lineHeight) || 20;
    const verticalPadding = Number.parseFloat(computedStyles.paddingTop) + Number.parseFloat(computedStyles.paddingBottom);
    const minHeight = lineHeight * 2 + verticalPadding;
    const maxHeight = lineHeight * 3 + verticalPadding;
    const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    adjustIntentTextareaHeight();
  }, [intent]);

  const userDisplayName = (userProfile?.name || '').trim();

  useEffect(() => {
    const hasName = userDisplayName.length > 0;
    const variantsKey = hasName ? 'landing.intentLabelVariants' : 'landing.intentLabelVariantsAnonymous';
    const defaultKey = hasName ? 'landing.intentLabel' : 'landing.intentLabelAnonymousDefault';
    const sourceKey = `${i18n.language}|${hasName ? `named:${userDisplayName}` : 'anonymous'}`;

    if (lastPromptSourceKeyRef.current === sourceKey && intentPrompt) return;

    const promptOptionsRaw = t(variantsKey, {
      returnObjects: true,
      name: userDisplayName,
    });

    const promptOptions = Array.isArray(promptOptionsRaw)
      ? promptOptionsRaw.filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
      : [t(defaultKey, { name: userDisplayName })];

    if (promptOptions.length === 0) {
      setIntentPrompt(t(defaultKey, { name: userDisplayName }));
      lastPromptSourceKeyRef.current = sourceKey;
      return;
    }

    setIntentPrompt(promptOptions[Math.floor(Math.random() * promptOptions.length)]);
    lastPromptSourceKeyRef.current = sourceKey;
  }, [t, i18n.language, userDisplayName, intentPrompt]);

  const startBootstrapRequest = (intentValue: string) => {
    return (async () => {
      const base = getRfxAgentHttpBaseUrl();
      const res = await fetch(`${base}/api/rfxs/bootstrap-from-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: intentValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'bootstrap_failed');
      }

      const title = String(data.title || '').trim();
      const description = String(data.description || '').trim();
      const initialAgentPrompt = String(data.initialAgentPrompt || '').trim();
      if (!title || !initialAgentPrompt) {
        throw new Error('invalid_payload');
      }

      return { title, description, initialAgentPrompt };
    })();
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = intent.trim();
    if (trimmed.length < 3) {
      toast({
        title: t('rfxs.error'),
        description: t('landing.intentTooShort'),
        variant: 'destructive',
      });
      return;
    }
    if (!user) {
      navigate('/auth');
      return;
    }
    if (isBootstrapping || isBootstrapRequestPending) return;

    setPendingIntent(trimmed);
    setWorkspaceChoice('none');
    setNewWorkspaceName('');
    setBootstrapData(null);
    void refetchWorkspaces();
    const requestId = ++bootstrapRequestIdRef.current;
    setIsBootstrapRequestPending(true);
    const requestPromise = startBootstrapRequest(trimmed);
    bootstrapPromiseRef.current = requestPromise;
    requestPromise
      .then((payload) => {
        if (bootstrapRequestIdRef.current !== requestId) return;
        setBootstrapData(payload);
      })
      .catch(() => {
        if (bootstrapRequestIdRef.current !== requestId) return;
        setBootstrapData(null);
      })
      .finally(() => {
        if (bootstrapRequestIdRef.current !== requestId) return;
        setIsBootstrapRequestPending(false);
      });
    setIsWorkspaceModalOpen(true);
  };

  const handleWorkspaceAndBootstrap = async () => {
    if (!pendingIntent.trim()) return;

    let workspaceId: string | null = null;

    if (workspaceChoice === 'new') {
      const trimmedWorkspace = newWorkspaceName.trim();
      if (!trimmedWorkspace) {
        toast({
          title: t('rfxs.error'),
          description: t('rfxs.workspaceNameRequired'),
          variant: 'destructive',
        });
        return;
      }
      try {
        const createdWorkspace = await createWorkspaceMutation.mutateAsync(trimmedWorkspace);
        workspaceId = createdWorkspace.id;
      } catch (error: any) {
        toast({
          title: t('rfxs.error'),
          description: error?.message || t('rfxs.workspaceCreateFailed'),
          variant: 'destructive',
        });
        return;
      }
    } else if (workspaceChoice !== 'none') {
      workspaceId = workspaceChoice;
    }

    setIsWorkspaceModalOpen(false);

    let resolved = bootstrapData;
    if (!resolved) {
      const pendingBootstrapPromise = bootstrapPromiseRef.current;
      if (!pendingBootstrapPromise) {
        toast({
          title: t('rfxs.error'),
          description: t('landing.intentBootstrapError'),
          variant: 'destructive',
        });
        return;
      }
      setIsBootstrapping(true);
      try {
        resolved = await pendingBootstrapPromise;
      } catch {
        toast({
          title: t('rfxs.error'),
          description: t('landing.intentBootstrapError'),
          variant: 'destructive',
        });
        return;
      } finally {
        setIsBootstrapping(false);
      }
    }

    if (!resolved) {
      toast({
        title: t('rfxs.error'),
        description: t('landing.intentBootstrapError'),
        variant: 'destructive',
      });
      return;
    }

    const created = await createRFX({
      name: resolved.title,
      description: resolved.description || undefined,
      workspace_id: workspaceId,
    });
    if (!created?.id) {
      return;
    }

    writeRfxSpecsBootstrapToStorage(created.id, resolved.initialAgentPrompt);
    navigate(`/rfxs/specs/${created.id}`, {
      state: { bootstrapInitialPrompt: resolved.initialAgentPrompt },
    });
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col min-h-full">
      <Dialog open={isBootstrapping} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#22183a]">
              <Loader2 className="h-5 w-5 animate-spin text-[#f4a9aa] shrink-0" />
              {t('landing.bootstrapModalTitle')}
            </DialogTitle>
            <DialogDescription className="text-base text-gray-700 pt-1">
              {t('landing.bootstrapModalDescription')}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isWorkspaceModalOpen}
        onOpenChange={(open) => {
          if (isBootstrapping) return;
          setIsWorkspaceModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('landing.workspaceModalTitle')}</DialogTitle>
            <DialogDescription>{t('landing.workspaceModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label>{t('rfxs.pickWorkspaceLabel')}</Label>
            {isFetchingWorkspaces ? (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('rfxs.loadingWorkspaces')}
              </div>
            ) : (
              <RadioGroup value={workspaceChoice} onValueChange={setWorkspaceChoice} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="none" id="home-workspace-none" />
                  <Label htmlFor="home-workspace-none" className="cursor-pointer">
                    {t('rfxs.rfxNoWorkspaceOption')}
                  </Label>
                </div>
                {workspaces.map((workspace) => (
                  <div key={workspace.id} className="flex items-center space-x-2">
                    <RadioGroupItem value={workspace.id} id={`home-workspace-${workspace.id}`} />
                    <Label htmlFor={`home-workspace-${workspace.id}`} className="cursor-pointer">
                      {workspace.name}
                    </Label>
                  </div>
                ))}
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="home-workspace-new" />
                  <Label htmlFor="home-workspace-new" className="cursor-pointer">
                    {t('landing.workspaceModalCreateNew')}
                  </Label>
                </div>
              </RadioGroup>
            )}
            {workspaceChoice === 'new' && (
              <div className="space-y-2">
                <Label htmlFor="home-new-workspace-name">{t('rfxs.workspaceNameLabel')}</Label>
                <Input
                  id="home-new-workspace-name"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder={t('rfxs.workspaceNamePlaceholder')}
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsWorkspaceModalOpen(false)}
              disabled={isBootstrapping || createWorkspaceMutation.isPending}
            >
              {t('rfxs.cancel')}
            </Button>
            <Button
              type="button"
              className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              onClick={() => void handleWorkspaceAndBootstrap()}
              disabled={isFetchingWorkspaces || isBootstrapping || createWorkspaceMutation.isPending}
            >
              {(isBootstrapping || createWorkspaceMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('landing.intentSubmitting')}
                </>
              ) : (
                t('landing.workspaceModalContinue')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="w-full relative overflow-hidden flex flex-col items-center justify-center flex-1">
        <div className="w-full px-4 sm:px-6 py-8 sm:py-12 relative z-10 flex flex-col items-center justify-center">
          {/* Simplified Header */}
          <div className="text-center mb-0 max-w-4xl mx-auto w-full">
            <h1 className="text-[2rem] font-bold text-[#22183a] mb-4 leading-tight">
              {t('landing.title')}{' '}
              <span className="text-[#f4a9aa]">{t('landing.titleHighlight')}</span>
            </h1>
            <p className="text-base text-[#6b7280] font-normal max-w-3xl mx-auto mb-6">
              {t('landing.subtitle')}
            </p>

            {/* Intent → RFX bootstrap */}
            <form
              onSubmit={handleBootstrapSubmit}
              className="max-w-2xl mx-auto w-full text-left mb-0 space-y-3"
            >
              <Label htmlFor="home-rfx-intent" className="block text-center text-2xl sm:text-3xl font-bold text-[#22183a] leading-tight">
                {intentPrompt}
              </Label>
              <div className="flex flex-col gap-3">
                <Textarea
                  ref={intentTextareaRef}
                  id="home-rfx-intent"
                  value={intent}
                  onChange={(e) => {
                    setIntent(e.target.value);
                    adjustIntentTextareaHeight(e.currentTarget);
                  }}
                  placeholder={t('landing.intentPlaceholder')}
                  rows={2}
                  className="resize-none flex-1 rounded-[12px] border-[1.5px] border-[#e8d5f0] bg-[#f1e8f4] focus-visible:ring-[#f4a9aa] font-['Sora']"
                  disabled={isBootstrapping || authLoading}
                  maxLength={8000}
                />
                <div className="flex justify-center">
                  <Button
                    type="submit"
                    disabled={isBootstrapping || isBootstrapRequestPending || authLoading || intent.trim().length < 3}
                    className="h-12 border-0 rounded-[8px] px-6 py-3 bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-[#22183a] font-semibold whitespace-nowrap"
                  >
                    {isBootstrapping ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('landing.intentSubmitting')}
                      </>
                    ) : (
                      t('landing.intentSubmit')
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                {!user && !authLoading && (
                  <p className="text-sm text-gray-600">{t('landing.intentLoginToContinue')}</p>
                )}
              </div>
            </form>

          </div>

          {/* RFX Agent Section (hidden for now, kept for future re-enable) */}
          <div className="max-w-4xl mx-auto mt-4 px-4 w-full hidden">
          <Card className="border border-gray-300 shadow-sm">
            <CardContent className="p-6">
              <div className="text-center md:text-left mb-4">
                <h2 className="text-2xl sm:text-3xl font-bold text-[#22183a] mb-2 flex items-center gap-2 justify-center md:justify-start">
                  <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-[#f4a9aa]" />
                  {t('landing.rfxAgent')}
                </h2>
                <p className="text-base sm:text-lg text-gray-600">
                  {t('landing.rfxAgentDesc')}
                </p>
              </div>
              
              {rfxsLoading && publicRfxs.length === 0 ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-4 space-y-3">
                        <div className="w-32 h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="w-full h-4 bg-gray-200 rounded animate-pulse" />
                        <div className="w-3/4 h-4 bg-gray-200 rounded animate-pulse" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : publicRfxs.length > 0 ? (
                <Carousel
                  opts={{
                    align: 'start',
                    loop: true,
                  }}
                  className="w-full relative"
                >
                  <CarouselContent className="-ml-2">
                    {publicRfxs.map((pr) => (
                      <CarouselItem
                        key={pr.id}
                        className="pl-2 basis-full sm:basis-1/2 md:basis-1/3"
                      >
                        <ExampleCard
                          title={pr.title || pr.rfx?.name || t('landing.rfxExample')}
                          description={pr.description || pr.rfx?.description}
                          imageUrl={pr.image_url}
                          fallbackIcon={<FileText className="w-5 h-5 text-white" />}
                          fallbackGradient="bg-gradient-to-br from-[#f4a9aa] to-[#f4a9aa]"
                          createdAt={new Date(pr.rfx?.created_at || pr.created_at)}
                          badge={{
                            label: t('landing.example'),
                            variant: 'outline',
                            className: 'text-xs bg-blue-50 border-blue-200 text-blue-700'
                          }}
                          onClick={() => {
                            const targetId = pr.rfx ? pr.rfx_id : DEFAULT_PUBLIC_RFX_EXAMPLE_ID;
                            navigate(`/rfx-example/${targetId}`);
                          }}
                        />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="left-0" />
                  <CarouselNext className="right-0" />
                </Carousel>
              ) : null}
            </CardContent>
          </Card>
          </div>

          <div className="max-w-4xl mx-auto mt-6 px-4 w-full">
            <Card className="border border-gray-300 shadow-sm">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
                  {isLoadingLandingStats ? (
                    [1, 2, 3, 4].map((item) => (
                      <div key={item} className="rounded-lg border border-gray-200 p-4 min-h-[116px] flex flex-col justify-between">
                        <div className="h-5 w-5 bg-gray-200 rounded animate-pulse" />
                        <div className="h-9 w-16 bg-gray-200 rounded animate-pulse" />
                        <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="rounded-lg border border-gray-200 p-4 min-h-[116px] flex flex-col justify-between bg-white">
                        <Target className="h-5 w-5 text-[#f4a9aa]" />
                        {landingStats.workspacesCreated === 0 ? (
                          <button
                            type="button"
                            className="mt-2 text-left text-sm font-semibold text-[#f4a9aa] hover:underline"
                            onClick={() => navigate('/rfxs')}
                          >
                            {t('landing.firstChallengeCta')}
                          </button>
                        ) : (
                          <p className="text-[2rem] font-bold text-[#22183a] leading-none mt-2 tabular-nums">{landingStats.workspacesCreated}</p>
                        )}
                        <p className="text-xs font-normal text-[#9ca3af] leading-snug mt-2">{t('landing.workspacesCreated')}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 min-h-[116px] flex flex-col justify-between bg-white">
                        <Rocket className="h-5 w-5 text-[#f4a9aa]" />
                        <p className="text-[2rem] font-bold text-[#22183a] leading-none mt-2 tabular-nums">{landingStats.rfxsCreated}</p>
                        <p className="text-xs font-normal text-[#9ca3af] leading-snug mt-2">{t('landing.rfxsCreated')}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 min-h-[116px] flex flex-col justify-between bg-white">
                        <Sparkles className="h-5 w-5 text-[#f4a9aa]" />
                        {landingStats.companiesRecommended === 0 ? (
                          <button
                            type="button"
                            className="mt-2 text-left text-sm font-semibold text-[#f4a9aa] hover:underline"
                            onClick={() => navigate('/supplier-search')}
                          >
                            {t('landing.discoverStartupsCta')}
                          </button>
                        ) : (
                          <p className="text-[2rem] font-bold text-[#22183a] leading-none mt-2 tabular-nums">{landingStats.companiesRecommended}</p>
                        )}
                        <p className="text-xs font-normal text-[#9ca3af] leading-snug mt-2">{t('landing.companiesRecommended')}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-4 min-h-[116px] flex flex-col justify-between bg-white">
                        <Link2 className="h-5 w-5 text-[#f4a9aa]" />
                        {landingStats.companiesConnected === 0 ? (
                          <button
                            type="button"
                            className="mt-2 text-left text-sm font-semibold text-[#f4a9aa] hover:underline"
                            onClick={() => navigate('/rfxs')}
                          >
                            {t('landing.connectNowCta')}
                          </button>
                        ) : (
                          <p className="text-[2rem] font-bold text-[#22183a] leading-none mt-2 tabular-nums">{landingStats.companiesConnected}</p>
                        )}
                        <p className="text-xs font-normal text-[#9ca3af] leading-snug mt-2">{t('landing.companiesConnected')}</p>
                      </div>
                    </>
                  )}
                </div>
                {!isLoadingLandingStats && landingStats.rfxsCreated === 0 && (
                  <div className="mt-6 rounded-xl border border-[#e8d5f0] bg-[#fdf9fe] p-5 text-center">
                    <div className="text-2xl mb-2">🚀</div>
                    <h3 className="text-xl font-bold text-[#22183a]">{t('landing.emptyStateTitle')}</h3>
                    <p className="text-sm text-[#6b7280] mt-1">{t('landing.emptyStateDescription')}</p>
                    <div className="mt-4">
                      <Button
                        type="button"
                        onClick={() => navigate('/rfxs')}
                        className="border-0 rounded-[8px] px-6 py-3 bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-[#22183a] font-semibold"
                      >
                        {t('landing.emptyStateCta')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <RFXFooter />
    </div>
  );
};

export default Home;
