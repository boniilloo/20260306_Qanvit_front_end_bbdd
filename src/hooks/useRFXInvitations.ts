import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { userCrypto } from '@/lib/userCrypto';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';

// Helper to get the functions URL
const getFunctionsUrl = (functionName: string) => {
  const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_SUPABASE === 'true';
  const LOCAL_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';
  const REMOTE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://bymbfjkezrwsuvbsaycg.supabase.co';
  
  const baseUrl = USE_LOCAL ? LOCAL_URL : REMOTE_URL;
  
  return `${baseUrl}/functions/v1/${functionName}`;
};

// Helper function to generate keys for a user via Edge Function
async function generateUserKeys(targetUserId: string): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No active session");

    const functionUrl = getFunctionsUrl('generate-user-keys');
    
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        target_user_id: targetUserId
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to generate user keys: ${error}`);
    }

    const result = await response.json();
    return result.public_key || null;
  } catch (error) {
    console.error('❌ [useRFXInvitations] Error generating keys for user:', error);
    throw error;
  }
}

export interface RFXInvitation {
  id: string;
  rfx_id: string;
  invited_by: string;
  target_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  responded_at: string | null;
}

export interface RFXInvitationWithMeta extends RFXInvitation {
  rfx_name?: string;
  rfx_description?: string | null;
  rfx_creator_id?: string;
  inviter_name?: string | null;
  inviter_surname?: string | null;
  inviter_email?: string | null;
  creator_name?: string | null;
  creator_surname?: string | null;
  creator_email?: string | null;
}

export function useRFXInvitations() {
  const { toast } = useToast();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [invitations, setInvitations] = useState<RFXInvitationWithMeta[]>([]);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState<boolean>(false);

  // We need to access the RFX symmetric key to share it with new members
  // However, useRFXCrypto is scoped to a single RFX. 
  // Here we deal with multiple invitations possibly for multiple RFXs, 
  // but the "inviteByEmails" action is always for a single rfxId.
  // We will load keys on-demand inside the invite function.

  const refreshPendingCount = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setPendingCount(0);
      return;
    }
    const { count } = await supabase
      .from('rfx_invitations' as any)
      .select('*', { count: 'exact', head: true })
      .eq('target_user_id', user.id)
      .eq('status', 'pending');
    setPendingCount(count || 0);
  }, []);

  const loadMyInvitations = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setInvitations([]);
        return;
      }

      // Fetch pending invitations with related RFX and user meta
      const { data: invs, error } = await supabase
        .from('rfx_invitations' as any)
        .select('id, rfx_id, invited_by, target_user_id, status, created_at, responded_at')
        .eq('target_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Load related RFX names and creator, and inviter/creator names via RPC get_users_with_emails_batch-like function is not present for arbitrary ids with names; fetch app_user for names
      const rfxIds = Array.from(new Set((invs || []).map(i => i.rfx_id)));
      let rfxMap: Record<string, { name: string; description: string | null; user_id: string }> = {};
      if (rfxIds.length > 0) {
        // Use RPC that respects invitation visibility
        const { data: rfxData, error: rfxErr } = await supabase
          .rpc('get_rfx_basic_info_for_invited' as any, { p_rfx_ids: rfxIds });
        if (rfxErr) throw rfxErr;
        rfxMap = (rfxData || []).reduce((acc: any, r: any) => {
          acc[r.id] = { name: r.name, description: r.description ?? null, user_id: r.user_id };
          return acc;
        }, {});
      }

      const userIds = Array.from(new Set([...(invs || []).map(i => i.invited_by), ...Object.values(rfxMap).map(v => v.user_id)]));
      let userInfoMap: Record<string, { name: string | null; surname: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        // Prefer RPC allowed to authenticated users
        const { data: usersData, error: usersErr } = await supabase
          .rpc('get_basic_user_info' as any, { p_user_ids: userIds });
        if (usersErr) throw usersErr;
        userInfoMap = (usersData || []).reduce((acc: any, u: any) => {
          const key = u.auth_user_id || u.id;
          acc[key] = { name: u.name ?? null, surname: u.surname ?? null, email: u.email ?? null };
          return acc;
        }, {} as Record<string, { name: string | null; surname: string | null; email: string | null }>);
      }

      const withMeta: RFXInvitationWithMeta[] = (invs || []).map((i: any) => {
        const r = rfxMap[i.rfx_id];
        const inviter = userInfoMap[i.invited_by] || {};
        const creator = r ? (userInfoMap[r.user_id] || {}) : {};
        return {
          ...i,
          rfx_name: r?.name,
          rfx_description: r?.description ?? null,
          rfx_creator_id: r?.user_id,
          inviter_name: (inviter as any).name ?? null,
          inviter_surname: (inviter as any).surname ?? null,
          inviter_email: (inviter as any).email ?? null,
          creator_name: (creator as any).name ?? null,
          creator_surname: (creator as any).surname ?? null,
          creator_email: (creator as any).email ?? null,
        };
      });
      setInvitations(withMeta);
    } catch (err: any) {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  }, []);

  const inviteByEmails = useCallback(async (rfxId: string, emails: string[]) => {
    try {
      // Reset generating keys state at the start
      setIsGeneratingKeys(false);
      
      const clean = Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean)));
      if (clean.length === 0) return { invited: [] as string[], notFound: [] as string[], alreadyInvited: [] as string[] };

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');

      // --- CRYPTO SETUP: Prepare to share key ---
      // 1. Get the inviter's encrypted symmetric key for this RFX
      const { data: myKeyData, error: myKeyError } = await supabase
        .from('rfx_key_members')
        .select('encrypted_symmetric_key')
        .eq('rfx_id', rfxId)
        .eq('user_id', user.id)
        .maybeSingle();
      
      let symmetricKeyRaw: string | null = null;

      if (myKeyData?.encrypted_symmetric_key) {
        try {
          console.log('🔐 [useRFXInvitations] Preparing to share RFX key with new members...');
          
          // 2. Get user's (inviter's) private key to decrypt the symmetric key
          const { data: userData } = await supabase
            .from('app_user')
            .select('encrypted_private_key')
            .eq('auth_user_id', user.id)
            .single();

          if (userData?.encrypted_private_key) {
             const privateKeyPem = await userCrypto.decryptPrivateKeyOnServer(userData.encrypted_private_key);
             const privateKey = await userCrypto.importPrivateKey(privateKeyPem);
             
             // 3. Decrypt the symmetric key
             const symmetricKeyObj = await userCrypto.decryptSymmetricKey(
               myKeyData.encrypted_symmetric_key,
               privateKey
             );

             // Export it to raw format so we can re-encrypt it for others
             const exportedKey = await window.crypto.subtle.exportKey("raw", symmetricKeyObj);
             symmetricKeyRaw = userCrypto.arrayBufferToBase64(exportedKey);
             console.log('✅ [useRFXInvitations] Symmetric key retrieved and ready for sharing');
          }
        } catch (cryptoErr) {
          console.error('❌ [useRFXInvitations] Failed to prepare keys for sharing:', cryptoErr);
          // We proceed without keys - the user will be invited but won't have access to encrypted data yet.
          // Ideally we should warn or fail, but legacy support might be needed.
        }
      }
      // ------------------------------------------

      // Resolve emails to users
      const { data: users, error: rpcErr } = await supabase
        .rpc('get_users_by_emails', { p_emails: clean as any });
      if (rpcErr) throw rpcErr;

      const foundByEmail: Record<string, string> = {};
      (users || []).forEach((u: any) => { if (u.email) foundByEmail[u.email.toLowerCase()] = u.id; });

      const notFound = clean.filter(e => !foundByEmail[e]);

      const targetUserIds = Array.from(new Set(Object.values(foundByEmail)));

      // Filter out self
      const filteredTargetIds = targetUserIds.filter(id => id !== user.id);

      // Check invitation status for each user
      let alreadyInvited: string[] = [];
      if (filteredTargetIds.length > 0) {
        for (const [email, userId] of Object.entries(foundByEmail)) {
          // Use RPC to check status
          const { data, error } = await supabase
            .rpc('check_rfx_invitation_status', { 
              p_rfx_id: rfxId,
              p_user_id: userId
            });

          if (error) {
            continue;
          }

          const status = data?.[0];
          if (status?.is_member || status?.has_pending_invite) {
            alreadyInvited.push(email);
          }
        }
      }

      const toInvite = Object.entries(foundByEmail)
        .filter(([email]) => !alreadyInvited.includes(email))
        .map(([email, id]) => ({ rfx_id: rfxId, invited_by: user.id, target_user_id: id }));

      // Preload public keys for all targets so we avoid per-user queries (and RLS issues)
      const publicKeyMap: Record<string, string | null> = {};
      if (toInvite.length > 0) {
        try {
          const { data: publicKeys, error: publicKeysError } = await supabase
            .rpc('get_user_public_keys' as any, { p_user_ids: toInvite.map((invite) => invite.target_user_id) });

          if (publicKeysError) {
            console.warn('⚠️ [useRFXInvitations] Could not preload public keys for invited users:', publicKeysError);
          } else {
            (publicKeys || []).forEach((row: any) => {
              if (row?.auth_user_id) {
                publicKeyMap[row.auth_user_id] = row.public_key ?? null;
              }
            });
            console.log('🧾 [useRFXInvitations] Loaded public keys for users:', publicKeyMap);
          }
        } catch (publicKeyErr) {
          console.warn('⚠️ [useRFXInvitations] Error loading public keys for invited users:', publicKeyErr);
        }
      }

      // Track successfully created invitations
      const successfullyInvited: Array<{ target_user_id: string; email: string }> = [];

      // Create or reactivate invitations one by one
      for (const invite of toInvite) {
        try {
          const { data, error } = await supabase
            .rpc('create_or_reactivate_rfx_invitation', {
              p_rfx_id: invite.rfx_id,
              p_invited_by: invite.invited_by,
              p_target_user_id: invite.target_user_id
            });
          
          if (error) {
            // Skip if user is already a member (expected error)
            if (error.code === 'MBMER') {
              continue;
            }
            throw error;
          }
          
          // Track successfully invited user
          const email = Object.entries(foundByEmail).find(([, id]) => id === invite.target_user_id)?.[0];
          if (email) {
            successfullyInvited.push({ target_user_id: invite.target_user_id, email });

            // --- CRYPTO: Share key with the new member ---
            if (symmetricKeyRaw) {
              try {
                 let targetPublicKey = publicKeyMap[invite.target_user_id];

                 // If user has no public key, generate it automatically
                 if (!targetPublicKey) {
                   console.log(`🔑 [useRFXInvitations] Target user ${email} has no public key. Generating keys...`);
                   setIsGeneratingKeys(true);
                   try {
                     const generatedPublicKey = await generateUserKeys(invite.target_user_id);
                     if (generatedPublicKey) {
                       targetPublicKey = generatedPublicKey;
                       // Update the map so we don't try to generate again
                       publicKeyMap[invite.target_user_id] = targetPublicKey;
                       console.log(`✅ [useRFXInvitations] Keys generated successfully for ${email}`);
                     } else {
                       console.warn(`⚠️ [useRFXInvitations] Failed to generate keys for ${email} - no public key returned`);
                     }
                   } catch (genErr) {
                     console.error(`❌ [useRFXInvitations] Error generating keys for ${email}:`, genErr);
                     // Continue without sharing the key - user was still invited
                   } finally {
                     // Only reset if this is the last user or if we're done with all key generations
                     // We'll reset at the end of the entire function
                   }
                 }

                 if (targetPublicKey) {
                   try {
                     const { data: canShare } = await supabase
                       .rpc('can_current_user_share_rfx_key' as any, { p_rfx_id: invite.rfx_id });
                     console.log('🔍 [useRFXInvitations] can_current_user_share_rfx_key result:', canShare);
                   } catch (permErr) {
                     console.warn('⚠️ [useRFXInvitations] Unable to verify can_current_user_share_rfx_key:', permErr);
                   }

                   console.log('🧩 [useRFXInvitations] Sharing key', {
                     rfxId: invite.rfx_id,
                     targetUserId: invite.target_user_id,
                     inviterId: user.id,
                   });

                   // Encrypt symmetric key with target user's public key
                   const encryptedForTarget = await userCrypto.encryptSymmetricKeyWithPublicKey(
                     symmetricKeyRaw,
                     targetPublicKey
                   );

                   // Insert into rfx_key_members
                   // Note: 'rfx_key_members' has a policy "RFX owners can insert keys for members"
                   // But here 'invited_by' might not be the owner? 
                   // The policy "RFX owners can insert keys for members" checks: 
                   // EXISTS ( SELECT 1 FROM public.rfxs WHERE id = rfx_id AND user_id = auth.uid() )
                   // This means ONLY the RFX Creator can share keys currently. 
                   // If "invited_by" is just a member, they cannot share keys with that policy.
                   // We might need to update the RLS policy to allow any member to share keys?
                   // Or at least any member who has the key?
                   
                   // For now let's try to insert. If it fails due to RLS, we log it.
                   console.log('📨 [useRFXInvitations] Sharing key via share_rfx_key_with_member RPC');
                   const { error: keyInsertError } = await supabase
                     .rpc('share_rfx_key_with_member' as any, {
                       p_rfx_id: invite.rfx_id,
                       p_target_user_id: invite.target_user_id,
                       p_encrypted_key: encryptedForTarget
                     });

                   if (keyInsertError) {
                     console.warn('⚠️ [useRFXInvitations] Failed to share key with user (RLS?):', {
                       email,
                       targetUserId: invite.target_user_id,
                       error: keyInsertError,
                     });
                   } else {
                     console.log(`🔐 [useRFXInvitations] Key shared with ${email}`);
                   }
                 } else {
                   console.warn(`⚠️ [useRFXInvitations] Target user ${email} has no public key and generation failed`);
                 }
              } catch (shareErr) {
                console.error(`❌ [useRFXInvitations] Error sharing key with ${email}:`, {
                  shareErr,
                  targetUserId: invite.target_user_id,
                });
              }
            }
            // ---------------------------------------------
          }
        } catch (err) {
          if (err.code !== 'MBMER') throw err;
        }
      }

      // Create notifications for successfully invited users
      if (successfullyInvited.length > 0) {
        try {
          // Fetch RFX name
          let rfxName = 'an RFX';
          try {
            const { data: rfxData } = await supabase
              .from('rfxs' as any)
              .select('name')
              .eq('id', rfxId)
              .single();
            if (rfxData?.name) {
              rfxName = rfxData.name;
            }
          } catch (rfxErr) {
            // Use default name if RFX fetch fails
            console.warn('Could not fetch RFX name for notification:', rfxErr);
          }

          // Get inviter name (optional, for better notification message)
          let inviterName = 'A team member';
          try {
            const { data: inviterData } = await supabase
              .rpc('get_basic_user_info' as any, { p_user_ids: [user.id] });
            if (inviterData && inviterData.length > 0) {
              const inviter = inviterData[0];
              const fullName = [inviter.name, inviter.surname].filter(Boolean).join(' ').trim();
              if (fullName) {
                inviterName = fullName;
              }
            }
          } catch (inviterErr) {
            // Ignore error, use default name
          }

          // Create notifications using RPC function (bypasses RLS)
          const title = 'Invited to participate in an RFX';
          const body = `${inviterName} invited you to participate in the RFX "${rfxName}".`;
          const targetUrl = '/rfxs';
          const userIds = successfullyInvited.map(({ target_user_id }) => target_user_id);

          const { error: notifyError } = await supabase
            .rpc('create_rfx_member_invitation_notifications', {
              p_rfx_id: rfxId,
              p_user_ids: userIds,
              p_title: title,
              p_body: body,
              p_target_url: targetUrl,
            });

          if (notifyError) {
            console.warn('Failed to create notifications for RFX invitations:', notifyError);
            // Don't throw - invitations were successful, notifications are secondary
          }
        } catch (notifyErr) {
          console.warn('Error creating notifications for RFX invitations:', notifyErr);
          // Don't throw - invitations were successful, notifications are secondary
        }
      }

      const invited = successfullyInvited.map(({ email }) => email);

      if (invited.length > 0) {
        toast({ title: 'Invitations sent', description: `Invited: ${invited.join(', ')}` });
      }
      if (notFound.length > 0) {
        toast({ title: 'Some emails not found', description: `Not members: ${notFound.join(', ')}`, variant: 'destructive' });
      }
      if (alreadyInvited.length > 0) {
        toast({ title: 'Already invited', description: `Already invited: ${alreadyInvited.join(', ')}`, variant: 'warning' });
      }
      
      // Reset generating keys state at the end
      setIsGeneratingKeys(false);
      
      return { invited, notFound, alreadyInvited };
    } catch (err: any) {
      // Reset generating keys state on error
      setIsGeneratingKeys(false);
      toast({ title: 'Error', description: err.message || 'Failed to send invitations', variant: 'destructive' });
      return { invited: [] as string[], notFound: emails, alreadyInvited: [] as string[] };
    }
  }, [toast]);

  const acceptInvitation = useCallback(async (invitationId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Paid-seat guard before accepting collaborator invitation (resolved via manual billing get_info).
    const { data: billingInfo, error: billingError } = await supabase.functions.invoke(
      'billing-manage-subscription',
      {
        body: { action: 'get_info' },
      },
    );
    if (billingError) throw billingError;
    if (billingInfo?.error) throw new Error(String(billingInfo.error));
    if (!billingInfo?.is_paid_member) {
      return { success: false as const, requiresSubscription: true };
    }

    // Get invitation details before updating
    const { data: invitation, error: fetchError } = await supabase
      .from('rfx_invitations' as any)
      .select('rfx_id, target_user_id')
      .eq('id', invitationId)
      .single();
    
    if (fetchError || !invitation) {
      throw fetchError || new Error('Invitation not found');
    }

    // Update invitation status
    const { error } = await supabase
      .from('rfx_invitations' as any)
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', invitationId)
      .eq('status', 'pending');
    if (error) throw error;

    // Create notifications for all RFX members
    try {
      // Get RFX name
      let rfxName = 'the RFX';
      try {
        const { data: rfxData } = await supabase
          .from('rfxs' as any)
          .select('name')
          .eq('id', invitation.rfx_id)
          .single();
        if (rfxData?.name) {
          rfxName = rfxData.name;
        }
      } catch (rfxErr) {
        console.warn('Could not fetch RFX name for notification:', rfxErr);
      }

      // Get user name who accepted
      let userName = 'A user';
      try {
        const { data: userData } = await supabase
          .rpc('get_basic_user_info' as any, { p_user_ids: [invitation.target_user_id] });
        if (userData && userData.length > 0) {
          const user = userData[0];
          const fullName = [user.name, user.surname].filter(Boolean).join(' ').trim();
          if (fullName) {
            userName = fullName;
          } else if (user.email) {
            userName = user.email;
          }
        }
      } catch (userErr) {
        console.warn('Could not fetch user name for notification:', userErr);
      }

      // Notify all RFX members
      const title = 'Member joined RFX';
      const body = `${userName} has joined the RFX "${rfxName}".`;
      const targetUrl = '/rfxs';

      const { error: notifyError } = await supabase
        .rpc('create_rfx_member_response_notifications', {
          p_rfx_id: invitation.rfx_id,
          p_title: title,
          p_body: body,
          p_target_url: targetUrl,
          p_type: 'rfx_member_joined',
        });

      if (notifyError) {
        console.warn('Failed to create notifications for member acceptance:', notifyError);
      }
    } catch (notifyErr) {
      console.warn('Error creating notifications for member acceptance:', notifyErr);
    }

    await refreshPendingCount();
    await loadMyInvitations();
    return { success: true as const };
  }, [refreshPendingCount, loadMyInvitations]);

  const declineInvitation = useCallback(async (invitationId: string) => {
    // Get invitation details before updating
    const { data: invitation, error: fetchError } = await supabase
      .from('rfx_invitations' as any)
      .select('rfx_id, target_user_id')
      .eq('id', invitationId)
      .single();
    
    if (fetchError || !invitation) {
      throw fetchError || new Error('Invitation not found');
    }

    // Update invitation status
    const { error } = await supabase
      .from('rfx_invitations' as any)
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', invitationId)
      .eq('status', 'pending');
    if (error) throw error;

    // Create notifications for all RFX members
    try {
      // Get RFX name
      let rfxName = 'the RFX';
      try {
        const { data: rfxData } = await supabase
          .from('rfxs' as any)
          .select('name')
          .eq('id', invitation.rfx_id)
          .single();
        if (rfxData?.name) {
          rfxName = rfxData.name;
        }
      } catch (rfxErr) {
        console.warn('Could not fetch RFX name for notification:', rfxErr);
      }

      // Get user name who declined
      let userName = 'A user';
      try {
        const { data: userData } = await supabase
          .rpc('get_basic_user_info' as any, { p_user_ids: [invitation.target_user_id] });
        if (userData && userData.length > 0) {
          const user = userData[0];
          const fullName = [user.name, user.surname].filter(Boolean).join(' ').trim();
          if (fullName) {
            userName = fullName;
          } else if (user.email) {
            userName = user.email;
          }
        }
      } catch (userErr) {
        console.warn('Could not fetch user name for notification:', userErr);
      }

      // Notify all RFX members
      const title = 'Member declined invitation';
      const body = `${userName} has declined to join the RFX "${rfxName}".`;
      const targetUrl = '/rfxs';

      const { error: notifyError } = await supabase
        .rpc('create_rfx_member_response_notifications', {
          p_rfx_id: invitation.rfx_id,
          p_title: title,
          p_body: body,
          p_target_url: targetUrl,
          p_type: 'rfx_member_declined',
        });

      if (notifyError) {
        console.warn('Failed to create notifications for member decline:', notifyError);
      }
    } catch (notifyErr) {
      console.warn('Error creating notifications for member decline:', notifyErr);
    }

    await refreshPendingCount();
    await loadMyInvitations();
  }, [refreshPendingCount, loadMyInvitations]);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  return {
    pendingCount,
    invitations,
    loading,
    isGeneratingKeys,
    refreshPendingCount,
    loadMyInvitations,
    inviteByEmails,
    acceptInvitation,
    declineInvitation,
  };
}


