import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { userCrypto } from '@/lib/userCrypto';
import {
  RFX_WORKSPACES_QUERY_KEY,
  WORKSPACE_RFX_COUNT_QUERY_KEY,
  WORKSPACE_RFXS_QUERY_KEY,
  UNASSIGNED_RFXS_QUERY_KEY,
} from '@/hooks/useRfxWorkspaces';

export interface RFX {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'revision requested by buyer' | 'waiting for supplier proposals' | 'closed' | 'cancelled';
  created_at: string;
  updated_at: string;
  progress_step: number;
  workspace_id?: string | null;
  creator_email?: string;
  creator_name?: string;
  creator_surname?: string;
  archived?: boolean;
}

export interface CreateRFXInput {
  name: string;
  description?: string;
  status?: 'draft' | 'revision requested by buyer' | 'waiting for supplier proposals' | 'closed' | 'cancelled';
  workspace_id?: string | null;
}

export interface UpdateRFXInput {
  name?: string;
  description?: string;
  status?: 'draft' | 'revision requested by buyer' | 'waiting for supplier proposals' | 'closed' | 'cancelled';
  workspace_id?: string | null;
}

export interface FetchRFXsOptions {
  page?: number;
  itemsPerPage?: number;
  searchQuery?: string;
  filterBy?: 'all' | 'member' | 'owner';
  sortBy?: 'date' | 'progress';
  sortOrder?: 'asc' | 'desc';
}

