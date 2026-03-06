import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { userCrypto } from '@/lib/userCrypto';

export interface PublicRFX {
  id: string;
  rfx_id: string;
  made_public_by: string;
  made_public_at: string | null;
  category: string | null;
  display_order: number;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  is_featured: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  image_url: string | null;
  // Unencrypted symmetric key for public access
  unencrypted_symmetric_key?: string | null;
  // Joined data from rfxs table
  rfx?: {
    id: string;
    name: string | null;
    description: string | null;
    created_at: string;
  };
}

export const usePublicRFXs = () => {
  const [publicRfxs, setPublicRfxs] = useState<PublicRFX[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadPublicRfxs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('public_rfxs' as any)
        .select(`
          *,
          rfx:rfxs(
            id,
            name,
            description,
            created_at
          )
        `)
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true })
        .order('made_public_at', { ascending: false });

      if (error) throw error;

      setPublicRfxs((data || []) as any);
    } catch (error) {
      console.error('Error loading public RFXs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load public RFX examples',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPublicRfxs();
  }, []);

  const makePublic = async (
    rfxId: string,
    metadata?: {
      category?: string;
      title?: string;
      description?: string;
      tags?: string[];
      is_featured?: boolean;
      display_order?: number;
      image_url?: string;
    }
  ) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('You must be logged in to make RFXs public');
      }

      // Get the RFX symmetric key and export it unencrypted
      let unencryptedSymmetricKey: string | null = null;
      
      try {
        console.log('🔑 [usePublicRFXs] Retrieving RFX symmetric key to store unencrypted...');
        
        // Get user's private key
        const { data: userData, error: userKeyError } = await supabase
          .from('app_user')
          .select('encrypted_private_key')
          .eq('auth_user_id', user.id)
          .single();

        if (userKeyError || !userData?.encrypted_private_key) {
          console.warn('⚠️ [usePublicRFXs] User has no encrypted private key, cannot retrieve RFX key');
        } else {
          // Get RFX symmetric key (encrypted with user's public key)
          const { data: rfxKeyData, error: rfxKeyError } = await supabase
            .from('rfx_key_members')
            .select('encrypted_symmetric_key')
            .eq('rfx_id', rfxId)
            .eq('user_id', user.id)
            .maybeSingle();

          if (rfxKeyError || !rfxKeyData) {
            console.warn('⚠️ [usePublicRFXs] No RFX key found - this might be a legacy RFX without encryption');
          } else {
            // Decrypt the private key using the server oracle
            const privateKeyPem = await userCrypto.decryptPrivateKeyOnServer(userData.encrypted_private_key);
            const privateKey = await userCrypto.importPrivateKey(privateKeyPem);

            // Decrypt the symmetric key
            const symmetricKey = await userCrypto.decryptSymmetricKey(
              rfxKeyData.encrypted_symmetric_key,
              privateKey
            );

            // Export the symmetric key as base64 (unencrypted)
            const exported = await window.crypto.subtle.exportKey("raw", symmetricKey);
            unencryptedSymmetricKey = userCrypto.arrayBufferToBase64(exported);

            console.log('✅ [usePublicRFXs] Successfully exported symmetric key (unencrypted) for public access');
          }
        }
      } catch (keyError: any) {
        console.error('❌ [usePublicRFXs] Error retrieving symmetric key:', keyError);
        toast({
          title: 'Warning',
          description: 'Could not retrieve encryption key. Public RFX may have limited access to encrypted content.',
        });
        // Continue anyway - RFX will be marked public but without decryption capability
      }

      const { error } = await supabase.from('public_rfxs' as any).insert({
        rfx_id: rfxId,
        made_public_by: user.id,
        category: metadata?.category || null,
        title: metadata?.title || null,
        description: metadata?.description || null,
        tags: metadata?.tags || null,
        is_featured: metadata?.is_featured ?? false,
        display_order: metadata?.display_order ?? 0,
        image_url: metadata?.image_url || null,
        unencrypted_symmetric_key: unencryptedSymmetricKey,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'RFX marked as public example',
      });

      await loadPublicRfxs();
    } catch (error: any) {
      console.error('Error making RFX public:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to make RFX public',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const updatePublicRfx = async (
    id: string,
    updates: {
      category?: string | null;
      title?: string | null;
      description?: string | null;
      tags?: string[] | null;
      is_featured?: boolean;
      display_order?: number;
      image_url?: string | null;
    }
  ) => {
    try {
      const { error } = await supabase
        .from('public_rfxs' as any)
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Public RFX example updated',
      });

      await loadPublicRfxs();
    } catch (error: any) {
      console.error('Error updating public RFX:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update public RFX',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const removeFromPublic = async (id: string) => {
    try {
      const { error } = await supabase
        .from('public_rfxs' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'RFX removed from public examples',
      });

      await loadPublicRfxs();
    } catch (error: any) {
      console.error('Error removing public RFX:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove public RFX',
        variant: 'destructive',
      });
      throw error;
    }
  };

  return {
    publicRfxs,
    loading,
    makePublic,
    updatePublicRfx,
    removeFromPublic,
    refresh: loadPublicRfxs,
  };
};


