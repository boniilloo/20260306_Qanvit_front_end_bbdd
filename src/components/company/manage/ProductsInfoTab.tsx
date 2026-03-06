import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
// Removed Tabs imports as sections are now stacked cards
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, History, Edit, Sparkles, Plus, Trash2, EyeOff, CheckCircle, Clock, ChevronLeft, ChevronRight, ChevronUp, AlertTriangle } from 'lucide-react';
import { ProductDocumentUpload } from '@/components/products/ProductDocumentUpload';
import type { Product, ProductActivation, ProductRevision } from './types';

interface ProductsInfoTabProps {
  products: Product[];
  loadingProducts: boolean;
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
  setHasUserSelectedProduct: (v: boolean) => void;
  // actions
  onEditProduct: () => void;
  onEditWithAI: () => void;
  onCreateProduct: () => void;
  onCreateWithAI: () => void;
  onConfirmDeleteProduct: () => void;
  onConfirmDeactivateProduct: () => void;
  // product revisions
  productRevisions: ProductRevision[];
  loadingProductRevisions: boolean;
  onPreviewProduct: (revision: ProductRevision) => void;
  onActivateProductRevision: (productRevisionId: string, productId: string) => void;
  activatingProductRevision: string | null;
  productRevisionsPage: number;
  productRevisionsPerPage: number;
  setProductRevisionsPage: (v: number) => void;
  setProductRevisionsPerPage: (v: number) => void;
  getTotalProductRevisionsPages: () => number;
  getPaginatedProductRevisions: () => ProductRevision[];
  // product activations
  productActivations: ProductActivation[];
  loadingProductActivations: boolean;
  productActivationsPage: number;
  productActivationsPerPage: number;
  setProductActivationsPage: (v: number) => void;
  setProductActivationsPerPage: (v: number) => void;
  getTotalProductActivationsPages: () => number;
  getPaginatedProductActivations: () => ProductActivation[];
}

