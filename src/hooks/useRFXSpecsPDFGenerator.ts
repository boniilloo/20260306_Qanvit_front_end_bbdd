import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { generateRFXSpecsPDF } from '@/utils/pdfGenerator';
import { TimelineMilestone } from '@/components/rfx/ProjectTimelineEditor';
import { ImageCategory } from '@/components/rfx/RFXImagesCard';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';

interface RFXSpecsData {
  id?: string;
  rfx_id: string;
  description: string;
  technical_requirements: string;
  company_requirements: string;
  project_timeline?: TimelineMilestone[];
  image_categories?: ImageCategory[];
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

export const useRFXSpecsPDFGenerator = (
  rfxId: string | null, 
  useCurrentSpecs: boolean = false,
  publicCrypto?: PublicCryptoContext
) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Use publicCrypto if provided, otherwise use private crypto
  const privateCrypto = useRFXCrypto(publicCrypto ? null : rfxId);
  const activeCrypto = publicCrypto || privateCrypto;
  const { decrypt, decryptFile, isEncrypted } = activeCrypto;
  // (Debug log removed) This hook is called frequently and was spamming the console.

  const generatePDF = async (rfxIdParam: string, projectName: string, returnBlob: boolean = false): Promise<Blob | boolean> => {
    // Use rfxId from param if available, or fallback to hook prop (though rfxIdParam is required by signature)
    const targetRfxId = rfxIdParam || rfxId;
    if (!targetRfxId) return false;

    try {
      setIsGenerating(true);

      let specs: RFXSpecsData | null = null;
      let rfxData: any = null; // Store RFX data to get creator info

      // If useCurrentSpecs is true, always use rfx_specs table (for specs and sending pages)
      if (useCurrentSpecs) {
        // Get RFX data to access creator info
        const { data: rfxInfo } = await supabase
          .from('rfxs' as any)
          .select('creator_name, creator_surname, creator_email')
          .eq('id', targetRfxId)
          .single();
        
        rfxData = rfxInfo;
        const { data: specsData, error: specsError } = await supabase
          .from('rfx_specs' as any)
          .select('*')
          .eq('rfx_id', targetRfxId)
          .single();

        if (specsError && specsError.code !== 'PGRST116') {
          throw specsError;
        }

        if (!specsData) {
          toast({
            title: 'No Content',
            description: 'No specifications found for this RFX',
            variant: 'destructive',
          });
          return false;
        }

        // Decrypt data
        // NOTE: Supabase types for this table/RPCs may be out of date; use a narrow `any` cast here.
        const specsRow: any = specsData as any;
        const [desc, tech, comp] = await Promise.all([
            decrypt(specsRow?.description || ''),
            decrypt(specsRow?.technical_requirements || ''),
            decrypt(specsRow?.company_requirements || '')
        ]);

        specs = {
            ...(specsRow || {}),
            description: desc,
            technical_requirements: tech,
            company_requirements: comp
        } as unknown as RFXSpecsData;
      } else {
        // Always use the version from rfxs table (sent_commit_id) - don't use rfx_specs directly
        console.log('🔍 [RFX Specs PDF Generator] Starting to fetch RFX data...', { rfxId: targetRfxId, useCurrentSpecs });
        
        // ... (fetch rfx logic) ...
        // I need to decrypt commit data too!
        
        // ...

        
        // First, get the RFX to find the sent_commit_id
        // Use RPC function for suppliers, fallback to direct query for owners/members
        let rfxError: any = null;
        
        // Try RPC function first (for suppliers/developers)
        try {
          const { data: rpcData, error: rpcError } = await (supabase as any)
            .rpc('get_rfx_info_for_supplier', { p_rfx_id: targetRfxId });
          
          if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
            rfxData = (rpcData as any[])[0];
            console.log('✅ [RFX Specs PDF Generator] RFX data fetched via RPC:', { rfxData: rfxData ? 'exists' : 'null' });
          } else {
            console.log('⚠️ [RFX Specs PDF Generator] RPC function not available or returned no data, trying direct query...', { rpcError });
          }
        } catch (rpcErr) {
          console.log('⚠️ [RFX Specs PDF Generator] RPC function not available, trying direct query...', { rpcErr });
        }

        // Fallback to direct query if RPC didn't work (for owners/members)
        if (!rfxData) {
          const { data: directRfxData, error: directRfxError } = await supabase
            .from('rfxs' as any)
            .select('sent_commit_id, user_id, name, creator_name, creator_surname, creator_email')
            .eq('id', targetRfxId)
            .single();

          rfxData = directRfxData;
          rfxError = directRfxError;

          console.log('📊 [RFX Specs PDF Generator] Direct query result:', { 
            rfxData: rfxData ? 'exists' : 'null',
            rfxError: rfxError ? { message: rfxError.message, code: rfxError.code, details: rfxError.details } : null 
          });

          if (rfxError) {
            console.error('❌ [RFX Specs PDF Generator] Error fetching RFX:', rfxError);
            throw rfxError;
          }
        }

        if (!rfxData) {
          console.error('❌ [RFX Specs PDF Generator] No RFX data found for ID:', targetRfxId);
          toast({
            title: 'Error',
            description: 'RFX not found. You may not have access to this RFX.',
            variant: 'destructive',
          });
          return false;
        }

        // If there's a sent_commit_id, use the committed version
        if (rfxData?.sent_commit_id) {
          const commitId = rfxData.sent_commit_id;
          console.log('🔍 [RFX Specs PDF Generator] Fetching commit data...', { commitId });
          
          // Try using RPC function first (for developers/suppliers), fallback to direct query
          let commitData: any = null;
          let commitError: any = null;

          // Try RPC function for developers
          try {
            const { data: rpcData, error: rpcError } = await (supabase as any)
              .rpc('get_rfx_specs_commit_for_pdf', { p_commit_id: commitId });
            
            if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
              commitData = (rpcData as any[])[0];
              console.log('✅ [RFX Specs PDF Generator] Commit data fetched via RPC:', { commitData: commitData ? 'exists' : 'null' });
            } else {
              console.log('⚠️ [RFX Specs PDF Generator] RPC function not available or returned no data, trying direct query...', { rpcError });
            }
          } catch (rpcErr) {
            console.log('⚠️ [RFX Specs PDF Generator] RPC function not available, trying direct query...', { rpcErr });
          }

          // Fallback to direct query if RPC didn't work
          if (!commitData) {
            const { data: directCommitData, error: directCommitError } = await supabase
              .from('rfx_specs_commits' as any)
              .select('description, technical_requirements, company_requirements, timeline, images, pdf_customization')
              .eq('id', commitId)
              .single();

            commitData = directCommitData;
            commitError = directCommitError;

            console.log('📊 [RFX Specs PDF Generator] Direct query result:', { 
              commitData: commitData ? 'exists' : 'null',
              commitError: commitError ? { 
                message: commitError.message, 
                code: commitError.code, 
                details: commitError.details,
                hint: commitError.hint 
              } : null 
            });
          }

          if (commitError && commitError.code !== 'PGRST116') {
            console.error('❌ [RFX Specs PDF Generator] Error fetching commit:', commitError);
            throw commitError;
          }

          if (commitData) {
            // Decrypt commit data
            const [desc, tech, comp] = await Promise.all([
                decrypt(commitData.description || ''),
                decrypt(commitData.technical_requirements || ''),
                decrypt(commitData.company_requirements || '')
            ]);

            // Map commit data to specs format
            const pdfCustomization = commitData.pdf_customization as any || {};
            specs = {
              rfx_id: targetRfxId,
              description: desc,
              technical_requirements: tech,
              company_requirements: comp,
              project_timeline: commitData.timeline as TimelineMilestone[] || [],
              image_categories: commitData.images as ImageCategory[] || [],
              pdf_header_bg_color: pdfCustomization.pdf_header_bg_color,
              pdf_header_text_color: pdfCustomization.pdf_header_text_color,
              pdf_section_header_bg_color: pdfCustomization.pdf_section_header_bg_color,
              pdf_section_header_text_color: pdfCustomization.pdf_section_header_text_color,
              pdf_logo_url: pdfCustomization.pdf_logo_url,
              pdf_logo_bg_color: pdfCustomization.pdf_logo_bg_color,
              pdf_logo_bg_enabled: pdfCustomization.pdf_logo_bg_enabled,
              pdf_pages_logo_url: pdfCustomization.pdf_pages_logo_url,
              pdf_pages_logo_bg_color: pdfCustomization.pdf_pages_logo_bg_color,
              pdf_pages_logo_bg_enabled: pdfCustomization.pdf_pages_logo_bg_enabled,
              pdf_pages_logo_use_header: pdfCustomization.pdf_pages_logo_use_header,
            };
            console.log('✅ [RFX Specs PDF Generator] Specs mapped from commit:', {
              hasDescription: !!specs.description,
              hasTechnical: !!specs.technical_requirements,
              hasCompany: !!specs.company_requirements,
              hasTimeline: !!(specs.project_timeline && specs.project_timeline.length > 0),
              hasImages: !!(specs.image_categories && specs.image_categories.length > 0)
            });
          } else {
            console.warn('⚠️ [RFX Specs PDF Generator] No commit data found for commitId:', commitId);
          }
        } else {
          console.warn('⚠️ [RFX Specs PDF Generator] No sent_commit_id found in RFX:', targetRfxId);
        }

        // If no sent_commit_id or no commit data found, show error
        // We don't fall back to rfx_specs as the user requested to use the version from rfxs table
        if (!specs) {
          console.error('❌ [RFX Specs PDF Generator] No specs found. RFX may not have been sent yet.');
          toast({
            title: 'No Content',
            description: 'No sent version found for this RFX. The RFX may not have been sent yet.',
            variant: 'destructive',
          });
          return false;
        }
      }

