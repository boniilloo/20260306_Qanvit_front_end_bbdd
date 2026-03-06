import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { generateRFXCandidatesReport } from '@/utils/pdfGenerator';
import type { Propuesta } from '@/types/chat';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';

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

export const useRFXCandidatesPDFGenerator = (
  rfxId: string | null, 
  publicCrypto?: PublicCryptoContext
) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Use publicCrypto if provided, otherwise use private crypto
  const privateCrypto = useRFXCrypto(publicCrypto ? null : rfxId);
  const activeCrypto = publicCrypto || privateCrypto;
  const { decrypt, isEncrypted, isReady, isLoading: isCryptoLoading } = activeCrypto;

  // Extract candidates from most recent evaluation result
  const getCandidatesFromResults = async (evaluationResults: any[]): Promise<Propuesta[]> => {
    try {
      if (!Array.isArray(evaluationResults) || evaluationResults.length === 0) return [];

      // Results are already ordered desc by created_at. Take the latest one
      const latest = evaluationResults[0];

      let evaluationData = latest?.evaluation_data;
      
      if (!evaluationData) {
        console.error('❌ [PDF Generator] evaluation_data is null or undefined');
        return [];
      }
      
      // Handle encrypted data or string JSON data
      if (typeof evaluationData === 'string') {
        const trimmed = evaluationData.trim();
        const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');

        try {
          if (!isJson && isEncrypted) {
            const decrypted = await decrypt(evaluationData);
            evaluationData = JSON.parse(decrypted);
          } else if (!isJson) {
            // Data looks encrypted but we don't have keys - this is an error
            console.error('❌ [PDF Generator] Data appears encrypted but no decryption keys available');
            throw new Error('Cannot decrypt evaluation data - encryption keys not available');
          } else {
            // Try to parse as normal JSON (might be legacy unencrypted data)
            evaluationData = JSON.parse(evaluationData);
          }
        } catch (e) {
          console.error('❌ Failed to parse/decrypt evaluation_data:', e);
          throw e; // Re-throw to be caught by outer try-catch
        }
      } else if (typeof evaluationData === 'object') {
        // Check if it's an encrypted object (has 'iv' and 'data' properties)
        if (evaluationData.iv && evaluationData.data && typeof evaluationData.data === 'string') {
          if (!isEncrypted) {
            console.error('❌ [PDF Generator] Data is encrypted but no decryption keys available');
            throw new Error('Cannot decrypt evaluation data - encryption keys not available');
          }
          
          try {
            // The decrypt function expects the encrypted string format that includes IV
            // We need to reconstruct it or use a different approach
            // Based on userCrypto implementation, we need to call decryptData with the full encrypted string
            const encryptedString = JSON.stringify(evaluationData);
            const decrypted = await decrypt(encryptedString);
            evaluationData = JSON.parse(decrypted);
          } catch (e) {
            console.error('❌ Failed to decrypt evaluation_data object:', e);
            throw e;
          }
        } else {
          // It's already parsed and unencrypted, might be from Supabase auto-parsing JSONB
        }
      }

      // Extract from best_matches
      const matches = Array.isArray(evaluationData?.best_matches) ? evaluationData.best_matches : [];
      return matches as Propuesta[];
    } catch (err) {
      console.error('❌ Unexpected error extracting candidates:', err);
      throw err; // Re-throw to propagate to generatePDF
    }
  };

  const generatePDF = async (targetRfxId: string, rfxName: string, returnBlob: boolean = false): Promise<boolean | Blob> => {
    try {
      // Check if crypto is ready before starting
      if (!isReady) {
        console.warn('⚠️ [PDF Generator] Crypto keys not ready yet');
        toast({
          title: 'Please wait',
          description: 'Encryption keys are still loading. Please try again in a moment.',
          variant: 'default',
        });
        return false;
      }

      setIsGenerating(true);
      setPdfProgress(null);

      // Fetch evaluation results
      const { data: evaluationResults, error: evalError } = await supabase
        .from('rfx_evaluation_results' as any)
        .select('*')
        .eq('rfx_id', targetRfxId)
        .order('created_at', { ascending: false });

      if (evalError) {
        throw evalError;
      }

      if (!evaluationResults || evaluationResults.length === 0) {
        toast({
          title: 'No candidates available',
          description: 'Please generate candidates first before creating a report.',
          variant: 'destructive',
        });
        return false;
      }

      const candidates = await getCandidatesFromResults(evaluationResults);
      
      if (candidates.length === 0) {
        console.error('❌ [PDF Generator] No candidates found in evaluation results');
        toast({
          title: 'No candidates available',
          description: 'Could not extract candidates from evaluation results. The data may be corrupted or encrypted incorrectly.',
          variant: 'destructive',
        });
        return false;
      }

      // Get creator info from RFX
      let userName: string | undefined;
      let userEmail: string | undefined;

      const { data: rfxData } = await supabase
        .from('rfxs' as any)
        .select('creator_name, creator_surname, creator_email')
        .eq('id', targetRfxId)
        .single();

      if (rfxData) {
        // Build full name from creator_name and creator_surname
        const nameParts: string[] = [];
        if (rfxData.creator_name) nameParts.push(rfxData.creator_name);
        if (rfxData.creator_surname) nameParts.push(rfxData.creator_surname);
        userName = nameParts.length > 0 ? nameParts.join(' ') : undefined;
        userEmail = rfxData.creator_email || undefined;
      }

      // Load company logos and product data for all candidates
      const companyIds = [...new Set(candidates.map(c => c.id_company_revision))];
      const productIds = [...new Set(candidates.map(c => c.id_product_revision).filter(Boolean))];
      const companyLogos: {[key: string]: string | null} = {};
      const productData: {[key: string]: { product_url?: string; images?: string[] }} = {};

      try {
        // Load company data
        const { data: companiesData, error } = await supabase
          .from('company_revision')
          .select('id, logo, website')
          .in('id', companyIds);

        if (!error && companiesData) {
          companiesData.forEach(company => {
            companyLogos[company.id] = company.logo || null;
          });
          
          // Also update candidate websites if not present
          candidates.forEach(candidate => {
            const companyData = companiesData.find(c => c.id === candidate.id_company_revision);
            if (companyData?.website && !candidate.website) {
              candidate.website = companyData.website;
            }
          });
        }
      } catch (err) {
        console.error('Error loading company logos for PDF:', err);
        // Continue without logos if there's an error
      }

      try {
        // Load product data (product_url and images)
        if (productIds.length > 0) {
          const { data: productsData, error } = await supabase
            .from('product_revision')
            .select('id, product_url, image')
            .in('id', productIds);

          if (error) {
            console.error('❌ Error fetching product data:', error);
          } else if (productsData) {
            productsData.forEach(product => {
              const images: string[] = [];
              if (product.image) {
                try {
                  // image field might be a JSON array or a single URL
                  if (typeof product.image === 'string') {
                    const parsed = JSON.parse(product.image);
                    if (Array.isArray(parsed)) {
                      images.push(...parsed.filter((url: any) => typeof url === 'string'));
                    } else {
                      images.push(product.image);
                    }
                  }
                } catch {
                  // If not JSON, treat as single URL
                  if (typeof product.image === 'string') {
                    images.push(product.image);
                  }
                }
              }
              
              productData[product.id] = {
                product_url: product.product_url || undefined,
                images: images.slice(0, 2) // Only take first 2 images
              };
            });
          }
        } else {
        }
      } catch (err) {
        console.error('Error loading product data for PDF:', err);
        // Continue without product data if there's an error
      }

      const result = await generateRFXCandidatesReport({
        rfxName: rfxName,
        candidates: candidates,
        userName: userName,
        userEmail: userEmail,
        date: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        companyLogos: companyLogos,
        productData: productData,
        onProgress: (current, total) => {
          setPdfProgress({ current, total });
        },
      }, returnBlob);

      if (returnBlob && result instanceof Blob) {
        return result;
      }

      toast({
        title: 'Report generated successfully',
        description: 'The PDF report has been opened in a new window.',
      });

      return true;
    } catch (error: any) {
      console.error('❌ [PDF Generator] Error generating PDF:', error);
      
      // Provide more specific error messages
      let errorMessage = 'Failed to generate the PDF report. Please try again.';
      if (error?.message?.includes('Encryption keys')) {
        errorMessage = 'Encryption keys are not ready. Please wait a moment and try again.';
      } else if (error?.message?.includes('decrypt')) {
        errorMessage = 'Failed to decrypt candidate data. You may not have access to this RFX.';
      }
      
      toast({
        title: 'Error generating report',
        description: errorMessage,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsGenerating(false);
      setPdfProgress(null);
    }
  };

  return {
    generatePDF,
    isGenerating,
    pdfProgress,
    isReady,
    isCryptoLoading,
  };
};
