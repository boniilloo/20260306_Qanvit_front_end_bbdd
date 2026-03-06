import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Globe, Eye, RotateCcw, Flag, Trash2, Search, ChevronLeft, ChevronRight, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import CompanyDetailModal from './CompanyDetailModal';
import { useNavigate } from 'react-router-dom';

interface CompanyData {
  id: string;
  url_root: string;
  created_at: string;
  processed: boolean | null;
  role: string;
  to_review: boolean;
  reviewed?: boolean | null;
  product_count?: number;
  company_slug?: string;
}

const URLsTab = () => {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  
  // Search and pagination states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'processed' | 'pending' | 'error'>('all');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'reviewed' | 'not-reviewed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 30;

  const loadCompanies = async (page = currentPage, search = searchTerm, status = statusFilter, review = reviewFilter) => {
    try {
      setLoading(true);
      
      // Build the query with search and pagination
      let query = supabase
        .from('company')
        .select('id, url_root, created_at, processed, role, to_review, reviewed', { count: 'exact' });
      
      // Apply search filter if provided
      if (search.trim()) {
        query = query.ilike('url_root', `%${search.trim()}%`);
      }

      // Apply status filter if not 'all'
      if (status !== 'all') {
        switch (status) {
          case 'processed':
            query = query.eq('processed', true);
            break;
          case 'pending':
            query = query.eq('processed', false);
            break;
          case 'error':
            query = query.is('processed', null);
            break;
        }
      }

      // Apply review filter if not 'all'
      if (review !== 'all') {
        switch (review) {
          case 'reviewed':
            query = query.eq('reviewed', true);
            break;
          case 'not-reviewed':
            query = query.or('reviewed.is.null,reviewed.eq.false');
            break;
        }
      }
      
      // Apply pagination
      const from = (page - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      query = query
        .order('created_at', { ascending: false })
        .range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error loading companies:', error);
        toast({
          title: "Error",
          description: "Failed to load company data.",
          variant: "destructive",
        });
        return;
      }

      // Enrich companies with product count and company slug
      const enrichedCompanies = await Promise.all((data || []).map(async (company) => {
        // Get product count
        const { count: productCount } = await supabase
          .from('product')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', company.id);

        // Get company slug from active company revision
        const { data: companyRevision } = await supabase
          .from('company_revision')
          .select('slug')
          .eq('company_id', company.id)
          .eq('is_active', true)
          .limit(1)
          .single();

        return {
          ...company,
          product_count: productCount || 0,
          company_slug: companyRevision?.slug || null,
        };
      }));

      setCompanies(enrichedCompanies);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading companies:', error);
      toast({
        title: "Error",
        description: "Failed to load company data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, [currentPage]);

  useEffect(() => {
    setCurrentPage(1);
    loadCompanies(1, searchTerm, statusFilter, reviewFilter);
  }, [searchTerm, statusFilter, reviewFilter]);

  // Search and pagination handlers
  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleStatusFilter = (value: 'all' | 'processed' | 'pending' | 'error') => {
    setStatusFilter(value);
  };

  const handleReviewFilter = (value: 'all' | 'reviewed' | 'not-reviewed') => {
    setReviewFilter(value);
  };

  const handleNextPage = () => {
    const totalPages = Math.ceil(totalCount / itemsPerPage);
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalCount);

  const getProcessedStatus = (processed: boolean | null) => {
    if (processed === null) {
      return <Badge variant="destructive">Error</Badge>;
    }
    return processed ? (
      <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-200">
        Processed
      </Badge>
    ) : (
      <Badge variant="secondary">Pending</Badge>
    );
  };

  const getReviewedStatus = (reviewed: boolean | null) => {
    if (reviewed === null || reviewed === false) {
      return <Badge variant="secondary">Not Rev</Badge>;
    }
    return <Badge variant="default" className="bg-blue-100 text-blue-800 hover:bg-blue-200">Rev</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleViewMore = (company: CompanyData) => {
    setSelectedCompany(company);
    setIsModalOpen(true);
  };

  const handleReprocess = async (company: CompanyData) => {
    try {
      setLoading(true);
      
      // First, check if user has developer access
      const { data: developerAccess } = await supabase
        .rpc('has_developer_access');
      
      console.log('User has developer access:', developerAccess);
      
      if (!developerAccess) {
        throw new Error('You need developer access to perform this operation');
      }
      
      console.log('Starting reprocess for company:', company.id);
      
      // Delete in correct order: embeddings -> product_revision -> product -> company_revision -> company
      
      // 1. Get company revision IDs for this company
      const { data: companyRevisions } = await supabase
        .from('company_revision')
        .select('id')
        .eq('company_id', company.id);

      const companyRevisionIds = companyRevisions?.map(cr => cr.id) || [];
      console.log('Company revision IDs:', companyRevisionIds);

      // 2. Get product IDs for this company
      const { data: products } = await supabase
        .from('product')
        .select('id')
        .eq('company_id', company.id);

      const productIds = products?.map(p => p.id) || [];
      console.log('Product IDs:', productIds);

      // 3. Get product revision IDs for these products
      let productRevisionIds: string[] = [];
      if (productIds.length > 0) {
        const { data: productRevisions } = await supabase
          .from('product_revision')
          .select('id')
          .in('product_id', productIds);
        
        productRevisionIds = productRevisions?.map(pr => pr.id) || [];
      }
      console.log('Product revision IDs:', productRevisionIds);

      // 4. Delete embeddings associated with company revisions
      if (companyRevisionIds.length > 0) {
        const { error: embeddingsCompanyError } = await supabase
          .from('embedding')
          .delete()
          .in('id_company_revision', companyRevisionIds);

        if (embeddingsCompanyError) {
          console.error('Error deleting company embeddings:', embeddingsCompanyError);
          throw embeddingsCompanyError;
        }
      }

      // 5. Delete embeddings associated with product revisions
      if (productRevisionIds.length > 0) {
        const { error: embeddingsProductError } = await supabase
          .from('embedding')
          .delete()
          .in('id_product_revision', productRevisionIds);

        if (embeddingsProductError) {
          console.error('Error deleting product embeddings:', embeddingsProductError);
          throw embeddingsProductError;
        }
      }

      // 6. Delete product revisions
      if (productIds.length > 0) {
        const { error: productRevisionsError } = await supabase
          .from('product_revision')
          .delete()
          .in('product_id', productIds);

        if (productRevisionsError) {
          console.error('Error deleting product revisions:', productRevisionsError);
          throw productRevisionsError;
        }
      }

      // 7. Delete products
      const { error: productsError } = await supabase
        .from('product')
        .delete()
        .eq('company_id', company.id);

      if (productsError) {
        console.error('Error deleting products:', productsError);
        throw productsError;
      }

      // 8. Delete company revisions - use multiple deletion attempts
      console.log('Attempting to delete company revisions for company:', company.id);
      
      // Try multiple times to ensure deletion
      let retries = 3;
      let remainingRevisions = [];
      
      for (let i = 0; i < retries; i++) {
        console.log(`Deletion attempt ${i + 1}/${retries}`);
        
        const { error: deleteError } = await supabase
          .from('company_revision')
          .delete()
          .eq('company_id', company.id);
        
        if (deleteError) {
          console.error(`Error on attempt ${i + 1}:`, deleteError);
          if (i === retries - 1) throw deleteError;
        }
        
        // Check remaining
        const { data: checkRemaining } = await supabase
          .from('company_revision')
          .select('id')
          .eq('company_id', company.id);
        
        remainingRevisions = checkRemaining || [];
        console.log(`After attempt ${i + 1}, remaining revisions:`, remainingRevisions.length);
        
        if (remainingRevisions.length === 0) {
          console.log('All company revisions deleted successfully');
          break;
        }
        
        // Wait a bit before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (remainingRevisions.length > 0) {
        console.error('Unable to delete all company revisions after multiple attempts:', remainingRevisions);
        throw new Error(`Unable to delete all company revisions. ${remainingRevisions.length} records remain after ${retries} attempts.`);
      }

      // 9. Delete subscription records first
      const { error: subscriptionError } = await supabase
        .from('subscription')
        .delete()
        .eq('id_company', company.id);

      if (subscriptionError) {
        console.error('Error deleting subscriptions:', subscriptionError);
        throw subscriptionError;
      }

      // 10. Finally delete the company
      const { error: companyError } = await supabase
        .from('company')
        .delete()
        .eq('id', company.id);

      if (companyError) {
        console.error('Error deleting company:', companyError);
        throw companyError;
      }

      console.log('Successfully deleted all data, creating new company...');

      // Create a new company record with the same URL
      const { error: insertError } = await supabase
        .from('company')
        .insert({
          url_root: company.url_root,
          role: 'supplier',
          processed: false,
          to_review: false,
          reviewed: null
        });

      if (insertError) {
        console.error('Error creating new company:', insertError);
        throw insertError;
      }

      toast({
        title: "Success",
        description: "Company reprocessing initiated successfully.",
      });
      
      // Reload the companies list
      await loadCompanies();
    } catch (error) {
      console.error('Error reprocessing company:', error);
      toast({
        title: "Error",
        description: "Failed to reprocess company.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkForReview = async (company: CompanyData) => {
    try {
      // Toggle the to_review status
      const newReviewStatus = !company.to_review;
      
      const { error } = await supabase
        .from('company')
        .update({ to_review: newReviewStatus })
        .eq('id', company.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: newReviewStatus ? "Company marked for review." : "Company unmarked for review.",
      });
      
      // Reload the companies list
      await loadCompanies();
    } catch (error) {
      console.error('Error toggling company review status:', error);
      toast({
        title: "Error",
        description: "Failed to update company review status.",
        variant: "destructive",
      });
    }
  };

  const handleToggleReviewed = async (company: CompanyData) => {
    try {
      // Toggle the reviewed status (null and false are treated the same)
      const currentReviewed = company.reviewed === true;
      const newReviewedStatus = !currentReviewed;
      
      const { error } = await supabase
        .from('company')
        .update({ reviewed: newReviewedStatus })
        .eq('id', company.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: newReviewedStatus ? "Company marked as reviewed." : "Company marked as not reviewed.",
      });
      
      // Reload the companies list
      await loadCompanies();
    } catch (error) {
      console.error('Error toggling company reviewed status:', error);
      toast({
        title: "Error",
        description: "Failed to update company reviewed status.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (company: CompanyData) => {
    try {
      setLoading(true);
      
      // First, check if user has developer access
      const { data: developerAccess } = await supabase
        .rpc('has_developer_access');
      
      console.log('User has developer access:', developerAccess);
      
      if (!developerAccess) {
        throw new Error('You need developer access to perform this operation');
      }
      
      console.log('Starting delete for company:', company.id);
      
      // Delete in correct order: subscription -> embeddings -> product_revision -> product -> company_revision -> company
      
      // 1. Delete subscription records first
      const { error: subscriptionError } = await supabase
        .from('subscription')
        .delete()
        .eq('id_company', company.id);

      if (subscriptionError) {
        console.error('Error deleting subscriptions:', subscriptionError);
        throw subscriptionError;
      }
      
      // 2. Get company revision IDs for this company
      const { data: companyRevisions } = await supabase
        .from('company_revision')
        .select('id')
        .eq('company_id', company.id);

      const companyRevisionIds = companyRevisions?.map(cr => cr.id) || [];
      console.log('Company revision IDs:', companyRevisionIds);

      // 3. Get product IDs for this company
      const { data: products } = await supabase
        .from('product')
        .select('id')
        .eq('company_id', company.id);

      const productIds = products?.map(p => p.id) || [];
      console.log('Product IDs:', productIds);

      // 4. Get product revision IDs for these products
      let productRevisionIds: string[] = [];
      if (productIds.length > 0) {
        const { data: productRevisions } = await supabase
          .from('product_revision')
          .select('id')
          .in('product_id', productIds);
        
        productRevisionIds = productRevisions?.map(pr => pr.id) || [];
      }
      console.log('Product revision IDs:', productRevisionIds);

      // 5. Delete embeddings associated with company revisions
      if (companyRevisionIds.length > 0) {
        const { error: embeddingsCompanyError } = await supabase
          .from('embedding')
          .delete()
          .in('id_company_revision', companyRevisionIds);

        if (embeddingsCompanyError) {
          console.error('Error deleting company embeddings:', embeddingsCompanyError);
          throw embeddingsCompanyError;
        }
      }

      // 6. Delete embeddings associated with product revisions
      if (productRevisionIds.length > 0) {
        const { error: embeddingsProductError } = await supabase
          .from('embedding')
          .delete()
          .in('id_product_revision', productRevisionIds);

        if (embeddingsProductError) {
          console.error('Error deleting product embeddings:', embeddingsProductError);
          throw embeddingsProductError;
        }
      }

      // 7. Delete product revisions
      if (productIds.length > 0) {
        const { error: productRevisionsError } = await supabase
          .from('product_revision')
          .delete()
          .in('product_id', productIds);

        if (productRevisionsError) {
          console.error('Error deleting product revisions:', productRevisionsError);
          throw productRevisionsError;
        }
      }

      // 8. Delete products
      const { error: productsError } = await supabase
        .from('product')
        .delete()
        .eq('company_id', company.id);

      if (productsError) {
        console.error('Error deleting products:', productsError);
        throw productsError;
      }

      // 9. Delete company revisions
      const { error: companyRevisionsError } = await supabase
        .from('company_revision')
        .delete()
        .eq('company_id', company.id);

      if (companyRevisionsError) {
        console.error('Error deleting company revisions:', companyRevisionsError);
        throw companyRevisionsError;
      }

      // 10. Finally delete the company
      const { error: companyError } = await supabase
        .from('company')
        .delete()
        .eq('id', company.id);

      if (companyError) {
        console.error('Error deleting company:', companyError);
        throw companyError;
      }

      toast({
        title: "Success",
        description: "Company deleted successfully.",
      });
      
      // Reload the companies list
      await loadCompanies();
    } catch (error) {
      console.error('Error deleting company:', error);
      toast({
        title: "Error",
        description: "Failed to delete company.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewSupplierProfile = (company: CompanyData) => {
    if (company.company_slug) {
      navigate(`/suppliers/${company.company_slug}`);
    } else {
      toast({
        title: "Error",
        description: "No se puede acceder al perfil del proveedor - slug no disponible",
        variant: "destructive",
      });
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCompany(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            <div>
              <CardTitle>Company URLs</CardTitle>
              <CardDescription>
                Lista de todas las URLs de empresas en la base de datos
              </CardDescription>
            </div>
          </div>
          <Button 
            onClick={() => loadCompanies()} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search and Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Search by URL..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Status Filter */}
          <div className="w-full sm:w-48">
            <Select value={statusFilter} onValueChange={handleStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Review Filter */}
          <div className="w-full sm:w-48">
            <Select value={reviewFilter} onValueChange={handleReviewFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by review" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Review</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="not-reviewed">Not Reviewed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading companies...
          </div>
        ) : (
          <>
            {/* Results Summary */}
              {totalCount > 0 && (
                <div className="mb-4 text-sm text-muted-foreground">
                  Mostrando {startItem}-{endItem} de {totalCount} empresas
                  {searchTerm && ` (filtrado por "${searchTerm}")`}
                  {statusFilter !== 'all' && ` (status: ${statusFilter})`}
                  {reviewFilter !== 'all' && ` (review: ${reviewFilter})`}
                </div>
              )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? `No companies found matching "${searchTerm}"` : "No companies found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    companies.map((company) => (
                      <TableRow key={company.id}>
                        <TableCell className="font-medium">
                          <a 
                            href={company.url_root.startsWith('http') ? company.url_root : `https://${company.url_root}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {company.url_root}
                          </a>
                        </TableCell>
                        <TableCell>{formatDate(company.created_at)}</TableCell>
                        <TableCell>{getProcessedStatus(company.processed)}</TableCell>
                        <TableCell>{getReviewedStatus(company.reviewed)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {company.product_count || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleViewMore(company)}
                              variant="outline"
                              size="sm"
                              className="p-2"
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="p-2 border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                                  title="Reprocess company"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reprocess Company</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will delete all existing data for this company (including revisions, products, and embeddings) and create a new entry for reprocessing. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleReprocess(company)}>
                                    Reprocess
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            <Button
                              onClick={() => handleMarkForReview(company)}
                              variant="outline"
                              size="sm"
                              className={`p-2 ${company.to_review 
                                ? 'border-green-300 text-green-600 bg-green-50 hover:bg-green-100' 
                                : 'border-blue-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700'
                              }`}
                              title={company.to_review ? 'Unmark for review' : 'Mark for review'}
                            >
                              <Flag className="h-4 w-4" />
                            </Button>

                            <Button
                              onClick={() => handleToggleReviewed(company)}
                              variant="outline"
                              size="sm"
                              className={`p-2 ${company.reviewed === true 
                                ? 'border-purple-300 text-purple-600 bg-purple-50 hover:bg-purple-100' 
                                : 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-700'
                              }`}
                              title={company.reviewed === true ? 'Mark as not reviewed' : 'Mark as reviewed'}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>

                            {company.company_slug && (
                              <Button
                                onClick={() => handleViewSupplierProfile(company)}
                                variant="outline"
                                size="sm"
                                className="p-2 border-teal-300 text-teal-600 hover:bg-teal-50 hover:text-teal-700"
                                title="Ver perfil del supplier"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="p-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                                  title="Delete company"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Company</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete this company and all related data (revisions, products, embeddings). This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDelete(company)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalCount > itemsPerPage && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handlePreviousPage}
                    disabled={currentPage === 1}
                    variant="outline"
                    size="sm"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>
                  <Button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    variant="outline"
                    size="sm"
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      
      <CompanyDetailModal
        company={selectedCompany}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </Card>
  );
};

export default URLsTab;