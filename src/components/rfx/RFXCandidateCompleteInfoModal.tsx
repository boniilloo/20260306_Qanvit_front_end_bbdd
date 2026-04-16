import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Propuesta } from '@/types/chat';
import { useRFXCandidateEnrichmentController } from '@/hooks/useRFXCandidateEnrichmentController';
import type { EnrichmentSnapshotRecord } from '@/types/rfxEnrichment';
import { supabase } from '@/integrations/supabase/client';
import FaviconLogo from '@/components/ui/FaviconLogo';

interface RFXCandidateCompleteInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfxId: string;
  candidate: (Propuesta & { company_id?: string }) | null;
  onSnapshotUpdated?: (snapshot: EnrichmentSnapshotRecord) => void;
  onBootstrapStateChange?: (state: {
    companyId: string;
    status: 'loading' | 'completed' | 'error';
    reason?: string;
  }) => void;
  initialSection?: 'news' | 'employees' | 'financials' | 'investment_rounds' | null;
}

interface LegacyCompanyNews {
  id: string;
  title: string | null;
  url: string | null;
  source: string | null;
  time: string | null;
  snippet: string | null;
  scraped_at: string;
  related: string | boolean | null;
}

interface LegacyLinkedInPerson {
  id: string;
  person_name: string;
  person_title: string | null;
  linkedin_profile_url: string | null;
  employee_count_linkedin: number | null;
}

interface DisplayNewsItem {
  id: string;
  title: string | null;
  url: string | null;
  source: string | null;
  time: string | null;
  related?: string | boolean | null;
}

function stageLabelToText(label?: string) {
  if (!label) return 'No clasificada';
  if (label === 'preseed') return 'Preseed';
  if (label === 'startup') return 'Startup';
  if (label === 'scaleup') return 'Scaleup';
  if (label === 'empresa_consolidada') return 'Empresa consolidada';
  return label;
}

function isLikelyUrl(value?: string | null): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

function formatRevenueKeyValue(payload: EnrichmentSnapshotRecord['enrichment_payload'] | undefined): string {
  const revenues = payload?.financials?.revenues || [];
  if (revenues.length === 0) return 'N/D';
  const firstWithCompact = revenues.find((entry) => entry?.compact_display && entry.compact_display.trim().length > 0);
  if (firstWithCompact?.compact_display) return firstWithCompact.compact_display;
  const newest = [...revenues].sort((a, b) => Number(b?.year || 0) - Number(a?.year || 0))[0];
  const amount = newest?.amount || 'N/D';
  const currency = newest?.currency ? ` ${newest.currency}` : '';
  const year = newest?.year ? ` (${newest.year})` : '';
  return `${amount}${currency}${year}`.trim();
}

function getNewsRelatedStatus(related: string | boolean | null | undefined): 'related' | 'unrelated' | 'not_classified' {
  if (related === null || related === undefined) return 'not_classified';
  if (typeof related === 'boolean') return related ? 'related' : 'unrelated';
  const normalized = String(related).trim().toLowerCase();
  if (!normalized) return 'not_classified';
  if (['true', 't', '1', 'yes', 'y', 'related'].includes(normalized)) return 'related';
  if (['false', 'f', '0', 'no', 'n', 'unrelated'].includes(normalized)) return 'unrelated';
  return 'not_classified';
}

function getNewsRelatedBadgeClass(status: ReturnType<typeof getNewsRelatedStatus>): string {
  if (status === 'related') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'unrelated') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