      // Check if there's any content to generate PDF
      const hasContent = !!(
        specs.description?.trim() || 
        specs.technical_requirements?.trim() || 
        specs.company_requirements?.trim() ||
        (specs.project_timeline && specs.project_timeline.length > 0) ||
        (specs.image_categories && specs.image_categories.some(c => (c.images?.length || 0) > 0))
      );
      
      if (!hasContent) {
        toast({
          title: 'No Content',
          description: 'Please add some content to the specifications before generating PDF',
          variant: 'destructive',
        });
        return;
      }
      
      // Get creator info from RFX data
      let creatorName: string | undefined = undefined;
      let creatorEmail: string | undefined = undefined;
      
      if (rfxData) {
        // Build full name from creator_name and creator_surname
        const nameParts: string[] = [];
        if (rfxData.creator_name) nameParts.push(rfxData.creator_name);
        if (rfxData.creator_surname) nameParts.push(rfxData.creator_surname);
        creatorName = nameParts.length > 0 ? nameParts.join(' ') : undefined;
        creatorEmail = rfxData.creator_email || undefined;
      }
      
      console.log('🔐 [RFX Specs PDF Generator] Encryption status:', { isEncrypted, hasDecryptFile: !!decryptFile });
      console.log('👤 [RFX Specs PDF Generator] Creator info:', { creatorName, creatorEmail });

