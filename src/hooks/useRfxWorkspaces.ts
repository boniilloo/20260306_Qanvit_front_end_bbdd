import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RfxFilterBy = 'all' | 'member' | 'owner';
export type RfxSortBy = 'date' | 'progress';
export type RfxSortOrder = 'asc' | 'desc';

export interface WorkspaceRfxListOptions {
  searchQuery?: string;
  filterBy?: RfxFilterBy;
  sortBy?: RfxSortBy;
  sortOrder?: RfxSortOrder;
  page?: number;
  itemsPerPage?: number;
}

export interface RfxWorkspace {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDeleteResult {
  deleted_rfx_count: number;
  unassigned_rfx_count: number;
}

export const RFX_WORKSPACES_QUERY_KEY = ['rfx-workspaces'] as const;
export const WORKSPACE_RFXS_QUERY_KEY = ['workspace-rfxs'] as const;
export const UNASSIGNED_RFXS_QUERY_KEY = ['workspace-rfxs-unassigned'] as const;
export const WORKSPACE_RFX_COUNT_QUERY_KEY = ['workspace-rfx-count'] as const;

const sortWorkspacesDesc = (items: RfxWorkspace[]) =>
  [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

const upsertWorkspace = (list: RfxWorkspace[], workspace: RfxWorkspace) => {
  const filtered = list.filter((item) => item.id !== workspace.id);
  return sortWorkspacesDesc([workspace, ...filtered]);
};

const getCurrentUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  return data.user;
};

const getMemberRfxIds = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('rfx_members' as any)
    .select('rfx_id')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return (data || []).map((row: any) => String(row.rfx_id));
};

const applyRfxVisibilityFilters = (
  baseQuery: any,
  userId: string,
  memberIds: string[],
  filterBy: RfxFilterBy,
) => {
  if (filterBy === 'owner') {
    return baseQuery.eq('user_id', userId);
  }

  if (filterBy === 'member') {
    if (memberIds.length === 0) {
      return baseQuery.is('id', null);
    }
    return baseQuery.in('id', memberIds).neq('user_id', userId);
  }

  if (memberIds.length > 0) {
    const orFilters = [
      `user_id.eq.${userId}`,
      `id.in.(${memberIds.map((id) => `"${id}"`).join(',')})`,
    ];
    return baseQuery.or(orFilters.join(','));
  }

  return baseQuery.eq('user_id', userId);
};

const applySearchAndSorting = (
  query: any,
  searchQuery: string,
  sortBy: RfxSortBy,
  sortOrder: RfxSortOrder,
) => {
  let nextQuery = query;
  const trimmedSearch = searchQuery.trim();

  if (trimmedSearch.length > 0) {
    nextQuery = nextQuery.or(`name.ilike.%${trimmedSearch}%,description.ilike.%${trimmedSearch}%`);
  }

  if (sortBy === 'progress') {
    nextQuery = nextQuery
      .order('progress_step', { ascending: sortOrder === 'asc' })
      .order('created_at', { ascending: sortOrder === 'asc' });
  } else {
    nextQuery = nextQuery.order('created_at', { ascending: sortOrder === 'asc' });
  }

  return nextQuery;
};

const listRfxByWorkspace = async (workspaceId: string | null, options: WorkspaceRfxListOptions = {}) => {
  const user = await getCurrentUser();
  if (!user) {
    return { data: [], count: 0 };
  }

  const {
    searchQuery = '',
    filterBy = 'all',
    sortBy = 'date',
    sortOrder = 'desc',
    page = 1,
    itemsPerPage = 12,
  } = options;

  const memberIds = await getMemberRfxIds(user.id);

  let query = (supabase.from('rfxs' as any) as any).select('*', { count: 'exact' });
  query = applyRfxVisibilityFilters(query, user.id, memberIds, filterBy);
  query = workspaceId ? query.eq('workspace_id', workspaceId) : query.is('workspace_id', null);
  query = applySearchAndSorting(query, searchQuery, sortBy, sortOrder);

  const from = (page - 1) * itemsPerPage;
  const to = from + itemsPerPage - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw error;
  }

  return { data: data || [], count: count || 0 };
};