const RFXCandidateCompleteInfoModal: React.FC<RFXCandidateCompleteInfoModalProps> = ({
  open,
  onOpenChange,
  rfxId,
  candidate,
  onSnapshotUpdated,
  onBootstrapStateChange,
  initialSection = null,
}) => {
  const [legacyNews, setLegacyNews] = useState<LegacyCompanyNews[]>([]);
  const [legacyPeople, setLegacyPeople] = useState<LegacyLinkedInPerson[]>([]);
  const [isLoadingLegacyData, setIsLoadingLegacyData] = useState(false);
  const [visibleNewsCount, setVisibleNewsCount] = useState(3);
  const newsSectionRef = useRef<HTMLElement | null>(null);
  const employeesSectionRef = useRef<HTMLElement | null>(null);
  const financialsSectionRef = useRef<HTMLElement | null>(null);
  const investmentRoundsSectionRef = useRef<HTMLElement | null>(null);
  const controller = useRFXCandidateEnrichmentController({
    rfxId,
    companyId: String(candidate?.company_id || ''),
    idCompanyRevision: candidate?.id_company_revision,
    idProductRevision: candidate?.id_product_revision,
    companyName: candidate?.empresa,
    website: candidate?.website,
    onSnapshotUpdated,
    onBootstrapStateChange,
  });

  const payload = controller.snapshot?.enrichment_payload;
  const hasPayload = Boolean(payload);
  const isCompanyReady = Boolean(candidate?.company_id);
  const sectionState = useMemo(
    () => ({
      founded: payload?.founded_year?.value,
      newsCount: payload?.news?.new_candidates?.length || 0,
      keyPeopleCount: payload?.employees?.key_people?.length || 0,
      roundsCount: payload?.investment_rounds?.length || 0,
      revenuesCount: payload?.financials?.revenues?.length || 0,
      stage: payload?.stage_classification?.label,
    }),
    [payload]
  );
  const keyRevenue = useMemo(() => formatRevenueKeyValue(payload), [payload]);
  const keyEmployees = useMemo(() => {
    const estimated = payload?.employees?.estimated_count;
    if (estimated !== null && estimated !== undefined) return String(estimated);
    const legacyEstimated = legacyPeople[0]?.employee_count_linkedin;
    if (legacyEstimated !== null && legacyEstimated !== undefined) return `${legacyEstimated} (LinkedIn)`;
    return 'N/D';
  }, [legacyPeople, payload]);
  const preferredNews = useMemo<DisplayNewsItem[]>(() => {
    const newCandidates = (payload?.news?.new_candidates || []).map((news, index) => ({
      id: `new-${index}-${news.url || news.title || 'news'}`,
      title: news.title || null,
      url: news.url || null,
      source: news.source || null,
      time: news.published_at || null,
      related: null,
    }));
    if (newCandidates.length > 0) return newCandidates;
    return legacyNews.map((news) => ({
      id: `legacy-${news.id}`,
      title: news.title || null,
      url: news.url || null,
      source: news.source || null,
      time: news.time || null,
      related: news.related,
    }));
  }, [legacyNews, payload?.news?.new_candidates]);
  const showingLegacyNews = useMemo(
    () => (payload?.news?.new_candidates || []).length === 0 && preferredNews.length > 0,
    [payload?.news?.new_candidates, preferredNews.length]
  );

  const sectionRefsByKey = useMemo(
    () => ({
      news: newsSectionRef,
      employees: employeesSectionRef,
      financials: financialsSectionRef,
      investment_rounds: investmentRoundsSectionRef,
    }),
    []
  );

  const scrollToSection = (sectionId: string) => {
    const sectionById: Record<string, HTMLElement | null> = {
      'complete-info-news-section': newsSectionRef.current,
      'complete-info-employees-section': employeesSectionRef.current,
      'complete-info-financials-section': financialsSectionRef.current,
      'complete-info-investment-rounds-section': investmentRoundsSectionRef.current,
    };
    const section = sectionById[sectionId] || document.getElementById(sectionId);
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!open || !initialSection) return;
    const targetSectionRef = sectionRefsByKey[initialSection];
    if (!targetSectionRef) return;

    let cancelled = false;
    let retryTimeout: number | null = null;
    let attempts = 0;
    const maxAttempts = 20;
    let rafFirst = 0;
    let rafSecond = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const section = targetSectionRef.current;
      if (section) {
        section.scrollIntoView({
          behavior: attempts === 0 ? 'auto' : 'smooth',
          block: 'start',
        });
        return;
      }
      if (attempts >= maxAttempts) return;
      attempts += 1;
      retryTimeout = window.setTimeout(tryScroll, 60);
    };

    rafFirst = window.requestAnimationFrame(() => {
      rafSecond = window.requestAnimationFrame(() => {
        tryScroll();
      });
    });

    return () => {
      cancelled = true;
      if (retryTimeout !== null) {
        window.clearTimeout(retryTimeout);
      }
      if (rafFirst) window.cancelAnimationFrame(rafFirst);
      if (rafSecond) window.cancelAnimationFrame(rafSecond);
    };
  }, [initialSection, open, sectionRefsByKey]);

  useEffect(() => {
    const companyId = String(candidate?.company_id || '');
    if (!open || !companyId) {
      setLegacyNews([]);
      setLegacyPeople([]);
      return;
    }

    let cancelled = false;
    const loadLegacyData = async () => {
      setIsLoadingLegacyData(true);
      try {
        const [newsResponse, peopleResponse] = await Promise.all([
          (supabase as any)
            .from('company_news' as any)
            .select('id, title, url, source, time, snippet, scraped_at, related')
            .eq('company_id', companyId)
            .order('scraped_at', { ascending: false })
            .limit(10),
          (supabase as any)
            .from('linkedin_company_people' as any)
            .select('id, person_name, person_title, linkedin_profile_url, employee_count_linkedin')
            .eq('company_id', companyId)
            .order('person_name', { ascending: true })
            .limit(20),
        ]);

        if (cancelled) return;
        setLegacyNews((newsResponse.data || []) as LegacyCompanyNews[]);
        setLegacyPeople((peopleResponse.data || []) as LegacyLinkedInPerson[]);
      } catch {
        if (!cancelled) {
          setLegacyNews([]);
          setLegacyPeople([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingLegacyData(false);
        }
      }
    };

    void loadLegacyData();
    return () => {
      cancelled = true;
    };
  }, [candidate?.company_id, open]);

  /**
   * When opening the modal right after auto/manual enrichment, backend persistence can land a bit later.
   * Retry snapshot loading briefly so users see data without refreshing the page.
   */
  useEffect(() => {
    const hasSnapshotPayload =
      !!controller.snapshot?.enrichment_payload &&
      Object.keys(controller.snapshot.enrichment_payload).length > 0;
    if (!open || !isCompanyReady || hasSnapshotPayload) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6;
    let retryTimer: number | null = null;

    const retryLoadSnapshot = async () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts += 1;
      await controller.reloadSnapshot();
      if (cancelled || attempts >= maxAttempts) return;
      retryTimer = window.setTimeout(() => {
        void retryLoadSnapshot();
      }, 350);
    };

    void retryLoadSnapshot();
    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [open, isCompanyReady, controller.reloadSnapshot, controller.snapshot]);

  useEffect(() => {
    setVisibleNewsCount(3);
  }, [candidate?.company_id, open, preferredNews.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-[#22183a]">
            <span className="text-[#f4a9aa] text-xl">Qanvit Enrichment</span> {candidate?.empresa || 'Candidato'}
          </DialogTitle>
        </DialogHeader>

        {!isCompanyReady && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Este candidato no tiene `company_id` disponible, por lo que no se puede ejecutar el enriquecimiento todavía.
          </div>
        )}

        {controller.connectionError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {controller.connectionError}
          </div>
        )}

        <div className="space-y-4">
          <section className="rounded-lg border p-4">
            <h3 className="text-sm font-semibold mb-3">Datos clave</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => scrollToSection('complete-info-financials-section')}
                className="text-left rounded-md border border-[#f4a9aa]/50 bg-[#f4a9aa]/15 p-3 hover:bg-[#f4a9aa]/25 transition-colors"
              >
                <p className="text-xs text-gray-500">Facturación</p>
                <p className="text-sm font-semibold text-[#22183a]">{keyRevenue}</p>
              </button>
              <div className="rounded-md border border-[#f4a9aa]/50 bg-[#f4a9aa]/15 p-3">
                <p className="text-xs text-gray-500">Año de fundación</p>
                <p className="text-sm font-semibold text-[#22183a]">{sectionState.founded || 'N/D'}</p>
              </div>
              <button
                type="button"
                onClick={() => scrollToSection('complete-info-employees-section')}
                className="text-left rounded-md border border-[#f4a9aa]/50 bg-[#f4a9aa]/15 p-3 hover:bg-[#f4a9aa]/25 transition-colors"
              >
                <p className="text-xs text-gray-500">Empleados</p>
                <p className="text-sm font-semibold text-[#22183a]">{keyEmployees}</p>
              </button>
            </div>
          </section>

          <section id="complete-info-news-section" ref={newsSectionRef} className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">Clasificación:</h3>
              <span className="inline-flex items-center rounded-full border border-[#f4a9aa] bg-[#22183a] px-3 py-1 text-sm font-semibold text-[#f4a9aa]">
                {hasPayload ? stageLabelToText(sectionState.stage) : 'Sin clasificar'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {payload?.stage_classification?.reasoning || 'Sin razonamiento todavía'}
            </p>
          </section>

          <section id="complete-info-investment-rounds-section" ref={investmentRoundsSectionRef} className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">
              Noticias{' '}
              <span className="text-xs text-muted-foreground">
                ({isLoadingLegacyData ? '...' : preferredNews.length})
              </span>
            </h3>
            <div className="space-y-2">
              {preferredNews.length === 0 && !isLoadingLegacyData ? (
                <p className="text-xs text-muted-foreground">No hay noticias disponibles.</p>
              ) : (
                preferredNews.slice(0, visibleNewsCount).map((news) => (
                  <article key={news.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-start gap-3">
                      <FaviconLogo
                        websiteUrl={news.url}
                        companyName={candidate?.empresa || news.title || 'news'}
                        size="sm"
                        className="rounded-md flex-shrink-0 !w-5 !h-5"
                      />
                      <div className="min-w-0 flex-1">
                        {isLikelyUrl(news.url) ? (
                          <a
                            href={news.url || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-sky-700 hover:underline font-medium"
                          >
                            {news.title || news.url}
                          </a>
                        ) : (
                          <p className="text-sm font-medium text-gray-800">{news.title || 'Noticia sin título'}</p>
                        )}
                        {(news.source || news.time) && (
                          <p className="text-[11px] text-gray-500 mt-1">
                            {[news.source, news.time].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {showingLegacyNews && (
                          <div className="mt-2">
                            {(() => {
                              const status = getNewsRelatedStatus(news.related);
                              const label = status === 'related' ? 'related' : status === 'unrelated' ? 'unrelated' : 'unclassified';
                              const badge = (
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${getNewsRelatedBadgeClass(status)}`}
                                >
                                  {label}
                                </span>
                              );
                              if (status !== 'not_classified') return badge;
                              return (
                                <TooltipProvider delayDuration={0}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="inline-flex cursor-help rounded-full focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1"
                                      >
                                        {badge}
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs z-[9999]">
                                      <p>
                                        La IA de Qanvit todavia no ha analizado las noticias de esta empresa.
                                        Si ejecutas un enrichment, se clasificaran estas noticias y tambien el resto de informacion.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
            {preferredNews.length > visibleNewsCount && (
              <button
                type="button"
                onClick={() => setVisibleNewsCount((prev) => prev + 3)}
                className="text-sm text-sky-700 hover:text-sky-800 underline underline-offset-2"
              >
                Load more
              </button>
            )}
          </section>

          <section id="complete-info-employees-section" ref={employeesSectionRef} className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">Empleados y personas clave</h3>
            {(payload?.employees?.estimated_count !== null && payload?.employees?.estimated_count !== undefined) && (
              <p className="text-sm text-muted-foreground">
                Headcount estimado: {payload?.employees?.estimated_count}
              </p>
            )}
            {(payload?.employees?.key_people || []).length > 0 && (
              <ul className="space-y-1">
                {(payload?.employees?.key_people || []).slice(0, 6).map((person) => (
                  <li key={`${person.name}-${person.role}`} className="text-xs text-muted-foreground">
                    <strong>{person.name}</strong> - {person.role || 'Sin rol'}
                    {person.profile_url && (
                      <>
                        {' '}
                        -{' '}
                        <a
                          href={person.profile_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-700 hover:underline"
                        >
                          perfil
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(payload?.employees?.sources || []).length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 mb-1">Fuentes</p>
                <ul className="space-y-1">
                  {(payload?.employees?.sources || []).slice(0, 6).map((source, idx) => (
                    <li key={`${source.url}-${idx}`} className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <FaviconLogo
                          websiteUrl={source.url || null}
                          companyName={source.source || source.title || 'Fuente'}
                          size="sm"
                          className="rounded-md flex-shrink-0 !w-5 !h-5"
                        />
                        {isLikelyUrl(source.url) ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-700 hover:underline"
                          >
                            {source.title || source.source || source.url}
                          </a>
                        ) : (
                          <span>{source.title || source.source || 'Fuente sin URL'}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isLoadingLegacyData ? (
              <p className="text-xs text-muted-foreground">Cargando personas guardadas...</p>
            ) : legacyPeople.length > 0 ? (
              <>
                <p className="text-sm font-medium text-gray-700">Perfiles de Linkedin</p>
                {legacyPeople[0]?.employee_count_linkedin !== null && legacyPeople[0]?.employee_count_linkedin !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Empleados en LinkedIn: {legacyPeople[0].employee_count_linkedin}
                  </p>
                )}
                <ul className="space-y-1">
                  {legacyPeople.slice(0, 10).map((person) => (
                    <li key={person.id} className="text-xs text-muted-foreground">
                      <strong>{person.person_name || 'Sin nombre'}</strong> - {person.person_title || 'Sin rol'}
                      {person.linkedin_profile_url && (
                        <>
                          {' '}
                          -{' '}
                          <a
                            href={person.linkedin_profile_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-700 hover:underline"
                          >
                            perfil
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">Rondas de inversión</h3>
            <p className="text-sm text-muted-foreground">
              {hasPayload ? `${sectionState.roundsCount} rondas identificadas` : 'Sin datos todavía'}
            </p>
            <ul className="space-y-1">
              {(payload?.investment_rounds || []).slice(0, 5).map((round, idx) => (
                <li key={`${round.round_type}-${idx}`} className="text-xs text-muted-foreground">
                  {round.round_type || 'Ronda'} - {round.amount || 'N/D'} {round.currency || ''}
                  {(round.actors || []).length > 0 && (
                    <> | Actores: {(round.actors || []).join(', ')}</>
                  )}
                  {(round.evidence || []).length > 0 && (
                    <div className="mt-1 space-y-1">
                      {(round.evidence || []).slice(0, 3).map((evidence, evidenceIdx) => (
                        <div key={`${evidence.url}-${evidenceIdx}`}>
                          <div className="flex items-center gap-2">
                            <FaviconLogo
                              websiteUrl={evidence.url || null}
                              companyName={evidence.source || evidence.title || 'Fuente'}
                              size="sm"
                              className="rounded-md flex-shrink-0 !w-5 !h-5"
                            />
                            {isLikelyUrl(evidence.url) ? (
                              <a
                                href={evidence.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-700 hover:underline"
                              >
                                Fuente: {evidence.title || evidence.source || evidence.url}
                              </a>
                            ) : (
                              <span>Fuente: {evidence.title || evidence.source || 'Sin URL'}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section id="complete-info-financials-section" ref={financialsSectionRef} className="rounded-lg border p-4 space-y-2">
            <h3 className="text-sm font-semibold">Facturación / señales financieras</h3>
            <p className="text-sm text-muted-foreground">
              {hasPayload ? `${sectionState.revenuesCount} entradas de facturación` : 'Sin datos todavía'}
            </p>
            <ul className="space-y-1">
              {(payload?.financials?.revenues || []).slice(0, 5).map((revenue, idx) => (
                <li key={`${revenue.year}-${idx}`} className="text-xs text-muted-foreground">
                  {revenue.year || 'Año N/D'} - {revenue.amount || 'N/D'} {revenue.currency || ''}
                  {(revenue.source || revenue.source_title || revenue.source_url) && (
                    <div className="mt-1">
                      <div className="flex items-center gap-2">
                        <FaviconLogo
                          websiteUrl={revenue.source_url || null}
                          companyName={revenue.source || revenue.source_title || 'Fuente'}
                          size="sm"
                          className="rounded-md flex-shrink-0 !w-5 !h-5"
                        />
                        {isLikelyUrl(revenue.source_url) ? (
                          <a
                            href={revenue.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-700 hover:underline"
                          >
                            Fuente: {revenue.source_title || revenue.source || revenue.source_url}
                          </a>
                        ) : (
                          <span>Fuente: {revenue.source_title || revenue.source || 'Sin URL'}</span>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RFXCandidateCompleteInfoModal;
