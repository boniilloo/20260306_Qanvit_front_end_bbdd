import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';

export interface RFXSpecsData {
  id?: string;
  rfx_id: string;
  description: string;
  technical_requirements: string;
  company_requirements: string;
  project_timeline?: any[];
  image_categories?: any[];
  
  // PDF Customization
  pdf_header_bg_color?: string;
  pdf_header_text_color?: string;
  pdf_section_header_bg_color?: string;
  pdf_section_header_text_color?: string;
  pdf_logo_url?: string;
  pdf_logo_bg_color?: string;
  pdf_logo_bg_enabled?: boolean;
  pdf_pages_logo_url?: string;
  pdf_pages_logo_bg_color?: string;
  pdf_pages_logo_bg_enabled?: boolean;
  pdf_pages_logo_use_header?: boolean;
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

export const useRFXSpecs = (rfxId: string | null, publicCrypto?: PublicCryptoContext) => {
  const [specs, setSpecs] = useState<RFXSpecsData | null>(null);
  // Start with loading=false if no rfxId, otherwise true
  const [loading, setLoading] = useState(!!rfxId);
  const [error, setError] = useState<any>(null);
  
  // Use publicCrypto if provided, otherwise use private crypto
  const privateCrypto = useRFXCrypto(publicCrypto ? null : rfxId);
  const activeCrypto = publicCrypto || privateCrypto;
  const { decrypt, encrypt, isEncrypted, isLoading: isCryptoLoading, isReady } = activeCrypto;

  const fetchSpecs = useCallback(async () => {
    if (!rfxId) return;
    
    try {
      setLoading(true);
      // Cast to any to avoid type errors with dynamic columns if types aren't updated
      const { data, error } = await supabase
        .from('rfx_specs' as any)
        .select('*')
        .eq('rfx_id', rfxId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        // Decrypt text fields
        // We process them in parallel
        const [desc, tech, comp] = await Promise.all([
          decrypt(data.description || ''),
          decrypt(data.technical_requirements || ''),
          decrypt(data.company_requirements || '')
        ]);

        setSpecs({
          id: data.id,
          rfx_id: data.rfx_id,
          description: desc,
          technical_requirements: tech,
          company_requirements: comp,
          project_timeline: data.project_timeline || [],
          image_categories: data.image_categories || [],
          
          pdf_header_bg_color: data.pdf_header_bg_color,
          pdf_header_text_color: data.pdf_header_text_color,
          pdf_section_header_bg_color: data.pdf_section_header_bg_color,
          pdf_section_header_text_color: data.pdf_section_header_text_color,
          pdf_logo_url: data.pdf_logo_url,
          pdf_logo_bg_color: data.pdf_logo_bg_color,
          pdf_logo_bg_enabled: data.pdf_logo_bg_enabled,
          pdf_pages_logo_url: data.pdf_pages_logo_url,
          pdf_pages_logo_bg_color: data.pdf_pages_logo_bg_color,
          pdf_pages_logo_bg_enabled: data.pdf_pages_logo_bg_enabled,
          pdf_pages_logo_use_header: data.pdf_pages_logo_use_header,
        });
      } else {
        // Default empty specs
        setSpecs({
          rfx_id: rfxId,
          description: '',
          technical_requirements: '',
          company_requirements: '',
          project_timeline: [],
          image_categories: []
        });
      }
    } catch (err) {
      console.error("Error fetching specs:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [rfxId, decrypt]);

  // Refetch when crypto is ready (or rfxId changes)
  // We wait for crypto loading to finish to ensure we have keys if available
  useEffect(() => {
    if (!rfxId) {
      setLoading(false);
      return;
    }
    
    if (isReady) {
      fetchSpecs();
    } else {
      setLoading(true);
    }
  }, [rfxId, isReady, fetchSpecs, isCryptoLoading]);

  return { specs, loading, error, refresh: fetchSpecs, decrypt, encrypt, isEncrypted, isReady };
};

