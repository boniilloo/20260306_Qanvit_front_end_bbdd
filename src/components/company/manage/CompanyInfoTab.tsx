import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CompanyDocumentUpload } from '../CompanyDocumentUpload';
import { CoverImageUpload } from '../CoverImageUpload';
import { Building2, CheckCircle, Clock, History, FileText, Image, User, ChevronLeft, ChevronRight, Edit, ChevronUp, Sparkles } from 'lucide-react';
import type { CompanyActivation, CompanyRevision } from './types';

type PaginationSetter = (value: number) => void;

interface CompanyInfoTabProps {
  companyId: string;
  companyName: string;
  revisions: CompanyRevision[];
  loadingRevisions: boolean;
  activations: CompanyActivation[];
  loadingActivations: boolean;
  activatingRevision: string | null;
  onActivateRevision: (revisionId: string) => Promise<void> | void;
  onPreviewRevision: (revisionId: string) => Promise<void> | void;
  onEditCompany: () => void;
  onAutoFillCompany?: () => void;
  // pagination helpers for revisions
  revisionsPage: number;
  revisionsPerPage: number;
  setRevisionsPage: PaginationSetter;
  setRevisionsPerPage: PaginationSetter;
  getTotalRevisionsPages: () => number;
  getPaginatedRevisions: () => CompanyRevision[];
  // pagination helpers for activations
  activationsPage: number;
  activationsPerPage: number;
  setActivationsPage: PaginationSetter;
  setActivationsPerPage: PaginationSetter;
  getTotalActivationsPages: () => number;
  getPaginatedActivations: () => CompanyActivation[];
}