/** Count RFXs in a workspace with the same visibility/search filters as listRfxByWorkspace (no pagination). */
export const countRfxByWorkspace = async (workspaceId: string, options: WorkspaceRfxListOptions = {}) => {
  const user = await getCurrentUser();
  if (!user) return 0;

  const { searchQuery = '', filterBy = 'all' } = options;

  const memberIds = await getMemberRfxIds(user.id);

  let query = (supabase.from('rfxs' as any) as any).select('id', { count: 'exact', head: true });
  query = applyRfxVisibilityFilters(query, user.id, memberIds, filterBy);
  query = query.eq('workspace_id', workspaceId);

  const trimmedSearch = searchQuery.trim();
  if (trimmedSearch.length > 0) {
    query = query.or(`name.ilike.%${trimmedSearch}%,description.ilike.%${trimmedSearch}%`);
  }

  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return count || 0;
};

export const useWorkspaceRfxFolderCounts = (
  workspaceIds: string[],
  options: WorkspaceRfxListOptions,
) => {
  return useQueries({
    queries: workspaceIds.map((id) => ({
      queryKey: [...WORKSPACE_RFX_COUNT_QUERY_KEY, id, options] as const,
      queryFn: () => countRfxByWorkspace(id, options),
      enabled: !!id,
      staleTime: 10_000,
    })),
  });
};

export const useRfxWorkspaces = () => {
  return useQuery({
    queryKey: RFX_WORKSPACES_QUERY_KEY,
    queryFn: async (): Promise<RfxWorkspace[]> => {
      const user = await getCurrentUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('rfx_workspaces' as any)
        .select('id, owner_user_id, name, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as RfxWorkspace[];
    },
    staleTime: 30_000,
  });
};

export const useWorkspaceRfxs = (
  workspaceId: string | null,
  options: WorkspaceRfxListOptions,
  enabled = true,
) => {
  const keySuffix = useMemo(
    () => ({
      workspaceId: workspaceId ?? 'unassigned',
      ...options,
    }),
    [workspaceId, options],
  );

  return useQuery({
    queryKey: workspaceId ? [...WORKSPACE_RFXS_QUERY_KEY, keySuffix] : [...UNASSIGNED_RFXS_QUERY_KEY, keySuffix],
    queryFn: () => listRfxByWorkspace(workspaceId, options),
    enabled,
    staleTime: 10_000,
  });
};

export const useCreateRfxWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string): Promise<RfxWorkspace> => {
      const user = await getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const workspaceName = name.trim();
      if (workspaceName.length === 0) {
        throw new Error('Workspace name is required');
      }

      const { data, error } = await supabase
        .from('rfx_workspaces' as any)
        .insert({
          owner_user_id: user.id,
          name: workspaceName,
        })
        .select('id, owner_user_id, name, created_at, updated_at')
        .single();

      if (error) {
        throw error;
      }

      return data as RfxWorkspace;
    },
    onSuccess: (createdWorkspace) => {
      queryClient.setQueryData<RfxWorkspace[]>(RFX_WORKSPACES_QUERY_KEY, (previous) =>
        upsertWorkspace(previous || [], createdWorkspace),
      );
      queryClient.invalidateQueries({ queryKey: RFX_WORKSPACES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFX_COUNT_QUERY_KEY });
    },
  });
};

export const useDeleteRfxWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      deleteRfxs,
    }: {
      workspaceId: string;
      deleteRfxs: boolean;
    }): Promise<WorkspaceDeleteResult> => {
      const { data, error } = await supabase.rpc('delete_rfx_workspace' as any, {
        p_workspace_id: workspaceId,
        p_delete_rfxs: deleteRfxs,
      });

      if (error) {
        throw error;
      }

      const resultRow = Array.isArray(data) ? data[0] : data;
      return {
        deleted_rfx_count: Number(resultRow?.deleted_rfx_count || 0),
        unassigned_rfx_count: Number(resultRow?.unassigned_rfx_count || 0),
      };
    },
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<RfxWorkspace[]>(RFX_WORKSPACES_QUERY_KEY, (previous) =>
        (previous || []).filter((workspace) => workspace.id !== variables.workspaceId),
      );
      queryClient.invalidateQueries({ queryKey: RFX_WORKSPACES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNASSIGNED_RFXS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: WORKSPACE_RFX_COUNT_QUERY_KEY });
    },
  });
};

export const invalidateRfxWorkspaceQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: RFX_WORKSPACES_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: WORKSPACE_RFXS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: UNASSIGNED_RFXS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: WORKSPACE_RFX_COUNT_QUERY_KEY });
};
