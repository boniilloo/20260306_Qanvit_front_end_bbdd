import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parseISO, addDays, addWeeks, addMonths, addYears, differenceInDays, startOfDay } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

export interface TimelineMilestone {
  id: string;
  label: string;
  key: string;
  date: {
    type: 'absolute' | 'relative';
    date?: string; // ISO string for absolute
    amount?: number;
    unit?: 'days' | 'weeks' | 'months' | 'years';
    from?: 'rfq_launch' | 'previous';
  };
}

export interface NextDeadline {
  date: Date;
  label: string;
  daysRemaining: number;
}

export interface CompanyRFXInvitation {
  id: string;
  rfx_id: string;
  company_id: string;
  status: string;
  created_at: string;
  archived?: boolean;
  rfx_name?: string;
  rfx_description?: string;
  rfx_creator_email?: string;
  nextDeadline?: NextDeadline | null;
}

export interface NDAMetadata {
  rfx_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

export interface SignedNDAMetadata {
  rfx_company_invitation_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

// Helper function to compute absolute date from timeline milestone
function computeAbsoluteDate(index: number, items: TimelineMilestone[], rfqLaunchDate?: string | null): Date | null {
  const item = items[index];
  if (!item) return null;
  if (item.date.type === 'absolute' && item.date.date) {
    try { return parseISO(item.date.date); } catch { return null; }
  }
  if (item.date.type === 'relative') {
    const fromDate = item.date.from === 'rfq_launch'
      ? (rfqLaunchDate ? parseISO(rfqLaunchDate) : null)
      : computeAbsoluteDate(index - 1, items, rfqLaunchDate);
    if (!fromDate) return null;
    const { amount, unit } = item.date;
    if (amount === undefined || !unit) return null;
    switch (unit) {
      case 'days': return addDays(fromDate, amount);
      case 'weeks': return addWeeks(fromDate, amount);
      case 'months': return addMonths(fromDate, amount);
      case 'years': return addYears(fromDate, amount);
    }
  }
  return null;
}

// Helper function to find next deadline from timeline
function findNextDeadline(timeline: TimelineMilestone[] | null): NextDeadline | null {
  if (!timeline || timeline.length === 0) return null;

  // Find RFX launch date (absolute date)
  let rfqLaunchDate: string | null = null;
  for (const milestone of timeline) {
    if (milestone.key === 'rfx_launch' && milestone.date.type === 'absolute' && milestone.date.date) {
      rfqLaunchDate = milestone.date.date;
      break;
    }
  }

  const now = startOfDay(new Date());
  let nextDeadline: { date: Date; label: string } | null = null;

  // Calculate absolute dates for all milestones
  for (let i = 0; i < timeline.length; i++) {
    const milestone = timeline[i];
    const absoluteDate = computeAbsoluteDate(i, timeline, rfqLaunchDate);
    
    if (absoluteDate && absoluteDate >= now) {
      const dateStart = startOfDay(absoluteDate);
      if (!nextDeadline || dateStart < nextDeadline.date) {
        nextDeadline = {
          date: dateStart,
          label: milestone.label
        };
      }
    }
  }

  if (!nextDeadline) return null;

  const daysRemaining = differenceInDays(nextDeadline.date, now);
  return {
    date: nextDeadline.date,
    label: nextDeadline.label,
    daysRemaining: Math.max(0, daysRemaining)
  };
}

export function useCompanyRFXInvitations(companyId: string | null, page: number = 1, perPage: number = 5, searchQuery: string = '', statusFilter: string = 'all', showArchived: boolean = false) {
  const [invitations, setInvitations] = useState<CompanyRFXInvitation[]>([]);
  const [ndaMetadata, setNdaMetadata] = useState<Record<string, NDAMetadata>>({});
  const [signedNdaMetadata, setSignedNdaMetadata] = useState<Record<string, SignedNDAMetadata>>({});
  const [loading, setLoading] = useState(false);
  const [uploadingSignedNda, setUploadingSignedNda] = useState<Record<string, boolean>>({});
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const loadInvitations = useCallback(async () => {
    if (!companyId) {
      setInvitations([]);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    try {
      let rfxIdsToFilter: string[] | null = null;

      // If there's a search query, first find matching RFXs
      if (searchQuery.trim()) {
        const searchTerm = `%${searchQuery.trim()}%`;
        
        // Search in rfxs table by name or description
        // Use two separate queries and combine results, or use textSearch if available
        let matchingRfxIds: string[] = [];
        
        // Search by name
        const { data: nameData, error: nameError } = await supabase
          .from('rfxs' as any)
          .select('id')
          .ilike('name', searchTerm);

        // Search by description
        const { data: descData, error: descError } = await supabase
          .from('rfxs' as any)
          .select('id')
          .ilike('description', searchTerm);

        // Combine results and remove duplicates
        const allIds = new Set<string>();
        if (!nameError && nameData) {
          nameData.forEach((r: any) => allIds.add(r.id));
        }
        if (!descError && descData) {
          descData.forEach((r: any) => allIds.add(r.id));
        }

        matchingRfxIds = Array.from(allIds);

        if (matchingRfxIds.length === 0) {
          // No matching RFXs, return empty results
          setInvitations([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }

        rfxIdsToFilter = matchingRfxIds;
      }

      // Determine status filter values based on statusFilter parameter
      let statusValues: string[] | null = null;
      if (statusFilter !== 'all') {
        if (statusFilter === 'new_invitation') {
          statusValues = [
            'waiting for supplier approval',
            'waiting NDA signing',
            'waiting for NDA signature validation',
            'NDA signed by supplier'
          ];
        } else if (statusFilter === 'under_review') {
          statusValues = ['supplier evaluating RFX'];
        } else if (statusFilter === 'submitted') {
          statusValues = ['submitted'];
        }
      }

      // Build the query for invitations
      let countQuery = supabase
        .from('rfx_company_invitations' as any)
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

      let dataQuery = supabase
        .from('rfx_company_invitations' as any)
        .select('id, rfx_id, company_id, status, created_at, archived')
        .eq('company_id', companyId);

      // Apply archived filter
      if (showArchived) {
        countQuery = countQuery.eq('archived', true);
        dataQuery = dataQuery.eq('archived', true);
      } else {
        // For non-archived, filter by false (null values should be treated as false due to DEFAULT FALSE NOT NULL)
        countQuery = countQuery.eq('archived', false);
        dataQuery = dataQuery.eq('archived', false);
      }

      // Apply search filter if we have matching RFX IDs
      if (rfxIdsToFilter) {
        countQuery = countQuery.in('rfx_id', rfxIdsToFilter);
        dataQuery = dataQuery.in('rfx_id', rfxIdsToFilter);
      }

      // Apply status filter if we have status values
      if (statusValues && statusValues.length > 0) {
        countQuery = countQuery.in('status', statusValues);
        dataQuery = dataQuery.in('status', statusValues);
      }

      // Get total count
      const { count, error: countError } = await countQuery;

      if (countError) {
        console.error('Error getting count:', countError);
      } else {
        setTotalCount(count || 0);
      }

      // Calculate pagination range
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;

      // Get RFX invitations with pagination
      const { data, error } = await dataQuery
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Fetch RFX info with creator email using RPC function to avoid RLS recursion
      // The creator_email, creator_name, and creator_surname fields are cached at RFX creation time
      const rfxIds = Array.from(new Set((data || []).map((d: any) => d.rfx_id)));
      let rfxMap: Record<string, { name: string; description: string | null; creator_email: string | null; sent_commit_id: string | null }> = {};
      if (rfxIds.length > 0) {
        // Use RPC function to get RFX info (avoids RLS recursion issues)
        const { data: rfxData, error: rfxError } = await supabase
          .rpc('get_rfx_basic_info_for_suppliers', { p_rfx_ids: rfxIds });

        if (rfxError) {
          console.warn('get_rfx_basic_info_for_suppliers RPC failed:', rfxError);
          // Fallback: try direct query (may fail for suppliers due to RLS, but works for owners)
          const { data: fallbackData } = await supabase
            .from('rfxs' as any)
            .select('id, name, description, creator_email, sent_commit_id')
            .in('id', rfxIds);
          
          if (fallbackData) {
            rfxMap = fallbackData.reduce((acc: any, r: any) => {
              acc[r.id] = {
                name: r.name,
                description: r.description ?? null,
                creator_email: r.creator_email ?? null,
                sent_commit_id: r.sent_commit_id ?? null,
              };
              return acc;
            }, {});
          }
        } else {
          rfxMap = (rfxData || []).reduce((acc: any, r: any) => {
            acc[r.id] = {
              name: r.name,
              description: r.description ?? null,
              creator_email: r.creator_email ?? null,
              sent_commit_id: r.sent_commit_id ?? null,
            };
            return acc;
          }, {});
        }
      }

      // Load timelines for RFXs that have sent_commit_id
      const commitIds = Array.from(new Set(
        Object.values(rfxMap)
          .map(r => r.sent_commit_id)
          .filter((id): id is string => id !== null)
      ));

      const timelineMap: Record<string, TimelineMilestone[] | null> = {};
      if (commitIds.length > 0) {
        const { data: commitData, error: commitError } = await supabase
          .from('rfx_specs_commits' as any)
          .select('id, timeline')
          .in('id', commitIds);

        if (!commitError && commitData) {
          commitData.forEach((commit: any) => {
            timelineMap[commit.id] = commit.timeline as TimelineMilestone[] | null;
          });
        }
      }

      // Create a map from rfx_id to timeline (via sent_commit_id)
      const rfxTimelineMap: Record<string, TimelineMilestone[] | null> = {};
      Object.entries(rfxMap).forEach(([rfxId, rfxInfo]) => {
        if (rfxInfo.sent_commit_id) {
          rfxTimelineMap[rfxId] = timelineMap[rfxInfo.sent_commit_id] || null;
        }
      });

      const invitationsWithMeta = (data || []).map((row: any) => {
        const timeline = rfxTimelineMap[row.rfx_id] || null;
        const nextDeadline = findNextDeadline(timeline);
        
        return {
          ...row, 
          archived: row.archived || false,
          rfx_name: rfxMap[row.rfx_id]?.name, 
          rfx_description: rfxMap[row.rfx_id]?.description,
          rfx_creator_email: rfxMap[row.rfx_id]?.creator_email,
          nextDeadline: nextDeadline
        };
      });
      
      setInvitations(invitationsWithMeta);

      // Load NDA metadata - using rfx_id (one NDA per RFX)
      if (invitationsWithMeta.length > 0) {
        const rfxIds = Array.from(new Set(invitationsWithMeta.map(inv => inv.rfx_id)));
        const { data: ndaData } = await supabase
          .from('rfx_nda_uploads')
          .select('rfx_id, file_path, file_name, file_size, uploaded_at')
          .in('rfx_id', rfxIds);
        
        const ndaMap: {[key: string]: NDAMetadata} = {};
        (ndaData || []).forEach(nda => {
          ndaMap[nda.rfx_id] = {
            rfx_id: nda.rfx_id,
            file_path: nda.file_path,
            file_name: nda.file_name,
            file_size: nda.file_size,
            uploaded_at: nda.uploaded_at,
          };
        });
        setNdaMetadata(ndaMap);

        // Load signed NDAs
        const invitationIds = invitationsWithMeta.map(inv => inv.id);
        
        const { data: signedNdaData, error: signedNdaError } = await supabase
          .from('rfx_signed_nda_uploads' as any)
          .select('rfx_company_invitation_id, file_path, file_name, file_size, uploaded_at')
          .in('rfx_company_invitation_id', invitationIds);
        
        if (signedNdaError) {
          console.error('Error loading signed NDAs:', signedNdaError);
        }
        
        // Preserve existing signed NDAs and merge with new data
        // This prevents the UI from flickering or losing data during reload
        setSignedNdaMetadata(prev => {
          const newMap: {[key: string]: SignedNDAMetadata} = { ...prev };
          
          (signedNdaData || []).forEach(signedNda => {
            newMap[signedNda.rfx_company_invitation_id] = signedNda;
          });
          
          // Remove NDAs for invitations that no longer exist
          const validInvitationIds = new Set(invitationIds);
          Object.keys(newMap).forEach(key => {
            if (!validInvitationIds.has(key)) {
              delete newMap[key];
            }
          });
          
          return newMap;
        });
      }
    } catch (e: any) {
      console.error('Error loading company RFX invitations:', e);
      const errorMessage = e?.message || e?.details || 'Failed to load RFX invitations';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, page, perPage, searchQuery, statusFilter, showArchived, toast]);

  const acceptInvitation = useCallback(async (invitationId: string) => {
    try {
      // Get invitation data directly from database to avoid race condition with local state
      const { data: invitation, error: invError } = await supabase
        .from('rfx_company_invitations' as any)
        .select('id, rfx_id, status')
        .eq('id', invitationId)
        .single();

      if (invError) {
        throw new Error('Failed to fetch invitation details');
      }

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'waiting for supplier approval') {
        throw new Error('Invitation has already been processed');
      }

      // Check if NDA exists for this RFX (one NDA per RFX)
      const { data: nda, error: ndaError } = await supabase
        .from('rfx_nda_uploads')
        .select('id')
        .eq('rfx_id', invitation.rfx_id)
        .maybeSingle();

      // If there was an error querying NDA (not just no results), throw it
      if (ndaError) {
        console.error('Error checking NDA:', ndaError);
        throw new Error('Failed to verify NDA requirements');
      }

      const nextStatus = nda ? 'waiting NDA signing' : 'supplier evaluating RFX';
      
      const { error } = await supabase
        .from('rfx_company_invitations' as any)
        .update({ status: nextStatus })
        .eq('id', invitationId)
        .eq('status', 'waiting for supplier approval');

      if (error) throw error;

      // For RFX without NDA: verify that company keys exist
      // Keys should have been generated when the developer approved the RFX
      // If they don't exist, it might be a race condition or the developer hasn't approved yet
      if (!nda && companyId) {
        try {
          const { data: companyKey, error: keyCheckError } = await supabase
            .from('rfx_company_keys')
            .select('rfx_id, company_id')
            .eq('rfx_id', invitation.rfx_id)
            .eq('company_id', companyId)
            .maybeSingle();
          
          if (keyCheckError) {
            console.warn('⚠️ [Accept Invitation] Error checking company key:', keyCheckError);
          } else if (!companyKey) {
            console.warn('⚠️ [Accept Invitation] Company key not found for RFX without NDA. This might indicate:');
            console.warn('   1. The developer has not yet approved the RFX');
            console.warn('   2. A race condition occurred');
            console.warn('   3. Key generation failed during approval');
            // Don't block the flow, but log the warning
          }
        } catch (keyCheckErr) {
          console.warn('⚠️ [Accept Invitation] Error verifying company key:', keyCheckErr);
          // Don't block the flow
        }
      }

      // Reload invitations to ensure UI is in sync with database
      await loadInvitations();

      toast({ 
        title: 'Invitation accepted', 
        description: nda 
          ? 'Please sign the NDA to access the RFX details' 
          : 'You can now access the RFX details'
      });
    } catch (e: any) {
      console.error('Accept error:', e);
      toast({ 
        title: 'Error', 
        description: e?.message || 'Failed to accept invitation', 
        variant: 'destructive' 
      });
    }
  }, [toast, loadInvitations]);

  const declineInvitation = useCallback(async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('rfx_company_invitations' as any)
        .update({ status: 'declined' })
        .eq('id', invitationId)
        .eq('status', 'waiting for supplier approval');

      if (error) throw error;

      setInvitations(prev => prev.map(r => r.id === invitationId ? { ...r, status: 'declined' } : r));
      toast({ title: 'Invitation declined' });
    } catch (e: any) {
      console.error('Decline error:', e);
      toast({ 
        title: 'Error', 
        description: 'Failed to decline invitation', 
        variant: 'destructive' 
      });
    }
  }, [toast]);

  const uploadSignedNDA = useCallback(async (invitationId: string, file: File, onSuccess?: () => void) => {
    setUploadingSignedNda(prev => ({ ...prev, [invitationId]: true }));
    
    try {
      // Validate file type
      if (file.type !== 'application/pdf') {
        throw new Error('Only PDF files are allowed for signed NDAs');
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size must be less than 10MB');
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if there's an existing NDA and delete it before uploading new one
      // Query directly from DB to ensure we have the latest data
      const { data: existingNdaData, error: queryError } = await supabase
        .from('rfx_signed_nda_uploads' as any)
        .select('file_path')
        .eq('rfx_company_invitation_id', invitationId)
        .maybeSingle();

      if (queryError && queryError.code !== 'PGRST116') {
        console.error('Error querying existing NDA:', queryError);
      }

      if (existingNdaData) {
        // Delete old file from storage
        const { error: deleteStorageError } = await supabase.storage
          .from('rfx-signed-ndas')
          .remove([existingNdaData.file_path]);

        if (deleteStorageError) {
          console.error('Error deleting old NDA from storage:', deleteStorageError);
          // Continue anyway, as the file might not exist
        }

        // Delete old metadata from database
        const { error: deleteDbError } = await supabase
          .from('rfx_signed_nda_uploads' as any)
          .delete()
          .eq('rfx_company_invitation_id', invitationId);

        if (deleteDbError) {
          console.error('Error deleting old NDA from database:', deleteDbError);
          // Continue anyway, will try to insert new one
        }
      }

      // Upload new file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${invitationId}-${Date.now()}.${fileExt}`;
      const filePath = `signed-ndas/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('rfx-signed-ndas')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Save metadata to database
      const { data: insertedData, error: dbError } = await supabase
        .from('rfx_signed_nda_uploads' as any)
        .insert({
          rfx_company_invitation_id: invitationId,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          uploaded_by: user.id,
          uploaded_at: new Date().toISOString()
        })
        .select('rfx_company_invitation_id, file_path, file_name, file_size, uploaded_at')
        .single();

      if (dbError) throw dbError;

      // Update invitation status to 'NDA signed by supplier'
      const { error: statusError } = await supabase
        .from('rfx_company_invitations' as any)
        .update({ status: 'NDA signed by supplier' })
        .eq('id', invitationId);

      if (statusError) {
        console.error('Error updating invitation status:', statusError);
        // Don't throw here, as the NDA was uploaded successfully
      }

      // Use the inserted data directly instead of querying again
      if (insertedData && !dbError) {
        const signedNdaData = insertedData as any;
        setSignedNdaMetadata(prev => ({
          ...prev,
          [invitationId]: {
            rfx_company_invitation_id: signedNdaData.rfx_company_invitation_id || invitationId,
            file_path: signedNdaData.file_path || filePath,
            file_name: signedNdaData.file_name || file.name,
            file_size: signedNdaData.file_size || file.size,
            uploaded_at: signedNdaData.uploaded_at || new Date().toISOString()
          }
        }));
      } else {
        // Fallback if insert didn't return data
        setSignedNdaMetadata(prev => ({
          ...prev,
          [invitationId]: {
            rfx_company_invitation_id: invitationId,
            file_path: filePath,
            file_name: file.name,
            file_size: file.size,
            uploaded_at: new Date().toISOString()
          }
        }));
      }

      // Update invitation status in local state
      setInvitations(prev => prev.map(inv => 
        inv.id === invitationId 
          ? { ...inv, status: 'NDA signed by supplier' }
          : inv
      ));

      toast({ 
        title: 'Success', 
        description: 'Signed NDA uploaded successfully' 
      });

      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (e: any) {
      console.error('Upload error:', e);
      toast({ 
        title: 'Error', 
        description: 'Failed to upload signed NDA', 
        variant: 'destructive' 
      });
    } finally {
      setUploadingSignedNda(prev => ({ ...prev, [invitationId]: false }));
    }
  }, [toast, loadInvitations]);

  const downloadNDA = useCallback(async (rfxId: string) => {
    try {
      const nda = ndaMetadata[rfxId];
      if (!nda) return;

      const { data, error } = await supabase.storage
        .from('rfx-ndas')
        .download(nda.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = nda.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Download error:', e);
      toast({ 
        title: 'Error', 
        description: 'Failed to download NDA', 
        variant: 'destructive' 
      });
    }
  }, [ndaMetadata, toast]);

  const downloadSignedNDA = useCallback(async (invitationId: string) => {
    try {
      const signedNda = signedNdaMetadata[invitationId];
      if (!signedNda) {
        toast({
          title: 'Error',
          description: 'No signed NDA found to download',
          variant: 'destructive',
        });
        return;
      }

      const { data, error } = await supabase.storage
        .from('rfx-signed-ndas')
        .download(signedNda.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = signedNda.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Download signed NDA error:', e);
      toast({
        title: 'Error',
        description: 'Failed to download signed NDA',
        variant: 'destructive',
      });
    }
  }, [signedNdaMetadata, toast]);

  const deleteSignedNDA = useCallback(async (invitationId: string) => {
    try {
      // Get existing NDA from database
      const { data: existingNdaData, error: queryError } = await supabase
        .from('rfx_signed_nda_uploads' as any)
        .select('file_path')
        .eq('rfx_company_invitation_id', invitationId)
        .maybeSingle();

      if (queryError && queryError.code !== 'PGRST116') {
        throw queryError;
      }

      if (!existingNdaData) {
        toast({
          title: 'No NDA found',
          description: 'There is no signed NDA to delete',
          variant: 'destructive',
        });
        return;
      }

      const filePath = existingNdaData.file_path;
      let storageDeleted = false;
      let dbDeleted = false;

      // Delete file from storage
      const { error: deleteStorageError } = await supabase.storage
        .from('rfx-signed-ndas')
        .remove([filePath]);

      if (deleteStorageError) {
        // Check if error is because file doesn't exist (that's ok)
        if (deleteStorageError.message?.includes('not found') || deleteStorageError.message?.includes('does not exist')) {
          console.log('File already deleted from storage, continuing...');
          storageDeleted = true;
        } else {
          console.error('Error deleting NDA from storage:', deleteStorageError);
          // Continue to delete from DB anyway, but log the error
        }
      } else {
        storageDeleted = true;
      }

      // Delete metadata from database (always try to delete, even if storage deletion failed)
      const { error: deleteDbError } = await supabase
        .from('rfx_signed_nda_uploads' as any)
        .delete()
        .eq('rfx_company_invitation_id', invitationId);

      if (deleteDbError) {
        throw deleteDbError;
      }
      
      dbDeleted = true;

      // If storage deletion failed but it wasn't a "not found" error, warn the user
      if (!storageDeleted && !deleteStorageError?.message?.includes('not found') && !deleteStorageError?.message?.includes('does not exist')) {
        console.warn('Database record deleted but storage file deletion failed. File path:', filePath);
      }

      // Update local state
      setSignedNdaMetadata(prev => {
        const updated = { ...prev };
        delete updated[invitationId];
        return updated;
      });

      // Update invitation status back to 'waiting NDA signing'
      const { error: statusError } = await supabase
        .from('rfx_company_invitations' as any)
        .update({ status: 'waiting NDA signing' })
        .eq('id', invitationId);

      if (statusError) {
        console.error('Error updating invitation status:', statusError);
        // Don't throw here, as the NDA was deleted successfully
      }

      // Update invitation status in local state
      setInvitations(prev => prev.map(inv => 
        inv.id === invitationId 
          ? { ...inv, status: 'waiting NDA signing' }
          : inv
      ));

      // Reload invitations to ensure state is in sync
      await loadInvitations();

      toast({
        title: 'Success',
        description: 'Signed NDA deleted successfully',
      });
    } catch (e: any) {
      console.error('Delete error:', e);
      toast({
        title: 'Error',
        description: 'Failed to delete signed NDA',
        variant: 'destructive',
      });
    }
  }, [toast, loadInvitations]);

  const archiveInvitation = useCallback(async (invitationId: string) => {
    try {
      // First verify the invitation exists and belongs to the company
      const { data: invitationData, error: checkError } = await supabase
        .from('rfx_company_invitations' as any)
        .select('id, company_id, archived')
        .eq('id', invitationId)
        .maybeSingle();

      if (checkError) {
        console.error('❌ [archiveInvitation] Error checking invitation:', checkError);
        throw checkError;
      }

      if (!invitationData) {
        console.error('❌ [archiveInvitation] Invitation not found:', invitationId);
        throw new Error('Invitation not found');
      }

      const { error } = await supabase
        .from('rfx_company_invitations' as any)
        .update({ archived: true })
        .eq('id', invitationId);

      if (error) {
        console.error('❌ [archiveInvitation] Update error:', error);
        throw error;
      }

      setInvitations(prev => prev.map(r => r.id === invitationId ? { ...r, archived: true } : r));
      toast({ 
        title: 'Success', 
        description: 'RFX archived successfully' 
      });
      // Reload to update the list
      await loadInvitations();
    } catch (e: any) {
      console.error('❌ [archiveInvitation] Archive error:', e);
      const errorMessage = e?.message || e?.details || 'Failed to archive RFX';
      toast({ 
        title: 'Error', 
        description: errorMessage, 
        variant: 'destructive' 
      });
    }
  }, [toast, loadInvitations]);

  const unarchiveInvitation = useCallback(async (invitationId: string) => {
    try {
      const { error } = await supabase
        .from('rfx_company_invitations' as any)
        .update({ archived: false })
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(prev => prev.map(r => r.id === invitationId ? { ...r, archived: false } : r));
      toast({ 
        title: 'Success', 
        description: 'RFX unarchived successfully' 
      });
      // Reload to update the list
      await loadInvitations();
    } catch (e: any) {
      console.error('Unarchive error:', e);
      toast({ 
        title: 'Error', 
        description: 'Failed to unarchive RFX', 
        variant: 'destructive' 
      });
    }
  }, [toast, loadInvitations]);

  useEffect(() => {
    loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, page, perPage, searchQuery, statusFilter, showArchived]);

  return {
    invitations,
    ndaMetadata,
    signedNdaMetadata,
    loading,
    uploadingSignedNda,
    totalCount,
    loadInvitations,
    acceptInvitation,
    declineInvitation,
    uploadSignedNDA,
    deleteSignedNDA,
    downloadNDA,
    downloadSignedNDA,
    archiveInvitation,
    unarchiveInvitation,
  };
}
