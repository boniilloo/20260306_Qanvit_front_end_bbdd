import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RFXValidation {
  id: string;
  rfx_id: string;
  user_id: string;
  specs_commit_id: string | null;
  candidates_selection_timestamp: string | null;
  validated_at: string;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
}

export interface RFXMember {
  user_id: string;
  email?: string;
  name?: string;
}

export const useRFXValidations = (rfxId: string) => {
  const { toast } = useToast();
  const [validations, setValidations] = useState<RFXValidation[]>([]);
  const [members, setMembers] = useState<RFXMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserValidation, setCurrentUserValidation] = useState<RFXValidation | null>(null);
  const [allMembersValidated, setAllMembersValidated] = useState(false);

  // Load validations and members
  const loadValidations = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get RFX owner and members
      const { data: rfxData } = await supabase
        .from('rfxs' as any)
        .select('user_id')
        .eq('id', rfxId)
        .single();

      if (!rfxData) return;

      // Get all members including owner
      const { data: membersData, error: membersError } = await supabase
        .from('rfx_members' as any)
        .select('user_id')
        .eq('rfx_id', rfxId);

      if (membersError) {
        console.error('❌ [RFX Validations] Error loading members:', membersError);
      }

      const allMemberIds = [
        rfxData.user_id,
        ...(membersData?.map((m: any) => m.user_id) || [])
      ];

      // Remove duplicates
      const uniqueMemberIds = [...new Set(allMemberIds)];
      
      setMembers(uniqueMemberIds.map(id => ({ user_id: id })));

      // Get all validations for this RFX
      const { data: validationsData, error } = await supabase
        .from('rfx_validations' as any)
        .select('*')
        .eq('rfx_id', rfxId);

      if (error) {
        console.error('Error loading validations:', error);
        return;
      }

      setValidations(validationsData || []);

      // Find current user's validation
      const userValidation = validationsData?.find(
        (v: any) => v.user_id === user.id && v.is_valid
      );
      setCurrentUserValidation(userValidation || null);

      // Check if all members have validated
      const validMemberIds = new Set(
        (validationsData || [])
          .filter((v: any) => v.is_valid)
          .map((v: any) => v.user_id)
      );
      
      const allValidated = uniqueMemberIds.every(id => validMemberIds.has(id));
      
      setAllMembersValidated(allValidated);
      
    } catch (error) {
      console.error('Error loading validations:', error);
    } finally {
      setLoading(false);
    }
  }, [rfxId]);

  // Keep a stable ref to loadValidations to avoid recreating subscriptions
  const loadValidationsRef = useRef(loadValidations);
  useEffect(() => {
    loadValidationsRef.current = loadValidations;
  }, [loadValidations]);

  useEffect(() => {
    if (rfxId) {
      loadValidations();
    }
  }, [rfxId, loadValidations]);
  
  // Subscribe to validation and member changes
  // Use ref instead of direct dependency to avoid recreating subscriptions
  useEffect(() => {
    if (!rfxId) return;
    
    const channel = supabase
      .channel(`rfx_validations_${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_validations',
          filter: `rfx_id=eq.${rfxId}`
        },
        () => {
          loadValidationsRef.current();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_members',
          filter: `rfx_id=eq.${rfxId}`
        },
        () => {
          loadValidationsRef.current();
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId]); // Solo depende de rfxId, no de loadValidations

  // Create or update validation
  const validateRFX = async (
    specsCommitId: string | null,
    candidatesTimestamp: string | null
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to validate',
          variant: 'destructive',
        });
        return false;
      }

      // Upsert validation
      const { error } = await supabase
        .from('rfx_validations' as any)
        .upsert({
          rfx_id: rfxId,
          user_id: user.id,
          specs_commit_id: specsCommitId,
          candidates_selection_timestamp: candidatesTimestamp,
          is_valid: true,
          validated_at: new Date().toISOString(),
        }, {
          onConflict: 'rfx_id,user_id'
        });

      if (error) {
        console.error('Error creating validation:', error);
        toast({
          title: 'Error',
          description: 'Failed to save validation',
          variant: 'destructive',
        });
        return false;
      }

      // Reload validations
      await loadValidations();

      toast({
        title: 'Validation saved',
        description: 'Your validation has been recorded successfully',
      });

      return true;
    } catch (error) {
      console.error('Error validating RFX:', error);
      toast({
        title: 'Error',
        description: 'Failed to validate RFX',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Invalidate (remove) user's validation
  const invalidateRFX = async (): Promise<boolean> => {
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

      // Delete validation
      const { error } = await supabase
        .from('rfx_validations' as any)
        .delete()
        .eq('rfx_id', rfxId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error invalidating validation:', error);
        toast({
          title: 'Error',
          description: 'Failed to remove validation',
          variant: 'destructive',
        });
        return false;
      }

      // Reload validations
      await loadValidations();

      toast({
        title: 'Validation removed',
        description: 'Your validation has been removed successfully',
      });

      return true;
    } catch (error) {
      console.error('Error invalidating RFX:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove validation',
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    validations,
    members,
    loading,
    currentUserValidation,
    allMembersValidated,
    validateRFX,
    invalidateRFX,
    reloadValidations: loadValidations,
  };
};

