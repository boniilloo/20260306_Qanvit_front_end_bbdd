import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';

export interface SelectedCandidateItem {
  id_company_revision: string;
  id_product_revision?: string | null;
  empresa: string;
  producto?: string | null;
  match: number;
  company_match?: number | null;
}

export interface SelectionThresholds {
  overall?: number | null;
  technical?: number | null;
  company?: number | null;
}

export interface RFXSelectedCandidatesRecord {
  id: string;
  rfx_id: string;
  user_id: string;
  selected: SelectedCandidateItem[];
  thresholds: SelectionThresholds | null;
  created_at: string;
  updated_at: string;
}

interface PublicCryptoContext {
  encrypt: (text: string) => Promise<string>;
  decrypt: (text: string) => Promise<string>;
  encryptFile: (buffer: ArrayBuffer) => Promise<{ iv: string, data: ArrayBuffer } | null>;
  decryptFile: (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
  isLoading: boolean;
  isReady: boolean;
  isEncrypted: boolean;
  hasKey: boolean;
  error: string | null;
}

export const useRFXSelectedCandidates = (
  rfxId: string | undefined, 
  publicCrypto?: PublicCryptoContext
) => {
  const { toast } = useToast();
  const [record, setRecord] = useState<RFXSelectedCandidatesRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Use publicCrypto if provided, otherwise use private crypto
  const privateCrypto = useRFXCrypto(publicCrypto ? null : (rfxId || null));
  const activeCrypto = publicCrypto || privateCrypto;
  const { encrypt, decrypt, isLoading: isCryptoLoading, isReady } = activeCrypto;

  const load = useCallback(async () => {
    if (!rfxId) {
      setLoading(false);
      return;
    }
    
    if (!isReady) {
      setLoading(true);
      return;
    }
    
    try {
      setLoading(true);
      // Load shared selection (one per RFX, no user filter)
      const { data, error } = await supabase
        .from('rfx_selected_candidates')
        .select('*')
        .eq('rfx_id', rfxId)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        // Decrypt selected and thresholds if they are encrypted
        let decryptedSelected = data.selected;
        let decryptedThresholds = data.thresholds;
        
        // Check if data is encrypted (encrypted data is a string, not an object)
        if (encrypt && typeof data.selected === 'string') {
          try {
            const decryptedSelectedStr = await decrypt(data.selected);
            decryptedSelected = JSON.parse(decryptedSelectedStr);
          } catch (err) {
            console.error('[useRFXSelectedCandidates] Error decrypting selected:', err);
            // If decryption fails, try to use as-is (might be legacy unencrypted data)
            decryptedSelected = data.selected;
          }
        }
        
        if (encrypt && data.thresholds && typeof data.thresholds === 'string') {
          try {
            const decryptedThresholdsStr = await decrypt(data.thresholds);
            decryptedThresholds = JSON.parse(decryptedThresholdsStr);
          } catch (err) {
            console.error('[useRFXSelectedCandidates] Error decrypting thresholds:', err);
            // If decryption fails, try to use as-is (might be legacy unencrypted data)
            decryptedThresholds = data.thresholds;
          }
        }
        
        setRecord({
          ...data,
          selected: decryptedSelected,
          thresholds: decryptedThresholds,
        } as any);
      } else {
        setRecord(null);
      }
    } catch (error: any) {
      console.error('[useRFXSelectedCandidates] load error', error);
      toast({ title: 'Error', description: error.message || 'Failed to load selected candidates', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [rfxId, isReady, toast, encrypt, decrypt]);

  const save = useCallback(async (selected: SelectedCandidateItem[], thresholds: SelectionThresholds | null) => {
    if (!rfxId) return null;
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Wait for crypto to be ready if it's loading
      if (isCryptoLoading) {
        // Wait a bit for crypto to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Encrypt selected and thresholds if encryption is available
      let encryptedSelected: any = selected;
      let encryptedThresholds: any = thresholds;
      
      if (encrypt) {
        try {
          // Encrypt selected as JSON string
          const selectedJson = JSON.stringify(selected);
          encryptedSelected = await encrypt(selectedJson);
          
          // Encrypt thresholds if present
          if (thresholds) {
            const thresholdsJson = JSON.stringify(thresholds);
            encryptedThresholds = await encrypt(thresholdsJson);
          }
        } catch (err) {
          console.error('[useRFXSelectedCandidates] Error encrypting data:', err);
          throw new Error('Failed to encrypt data');
        }
      }

      // Upsert shared selection (one per RFX)
      const payload = {
        rfx_id: rfxId,
        user_id: user.id, // Keep for audit trail
        selected: encryptedSelected,
        thresholds: encryptedThresholds,
      };

      const { data, error } = await supabase
        .from('rfx_selected_candidates')
        .upsert(payload, { onConflict: 'rfx_id' })
        .select()
        .single();

      if (error) throw error;

      // Set record with decrypted data for local state
      setRecord({
        ...data,
        selected,
        thresholds,
      } as any);
      
      toast({ title: 'Saved', description: 'Selected candidates saved successfully' });
      return {
        ...data,
        selected,
        thresholds,
      } as RFXSelectedCandidatesRecord;
    } catch (error: any) {
      console.error('[useRFXSelectedCandidates] save error', error);
      toast({ title: 'Error', description: error.message || 'Failed to save selection', variant: 'destructive' });
      return null;
    } finally {
      setSaving(false);
    }
  }, [rfxId, toast, encrypt, isCryptoLoading]);

  useEffect(() => {
    if (!rfxId) {
      setLoading(false);
      return;
    }
    
    if (isReady) {
      load();
    } else {
      setLoading(true);
    }
  }, [rfxId, isReady, isCryptoLoading, load]);

  return { record, loading, saving, load, save };
};


