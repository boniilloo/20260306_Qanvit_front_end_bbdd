import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Package, Users, BarChart3, CircleHelp, FileText, Archive, Eye } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useManageCompanyData } from './manage/useManageCompanyData';
import { CompanyInfoTab } from './manage/CompanyInfoTab';
import { ProductsInfoTab } from './manage/ProductsInfoTab';
import { MembersTab } from './manage/MembersTab';
import { CompanyRevisionPreviewModal } from './CompanyRevisionPreviewModal';
import { ProductRevisionPreviewModal } from './ProductRevisionPreviewModal';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { CompanyRevision, ProductRevision } from './manage/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import CompanyRFXInvitations from '@/components/company/CompanyRFXInvitations';
import { usePendingCompanyRFXInvitations } from '@/hooks/usePendingCompanyRFXInvitations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ManageCompanyTabProps {
  companyId: string;
  companyName: string;
  companySlug?: string;
}

const ManageCompanyTabRefactored: React.FC<ManageCompanyTabProps> = ({ companyId, companyName, companySlug }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);

  const {
    // data
    members,
    revisions,
    activations,
    pendingRequests,
    products,
    productRevisions,
    productActivations,
    // loading
    loadingMembers,
    loadingRevisions,
    loadingActivations,
    loadingPending,
    loadingProducts,
    loadingProductRevisions,
    loadingProductActivations,
    // flags
    processingRequestId,
    activatingRevision,
    activatingProductRevision,
    removingMember,
    // actions
    handleApproveRequest,
    handleRejectRequest,
    activateRevision,
    activateProductRevision, 
    deleteProduct,
    deactivateProduct,
    removeCompanyAdmin,
    fetchProductRevisions,
    fetchProductActivations,
  } = useManageCompanyData(companyId);

  // UI state
  const [activeTab, setActiveTab] = useState<string>('rfxs');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [hasUserSelectedProduct, setHasUserSelectedProduct] = useState<boolean>(false);

  // Company pagination
  const [revisionsPage, setRevisionsPage] = useState(1);
  const [revisionsPerPage, setRevisionsPerPage] = useState(5);
  const [activationsPage, setActivationsPage] = useState(1);
  const [activationsPerPage, setActivationsPerPage] = useState(5);

  // Product activations pagination
  const [productActivationsPage, setProductActivationsPage] = useState(1);
  const [productActivationsPerPage, setProductActivationsPerPage] = useState(5);
  // Product revisions pagination (for older revisions list)
  const [productRevisionsPage, setProductRevisionsPage] = useState(1);
  const [productRevisionsPerPage, setProductRevisionsPerPage] = useState(5);

  // Preview modals
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<CompanyRevision | null>(null);
  const [isProductPreviewOpen, setIsProductPreviewOpen] = useState(false);
  const [selectedProductRevision, setSelectedProductRevision] = useState<ProductRevision | null>(null);
  const { count: pendingRfxForCompany } = usePendingCompanyRFXInvitations(companyId);

  // Dialogs
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [productToDeactivate, setProductToDeactivate] = useState<string | null>(null);

  // Effects: URL param sync
  useEffect(() => {
    const subtab = searchParams.get('subtab');
    const selectedProduct = searchParams.get('selectedProduct');
    // Support both "subtab" (preferred) and legacy "tab" for deep-linking
    const legacyTab = searchParams.get('tab');
    if (subtab) setActiveTab(subtab === 'subscription' ? 'rfxs' : subtab);
    else if (legacyTab && legacyTab !== 'manage') setActiveTab(legacyTab);

    // Only clear params after we have successfully applied them
    let shouldClear = false;
    if (selectedProduct) {
      if (products.length > 0) {
        const foundProduct = products.find((p) => p.id === selectedProduct);
        if (foundProduct) {
          setSelectedProductId(selectedProduct);
          shouldClear = true;
        }
      }
    } else if (legacyTab && legacyTab !== 'manage') {
      shouldClear = true;
    } else if (subtab) {
      shouldClear = true;
    }

    if (shouldClear) setSearchParams({});
  }, [searchParams, products, setSearchParams]);

  // Auto-select first product when switching to products tab
  useEffect(() => {
    if (activeTab === 'products-info' && products.length > 0 && !selectedProductId && !hasUserSelectedProduct) {
      const timeoutId = setTimeout(() => setSelectedProductId(products[0].id), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [activeTab, products.length, hasUserSelectedProduct, products, selectedProductId]);

  // Fetch product data when selection changes
  useEffect(() => {
    if (selectedProductId) {
      fetchProductRevisions(selectedProductId);
      fetchProductActivations(selectedProductId);
    }
  }, [selectedProductId, fetchProductRevisions, fetchProductActivations]);

  // Pagination helpers
  const paginatedRevisions = useMemo(() => {
    const startIndex = (revisionsPage - 1) * revisionsPerPage;
    return revisions.slice(startIndex, startIndex + revisionsPerPage);
  }, [revisions, revisionsPage, revisionsPerPage]);
  const paginatedActivations = useMemo(() => {
    const startIndex = (activationsPage - 1) * activationsPerPage;
    return activations.slice(startIndex, startIndex + activationsPerPage);
  }, [activations, activationsPage, activationsPerPage]);
  const paginatedProductActivations = useMemo(() => {
    const startIndex = (productActivationsPage - 1) * productActivationsPerPage;
    return productActivations.slice(startIndex, startIndex + productActivationsPerPage);
  }, [productActivations, productActivationsPage, productActivationsPerPage]);
  const paginatedProductRevisions = useMemo(() => {
    const startIndex = (productRevisionsPage - 1) * productRevisionsPerPage;
    return productRevisions.slice(startIndex, startIndex + productRevisionsPerPage);
  }, [productRevisions, productRevisionsPage, productRevisionsPerPage]);
  const getTotalRevisionsPages = () => Math.ceil(revisions.length / revisionsPerPage);
  const getTotalActivationsPages = () => Math.ceil(activations.length / activationsPerPage);
  const getTotalProductActivationsPages = () => Math.ceil(productActivations.length / productActivationsPerPage);
  const getTotalProductRevisionsPages = () => Math.ceil(productRevisions.length / productRevisionsPerPage);

  // Handlers
  const handlePreviewRevision = (revisionId: string) => {
    const rev = revisions.find((r) => r.id === revisionId) || null;
    setSelectedRevision(rev);
    setIsPreviewOpen(true);
  };
  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setSelectedRevision(null);
  };
  const handlePreviewProduct = (revision: ProductRevision) => {
    setSelectedProductRevision(revision);
    setIsProductPreviewOpen(true);
  };
  const handleCloseProductPreview = () => {
    setIsProductPreviewOpen(false);
    setSelectedProductRevision(null);
  };

  const handleEditCompany = () => navigate(`/my-company/edit?companyId=${companyId}`);
  const handleAutoFillCompany = () => navigate(`/my-company/edit?companyId=${companyId}&openAutoFillCompany=true`);
  const handleEditProduct = () => selectedProductId && navigate(`/my-company/products-edit?companyId=${companyId}&companyName=${encodeURIComponent(companyName)}&selectedProductId=${selectedProductId}&returnPath=/my-company`);
  const handleEditWithAI = () => selectedProductId && navigate(`/my-company/products-edit?companyId=${companyId}&companyName=${encodeURIComponent(companyName)}&selectedProductId=${selectedProductId}&returnPath=/my-company&openAutoFill=true`);
  const handleCreateProduct = () => navigate(`/my-company/products-edit?companyId=${companyId}&companyName=${encodeURIComponent(companyName)}&returnPath=/my-company`);
  const handleCreateWithAI = () => navigate(`/my-company/products-edit?companyId=${companyId}&companyName=${encodeURIComponent(companyName)}&returnPath=/my-company&openAutoFill=true`);

  const confirmDeleteProduct = () => {
    if (!selectedProductId) return;
    setProductToDelete(selectedProductId);
    setShowDeleteDialog(true);
  };
  const confirmDeactivateProduct = () => {
    if (!selectedProductId) return;
    setProductToDeactivate(selectedProductId);
    setShowDeactivateDialog(true);
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      await deleteProduct(productToDelete);
      setSelectedProductId('');
    } finally {
      setShowDeleteDialog(false);
      setProductToDelete(null);
    }
  };
  const handleDeactivateProduct = async () => {
    if (!productToDeactivate) return;
    try {
      await deactivateProduct(productToDeactivate);
      if (selectedProductId === productToDeactivate) {
        await fetchProductRevisions(selectedProductId);
        await fetchProductActivations(selectedProductId);
      }
    } finally {
      setShowDeactivateDialog(false);
      setProductToDeactivate(null);
    }
  };

  return (
    <div className="space-y-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full justify-start gap-4 bg-transparent p-0 mb-4 md:mb-6">
          <TabsTrigger value="rfxs" className="justify-center flex items-center gap-2 text-base px-3 py-2 rounded-xl text-gray-500 hover:text-gray-700 transition-colors data-[state=active]:bg-sky/20 data-[state=active]:text-navy data-[state=active]:ring-1 data-[state=active]:ring-sky">
            <div className="relative">
              <FileText className="w-4 h-4" />
              {pendingRfxForCompany > 0 && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </div>
            RFXs
          </TabsTrigger>
          <TabsTrigger value="company-info" className="justify-center flex items-center gap-2 text-base px-3 py-2 rounded-xl text-gray-500 hover:text-gray-700 transition-colors data-[state=active]:bg-sky/20 data-[state=active]:text-navy data-[state=active]:ring-1 data-[state=active]:ring-sky">
            <Building2 className="w-4 h-4" />
            Company Info
          </TabsTrigger>
          <TabsTrigger value="products-info" className="justify-center flex items-center gap-2 text-base px-3 py-2 rounded-xl text-gray-500 hover:text-gray-700 transition-colors data-[state=active]:bg-sky/20 data-[state=active]:text-navy data-[state=active]:ring-1 data-[state=active]:ring-sky">
            <Package className="w-4 h-4" />
            Products Info
          </TabsTrigger>
          <TabsTrigger value="company-members" className="justify-center flex items-center gap-2 text-base px-3 py-2 rounded-xl text-gray-500 hover:text-gray-700 transition-colors data-[state=active]:bg-sky/20 data-[state=active]:text-navy data-[state=active]:ring-1 data-[state=active]:ring-sky">
            <div className="relative">
              <Users className="w-4 h-4" />
              {pendingRequests.length > 0 && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </div>
            Team Members
          </TabsTrigger>
          <TabsTrigger value="statistics" className="justify-center flex items-center gap-2 text-base px-3 py-2 rounded-xl text-gray-500 hover:text-gray-700 transition-colors data-[state=active]:bg-sky/20 data-[state=active]:text-navy data-[state=active]:ring-1 data-[state=active]:ring-sky">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" asChild>
                  <a href="https://fqsource.com/help/supplier-profile" target="_blank" rel="noopener noreferrer" aria-label="Help">
                    <CircleHelp className="w-4 h-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Help</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TabsList>
        <TabsContent value="rfxs" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  RFXs
                </CardTitle>
                <Button
                  variant={showArchived ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowArchived(!showArchived)}
                  className={showArchived ? "bg-[#22183a] hover:bg-[#22183a]/90 text-white" : ""}
                >
                  {showArchived ? (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      View Active
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4 mr-2" />
                      View Archived
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <CompanyRFXInvitations companyId={companyId} companySlug={companySlug} showArchived={showArchived} onShowArchivedChange={setShowArchived} />
            </CardContent>
          </Card>
          <div style={{ height: '600px' }} />
        </TabsContent>

        <TabsContent value="company-info" className="mt-0">
          <CompanyInfoTab
            companyId={companyId}
            companyName={companyName}
            revisions={revisions}
            loadingRevisions={loadingRevisions}
            activations={activations}
            loadingActivations={loadingActivations}
            activatingRevision={activatingRevision}
            onActivateRevision={activateRevision}
            onPreviewRevision={handlePreviewRevision}
            onEditCompany={handleEditCompany}
            onAutoFillCompany={handleAutoFillCompany}
            revisionsPage={revisionsPage}
            revisionsPerPage={revisionsPerPage}
            setRevisionsPage={setRevisionsPage}
            setRevisionsPerPage={setRevisionsPerPage}
            getTotalRevisionsPages={getTotalRevisionsPages}
            getPaginatedRevisions={() => paginatedRevisions}
            activationsPage={activationsPage}
            activationsPerPage={activationsPerPage}
            setActivationsPage={setActivationsPage}
            setActivationsPerPage={setActivationsPerPage}
            getTotalActivationsPages={getTotalActivationsPages}
            getPaginatedActivations={() => paginatedActivations}
          />
        </TabsContent>

        <TabsContent value="products-info" className="mt-0">
          <ProductsInfoTab
            products={products}
            loadingProducts={loadingProducts}
            selectedProductId={selectedProductId}
            setSelectedProductId={setSelectedProductId}
            setHasUserSelectedProduct={setHasUserSelectedProduct}
            onEditProduct={handleEditProduct}
            onEditWithAI={handleEditWithAI}
            onCreateProduct={handleCreateProduct}
            onCreateWithAI={handleCreateWithAI}
            onConfirmDeleteProduct={confirmDeleteProduct}
            onConfirmDeactivateProduct={confirmDeactivateProduct}
            productRevisions={productRevisions}
            loadingProductRevisions={loadingProductRevisions}
            onPreviewProduct={handlePreviewProduct}
            onActivateProductRevision={activateProductRevision}
            activatingProductRevision={activatingProductRevision}
            productActivations={productActivations}
            loadingProductActivations={loadingProductActivations}
            productActivationsPage={productActivationsPage}
            productActivationsPerPage={productActivationsPerPage}
            setProductActivationsPage={setProductActivationsPage}
            setProductActivationsPerPage={setProductActivationsPerPage}
            getTotalProductActivationsPages={getTotalProductActivationsPages}
            getPaginatedProductActivations={() => paginatedProductActivations}
            productRevisionsPage={productRevisionsPage}
            productRevisionsPerPage={productRevisionsPerPage}
            setProductRevisionsPage={setProductRevisionsPage}
            setProductRevisionsPerPage={setProductRevisionsPerPage}
            getTotalProductRevisionsPages={getTotalProductRevisionsPages}
            getPaginatedProductRevisions={() => paginatedProductRevisions}
          />
        </TabsContent>

        <TabsContent value="company-members" className="mt-6">
            <MembersTab
              pendingRequests={pendingRequests}
              loadingPending={loadingPending}
              processingRequestId={processingRequestId}
              onApproveRequest={handleApproveRequest}
              onRejectRequest={handleRejectRequest}
              members={members}
              loadingMembers={loadingMembers}
              removingMember={removingMember}
              onRemoveAdmin={removeCompanyAdmin}
            />
        </TabsContent>

        <TabsContent value="statistics" className="mt-0">
          <div className="py-10">
            <div className="relative overflow-hidden rounded-2xl border bg-white p-8">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-sky flex items-center justify-center text-navy shadow-sm">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-navy">Analytics Dashboard</h3>
                  <p className="text-sm text-muted-foreground">This section is under development. Soon you’ll see live charts and KPIs here.</p>
                </div>
              </div>

              {/* Visual placeholder content */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl bg-white/70 border p-6">
                  <div className="h-36 bg-gradient-to-t from-sky/30 to-white rounded-md" />
                  <div className="mt-4 h-2 w-3/5 bg-gray-200 rounded" />
                </div>
                <div className="rounded-xl bg-white/70 border p-6">
                  <div className="space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-4/5" />
                    <div className="h-3 bg-gray-200 rounded w-3/5" />
                    <div className="h-3 bg-gray-200 rounded w-2/5" />
                    <div className="mt-4 grid grid-cols-4 gap-2">
                      <div className="h-16 bg-gray-200 rounded" />
                      <div className="h-16 bg-gray-200 rounded" />
                      <div className="h-16 bg-gray-200 rounded" />
                      <div className="h-16 bg-gray-200 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ height: '600px' }} />
          </div>
        </TabsContent>
      </Tabs>

      <CompanyRevisionPreviewModal revision={selectedRevision} isOpen={isPreviewOpen} onClose={handleClosePreview} />
      <ProductRevisionPreviewModal revision={selectedProductRevision} isOpen={isProductPreviewOpen} onClose={handleCloseProductPreview} />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product? This action cannot be undone and will remove all product revisions, documents, and associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteDialog(false); setProductToDelete(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProduct} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Product</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate this product? This action will make the product invisible by deactivating all its revisions. You can reactivate it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeactivateDialog(false); setProductToDeactivate(null); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivateProduct} className="bg-orange-600 text-white hover:bg-orange-700">Deactivate Product</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageCompanyTabRefactored;