export const useRFXs = () => {
  const queryClient = useQueryClient();
  const [rfxs, setRfxs] = useState<RFX[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchOptionsRef = useRef<FetchRFXsOptions>({});
  const { toast } = useToast();

  // Fetch RFXs with server-side pagination and filtering
  const fetchRFXs = useCallback(async (options: FetchRFXsOptions = {}) => {
    // Merge with last options to maintain pagination/filters if not provided
    const mergedOptions = { ...lastFetchOptionsRef.current, ...options };
    lastFetchOptionsRef.current = mergedOptions;
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setError('User not authenticated');
        setRfxs([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const {
        page = 1,
        itemsPerPage = 3,
        searchQuery = '',
        filterBy = 'all',
        sortBy = 'date',
        sortOrder = 'desc'
      } = mergedOptions;


      // Get member RFX IDs first
      const { data: memberRfxIds } = await supabase
        .from('rfx_members' as any)
        .select('rfx_id')
        .eq('user_id', user.id);
      
      const memberIds = memberRfxIds?.map((m: any) => m.rfx_id) || [];
      
      let result: RFX[] = [];
      let totalCountResult = 0;

      // Build base query with shared filters
      const buildBaseQuery = () => {
        let q = (supabase.from('rfxs' as any) as any).select('*', { count: 'exact' });

        if (searchQuery.trim()) {
          const searchTerm = searchQuery.trim();
          q = q.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
        }

        if (sortBy === 'date') {
          q = q.order('created_at', { ascending: sortOrder === 'asc' });
        } else {
          q = q.order('progress_step', { ascending: sortOrder === 'asc' })
               .order('created_at', { ascending: sortOrder === 'asc' });
        }

        return q;
      };

      // Apply ownership filter and fetch
      if (filterBy === 'owner') {
        let query = buildBaseQuery().eq('user_id', user.id);
        
        // Apply pagination
        const from = (page - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;
        query = query.range(from, to);

        const { data, error: fetchError, count } = await query;
        if (fetchError) throw fetchError;
        
        result = (data || []) as RFX[];
        totalCountResult = count || 0;
      } else if (filterBy === 'member') {
        if (memberIds.length > 0) {
          let query = buildBaseQuery().in('id', memberIds).neq('user_id', user.id);
          
          // Apply pagination
          const from = (page - 1) * itemsPerPage;
          const to = from + itemsPerPage - 1;
          query = query.range(from, to);

          const { data, error: fetchError, count } = await query;
          if (fetchError) throw fetchError;
          
          result = (data || []) as RFX[];
          totalCountResult = count || 0;
        } else {
          // No member RFXs, return empty
          setRfxs([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
      } else {
        // 'all' - combine owner and member RFXs
        let query = buildBaseQuery();

        if (memberIds.length > 0) {
          const orFilters = [`user_id.eq.${user.id}`, `id.in.(${memberIds.map((id: string) => `"${id}"`).join(',')})`];
          query = query.or(orFilters.join(','));
        } else {
          query = query.eq('user_id', user.id);
        }

        const from = (page - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;
        const { data, error: fetchError, count } = await query.range(from, to);
        if (fetchError) throw fetchError;

        result = (data || []) as RFX[];
        totalCountResult = count || 0;
      }

      setRfxs(result);
      setTotalCount(totalCountResult);
    } catch (err: any) {
      console.error('❌ [useRFXs] Error fetching RFXs:', err);
      const errorMessage = err.message || err.code || err.details || 'Failed to fetch RFXs';
      console.error('❌ [useRFXs] Error details:', { message: err.message, code: err.code, details: err.details });
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Create a new RFX
  const createRFX = async (input: CreateRFXInput): Promise<RFX | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to create an RFX',
          variant: 'destructive',
        });
        return null;
      }

      // Plan guard (mirrors DB enforcement for better UX)
      try {
        const { data: billingInfo, error: billingError } = await supabase.functions.invoke(
          'billing-manage-subscription',
          {
            body: { action: 'get_info' },
          },
        );

        console.log('[useRFXs createRFX] billing get_info', {
          billingError: billingError?.message ?? null,
          billingInfoError: billingInfo?.error ?? null,
          is_paid_member: billingInfo?.is_paid_member,
          can_create_unlimited_rfx: billingInfo?.can_create_unlimited_rfx,
          max_rfx_owned: billingInfo?.max_rfx_owned,
          tier_code: billingInfo?.tier_code,
        });

        if (!billingError && !billingInfo?.error) {
          const isPaidMember = !!billingInfo?.is_paid_member;
          const canCreateUnlimited = !!billingInfo?.can_create_unlimited_rfx;

          if (!isPaidMember && !canCreateUnlimited) {
            const maxOwned = Number(billingInfo?.max_rfx_owned ?? 1);
            const { count: ownedCount } = await supabase
              .from('rfxs' as any)
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id);

            if ((ownedCount || 0) >= maxOwned) {
              toast({
                title: 'RFX limit reached',
                description: 'Your current plan allows only one active owned RFX. Upgrade your plan or delete your draft RFX.',
                variant: 'warning',
              });
              return null;
            }
          }
        }
      } catch {
        // Ignore guard failure; DB trigger still enforces limits.
      }

      // Get creator info to cache at creation time
      let creatorData: { name?: string | null; surname?: string | null; email?: string | null } = {};
      
      try {
        const { data: creatorInfo, error: creatorError } = await supabase
          .rpc('get_basic_user_info' as any, { p_user_ids: [user.id] });

        if (creatorError) {
          // Continue with empty creator cache if lookup fails.
        } else {
          creatorData = creatorInfo?.[0] || {};
        }
      } catch (err) {
        // Continue with empty creator cache if lookup fails.
      }

      const { data, error: createError } = await supabase
        .from('rfxs' as any)
        .insert([
          {
            user_id: user.id,
            name: input.name,
            description: input.description || null,
            status: input.status || 'draft',
            workspace_id: input.workspace_id ?? null,
            progress_step: 0,
            creator_name: creatorData.name || null,
            creator_surname: creatorData.surname || null,
            creator_email: creatorData.email || null,
          },
        ])
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      // --- Crypto Implementation ---
      try {
        // 1. Ensure user has keys (idempotent)
        await userCrypto.initializeUserKeys(user.id);
        
        // 2. Get user's public key
        const { data: userData, error: userKeyError } = await supabase
          .from('app_user')
          .select('public_key')
          .eq('auth_user_id', user.id)
          .single();
          
        if (userKeyError) {
          throw new Error(`Could not retrieve user public key: ${userKeyError.message}`);
        }
        
        if (!userData?.public_key) {
          throw new Error('Could not retrieve user public key: public_key is null or undefined');
        }

        // 3. Generate symmetric key for the RFX
        const symmetricKey = await userCrypto.generateSymmetricKey();
        
        // 4. Encrypt symmetric key with user's public key
        const encryptedSymmetricKey = await userCrypto.encryptSymmetricKeyWithPublicKey(
          symmetricKey, 
          userData.public_key
        );
        
        // 5. Store the encrypted key
        const { error: keyError } = await supabase
          .from('rfx_key_members' as any)
          .insert({
            rfx_id: (data as any).id,
            user_id: user.id,
            encrypted_symmetric_key: encryptedSymmetricKey
          });
          
        if (keyError) {
          // Optional: We could delete the RFX here to maintain consistency
          // await deleteRFX((data as any).id); 
          // throw new Error('Failed to secure RFX');
        }
      } catch (cryptoError) {
        // Decide if this should block creation success. 
        // For now, we log it but don't fail the whole operation, 
        // although in production this should probably be a hard failure.
        toast({
          title: 'Security Warning',
          description: 'RFX created but encryption setup failed. Please contact support.',
          variant: 'destructive',
        });
      }
      // -----------------------------

      toast({
        title: 'Success',
        description: 'RFX created successfully',
      });

      // Refresh the list asynchronously (this will trigger loading state in the component)
      // Don't await - let the modal close and show loading state
      fetchRFXs().then(() => {
        // List refresh completed
      }).catch(() => {});

      // Notify other UI surfaces (e.g. sidebar) to update immediately without full reload.
      window.dispatchEvent(
        new CustomEvent('rfx-created', {
          detail: {
            id: (data as any).id,
            user_id: (data as any).user_id,
            name: (data as any).name || 'Untitled RFX',
            status: (data as any).status || 'draft',
            created_at: (data as any).created_at,
            workspace_id: (data as any).workspace_id ?? null,
          },
        })
      );

      queryClient.invalidateQueries({ queryKey: RFX_WORKSPACES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNASSIGNED_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFX_COUNT_QUERY_KEY });

      return data as unknown as RFX;
    } catch (err: any) {
      const rawMessage = err?.message || 'Failed to create RFX';
      const isPlanLimitError = String(rawMessage).toLowerCase().includes('limit reached');
      toast({
        title: isPlanLimitError ? 'RFX limit reached' : 'Error',
        description: isPlanLimitError
          ? 'Free plan users can only have one owned RFX. Delete your draft or upgrade from My Subscription.'
          : rawMessage,
        variant: isPlanLimitError ? 'warning' : 'destructive',
      });
      return null;
    }
  };

  // Update an existing RFX
  const updateRFX = async (id: string, input: UpdateRFXInput): Promise<boolean> => {
    try {
      const { data: updatedRfx, error: updateError } = await supabase
        .from('rfxs' as any)
        .update(input)
        .eq('id', id)
        .select('id, user_id, name, status, created_at, workspace_id')
        .single();

      if (updateError) {
        throw updateError;
      }

      toast({
        title: 'Success',
        description: 'RFX updated successfully',
      });

      // Refresh the list
      await fetchRFXs();
      queryClient.invalidateQueries({ queryKey: RFX_WORKSPACES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNASSIGNED_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFX_COUNT_QUERY_KEY });

      // Notify other UI surfaces (e.g. sidebar) for immediate workspace/status refresh.
      if (updatedRfx) {
        window.dispatchEvent(
          new CustomEvent('rfx-updated', {
            detail: {
              id: (updatedRfx as any).id,
              user_id: (updatedRfx as any).user_id,
              name: (updatedRfx as any).name || 'Untitled RFX',
              status: (updatedRfx as any).status || 'draft',
              created_at: (updatedRfx as any).created_at,
              workspace_id: (updatedRfx as any).workspace_id ?? null,
            },
          }),
        );
      }

      return true;
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update RFX',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Archive an RFX (only owner can archive)
  const archiveRFX = async (id: string, archived: boolean): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in',
          variant: 'destructive',
        });
        return false;
      }

      // Check if user is the owner
      const rfx = rfxs.find(r => r.id === id);
      if (!rfx || rfx.user_id !== user.id) {
        toast({
          title: 'Error',
          description: 'Only the RFX creator can archive it',
          variant: 'destructive',
        });
        return false;
      }

      const { error: archiveError } = await supabase
        .from('rfxs' as any)
        .update({ archived })
        .eq('id', id);

      if (archiveError) {
        throw archiveError;
      }

      toast({
        title: 'Success',
        description: archived ? 'RFX archived successfully' : 'RFX unarchived successfully',
      });

      // Refresh the list
      await fetchRFXs();
      queryClient.invalidateQueries({ queryKey: RFX_WORKSPACES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNASSIGNED_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFX_COUNT_QUERY_KEY });

      return true;
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to archive RFX',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Delete an RFX
  const deleteRFX = async (id: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('rfxs' as any)
        .delete()
        .eq('id', id);

      if (deleteError) {
        throw deleteError;
      }

      // Clean up localStorage cache for this RFX
      try {
        localStorage.removeItem(`rfx_members_${id}`);
      } catch (e) {
        // Ignore localStorage errors
      }

      toast({
        title: 'Success',
        description: 'RFX deleted successfully',
      });

      // Notify other UI surfaces (e.g. sidebar) to remove deleted RFX immediately.
      window.dispatchEvent(
        new CustomEvent('rfx-deleted', {
          detail: {
            id,
          },
        })
      );

      // Refresh the list
      await fetchRFXs();
      queryClient.invalidateQueries({ queryKey: RFX_WORKSPACES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNASSIGNED_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFX_COUNT_QUERY_KEY });

      return true;
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete RFX',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Fetch RFXs on mount
  useEffect(() => {
    fetchRFXs({
      page: 1,
      itemsPerPage: 3,
      searchQuery: '',
      filterBy: 'all',
      sortBy: 'date',
      sortOrder: 'desc',
    });
  }, [fetchRFXs]);

  return {
    rfxs,
    totalCount,
    loading,
    error,
    fetchRFXs,
    createRFX,
    updateRFX,
    archiveRFX,
    deleteRFX,
  };
};