      const result = await generateRFXSpecsPDF({
        projectName,
        description: specs.description || '',
        technicalRequirements: specs.technical_requirements || '',
        companyRequirements: specs.company_requirements || '',
        projectTimeline: specs.project_timeline,
        imageCategories: specs.image_categories,
        pdfHeaderBgColor: specs.pdf_header_bg_color,
        pdfHeaderTextColor: specs.pdf_header_text_color,
        pdfSectionHeaderBgColor: specs.pdf_section_header_bg_color,
        pdfSectionHeaderTextColor: specs.pdf_section_header_text_color,
        pdfLogoUrl: specs.pdf_logo_url,
        pdfLogoBgEnabled: specs.pdf_logo_bg_enabled,
        pdfLogoBgColor: specs.pdf_logo_bg_color,
        pdfPagesLogoUrl: specs.pdf_pages_logo_use_header ? undefined : specs.pdf_pages_logo_url,
        pdfPagesLogoBgEnabled: specs.pdf_pages_logo_use_header ? undefined : specs.pdf_pages_logo_bg_enabled,
        pdfPagesLogoBgColor: specs.pdf_pages_logo_use_header ? undefined : specs.pdf_pages_logo_bg_color,
        pdfPagesLogoUseHeader: specs.pdf_pages_logo_use_header,
        userName: creatorName,
        userEmail: creatorEmail,
      }, returnBlob, decryptFile || undefined, isEncrypted);

      // If returnBlob is true, return the blob
      if (returnBlob && result instanceof Blob) {
        return result;
      }

      return true;
    } catch (err: any) {
      console.error('❌ [RFX Specs PDF Generator] Error generating PDF:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate PDF. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generatePDF,
    isGenerating,
  };
};

