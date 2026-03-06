import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RFXMember {
  user_id: string;
  email: string | null;
  name: string | null;
  surname: string | null;
  role: 'viewer' | 'editor' | 'owner';
  rfx_owner_id: string;
  created_at: string;
  avatar_url: string | null;
}

export interface RFXInvitationOwnerView {
  id: string;
  target_user_id: string;
  email: string | null;
  name: string | null;
  surname: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
}

export function useRFXMembers(rfxId: string | undefined) {
  const { toast } = useToast();
  const [members, setMembers] = useState<RFXMember[]>([]);
  const [invitations, setInvitations] = useState<RFXInvitationOwnerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingInvitations, setCancellingInvitations] = useState<Set<string>>(new Set());

  const loadMembers = useCallback(async () => {
    if (!rfxId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_rfx_members' as any, { p_rfx_id: rfxId });
      if (error) {
        // Check if this is a 400 Bad Request error (RFX doesn't exist or was deleted)
        // Supabase may return errors in different formats, so check multiple properties
        const errorObj = error as any;
        const errorMessage = String(errorObj.message || errorObj.details || '').toLowerCase();
        const errorCode = String(errorObj.code || '');
        const errorStatus = String(errorObj.status || errorObj.statusCode || '');
        const errorHint = String(errorObj.hint || '').toLowerCase();
        
        // Serialize error to string to check for "400" anywhere
        const errorString = JSON.stringify(errorObj).toLowerCase();
        
        // Check for 400 Bad Request in multiple ways - be very permissive
        // If ANY indication of 400 status, treat as not found
        const isNotFoundError = 
          errorCode === 'PGRST116' || 
          errorCode === '42883' || 
          errorCode === 'PGRST301' ||
          errorStatus === '400' ||
          errorStatus.includes('400') ||
          errorString.includes('"status":400') ||
          errorString.includes('"statuscode":400') ||
          errorString.includes('"status": 400') ||
          errorMessage.includes('does not exist') || 
          errorMessage.includes('not found') ||
          errorMessage.includes('permission denied') ||
          errorMessage.includes('row-level security') ||
          errorMessage.includes('bad request') ||
          errorMessage.includes('rfx') ||
          errorHint.includes('rfx') ||
          // Check if error response contains status 400
          errorObj.response?.status === 400 ||
          errorObj.response?.statusCode === 400 ||
          // Check if error is a PostgrestError with status 400
          (errorObj.name === 'PostgrestError' && errorStatus === '400');
        
        if (isNotFoundError) {
          // RFX was deleted or doesn't exist, silently clear members and localStorage
          setMembers([]);
          // Clean up localStorage cache for this RFX
          try {
            localStorage.removeItem(`rfx_members_${rfxId}`);
          } catch (e) {
            // Ignore localStorage errors
          }
          return;
        }
        throw error;
      }
      // Function now returns all fields including avatar_url and rfx_owner_id directly
      setMembers((data || []) as RFXMember[]);
    } catch (err: any) {
      // Only show error toast if it's not a "not found" type error
      // HTTP 400 errors when RFX is deleted should be handled silently
      const errorMessage = String(err?.message || err?.details || '').toLowerCase();
      const errorCode = String(err?.code || '');
      const errorStatus = String(err?.status || err?.statusCode || '');
      const errorHint = String(err?.hint || '').toLowerCase();
      
      // Serialize error to string to check for "400" anywhere
      const errorString = JSON.stringify(err || {}).toLowerCase();
      
      const isNotFoundError = 
        errorCode === 'PGRST116' || 
        errorCode === '42883' || 
        errorCode === 'PGRST301' ||
        errorStatus === '400' ||
        errorStatus.includes('400') ||
        errorString.includes('"status":400') ||
        errorString.includes('"statuscode":400') ||
        errorString.includes('"status": 400') ||
        errorMessage.includes('does not exist') || 
        errorMessage.includes('not found') ||
        errorMessage.includes('permission denied') ||
        errorMessage.includes('row-level security') ||
        errorMessage.includes('bad request') ||
        errorMessage.includes('rfx') ||
        errorHint.includes('rfx') ||
        // Check if error response contains status 400
        err?.response?.status === 400 ||
        err?.response?.statusCode === 400 ||
        // Check if error is a PostgrestError with status 400
        (err?.name === 'PostgrestError' && errorStatus === '400');
      
      if (!isNotFoundError) {
        toast({ title: 'Error', description: 'Failed to load members', variant: 'destructive' });
      } else {
        // RFX was deleted or doesn't exist, silently clear members and localStorage
        setMembers([]);
        // Clean up localStorage cache for this RFX
        try {
          localStorage.removeItem(`rfx_members_${rfxId}`);
        } catch (e) {
          // Ignore localStorage errors
        }
      }
    } finally {
      setLoading(false);
    }
  }, [rfxId, toast]);

  const loadInvitations = useCallback(async () => {
    if (!rfxId) return;
    try {
      const { data, error } = await supabase.rpc('get_rfx_invitations_for_owner' as any, { p_rfx_id: rfxId });
      if (error) throw error;
      setInvitations(data || []);
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to load invitations', variant: 'destructive' });
    }
  }, [rfxId, toast]);

  const removeMember = useCallback(async (userId: string) => {
    if (!rfxId) return false;
    const { error } = await supabase.rpc('remove_rfx_member' as any, { p_rfx_id: rfxId, p_user_id: userId });
    if (error) {
      if (error.code === 'OWNER') {
        toast({ title: 'Cannot remove owner', description: 'The owner cannot be removed from the RFX.', variant: 'warning' });
        return false;
      }
      toast({ title: 'Error', description: error.message || 'Failed to remove member', variant: 'destructive' });
      return false;
    }
    await loadMembers();
    toast({ title: 'Member removed', description: 'Member has been removed from the RFX.' });
    return true;
  }, [rfxId, loadMembers, toast]);

  const cancelInvitation = useCallback(async (invitationId: string) => {
    // Set loading state for this specific invitation
    setCancellingInvitations(prev => new Set(prev).add(invitationId));
    
    try {
      const { error } = await supabase.rpc('cancel_rfx_invitation' as any, { p_invitation_id: invitationId });
      if (error) {
        toast({ title: 'Error', description: error.message || 'Failed to cancel invitation', variant: 'destructive' });
        return false;
      }
      await loadInvitations();
      return true;
    } finally {
      // Remove loading state for this invitation
      setCancellingInvitations(prev => {
        const next = new Set(prev);
        next.delete(invitationId);
        return next;
      });
    }
  }, [loadInvitations, toast]);

  return { members, invitations, loading, cancellingInvitations, loadMembers, loadInvitations, removeMember, cancelInvitation };
}