export const ProductsInfoTab: React.FC<ProductsInfoTabProps> = ({
  products,
  loadingProducts,
  selectedProductId,
  setSelectedProductId,
  setHasUserSelectedProduct,
  onEditProduct,
  onEditWithAI,
  onCreateProduct,
  onCreateWithAI,
  onConfirmDeleteProduct,
  onConfirmDeactivateProduct,
  productRevisions,
  loadingProductRevisions,
  onPreviewProduct,
  onActivateProductRevision,
  activatingProductRevision,
  productRevisionsPage,
  productRevisionsPerPage,
  setProductRevisionsPage,
  setProductRevisionsPerPage,
  getTotalProductRevisionsPages,
  getPaginatedProductRevisions,
  productActivations,
  loadingProductActivations,
  productActivationsPage,
  productActivationsPerPage,
  setProductActivationsPage,
  setProductActivationsPerPage,
  getTotalProductActivationsPages,
  getPaginatedProductActivations,
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

    const extraGap = 8; // small breathing room
    const targetTop = rect.top + currentScrollY - mobileHeaderHeight - stickyHeight - extraGap;

    window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
  };
  const [isRevisionsOpen, setIsRevisionsOpen] = React.useState(false);
  const [isActivationsOpen, setIsActivationsOpen] = React.useState(false);
  const selectedProduct = React.useMemo(() => products.find((p) => p.id === selectedProductId), [products, selectedProductId]);
  return (
    <>
    <Card>
      <CardHeader className="hidden">
        <CardTitle className="flex items-center gap-2">
          <Edit className="w-5 h-5" />
          Products Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loadingProducts ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="sticky top-0 z-20" ref={stickyHeaderRef}>
              <div className="mx-0 bg-white border-b shadow-sm rounded-xl">
                <div className="flex items-center justify-between gap-2 px-4 md:px-6 pt-4 md:pt-6">
                  <div className="flex items-center gap-2">
                    <Edit className="w-5 h-5" />
                    <span className="font-semibold text-lg">Products Information</span>
                  </div>
                  <TooltipProvider>
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button onClick={onCreateProduct} variant="outline" size="icon" className="shrink-0 border-sky text-navy hover:bg-sky/10" aria-label="Create Product">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Create Product</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button onClick={onCreateWithAI} variant="default" size="sm" className="flex items-center gap-2 bg-sky text-navy hover:bg-sky-dark">
                            <Sparkles className="w-4 h-4" />
                            Create with FQ AI
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Create with FQ AI</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </div>
                <div className="p-4 md:p-6 space-y-4">
                  <div className="space-y-2">
              <label className="text-lg font-semibold text-gray-700">Select Product</label>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                      <div className="flex-1">
              <Select value={selectedProductId} onValueChange={(value) => { setSelectedProductId(value); setHasUserSelectedProduct(true); }}>
                <SelectTrigger className="w-full h-12 text-base">
                  <SelectValue placeholder={products.length === 0 ? 'No products added to this company' : 'Choose a product to manage...'} className="text-base" />
                </SelectTrigger>
                <SelectContent>
                  {products.length === 0 ? (
                    <SelectItem value="__no_products__" disabled>
                      <div className="flex items-center gap-2">
                        <span>No products added to this company</span>
                      </div>
                    </SelectItem>
                  ) : (
                    products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <div className="flex items-center gap-2">
                          <span>{product.product_name}</span>
                          <Badge variant={product.is_active ? 'default' : 'secondary'} className="text-xs">
                            {product.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
                      </div>
                      <TooltipProvider>
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button onClick={onEditWithAI} disabled={!selectedProductId} variant="default" size="sm" className="flex items-center gap-2 bg-sky text-navy hover:bg-sky-dark disabled:opacity-50">
                      <Sparkles className="w-4 h-4" />
                      Edit with FQ AI
                    </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit with FQ AI</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button onClick={onEditProduct} disabled={!selectedProductId} variant="outline" size="icon" className="shrink-0 border-sky text-navy hover:bg-sky/10 disabled:opacity-50" aria-label="Edit Product">
                                <Edit className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit Product</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button onClick={onConfirmDeactivateProduct} disabled={!selectedProductId} variant="outline" size="icon" className="shrink-0 border-amber-500 text-amber-500 hover:bg-amber-50 disabled:opacity-50" aria-label="Deactivate Product">
                      <EyeOff className="w-4 h-4" />
                    </Button>
                            </TooltipTrigger>
                            <TooltipContent>Deactivate Product</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button onClick={onConfirmDeleteProduct} disabled={!selectedProductId} variant="destructive" size="icon" className="shrink-0" aria-label="Delete Product">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete Product</TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                  </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 py-2 text-sm border-t px-4 md:px-6">
                  <span className="text-muted-foreground">Jump to:</span>
                  <Button variant="ghost" size="sm" onClick={() => scrollToSection('product-revisions')} className="h-8 px-2 gap-2">
                    <Edit className="w-4 h-4" /> Revisions
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => scrollToSection('product-activation-history')} className="h-8 px-2 gap-2">
                    <History className="w-4 h-4" /> History
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => scrollToSection('product-documents')} className="h-8 px-2 gap-2">
                    <FileText className="w-4 h-4" /> Documents
                  </Button>
                </div>
              </div>
            </div>

            {selectedProductId && (
              <div className="w-full space-y-4 mt-4">
                <div id="product-revisions" className="scroll-mt-24">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Edit className="w-5 h-5" />
                        Product Revisions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingProductRevisions ? (
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
                      ) : productRevisions.length === 0 ? (
                        <div className="text-center py-8">
                          <Edit className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-gray-600 mb-2">No Product Revisions Found</h3>
                          <p className="text-muted-foreground">No revisions have been created for this product yet.</p>
                        </div>
                      ) : (
                      <>
                        {selectedProduct && !selectedProduct.is_active ? (
                          <Card className="p-4 mb-4 ring-2 ring-amber-200 bg-amber-50">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                              <div className="flex-1">
                                <h4 className="font-semibold text-amber-900">Product is deactivated</h4>
                                <p className="text-sm text-amber-800">There is no active revision. Activate one of the older revisions below to make this product visible again.</p>
                              </div>
                            </div>
                          </Card>
                        ) : (
                          (() => {
                            const active = productRevisions.find((r) => r.is_active);
                            if (!active) return null;
                            return (
                              <Card className="p-4 mb-4 ring-2 ring-green-200 bg-green-50">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                      <h4 className="font-semibold text-navy">{active.product_name || 'Active Revision'}</h4>
                                      <Badge variant="default" className="bg-mint-light text-black"><CheckCircle className="w-3 h-3 mr-1" /> Active</Badge>
                                      <Badge variant="outline">{active.source === 'member' ? 'Manual Edit' : active.source === 'web_scraping' ? 'Web Scraping' : active.source}</Badge>
                                    </div>
              {/* Author information */}
              {active.creator_name && (
                <p className="text-xs text-muted-foreground">Created by: {active.creator_name}</p>
              )}
              <p className="text-sm text-muted-foreground">Activated revision created on {new Date(active.created_at).toLocaleString()}</p>
                                    {active.comment && (
                                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                                        <span className="font-medium text-blue-800">Changes: </span>
                                        <span className="text-blue-700">{active.comment}</span>
                                      </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                    <Button variant="outline" size="sm" className="gap-1" onClick={() => onPreviewProduct(active)}>
                                      <Edit className="w-3 h-3" /> Preview
                                    </Button>
                                  </div>
                                </div>
                              </Card>
                            );
                          })()
                        )}

                        <Accordion type="single" collapsible value={isRevisionsOpen ? 'product-revisions-list' : undefined} onValueChange={(v) => setIsRevisionsOpen(!!v)}>
                          <AccordionItem value="product-revisions-list" className="border-none">
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
                                  <Select value={productRevisionsPerPage.toString()} onValueChange={(value) => { setProductRevisionsPerPage(Number(value)); setProductRevisionsPage(1); }}>
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
                                  <span className="text-sm text-muted-foreground">Showing {Math.min((productRevisionsPage - 1) * productRevisionsPerPage + 1, productRevisions.length)} - {Math.min(productRevisionsPage * productRevisionsPerPage, productRevisions.length)} of {productRevisions.length}</span>
                                  <div className="flex items-center gap-1">
                                    <Button variant="outline" size="sm" onClick={() => setProductRevisionsPage(productRevisionsPage - 1)} disabled={productRevisionsPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                                    <span className="text-sm px-2">{productRevisionsPage} / {getTotalProductRevisionsPages()}</span>
                                    <Button variant="outline" size="sm" onClick={() => setProductRevisionsPage(productRevisionsPage + 1)} disabled={productRevisionsPage >= getTotalProductRevisionsPages()}><ChevronRight className="w-4 h-4" /></Button>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                {getPaginatedProductRevisions().map((revision) => (
                                  <Card key={revision.id} className={`p-4 ${revision.is_active ? 'ring-2 ring-green-200 bg-green-50' : ''}`}>
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <h4 className="font-semibold text-navy">{revision.product_name}</h4>
                                          {revision.is_active ? (
                                            <Badge variant="default" className="bg-mint-light text-black"><CheckCircle className="w-3 h-3 mr-1" /> Active</Badge>
                                          ) : (
                                            <Badge variant="secondary" className="bg-navy/10 text-navy">Inactive</Badge>
                                          )}
                                          <Badge variant="outline">{revision.source === 'member' ? 'Manual Edit' : revision.source === 'web_scraping' ? 'Web Scraping' : revision.source}</Badge>
                                        </div>
                                        {/* Author information */}
                                        {revision.creator_name && (
                                          <p className="text-xs text-muted-foreground mb-1">Created by: {revision.creator_name}</p>
                                        )}
                                        <p className="text-sm text-muted-foreground mb-2">Created: {new Date(revision.created_at).toLocaleString()}</p>
                                        {revision.short_description && <p className="text-sm text-gray-600 line-clamp-2 mb-2">{revision.short_description}</p>}
                                        {revision.comment && (
                                          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                                            <span className="font-medium text-blue-800">Changes: </span>
                                            <span className="text-blue-700">{revision.comment}</span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 ml-4">
                                        <Button variant="outline" size="sm" onClick={() => onPreviewProduct(revision)} className="gap-1"><Edit className="w-3 h-3" /> Preview</Button>
                                        {!revision.is_active && (
                                          <Button size="sm" onClick={() => onActivateProductRevision(revision.id, revision.product_id)} disabled={activatingProductRevision === revision.id} className="gap-1">{activatingProductRevision === revision.id ? <Clock className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}Activate</Button>
                                        )}
                                </div>
                              </div>
                            </Card>
                          ))}
                                <div className="flex items-center justify-between mt-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Items per page:</span>
                                    <Select value={productRevisionsPerPage.toString()} onValueChange={(value) => { setProductRevisionsPerPage(Number(value)); setProductRevisionsPage(1); }}>
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
                                    <span className="text-sm text-muted-foreground">Showing {Math.min((productRevisionsPage - 1) * productRevisionsPerPage + 1, productRevisions.length)} - {Math.min(productRevisionsPage * productRevisionsPerPage, productRevisions.length)} of {productRevisions.length}</span>
                                    <div className="flex items-center gap-1">
                                      <Button variant="outline" size="sm" onClick={() => setProductRevisionsPage(productRevisionsPage - 1)} disabled={productRevisionsPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                                      <span className="text-sm px-2">{productRevisionsPage} / {getTotalProductRevisionsPages()}</span>
                                      <Button variant="outline" size="sm" onClick={() => setProductRevisionsPage(productRevisionsPage + 1)} disabled={productRevisionsPage >= getTotalProductRevisionsPages()}><ChevronRight className="w-4 h-4" /></Button>
                              </div>
                            </div>
                          </div>
                                <div className="flex justify-end mt-3">
                                  <Button variant="outline" size="sm" className="gap-1" onClick={() => { setIsRevisionsOpen(false); scrollToSection('product-revisions'); }}>
                                    <ChevronUp className="w-4 h-4" />
                                    Back to top
                                  </Button>
                        </div>
                        </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div id="product-activation-history" className="scroll-mt-24">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <History className="w-5 h-5" />
                        Product Action History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingProductActivations ? (
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
                      ) : productActivations.length === 0 ? (
                        <div className="text-center py-8">
                          <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-gray-600 mb-2">No Activations Found</h3>
                          <p className="text-muted-foreground">No product revision activations have been recorded yet.</p>
                        </div>
                      ) : (
                        <>
                        {(() => {
                          const latest = productActivations[0];
                          if (!latest) return null;
                          return (
                            <Card className="p-4 mb-4 ring-1 ring-blue-200 bg-blue-50">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className="font-semibold text-navy">{latest.revision_name}</h4>
                                    <Badge variant={latest.action_type === 'activation' ? 'default' : 'secondary'} className={latest.action_type === 'activation' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}>
                                      {latest.action_type === 'activation' ? 'Activated' : 'Deactivated'}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                                    {/* Activation author information */}
                                    {latest.user_name && (
                                      <div className="flex items-center gap-1">
                                        <span>Action by: {latest.user_name}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span>Action on: {new Date(latest.action_at).toLocaleString()}</span></div>
                                  </div>
                                  <div className="p-3 bg-gray-50 border rounded-lg">
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                                      <div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span>Revision created: {new Date(latest.revision_created_at).toLocaleString()}</span></div>
                                    </div>
                                    {latest.revision_comment && (
                                      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm"><span className="font-medium text-blue-800">Changes: </span><span className="text-blue-700">{latest.revision_comment}</span></div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </Card>
                          );
                        })()}

                        <Accordion type="single" collapsible value={isActivationsOpen ? 'product-activations-list' : undefined} onValueChange={(v) => setIsActivationsOpen(!!v)}>
                          <AccordionItem value="product-activations-list" className="border-none">
                            <AccordionTrigger className="no-underline px-0 py-0">
                              <div className="w-full flex items-center justify-between py-3">
                                <span className="text-sm font-medium">Show action history</span>
                                <span className="text-xs text-muted-foreground">Expand to view paginated list</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-0">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Items per page:</span>
                              <Select value={productActivationsPerPage.toString()} onValueChange={(value) => { setProductActivationsPerPage(Number(value)); setProductActivationsPage(1); }}>
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
                              <span className="text-sm text-muted-foreground">Showing {Math.min((productActivationsPage - 1) * productActivationsPerPage + 1, productActivations.length)} - {Math.min(productActivationsPage * productActivationsPerPage, productActivations.length)} of {productActivations.length}</span>
                              <div className="flex items-center gap-1">
                                    <Button variant="outline" size="sm" onClick={() => setProductActivationsPage(productActivationsPage - 1)} disabled={productActivationsPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                                <span className="text-sm px-2">{productActivationsPage} / {getTotalProductActivationsPages()}</span>
                                    <Button variant="outline" size="sm" onClick={() => setProductActivationsPage(productActivationsPage + 1)} disabled={productActivationsPage >= getTotalProductActivationsPages()}><ChevronRight className="w-4 h-4" /></Button>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            {getPaginatedProductActivations().map((activation) => (
                              <Card key={activation.id} className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                     <div className="flex items-center gap-2 mb-2">
                                       <h4 className="font-semibold text-navy">{activation.revision_name}</h4>
                                       <Badge variant={activation.action_type === 'activation' ? 'default' : 'secondary'} className={activation.action_type === 'activation' ? 'bg-sky/20 text-navy' : 'bg-orange-100 text-orange-800'}>
                                         {activation.action_type === 'activation' ? 'Activated' : 'Deactivated'}
                                       </Badge>
                                     </div>
                                     {/* Action author information */}
                                     {activation.user_name && (
                                       <p className="text-xs text-muted-foreground mb-2">Action by: {activation.user_name}</p>
                                     )}
                                    <div className="p-3 bg-gray-50 border rounded-lg">
                                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                                            <div className="flex items-center gap-1"><Clock className="w-3 h-3" /><span>Revision created: {new Date(activation.revision_created_at).toLocaleString()}</span></div>
                                          </div>
                                          {activation.revision_comment && (
                                            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm"><span className="font-medium text-blue-800">Changes: </span><span className="text-blue-700">{activation.revision_comment}</span></div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </Card>
                                ))}
                                <div className="flex items-center justify-between mt-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Items per page:</span>
                                    <Select value={productActivationsPerPage.toString()} onValueChange={(value) => { setProductActivationsPerPage(Number(value)); setProductActivationsPage(1); }}>
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
                                    <span className="text-sm text-muted-foreground">Showing {Math.min((productActivationsPage - 1) * productActivationsPerPage + 1, productActivations.length)} - {Math.min(productActivationsPage * productActivationsPerPage, productActivations.length)} of {productActivations.length}</span>
                                    <div className="flex items-center gap-1">
                                      <Button variant="outline" size="sm" onClick={() => setProductActivationsPage(productActivationsPage - 1)} disabled={productActivationsPage === 1}><ChevronLeft className="w-4 h-4" /></Button>
                                      <span className="text-sm px-2">{productActivationsPage} / {getTotalProductActivationsPages()}</span>
                                      <Button variant="outline" size="sm" onClick={() => setProductActivationsPage(productActivationsPage + 1)} disabled={productActivationsPage >= getTotalProductActivationsPages()}><ChevronRight className="w-4 h-4" /></Button>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex justify-end mt-3">
                                  <Button variant="outline" size="sm" className="gap-1" onClick={() => { setIsActivationsOpen(false); scrollToSection('product-activation-history'); }}>
                                    <ChevronUp className="w-4 h-4" />
                                    Back to top
                                  </Button>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </>
                    )}
                  </CardContent>
                              </Card>
                </div>

                <div id="product-documents" className="scroll-mt-24">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="w-5 h-5" />
                      Product Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedProductId ? (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                              <h3 className="font-semibold text-blue-900 mb-1">Product Documentation</h3>
                              <p className="text-sm text-blue-700">Upload technical specifications, user manuals, certificates, and other relevant documents for this product.</p>
                            </div>
                          </div>
                        </div>
                        <ProductDocumentUpload productId={selectedProductId} />
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-600 mb-2">No Product Selected</h3>
                        <p className="text-muted-foreground">Select a product to manage its documents.</p>
                      </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
    <div className="h-[600px]" />
    </>
  );
};


