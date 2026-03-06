import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  CompanyActivation,
  CompanyMember,
  CompanyRevision,
  PendingAdminRequest,
  Product,
  ProductActivation,
  ProductRevision,
} from './types';

export const useManageCompanyData = (companyId: string) => {
  const { user } = useAuth();

  // Company level
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [revisions, setRevisions] = useState<CompanyRevision[]>([]);
  const [activations, setActivations] = useState<CompanyActivation[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingAdminRequest[]>([]);

  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [loadingActivations, setLoadingActivations] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);

  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [activatingRevision, setActivatingRevision] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // Products level
  const [products, setProducts] = useState<Product[]>([]);
  const [productRevisions, setProductRevisions] = useState<ProductRevision[]>([]);
  const [productActivations, setProductActivations] = useState<ProductActivation[]>([]);

  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingProductRevisions, setLoadingProductRevisions] = useState(false);
  const [loadingProductActivations, setLoadingProductActivations] = useState(false);
  const [activatingProductRevision, setActivatingProductRevision] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const { data: productIds, error: productError } = await supabase
        .from('product')
        .select('id')
        .eq('company_id', companyId);
      if (productError) return;
      if (!productIds || productIds.length === 0) {
        setProducts([]);
        return;
      }

      const { data: allRevisions, error: revisionError } = await supabase
        .from('product_revision')
        .select('id, product_name, main_category, short_description, is_active, created_at, product_id')
        .in('product_id', productIds.map((p) => p.id))
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (revisionError) return;

      const productsWithRevisions: Product[] = productIds.map((product) => {
        const productRevs = allRevisions?.filter((rev) => rev.product_id === product.id) || [];
        let mostRelevantRevision = productRevs.find((rev) => rev.is_active);
        if (!mostRelevantRevision && productRevs.length > 0) {
          mostRelevantRevision = productRevs[0];
        }
        if (!mostRelevantRevision) {
          return {
            id: product.id,
            product_name: 'Unnamed Product',
            main_category: '',
            short_description: '',
            is_active: false,
            created_at: new Date().toISOString(),
            revision_id: '',
          };
        }
        return {
          id: product.id,
          product_name: mostRelevantRevision.product_name || 'Unnamed Product',
          main_category: mostRelevantRevision.main_category || '',
          short_description: mostRelevantRevision.short_description || '',
          is_active: mostRelevantRevision.is_active,
          created_at: mostRelevantRevision.created_at,
          revision_id: mostRelevantRevision.id,
        };
      });
      setProducts(productsWithRevisions);
    } finally {
      setLoadingProducts(false);
    }
  }, [companyId]);

  const fetchMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const { data: adminRequests, error: adminError } = await supabase
        .from('company_admin_requests')
        .select(`user_id, created_at`)
        .eq('company_id', companyId)
        .eq('status', 'approved');
      if (adminError) return;
      if (!adminRequests || adminRequests.length === 0) {
        setMembers([]);
        return;
      }
      const userIds = adminRequests.map((req) => req.user_id);
      const usersPromises = userIds.map(async (userId) => {
        try {
          const { data: userInfo } = await supabase.rpc('get_user_info_for_company_admins', {
            target_user_id: userId,
          } as any);
          if (userInfo && userInfo.length > 0) {
            const u = userInfo[0];
            return {
              id: u.id,
              auth_user_id: u.id,
              name: u.name || u.email?.split('@')[0] || 'Unknown',
              surname: u.surname || '',
              company_position: 'Company Admin',
              avatar_url: null,
              created_at: new Date().toISOString(),
              email: u.email || 'No email available',
            } as CompanyMember;
          }
        } catch {}
        return null;
      });
      const users = (await Promise.all(usersPromises)).filter(Boolean) as CompanyMember[];
      setMembers(users);
    } finally {
      setLoadingMembers(false);
    }
  }, [companyId]);

  const fetchRevisions = useCallback(async () => {
    setLoadingRevisions(true);
    try {
      const { data, error } = await supabase
        .from('company_revision')
        .select(`
          id,
          company_id,
          nombre_empresa,
          description,
          main_activities,
          strengths,
          sectors,
          website,
          logo,
          is_active,
          created_at,
          source,
          comment,
          created_by,
          contact_emails,
          contact_phones,
          countries,
          cities,
          certifications,
          main_customers,
          gps_coordinates,
          revenues
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) return;

      let transformed = data || [];
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((rev) => rev.created_by).filter(Boolean))];
        if (userIds.length > 0) {
          const usersPromises = userIds.map(async (uid) => {
            try {
              const { data: userInfo } = await supabase.rpc('get_user_info_for_company_admins', { target_user_id: uid } as any);
              if (userInfo && userInfo.length > 0) {
                const u = userInfo[0];
                const displayName = u.name && u.surname ? `${u.name} ${u.surname}`.trim() : u.name || u.email?.split('@')[0] || 'Unknown';
                return { auth_user_id: u.id, displayName, surname: u.surname };
              }
            } catch {}
            return null;
          });
          const users = (await Promise.all(usersPromises)).filter(Boolean) as any[];
          transformed = data.map((revision) => {
            const u = users.find((uu) => uu.auth_user_id === revision.created_by);
            return { 
              ...revision,
              created_by: revision.created_by || '',
              creator_name: u?.displayName || 'Unknown',
              creator_surname: u?.surname || '',
              description: revision.description || '',
              main_activities: revision.main_activities || '',
              strengths: revision.strengths || '',
              sectors: revision.sectors || '',
              website: revision.website || '',
              logo: revision.logo || '',
              comment: revision.comment || '',
              contact_emails: revision.contact_emails || null,
              contact_phones: revision.contact_phones || null,
              countries: revision.countries || null,
              cities: revision.cities || null,
              certifications: revision.certifications || null,
              main_customers: revision.main_customers || null,
              gps_coordinates: revision.gps_coordinates || null,
              revenues: revision.revenues || null
            } as CompanyRevision;
          });
        }
      }
      setRevisions(transformed);
    } finally {
      setLoadingRevisions(false);
    }
  }, [companyId]);

  const fetchActivations = useCallback(async () => {
    setLoadingActivations(true);
    try {
      const { data, error } = await supabase
        .from('company_revision_activations')
        .select(`id, company_revision_id, activated_by, activated_at, company_revision!inner(nombre_empresa, created_at, comment)`)
        .eq('company_revision.company_id', companyId)
        .order('activated_at', { ascending: false });
      if (error) return;
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((item) => item.activated_by))];
        const usersPromises = userIds.map(async (uid) => {
          try {
            const { data: userInfo } = await supabase.rpc('get_user_info_for_company_admins', { target_user_id: uid } as any);
            if (userInfo && userInfo.length > 0) {
              const u = userInfo[0];
              const displayName = u.name && u.surname ? `${u.name} ${u.surname}`.trim() : u.name || u.email?.split('@')[0] || 'Unknown';
              return { auth_user_id: u.id, displayName, surname: u.surname };
            }
          } catch {}
          return null;
        });
        const users = (await Promise.all(usersPromises)).filter(Boolean) as any[];
        const mapped = data.map((a) => {
          const u = users.find((uu) => uu.auth_user_id === a.activated_by);
          return {
            id: a.id,
            company_revision_id: a.company_revision_id,
            activated_by: a.activated_by,
            activated_at: a.activated_at,
            revision_name: (a as any).company_revision?.nombre_empresa || 'Unknown Revision',
            revision_created_at: (a as any).company_revision?.created_at || '',
            revision_comment: (a as any).company_revision?.comment,
            user_name: u?.displayName || 'Unknown',
            user_surname: u?.surname,
          } as CompanyActivation;
        });
        setActivations(mapped);
      } else {
        setActivations([]);
      }
    } finally {
      setLoadingActivations(false);
    }
  }, [companyId]);

  const fetchPendingRequests = useCallback(async () => {
    setLoadingPending(true);
    try {
      const { data, error } = await supabase.rpc('get_company_pending_admin_requests' as any, { p_company_id: companyId });
      if (error) {
        toast({ title: 'Error', description: 'Failed to load pending admin requests', variant: 'destructive' });
        return;
      }
      setPendingRequests((data as PendingAdminRequest[]) || []);
    } finally {
      setLoadingPending(false);
    }
  }, [companyId]);

  const handleApproveRequest = useCallback(async (requestId: string) => {
    setProcessingRequestId(requestId);
    try {
      const { error } = await supabase.rpc('approve_company_admin_request' as any, { p_request_id: requestId });
      if (error) throw error;

      // Get request data for email notification
      const { data: requestData } = await supabase
        .from('company_admin_requests')
        .select('user_id, company_id')
        .eq('id', requestId)
        .single();

      // Send notification email
      if (requestData) {
        try {
          await supabase.functions.invoke('send-admin-notification', {
            body: {
              requestId,
              userId: requestData.user_id,
              companyId: requestData.company_id,
              status: 'approved'
            }
          });
        } catch (emailError) {
          console.error('Failed to send approval email:', emailError);
          // Don't fail the entire operation if email fails
        }
      }

      toast({ title: 'Approved', description: 'The user is now a company admin.' });
      await fetchPendingRequests();
      await fetchMembers();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to approve the request', variant: 'destructive' });
    } finally {
      setProcessingRequestId(null);
    }
  }, [fetchPendingRequests, fetchMembers]);

  const handleRejectRequest = useCallback(async (requestId: string) => {
    setProcessingRequestId(requestId);
    try {
      const { error } = await supabase.rpc('reject_company_admin_request' as any, { p_request_id: requestId, p_rejection_reason: null });
      if (error) throw error;

      // Get request data for email notification
      const { data: requestData } = await supabase
        .from('company_admin_requests')
        .select('user_id, company_id')
        .eq('id', requestId)
        .single();

      // Send notification email
      if (requestData) {
        try {
          await supabase.functions.invoke('send-admin-notification', {
            body: {
              requestId,
              userId: requestData.user_id,
              companyId: requestData.company_id,
              status: 'rejected',
              rejectionReason: null
            }
          });
        } catch (emailError) {
          console.error('Failed to send rejection email:', emailError);
          // Don't fail the entire operation if email fails
        }
      }

      toast({ title: 'Rejected', description: 'The request has been rejected.' });
      await fetchPendingRequests();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to reject the request', variant: 'destructive' });
    } finally {
      setProcessingRequestId(null);
    }
  }, [fetchPendingRequests]);

  const fetchProductRevisions = useCallback(async (productId: string) => {
    setLoadingProductRevisions(true);
    try {
      const { data, error } = await supabase
        .from('product_revision')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      if (error) return;
      const userIds = [...new Set(data?.map((r) => r.created_by).filter(Boolean) || [])];
      let usersData: any[] = [];
      if (userIds.length > 0) {
        const usersPromises = userIds.map(async (uid) => {
          try {
            const { data: userInfo } = await supabase.rpc('get_user_info_for_company_admins', { target_user_id: uid } as any);
            if (userInfo && userInfo.length > 0) {
              const u = userInfo[0];
              const displayName = u.name && u.surname ? `${u.name} ${u.surname}`.trim() : u.name || u.email?.split('@')[0] || 'Unknown';
              return { auth_user_id: u.id, displayName, surname: u.surname };
            }
          } catch {}
          return null;
        });
        usersData = (await Promise.all(usersPromises)).filter(Boolean) as any[];
      }
      const transformed = (data || []).map((rev: any) => {
        const u = usersData.find((uu) => uu.auth_user_id === rev.created_by);
        return { ...rev, creator_name: u?.displayName, creator_surname: u?.surname } as ProductRevision;
      });
      setProductRevisions(transformed);
    } finally {
      setLoadingProductRevisions(false);
    }
  }, []);

  const fetchProductActivations = useCallback(async (productId: string) => {
    setLoadingProductActivations(true);
    try {
      const { data: productRevs, error: revisionsError } = await supabase
        .from('product_revision')
        .select('id')
        .eq('product_id', productId);
      if (revisionsError) return toast({ title: 'Error', description: 'Failed to load product revisions', variant: 'destructive' });
      if (!productRevs || productRevs.length === 0) {
        setProductActivations([]);
        return;
      }
      const revisionIds = productRevs.map((r) => r.id);
      const { data: historyData, error: historyError } = await supabase
        .from('product_revision_history')
        .select('*')
        .in('product_revision_id', revisionIds)
        .order('action_at', { ascending: false });
      if (historyError) return toast({ title: 'Error', description: 'Failed to load product history', variant: 'destructive' });
      if (!historyData || historyData.length === 0) {
        setProductActivations([]);
        return;
      }
      const historyRevisionIds = historyData.map((a) => a.product_revision_id);
      const { data: revisionsData } = await supabase
        .from('product_revision')
        .select('id, product_name, created_at, comment, product_id')
        .in('id', historyRevisionIds);
      const userIds = [...new Set(historyData.map((item) => item.action_by))];
      const { data: users } = await supabase.from('app_user').select('auth_user_id, name, surname').in('auth_user_id', userIds);
      const mapped = historyData.map((h) => {
        const u = users?.find((uu) => uu.auth_user_id === h.action_by);
        const rev = revisionsData?.find((r) => r.id === h.product_revision_id);
        const displayName = u?.name && u?.surname ? `${u.name} ${u.surname}`.trim() : u?.name || 'Unknown';
        return {
          id: h.id,
          product_revision_id: h.product_revision_id,
          action_by: h.action_by,
          action_at: h.action_at,
          action_type: h.action_type,
          revision_name: rev?.product_name || 'Unknown Product',
          revision_created_at: rev?.created_at || '',
          revision_comment: rev?.comment,
          user_name: displayName as string,
          user_surname: u?.surname,
        } as ProductActivation;
      });
      setProductActivations(mapped);
    } finally {
      setLoadingProductActivations(false);
    }
  }, []);

  const activateProductRevision = useCallback(async (productRevisionId: string, productId: string) => {
    if (!user) return;
    setActivatingProductRevision(productRevisionId);
    try {
      const { error: deactivateError } = await supabase.from('product_revision').update({ is_active: false }).eq('product_id', productId);
      if (deactivateError) {
        toast({ title: 'Error', description: `Failed to deactivate product revisions: ${deactivateError.message}`, variant: 'destructive' });
        return;
      }
      const { error: activateError } = await supabase.from('product_revision').update({ is_active: true }).eq('id', productRevisionId);
      if (activateError) {
        toast({ title: 'Error', description: `Failed to activate product revision: ${activateError.message}`, variant: 'destructive' });
        return;
      }
      const { error: activationLogError } = await supabase.from('product_revision_history').insert({ product_revision_id: productRevisionId, action_by: user.id, action_type: 'activation' });
      if (activationLogError) {
        // non-blocking
      }
      toast({ title: 'Success', description: 'Product revision activated successfully!' });
      await fetchProducts();
      await fetchProductRevisions(productId);
      await fetchProductActivations(productId);
    } finally {
      setActivatingProductRevision(null);
    }
  }, [user, fetchProducts, fetchProductRevisions, fetchProductActivations]);

  const activateRevision = useCallback(async (revisionId: string) => {
    if (!user) return;
    setActivatingRevision(revisionId);
    try {
      const { error: deactivateError } = await supabase.rpc('deactivate_company_revisions', { p_company_id: companyId, p_user_id: user.id } as any);
      if (deactivateError) {
        toast({ title: 'Error', description: `Failed to deactivate revisions: ${deactivateError.message}`, variant: 'destructive' });
        return;
      }
      const { error: activateError } = await supabase.from('company_revision').update({ is_active: true }).eq('id', revisionId);
      if (activateError) {
        toast({ title: 'Error', description: `Failed to activate revision: ${activateError.message}`, variant: 'destructive' });
        return;
      }
      const { error: activationLogError } = await supabase.from('company_revision_activations').insert({ company_revision_id: revisionId, activated_by: user.id });
      if (activationLogError) {
        // non-blocking
      }
      toast({ title: 'Success', description: 'Company revision has been activated successfully.' });
      await fetchRevisions();
      await fetchActivations();
    } finally {
      setActivatingRevision(null);
    }
  }, [user, companyId, fetchRevisions, fetchActivations]);

  const deleteProduct = useCallback(async (productId: string) => {
    // Delete embeddings, history, documents, revisions, then product
    const { data: productRevisions, error: getRevisionsError } = await supabase.from('product_revision').select('id').eq('product_id', productId);
    if (getRevisionsError) throw getRevisionsError;
    if (productRevisions && productRevisions.length > 0) {
      const revisionIds = productRevisions.map((r) => r.id);
      
      // Use the database function to properly delete embeddings for each revision
      for (const revisionId of revisionIds) {
        const { error: embeddingError } = await supabase.rpc('delete_product_embeddings', {
          p_product_revision_id: revisionId
        });
        if (embeddingError) throw embeddingError;
      }
      
      const { error: historyError } = await supabase.from('product_revision_history').delete().in('product_revision_id', revisionIds);
      if (historyError) throw historyError;
      const { error: documentsError } = await supabase.from('product_documents').delete().eq('product_id', productId);
      if (documentsError) throw documentsError;
      const { error: revisionsError } = await supabase.from('product_revision').delete().eq('product_id', productId);
      if (revisionsError) throw revisionsError;
    }
    const { error: productError } = await supabase.from('product').delete().eq('id', productId);
    if (productError) throw productError;
    toast({ title: 'Product deleted', description: 'Product has been deleted successfully.' });
    await fetchProducts();
  }, [fetchProducts]);

  const deactivateProduct = useCallback(async (productId: string) => {
    if (!user?.id) return;
    const { data: productRevisions, error: getRevisionsError } = await supabase.from('product_revision').select('id').eq('product_id', productId);
    if (getRevisionsError) throw getRevisionsError;
    if (productRevisions && productRevisions.length > 0) {
      const revisionIds = productRevisions.map((r) => r.id);
      const { error: revisionsError } = await supabase.from('product_revision').update({ is_active: false }).eq('product_id', productId);
      if (revisionsError) throw revisionsError;
      const deactivationEntries = revisionIds.map((revisionId) => ({ product_revision_id: revisionId, action_type: 'deactivation', action_at: new Date().toISOString(), action_by: user.id }));
      const { error: historyError } = await supabase.from('product_revision_history').insert(deactivationEntries);
      if (historyError) throw historyError;
    }
    toast({ title: 'Product deactivated', description: 'All product revisions have been deactivated successfully.' });
    await fetchProducts();
  }, [user, fetchProducts]);

  const removeCompanyAdmin = useCallback(async (userId: string) => {
    if (!user?.id) return;
    
    setRemovingMember(userId);
    try {
      const { error } = await supabase.rpc('remove_company_admin' as any, {
        p_user_id: userId,
        p_company_id: companyId,
        p_removed_by: user.id
      });

      if (error) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to remove admin privileges',
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Admin removed',
        description: 'Administrator privileges have been removed successfully.'
      });

      // Refresh the members list
      await fetchMembers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    } finally {
      setRemovingMember(null);
    }
  }, [user, companyId, fetchMembers]);

  useEffect(() => {
    fetchProducts();
    fetchMembers();
    fetchRevisions();
    fetchActivations();
    fetchPendingRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fetchProducts, fetchMembers, fetchRevisions, fetchActivations, fetchPendingRequests]);

  return {
    // data
    members,
    revisions,
    activations,
    pendingRequests,
    products,
    productRevisions,
    productActivations,
    // loading flags
    loadingMembers,
    loadingRevisions,
    loadingActivations,
    loadingPending,
    loadingProducts,
    loadingProductRevisions,
    loadingProductActivations,
    // action flags
    processingRequestId,
    activatingRevision,
    activatingProductRevision,
    removingMember,
    // fetchers
    fetchProducts,
    fetchMembers,
    fetchRevisions,
    fetchActivations,
    fetchPendingRequests,
    fetchProductRevisions,
    fetchProductActivations,
    // actions
    handleApproveRequest,
    handleRejectRequest,
    activateRevision,
    activateProductRevision,
    deleteProduct,
    deactivateProduct,
    removeCompanyAdmin,
  };
};

export type UseManageCompanyDataReturn = ReturnType<typeof useManageCompanyData>;