export const CompanyInfoTab: React.FC<CompanyInfoTabProps> = ({
  companyId,
  companyName,
  revisions,
  loadingRevisions,
  activations,
  loadingActivations,
  activatingRevision,
  onActivateRevision,
  onPreviewRevision,
  onEditCompany,
  onAutoFillCompany,
  revisionsPage,
  revisionsPerPage,
  setRevisionsPage,
  setRevisionsPerPage,
  getTotalRevisionsPages,
  getPaginatedRevisions,
  activationsPage,
  activationsPerPage,
  setActivationsPage,
  setActivationsPerPage,
  getTotalActivationsPages,
  getPaginatedActivations,
}) => {
  const stickyHeaderRef = React.useRef<HTMLDivElement | null>(null);

  const scrollToSection = (sectionId: string) => {
    const el = typeof document !== 'undefined' ? document.getElementById(sectionId) : null;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const currentScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

    const mobileHeader = document.querySelector('header.mobile-header') as HTMLElement | null;
    const mobileHeaderHeight = mobileHeader?.offsetHeight ?? 0;

    const stickyHeight = stickyHeaderRef.current?.offsetHeight ?? 0;

    const extraGap = 8;
    const targetTop = rect.top + currentScrollY - mobileHeaderHeight - stickyHeight - extraGap;

    window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
  };

  return (
    <>
    <Card>
      <CardHeader className="hidden">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Company Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="sticky top-0 z-20" ref={stickyHeaderRef}>
          <div className="mx-0 bg-white border-b shadow-sm rounded-xl">
            <div className="flex items-center gap-2 px-4 md:px-6 pt-4 md:pt-6">
              <Building2 className="w-5 h-5" />
              <span className="font-semibold text-lg">Company Information</span>
            </div>
            <div className="flex items-center justify-between p-4 md:p-6">
              <div>
                <h3 className="text-lg font-semibold text-navy mb-2">{companyName}</h3>
                <p className="text-muted-foreground">Manage your company profile, logo, locations, and other business information.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={onAutoFillCompany} variant="default" size="sm" className="flex items-center gap-2 bg-sky text-navy hover:bg-sky-dark">
                  <Sparkles className="w-4 h-4" />
                  Update info using Qanvit AI
                </Button>
                <Button onClick={onEditCompany} variant="outline" className="gap-2 bg-white text-black hover:bg-gray-50">
                  <Edit className="w-4 h-4" />
                  Edit Company
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 py-2 text-sm border-t px-4 md:px-6">
              <span className="text-muted-foreground">Jump to:</span>
              <Button variant="ghost" size="sm" onClick={() => scrollToSection('company-revisions')} className="h-8 px-2 gap-2 text-navy hover:bg-sky/10">
                <Edit className="w-4 h-4" /> Revisions
              </Button>
              <Button variant="ghost" size="sm" onClick={() => scrollToSection('company-activation-history')} className="h-8 px-2 gap-2 text-navy hover:bg-sky/10">
                <History className="w-4 h-4" /> History
              </Button>
              <Button variant="ghost" size="sm" onClick={() => scrollToSection('company-documents')} className="h-8 px-2 gap-2 text-navy hover:bg-sky/10">
                <FileText className="w-4 h-4" /> Documents
              </Button>
              <Button variant="ghost" size="sm" onClick={() => scrollToSection('company-cover-images')} className="h-8 px-2 gap-2 text-navy hover:bg-sky/10">
                <Image className="w-4 h-4" /> Images
              </Button>
            </div>
          </div>
        </div>

        <div id="company-revisions" className="mt-6 scroll-mt-24">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Company Revisions History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingRevisions ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                        </div>
                        <div className="w-16 h-8 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : revisions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No Revisions Found</h3>
                  <p className="text-muted-foreground">No company revisions have been created yet.</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const active = revisions.find((r) => r.is_active);
                    if (!active) return null;
                    return (
                      <Card className="p-4 mb-4 ring-2 ring-green-200 bg-green-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-navy">{active.nombre_empresa || 'Active Revision'}</h4>
                              <Badge variant="default" className="bg-mint-light text-black">
                                <CheckCircle className="w-3 h-3 mr-1" /> Active
                              </Badge>
                              <Badge variant="outline">{active.source === 'member' ? 'Manual Edit' : 'Web Scraping'}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">Activated revision created on {new Date(active.created_at).toLocaleString()}</p>
                            {(active.creator_name || active.creator_surname) && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <User className="w-3 h-3" /> Author: {active.creator_name || active.creator_surname || 'Unknown'}
                              </p>
                            )}
                            {active.comment && (
                              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                                <span className="font-medium text-blue-800">Changes: </span>
                                <span className="text-blue-700">{active.comment}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => onPreviewRevision(active.id)}>
                              <Edit className="w-3 h-3" /> Preview
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })()}

                  <Accordion type="single" collapsible>
                    <AccordionItem value="list" className="border-none">
                      <AccordionTrigger className="no-underline px-0 py-0">
                        <div className="w-full flex items-center justify-between py-3">
                          <span className="text-sm font-medium">Show older revisions</span>
                          <span className="text-xs text-muted-foreground">Expand to view paginated list</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Items per page:</span>
                            <Select value={revisionsPerPage.toString()} onValueChange={(value) => { setRevisionsPerPage(Number(value)); setRevisionsPage(1); }}>
                              <SelectTrigger className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5">5</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Showing {Math.min((revisionsPage - 1) * revisionsPerPage + 1, revisions.length)} - {Math.min(revisionsPage * revisionsPerPage, revisions.length)} of {revisions.length}</span>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" onClick={() => setRevisionsPage(revisionsPage - 1)} disabled={revisionsPage === 1}>
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                              <span className="text-sm px-2">{revisionsPage} / {getTotalRevisionsPages()}</span>
                              <Button variant="outline" size="sm" onClick={() => setRevisionsPage(revisionsPage + 1)} disabled={revisionsPage >= getTotalRevisionsPages()}>
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {getPaginatedRevisions().map((revision) => (
                            <Card key={revision.id} className={`p-4 transition-all ${revision.is_active ? 'ring-2 ring-green-200 bg-green-50' : ''}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className="font-semibold text-navy">{revision.nombre_empresa || 'Company Revision'}</h4>
                                    {revision.is_active ? (
                                      <Badge variant="default" className="bg-mint-light text-black"><CheckCircle className="w-3 h-3 mr-1" /> Active</Badge>
                                    ) : (
                                      <Badge variant="secondary" className="bg-navy/10 text-navy">Inactive</Badge>
                                    )}
                                    <Badge variant="outline">{revision.source === 'member' ? 'Manual Edit' : 'Web Scraping'}</Badge>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Created: {new Date(revision.created_at).toLocaleString()}</p>
                                    {(revision.creator_name || revision.creator_surname) && (
                                      <p className="text-sm text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> Author: {revision.creator_name || 'Unknown'}</p>
                                    )}
                                  </div>
                                  {revision.description && <p className="text-sm text-gray-600 line-clamp-2">{revision.description}</p>}
                                  {revision.website && <p className="text-sm text-blue-600 mt-1">{revision.website}</p>}
                                  {revision.comment && (
                                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                                      <span className="font-medium text-blue-800">Changes: </span>
                                      <span className="text-blue-700">{revision.comment}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                  <Button variant="outline" size="sm" onClick={() => onPreviewRevision(revision.id)} className="gap-1">
                                    <Edit className="w-3 h-3" /> Preview
                                  </Button>
                                  {!revision.is_active && (
                                    <Button onClick={() => onActivateRevision(revision.id)} disabled={activatingRevision === revision.id} size="sm" className="gap-1">
                                      {activatingRevision === revision.id ? <Clock className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
                                      Activate
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Items per page:</span>
                            <Select value={revisionsPerPage.toString()} onValueChange={(value) => { setRevisionsPerPage(Number(value)); setRevisionsPage(1); }}>
                              <SelectTrigger className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5">5</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Showing {Math.min((revisionsPage - 1) * revisionsPerPage + 1, revisions.length)} - {Math.min(revisionsPage * revisionsPerPage, revisions.length)} of {revisions.length}</span>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" onClick={() => setRevisionsPage(revisionsPage - 1)} disabled={revisionsPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                              <span className="text-sm px-2">{revisionsPage} / {getTotalRevisionsPages()}</span>
                              <Button variant="outline" size="sm" onClick={() => setRevisionsPage(revisionsPage + 1)} disabled={revisionsPage >= getTotalRevisionsPages()}><ChevronRight className="w-4 h-4" /></Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end mt-3">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => { const el = document?.getElementById('company-revisions'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <ChevronUp className="w-4 h-4" />
                            Back to top
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div id="company-activation-history" className="mt-6 scroll-mt-24">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Activation History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingActivations ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                        </div>
                        <div className="w-20 h-6 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activations.length === 0 ? (
                <div className="text-center py-8">
                  <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No Activations Found</h3>
                  <p className="text-muted-foreground">No revision activations have been recorded yet.</p>
                </div>
              ) : (
                <>
                  {(() => {
                    const latest = activations[0];
                    if (!latest) return null;
                    return (
                      <Card className="p-4 mb-4 ring-1 ring-blue-200 bg-blue-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2"><h4 className="font-semibold text-navy">{latest.revision_name}</h4><Badge variant="default" className="bg-sky/20 text-navy"><CheckCircle className="w-3 h-3 mr-1" /> Activated</Badge></div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3"><div className="flex items-center gap-1"><User className="w-3 h-3" /><span>Activated by: {latest.user_name}</span></div><div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span>Activated on: {new Date(latest.activated_at).toLocaleString()}</span></div></div>
                            <div className="p-3 bg-gray-50 border rounded-lg"><div className="flex items-center gap-4 text-sm text-muted-foreground mb-2"><div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span>Revision created: {new Date(latest.revision_created_at).toLocaleString()}</span></div></div>{latest.revision_comment && <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm"><span className="font-medium text-blue-800">Changes: </span><span className="text-blue-700">{latest.revision_comment}</span></div>}</div>
                          </div>
                        </div>
                      </Card>
                    );
                  })()}

                  <Accordion type="single" collapsible>
                    <AccordionItem value="activations-list" className="border-none">
                      <AccordionTrigger className="no-underline px-0 py-0">
                        <div className="w-full flex items-center justify-between py-3">
                          <span className="text-sm font-medium">Show activation history</span>
                          <span className="text-xs text-muted-foreground">Expand to view paginated list</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-0">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Items per page:</span>
                            <Select value={activationsPerPage.toString()} onValueChange={(value) => { setActivationsPerPage(Number(value)); setActivationsPage(1); }}>
                              <SelectTrigger className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5">5</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Showing {Math.min((activationsPage - 1) * activationsPerPage + 1, activations.length)} - {Math.min(activationsPage * activationsPerPage, activations.length)} of {activations.length}</span>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" onClick={() => setActivationsPage(activationsPage - 1)} disabled={activationsPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                              <span className="text-sm px-2">{activationsPage} / {getTotalActivationsPages()}</span>
                              <Button variant="outline" size="sm" onClick={() => setActivationsPage(activationsPage + 1)} disabled={activationsPage >= getTotalActivationsPages()}><ChevronRight className="w-4 h-4" /></Button>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          {getPaginatedActivations().map((activation) => (
                            <Card key={activation.id} className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2"><h4 className="font-semibold text-navy">{activation.revision_name}</h4><Badge variant="default" className="bg-sky/20 text-navy"><CheckCircle className="w-3 h-3 mr-1" /> Activated</Badge></div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3"><div className="flex items-center gap-1"><User className="w-3 h-3" /><span>Activated by: {activation.user_name}</span></div><div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span>Activated on: {new Date(activation.activated_at).toLocaleString()}</span></div></div>
                                  <div className="p-3 bg-gray-50 border rounded-lg"><div className="flex items-center gap-4 text-sm text-muted-foreground mb-2"><div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span>Revision created: {new Date(activation.revision_created_at).toLocaleString()}</span></div></div>{activation.revision_comment && <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm"><span className="font-medium text-blue-800">Changes: </span><span className="text-blue-700">{activation.revision_comment}</span></div>}</div>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Items per page:</span>
                            <Select value={activationsPerPage.toString()} onValueChange={(value) => { setActivationsPerPage(Number(value)); setActivationsPage(1); }}>
                              <SelectTrigger className="w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="5">5</SelectItem>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Showing {Math.min((activationsPage - 1) * activationsPerPage + 1, activations.length)} - {Math.min(activationsPage * activationsPerPage, activations.length)} of {activations.length}</span>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" onClick={() => setActivationsPage(activationsPage - 1)} disabled={activationsPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                              <span className="text-sm px-2">{activationsPage} / {getTotalActivationsPages()}</span>
                              <Button variant="outline" size="sm" onClick={() => setActivationsPage(activationsPage + 1)} disabled={activationsPage >= getTotalActivationsPages()}><ChevronRight className="w-4 h-4" /></Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end mt-3">
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => { const el = document?.getElementById('company-activation-history'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <ChevronUp className="w-4 h-4" />
                            Back to top
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div id="company-documents" className="mt-6 scroll-mt-24">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Company Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CompanyDocumentUpload companyId={companyId} />
            </CardContent>
          </Card>
        </div>

        <div id="company-cover-images" className="mt-6 scroll-mt-24">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="w-5 h-5" />
                Cover Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CoverImageUpload companyId={companyId} />
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
    <div className="h-[600px]" />
    </>
  );
};

