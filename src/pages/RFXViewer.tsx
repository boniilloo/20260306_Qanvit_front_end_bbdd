import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, FileText, Download, Eye, ArrowLeft, Building2, Users, Mail, Calendar, Image as ImageIcon, ExternalLink, Info, ChevronDown, Upload as UploadIcon, MessageSquare, CheckCircle2, HelpCircle, MessagesSquare } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { generateRFXSpecsPDF } from '@/utils/pdfGenerator';
import ProjectTimelineEditor from '@/components/rfx/ProjectTimelineEditor';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { SupplierDocumentUpload } from '@/components/rfx/SupplierDocumentUpload';
import AnnouncementsBoard from '@/components/rfx/AnnouncementsBoard';
import RFXSupplierChat from '@/components/rfx/supplier-chat/RFXSupplierChat';
import { generateUUID } from '@/utils/uuidUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useRFXCryptoForCompany } from '@/hooks/useRFXCryptoForCompany';
import { usePublicRFXCrypto } from '@/hooks/usePublicRFXCrypto';
import { EncryptedImageForCompany } from '@/components/rfx/EncryptedImageForCompany';
import { userCrypto } from '@/lib/userCrypto';
import { applyEmailAliases } from '@/lib/emailAliases';

interface RFXInvitation {
  id: string;
  rfx_id: string;
  company_id: string;
  status: string;
  rfx_name?: string;
  rfx_description?: string;
  company_name?: string;
  creator?: {
    name?: string;
    surname?: string;
    email?: string;
  };
}

interface NDADocument {
  file_path: string;
  file_name: string;
  file_size: number;
  uploaded_at: string;
}

interface MemberInfo {
  user_id: string;
  email?: string;
  name?: string;
  surname?: string;
}

interface SpecImage {
  url: string;
  name: string;
}

interface RelatedFile {
  path: string;
  name: string;
  originalName: string;
  size: number;
  createdAt: string | null;
  isEncrypted: boolean;
}

const RFXViewer: React.FC = () => {
  const { invitationId } = useParams<{ invitationId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isGeneratingSpecsPdf, setIsGeneratingSpecsPdf] = useState(false);
  const [loadingFile, setLoadingFile] = useState<{ type: 'view' | 'download'; bucket: string; filePath: string } | null>(null);

  // Get company_id and rfx_id from invitation once loaded
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [rfxId, setRfxId] = useState<string | null>(null);
  const [isPublicRFX, setIsPublicRFX] = useState<boolean>(false);
  
  // Initialize crypto hooks - use public crypto if RFX is public, otherwise use company crypto
  const publicCrypto = usePublicRFXCrypto(isPublicRFX ? rfxId : null);
  const companyCrypto = useRFXCryptoForCompany(
    isPublicRFX ? null : rfxId,
    isPublicRFX ? null : companyId
  );
  
  // Use the appropriate crypto based on whether RFX is public
  const activeCrypto = isPublicRFX ? publicCrypto : companyCrypto;
  const { decrypt, decryptFile, encryptFile, isReady: isCryptoReady, isLoading: isCryptoLoading, isEncrypted, key: rfxKey } = activeCrypto;

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<RFXInvitation | null>(null);
  const [originalNda, setOriginalNda] = useState<NDADocument | null>(null);
  const [signedNda, setSignedNda] = useState<NDADocument | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [specImages, setSpecImages] = useState<SpecImage[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [rfxSpecs, setRfxSpecs] = useState<{
    description?: string;
    technical_requirements?: string;
    company_requirements?: string;
  } | null>(null);
  const [imageCategories, setImageCategories] = useState<Array<{ id: string; name: string; images: string[] }>>([]);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isTechnicalOpen, setIsTechnicalOpen] = useState(false);
  const [isCompanyOpen, setIsCompanyOpen] = useState(false);
  const [isImagesOpen, setIsImagesOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isRelatedFilesOpen, setIsRelatedFilesOpen] = useState(false);
  const [relatedFiles, setRelatedFiles] = useState<RelatedFile[]>([]);
  const [submitButtonProps, setSubmitButtonProps] = useState<{
    canSubmit: boolean;
    isSubmitted: boolean;
    isSubmitting: boolean;
    onOpenSubmitModal: () => void;
  } | null>(null);
  const [activeTab, setActiveTab] = useState("info");

  useEffect(() => {
    loadInvitationData();
  }, [invitationId]);

  const parseOriginalNameFromStoredFileName = (storedName: string) => {
    const withoutEnc = storedName.endsWith('.enc') ? storedName.slice(0, -4) : storedName;
    const delimiterIndex = withoutEnc.indexOf('__');
    if (delimiterIndex === -1) return withoutEnc;
    const encoded = withoutEnc.slice(delimiterIndex + 2);
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  };

  // Decrypt specs data once crypto is ready
  useEffect(() => {
    if (isCryptoReady && rfxSpecs && (rfxSpecs.description || rfxSpecs.technical_requirements || rfxSpecs.company_requirements)) {
      const decryptSpecs = async () => {
        try {
          // Check if data is already decrypted (not JSON encrypted format)
          // Encrypted data starts with '{' (JSON format)
          const isEncryptedDesc = rfxSpecs.description && typeof rfxSpecs.description === 'string' && rfxSpecs.description.trim().startsWith('{');
          const isEncryptedTech = rfxSpecs.technical_requirements && typeof rfxSpecs.technical_requirements === 'string' && rfxSpecs.technical_requirements.trim().startsWith('{');
          const isEncryptedComp = rfxSpecs.company_requirements && typeof rfxSpecs.company_requirements === 'string' && rfxSpecs.company_requirements.trim().startsWith('{');

          // Only decrypt if we have encryption enabled and data appears encrypted
          if (isEncrypted && (isEncryptedDesc || isEncryptedTech || isEncryptedComp)) {
            const [desc, tech, comp] = await Promise.all([
              isEncryptedDesc ? decrypt(rfxSpecs.description || '') : Promise.resolve(rfxSpecs.description || ''),
              isEncryptedTech ? decrypt(rfxSpecs.technical_requirements || '') : Promise.resolve(rfxSpecs.technical_requirements || ''),
              isEncryptedComp ? decrypt(rfxSpecs.company_requirements || '') : Promise.resolve(rfxSpecs.company_requirements || '')
            ]);

            setRfxSpecs({
              description: desc,
              technical_requirements: tech,
              company_requirements: comp,
            });
          }
        } catch (error) {
          console.error('Error decrypting RFX specs:', error);
          // If decryption fails, keep encrypted data (user will see encrypted text)
        }
      };

      decryptSpecs();
    }
  }, [isCryptoReady, isEncrypted, decrypt, rfxSpecs?.description, rfxSpecs?.technical_requirements, rfxSpecs?.company_requirements]);

  const loadInvitationData = async () => {
    try {
      setLoading(true);

      // Load invitation
      const { data: invData, error: invError } = await supabase
        .from('rfx_company_invitations' as any)
        .select('id, rfx_id, company_id, status')
        .eq('id', invitationId)
        .single();

      if (invError) throw invError;

      // Set company_id and rfx_id early so crypto hook can initialize
      setCompanyId(invData.company_id);
      setRfxId(invData.rfx_id);
      
      // Check if this RFX is public (to use appropriate crypto)
      const { data: publicRFXData } = await supabase
        .from('public_rfxs' as any)
        .select('id')
        .eq('rfx_id', invData.rfx_id)
        .maybeSingle();
      
      const isPublic = !!publicRFXData;
      setIsPublicRFX(isPublic);
      console.log(`🔓 [RFXViewer] RFX ${invData.rfx_id} is ${isPublic ? 'PUBLIC' : 'PRIVATE'} - using ${isPublic ? 'public' : 'company'} crypto`);

      // Check if status allows viewing
      if (invData.status !== 'supplier evaluating RFX' && invData.status !== 'submitted') {
        toast({
          title: 'Access Denied',
          description: 'You do not have access to this RFX yet.',
          variant: 'destructive',
        });
        navigate('/my-company');
        return;
      }

      // Load RFX info using RPC function to avoid RLS recursion
      let rfxData: any = null;
      const { data: rfxDataArray, error: rfxError } = await supabase
        .rpc('get_rfx_info_for_supplier', { p_rfx_id: invData.rfx_id });
      
      if (rfxDataArray && rfxDataArray.length > 0) {
        rfxData = rfxDataArray[0];
      } else if (rfxError) {
        console.error('Error loading RFX info via RPC:', rfxError);
        // If RPC fails, try direct query as fallback (might work for owners/members)
        const { data: fallbackData } = await supabase
          .from('rfxs' as any)
          .select('id, name, description, user_id, sent_commit_id, creator_name, creator_surname, creator_email')
          .eq('id', invData.rfx_id)
          .single();
        if (fallbackData) {
          rfxData = fallbackData;
        }
      }

      // Load company info
      const { data: companyData } = await supabase
        .from('company' as any)
        .select('id, nombre_empresa')
        .eq('id', invData.company_id)
        .single();

      // Get creator info from RFX table (creator_name, creator_surname, creator_email)
      let creatorInfo = undefined;
      if (rfxData?.creator_name || rfxData?.creator_surname || rfxData?.creator_email) {
        creatorInfo = {
          name: rfxData.creator_name || undefined,
          surname: rfxData.creator_surname || undefined,
          email: rfxData.creator_email || undefined,
        };
      }

      // Load members
      const { data: membersInfo } = await supabase.rpc('get_rfx_members', { p_rfx_id: invData.rfx_id });
      const memberList: MemberInfo[] = (membersInfo || []).map((m: any) => ({ 
        user_id: m.user_id, 
        email: m.email, 
        name: m.name, 
        surname: m.surname 
      }));

      // Add creator from RFX table to members if not already present (check by email to avoid duplicates)
      if (creatorInfo && creatorInfo.email) {
        const creatorEmail = creatorInfo.email.toLowerCase().trim();
        const isCreatorAlreadyInMembers = memberList.some(
          (m) => m.email && m.email.toLowerCase().trim() === creatorEmail
        );
        
        if (!isCreatorAlreadyInMembers) {
          // Add creator to members list
          memberList.push({
            user_id: rfxData?.user_id || '', // Use user_id from rfxData if available
            email: creatorInfo.email,
            name: creatorInfo.name,
            surname: creatorInfo.surname,
          });
        }
      }

      setMembers(memberList);

      // Load specs data (images, timeline, description, requirements)
      // Use the sent_commit_id from rfxData if available
      let specsData: any = null;

      // If there's a sent_commit_id, use the committed version
      if (rfxData?.sent_commit_id) {
        const { data: commitData, error: commitError } = await supabase
          .from('rfx_specs_commits' as any)
          .select('description, technical_requirements, company_requirements, timeline, images')
          .eq('id', rfxData.sent_commit_id)
          .single();

        if (commitError && commitError.code !== 'PGRST116') {
          console.error('Error loading RFX specs commit:', commitError);
        } else if (commitData) {
          // Map commit data to specs format
          specsData = {
            description: commitData.description || '',
            technical_requirements: commitData.technical_requirements || '',
            company_requirements: commitData.company_requirements || '',
            project_timeline: commitData.timeline || null,
            image_categories: commitData.images || null,
          };
        }
      }

      // If no sent_commit_id or no commit data found, fall back to current specs
      if (!specsData) {
        const { data: currentSpecsData, error: specsError } = await supabase
          .from('rfx_specs' as any)
          .select('*')
          .eq('rfx_id', invData.rfx_id)
          .single();

        if (specsError && specsError.code !== 'PGRST116') {
          console.error('Error loading RFX specs:', specsError);
          // Don't throw, just log - specs might not exist yet
        } else {
          specsData = currentSpecsData;
        }
      }

      if (specsData) {
        console.log('RFX Specs loaded:', {
          usingSentVersion: !!rfxData?.sent_commit_id,
          hasDescription: !!specsData.description,
          hasTechnical: !!specsData.technical_requirements,
          hasCompany: !!specsData.company_requirements,
        });
        
        // Wait for crypto to be ready before decrypting
        // If crypto is not ready yet, we'll decrypt in a useEffect
        // For now, set the encrypted data and decrypt in useEffect
        setRfxSpecs({
          description: specsData.description || '',
          technical_requirements: specsData.technical_requirements || '',
          company_requirements: specsData.company_requirements || '',
        });

        // Parse images from image_categories (new format) or images (old format)
        let images: SpecImage[] = [];
        if (specsData.image_categories && Array.isArray(specsData.image_categories)) {
          // New format: image_categories - store categories and flatten for legacy display
          const categories = specsData.image_categories.map((cat: any) => ({
            id: cat.id || generateUUID(),
            name: cat.name || 'Unnamed Category',
            images: Array.isArray(cat.images) ? cat.images : [],
          }));
          setImageCategories(categories);
          
          // Also flatten for backwards compatibility
          categories.forEach((category) => {
            category.images.forEach((imgUrl: string) => {
              images.push({
                url: imgUrl,
                name: category.name || 'Image',
              });
            });
          });
        }
        setSpecImages(images);

        // Parse timeline from project_timeline
        let timelineData = specsData.project_timeline;
        if (typeof timelineData === 'string') {
          try { timelineData = JSON.parse(timelineData); } catch {}
        }
        setTimeline(Array.isArray(timelineData) ? timelineData : []);
      }

      // Load related files from specs route storage folder
      try {
        const relatedFolder = `${invData.rfx_id}/related-files`;
        const { data: relatedData, error: relatedError } = await supabase.storage
          .from('rfx-images')
          .list(relatedFolder, {
            limit: 100,
            offset: 0,
            sortBy: { column: 'created_at', order: 'desc' },
          });

        if (relatedError) {
          console.warn('Error loading related files:', relatedError);
        } else {
          const mappedRelatedFiles: RelatedFile[] = (relatedData || [])
            .filter((file: any) => file?.name && !file.name.endsWith('/'))
            .map((file: any) => {
              const originalName = parseOriginalNameFromStoredFileName(file.name);
              const fileSize = Number(file?.metadata?.size || file?.size || 0);
              return {
                path: `${relatedFolder}/${file.name}`,
                name: file.name,
                originalName,
                size: fileSize,
                createdAt: file?.created_at || null,
                isEncrypted: file.name.endsWith('.enc'),
              };
            });
          setRelatedFiles(mappedRelatedFiles);
        }
      } catch (relatedFilesError) {
        console.warn('Unexpected error loading related files:', relatedFilesError);
      }

      setInvitation({
        ...invData,
        rfx_name: rfxData?.name,
        rfx_description: rfxData?.description,
        company_name: companyData?.nombre_empresa,
        creator: creatorInfo,
      });

      // Load original NDA - using rfx_id (one NDA per RFX)
      const { data: originalNdaData } = await supabase
        .from('rfx_nda_uploads')
        .select('file_path, file_name, file_size, uploaded_at')
        .eq('rfx_id', invData.rfx_id)
        .maybeSingle();

      if (originalNdaData) {
        setOriginalNda(originalNdaData);
      }

      // Load signed NDA
      const { data: signedNdaData } = await supabase
        .from('rfx_signed_nda_uploads' as any)
        .select('file_path, file_name, file_size, uploaded_at')
        .eq('rfx_company_invitation_id', invData.id)
        .maybeSingle();

      if (signedNdaData) {
        setSignedNda(signedNdaData);
      }

      // Load company slug for navigation
      if (invData.company_id) {
        const { data: companyRevisionData } = await supabase
          .from('company_revision' as any)
          .select('slug')
          .eq('company_id', invData.company_id)
          .eq('is_active', true)
          .maybeSingle();
        
        if (companyRevisionData?.slug) {
          setCompanySlug(companyRevisionData.slug);
        }
        setLoading(false);
      } else {
        // No company_id: keep navigation fallback behaviour
        setLoading(false);
      }
    } catch (err) {
      console.error('Error loading RFX data:', err);
      toast({
        title: 'Error',
        description: 'Failed to load RFX data',
        variant: 'destructive',
      });
      setLoading(false);
      navigate('/my-company');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const downloadDocument = async (bucket: string, filePath: string, fileName: string) => {
    try {
      setLoadingFile({ type: 'download', bucket, filePath });
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      let fileBlob: Blob = data;
      
      // Check if file is encrypted (.enc extension)
      const isEncryptedFile = isEncrypted && filePath.endsWith('.enc') && decryptFile;
      
      if (isEncryptedFile && decryptFile) {
        console.log('🔐 [RFXViewer] Decrypting file for download:', fileName);
        const encryptedBuffer = await data.arrayBuffer();
        
        // Extract IV (first 12 bytes) and encrypted data
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        
        // Convert IV to base64
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        
        // Decrypt
        const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
        if (!decryptedBuffer) {
          throw new Error('Failed to decrypt file');
        }
        
        // Detect MIME type based on original extension (remove .enc if present)
        const fileNameWithoutEnc = filePath.endsWith('.enc') ? filePath.slice(0, -4) : filePath;
        const originalExt = fileNameWithoutEnc.split('.').pop()?.toLowerCase() || '';
        let mimeType = 'application/octet-stream';
        if (originalExt === 'pdf') mimeType = 'application/pdf';
        else if (originalExt === 'doc') mimeType = 'application/msword';
        else if (originalExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (originalExt === 'xls') mimeType = 'application/vnd.ms-excel';
        else if (originalExt === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (originalExt === 'txt') mimeType = 'text/plain';
        
        fileBlob = new Blob([decryptedBuffer], { type: mimeType });
        console.log('🔐 [RFXViewer] File decrypted successfully');
      }

      const url = URL.createObjectURL(fileBlob);
      const a = document.createElement('a');
      a.href = url;
      // Remove .enc extension from filename if present
      const downloadFileName = fileName.endsWith('.enc') ? fileName.slice(0, -4) : fileName;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: 'Error',
        description: 'Failed to download document',
        variant: 'destructive',
      });
    } finally {
      setLoadingFile(null);
    }
  };

  const viewDocument = async (bucket: string, filePath: string, title: string) => {
    try {
      setLoadingFile({ type: 'view', bucket, filePath });
      const { data, error } = await supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      // Check if file is encrypted (.enc extension)
      const isEncryptedFile = isEncrypted && filePath.endsWith('.enc') && decryptFile;
      
      if (isEncryptedFile && decryptFile) {
        console.log('🔐 [RFXViewer] Decrypting file for viewing:', title);
        const encryptedBuffer = await data.arrayBuffer();
        
        // Extract IV (first 12 bytes) and encrypted data
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        
        // Convert IV to base64
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        
        // Decrypt
        const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
        if (!decryptedBuffer) {
          throw new Error('Failed to decrypt file');
        }
        
        // Detect MIME type based on original extension (remove .enc if present)
        const fileNameWithoutEnc = filePath.endsWith('.enc') ? filePath.slice(0, -4) : filePath;
        const originalExt = fileNameWithoutEnc.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = 'application/pdf';
        if (originalExt === 'doc') mimeType = 'application/msword';
        else if (originalExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (originalExt === 'xls') mimeType = 'application/vnd.ms-excel';
        else if (originalExt === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (originalExt === 'txt') mimeType = 'text/plain';
        
        // Create blob from decrypted data
        const blob = new Blob([decryptedBuffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        // Clean title to remove .enc extension if present
        const cleanTitle = title.endsWith('.enc') ? title.slice(0, -4) : title;
        setViewingPdf({ url, title: cleanTitle });
      } else {
        // Not encrypted, use directly
        const url = URL.createObjectURL(data);
        setViewingPdf({ url, title });
      }
    } catch (error) {
      console.error('Error viewing document:', error);
      toast({
        title: 'Error',
        description: 'Failed to view document',
        variant: 'destructive',
      });
    } finally {
      setLoadingFile(null);
    }
  };

  const viewSpecsPDF = async () => {
    try {
      if (!invitation?.rfx_id || !invitation?.rfx_name || !rfxId) return;
      
      if (!isCryptoReady) {
        toast({
          title: 'Please wait',
          description: 'Encryption keys are still loading. Please try again in a moment.',
          variant: 'destructive',
        });
        return;
      }

      setIsGeneratingSpecsPdf(true);

      // Get RFX data to find sent_commit_id and creator info
      let rfxData: any = null;
      const { data: rfxDataArray, error: rfxError } = await supabase
        .rpc('get_rfx_info_for_supplier', { p_rfx_id: rfxId });
      
      if (rfxDataArray && rfxDataArray.length > 0) {
        rfxData = rfxDataArray[0];
      } else if (rfxError) {
        // Fallback to direct query
        const { data: fallbackData } = await supabase
          .from('rfxs' as any)
          .select('sent_commit_id, name, creator_name, creator_surname, creator_email')
          .eq('id', rfxId)
          .single();
        if (fallbackData) {
          rfxData = fallbackData;
        }
      }

      let specs: any = null;

      // If there's a sent_commit_id, use the committed version
      if (rfxData?.sent_commit_id) {
        const { data: commitData, error: commitError } = await supabase
          .from('rfx_specs_commits' as any)
          .select('description, technical_requirements, company_requirements, timeline, images, pdf_customization')
          .eq('id', rfxData.sent_commit_id)
          .single();

        if (commitError && commitError.code !== 'PGRST116') {
          throw commitError;
        }

        if (commitData) {
          // Decrypt commit data using company crypto
          const [desc, tech, comp] = await Promise.all([
            decrypt(commitData.description || ''),
            decrypt(commitData.technical_requirements || ''),
            decrypt(commitData.company_requirements || '')
          ]);

          const pdfCustomization = commitData.pdf_customization as any || {};
          specs = {
            description: desc,
            technical_requirements: tech,
            company_requirements: comp,
            project_timeline: commitData.timeline || [],
            image_categories: commitData.images || [],
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
        }
      }

      // If no sent_commit_id or no commit data found, fall back to current specs
      if (!specs) {
        const { data: currentSpecsData, error: specsError } = await supabase
          .from('rfx_specs' as any)
          .select('*')
          .eq('rfx_id', rfxId)
          .single();

        if (specsError && specsError.code !== 'PGRST116') {
          throw specsError;
        }

        if (currentSpecsData) {
          // Decrypt current specs data using company crypto
          const [desc, tech, comp] = await Promise.all([
            decrypt(currentSpecsData.description || ''),
            decrypt(currentSpecsData.technical_requirements || ''),
            decrypt(currentSpecsData.company_requirements || '')
          ]);

          specs = {
            ...currentSpecsData,
            description: desc,
            technical_requirements: tech,
            company_requirements: comp
          };
        }
      }

      if (!specs) {
        toast({
          title: 'No Content',
          description: 'No specifications found for this RFX',
          variant: 'destructive',
        });
        return;
      }

      // Check if there's any content to generate PDF
      const hasContent = !!(
        specs.description?.trim() || 
        specs.technical_requirements?.trim() || 
        specs.company_requirements?.trim() ||
        (specs.project_timeline && specs.project_timeline.length > 0) ||
        (specs.image_categories && specs.image_categories.some((c: any) => (c.images?.length || 0) > 0))
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

      // Generate PDF with decrypted data and company decryptFile function
      const blob = await generateRFXSpecsPDF({
        projectName: invitation.rfx_name,
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
      }, true, decryptFile || undefined, isEncrypted);

      if (blob instanceof Blob) {
        const url = URL.createObjectURL(blob);
        setViewingPdf({ url, title: `RFX Specifications - ${invitation.rfx_name}` });
      }
    } catch (error: any) {
      console.error('Error generating specs PDF:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate specifications PDF',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSpecsPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl w-full flex-1 flex items-center justify-center min-h-[calc(100vh-300px)]">
          <div className="flex flex-col justify-center items-center">
            <Loader2 className="h-12 w-12 animate-spin text-[#1A1F2C] mb-4" />
            <p className="text-gray-600">Loading RFX...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="flex-1 overflow-y-auto flex flex-col min-h-full bg-background">
        <div className="container mx-auto px-4 py-8 flex-1 flex items-center justify-center">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-600">RFX not found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col min-h-full bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl flex-1">
        {/* Header Card */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-white to-[#f1f1f1] border-l-4 border-l-[#80c8f0] rounded-xl shadow-sm px-4 md:px-6 py-4 md:py-5">
            <div className="flex items-start md:items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-extrabold text-black font-intro tracking-tight truncate">
                  {invitation.rfx_name}
                </h1>
                {invitation.rfx_description && (
                  <p className="mt-1 text-sm md:text-base text-gray-600 leading-relaxed max-w-3xl font-inter line-clamp-2">
                    {invitation.rfx_description}
                  </p>
                )}
                {invitation.company_name && (
                  <div className="mt-2">
                    <Badge className="bg-green-600">
                      <Building2 className="h-3 w-3 mr-1" />
                      {invitation.company_name}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (companySlug) {
                      navigate(`/suppliers/${companySlug}?tab=manage&subtab=rfxs`);
                    } else {
                      navigate('/my-company');
                    }
                  }}
                  className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white border-[#1A1F2C]"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-14 bg-[#f1f1f1] rounded-2xl p-1.5 mb-8 border border-white/60 shadow-inner">
            <TabsTrigger value="info" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#1b2c4a]/70 hover:bg-white/70 hover:text-[#1b2c4a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#1b2c4a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#80c8f0]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#80c8f0]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#80c8f0]/60">
              <FileText className="w-4 h-4" />
              RFX Specifications
            </TabsTrigger>
            <TabsTrigger value="documents" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#1b2c4a]/70 hover:bg-white/70 hover:text-[#1b2c4a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#1b2c4a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#80c8f0]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#80c8f0]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#80c8f0]/60">
              <UploadIcon className="w-4 h-4" />
              Generate Proposal
            </TabsTrigger>
            <TabsTrigger value="announcements" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#1b2c4a]/70 hover:bg-white/70 hover:text-[#1b2c4a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#1b2c4a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#80c8f0]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#80c8f0]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#80c8f0]/60">
              <MessageSquare className="w-4 h-4" />
              Announcements
            </TabsTrigger>
            <TabsTrigger value="chat" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#1b2c4a]/70 hover:bg-white/70 hover:text-[#1b2c4a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#1b2c4a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#80c8f0]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#80c8f0]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#80c8f0]/60">
              <MessagesSquare className="w-4 h-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="details" className="group flex items-center gap-2 rounded-lg px-5 py-2 font-semibold text-[#1b2c4a]/70 hover:bg-white/70 hover:text-[#1b2c4a] transition-all duration-200 ease-out data-[state=active]:bg-white data-[state=active]:text-[#1b2c4a] data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-[#80c8f0]/40 data-[state=active]:ring-1 data-[state=active]:ring-[#80c8f0]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#80c8f0]/60">
              <Info className="w-4 h-4" />
              RFX Details
            </TabsTrigger>
          </TabsList>

          {/* Submit Button - Just below tabs, above document cards (only show on documents tab) */}
          {activeTab === "documents" && submitButtonProps && !submitButtonProps.isSubmitted && (
            <Card className="border border-gray-200 rounded-xl shadow-sm bg-white mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-[#1A1F2C]">
                        Submit Proposal
                      </h3>
                      <TooltipProvider delayDuration={50}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-[#80c8f0] hover:text-[#1A1F2C] transition-colors cursor-help"
                              aria-label="What happens after you submit?"
                            >
                              <HelpCircle className="h-5 w-5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm p-4">
                            <div className="space-y-2">
                              <p className="font-semibold text-sm mb-2">What happens after you submit?</p>
                              <p className="text-sm">
                                The buyer will be notified that your company has submitted documents for review and will have direct access to them.
                              </p>
                              <p className="text-sm">
                                In the future, an FQ agent will help evaluate proposals before sending them to ensure they meet all the conditions specified in the RFX.
                              </p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-sm text-gray-600">
                      {submitButtonProps.canSubmit 
                        ? 'Ready to submit your proposal. Make sure all documents are correct before submitting.'
                        : 'You need to upload at least one proposal and one quotation document before submitting.'}
                    </p>
                  </div>
                  <Button
                    onClick={submitButtonProps.onOpenSubmitModal}
                    disabled={!submitButtonProps.canSubmit || submitButtonProps.isSubmitting}
                    className="bg-[#7de19a] hover:bg-[#7de19a]/90 text-[#1A1F2C]"
                  >
                    {submitButtonProps.isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Submit Proposal
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "documents" && submitButtonProps && submitButtonProps.isSubmitted && (
            <Card className="border border-[#7de19a] rounded-xl shadow-sm bg-[#7de19a]/10 mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#7de19a]" />
                  <div>
                    <h3 className="text-lg font-semibold text-[#1A1F2C] mb-1">
                      Proposal Submitted
                    </h3>
                    <p className="text-sm text-gray-600">
                      Your proposal has been successfully submitted and is under review.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tab 1: Details */}
          <TabsContent value="details" className="space-y-6">
            {/* RFX Details Card */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-xl text-[#1A1F2C]">RFX Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Creator */}
                {invitation.creator && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-semibold text-[#1A1F2C] mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Creator
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {invitation.creator.name && invitation.creator.surname 
                          ? `${invitation.creator.name} ${invitation.creator.surname}` 
                          : 'Unknown'}
                      </span>
                      {invitation.creator.email && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {invitation.creator.email}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Members */}
                {members.length > 0 && (
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="text-sm font-semibold text-[#1A1F2C] mb-2 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Members ({members.length})
                    </h4>
                    <div className="space-y-2">
                      {members.map((member) => (
                        <div key={member.user_id} className="flex items-center gap-2 text-sm">
                          <span>
                            {member.name && member.surname 
                              ? `${member.name} ${member.surname}` 
                              : applyEmailAliases(member.email) || 'Unknown'}
                          </span>
                          {member.email && member.name && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {applyEmailAliases(member.email)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {timeline.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-[#1A1F2C] mb-3 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Project Timeline
                    </h4>
                    <ProjectTimelineEditor 
                      milestones={timeline}
                      onChange={() => {}} // Read-only, no changes allowed
                      readOnly={true}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* NDAs Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Original NDA Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-blue-600" />
                    Original NDA
                  </CardTitle>
                  <CardDescription>
                    Non-Disclosure Agreement from buyer
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {originalNda ? (
                    <div className="space-y-4">
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm font-medium">{originalNda.file_name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatFileSize(originalNda.file_size)} • {new Date(originalNda.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => viewDocument('rfx-ndas', originalNda.file_path, 'Original NDA')}
                          disabled={loadingFile?.bucket === 'rfx-ndas' && loadingFile?.filePath === originalNda.file_path}
                          className="flex-1 bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
                        >
                          {loadingFile?.type === 'view' && loadingFile?.bucket === 'rfx-ndas' && loadingFile?.filePath === originalNda.file_path ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => downloadDocument('rfx-ndas', originalNda.file_path, originalNda.file_name)}
                          disabled={loadingFile?.bucket === 'rfx-ndas' && loadingFile?.filePath === originalNda.file_path}
                        >
                          {loadingFile?.type === 'download' && loadingFile?.bucket === 'rfx-ndas' && loadingFile?.filePath === originalNda.file_path ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No NDA document</p>
                  )}
                </CardContent>
              </Card>

              {/* Signed NDA Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-green-600" />
                    Signed NDA
                  </CardTitle>
                  <CardDescription>
                    Your signed Non-Disclosure Agreement
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {signedNda ? (
                    <div className="space-y-4">
                      <div className="p-4 border rounded-lg bg-green-50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-green-800">{signedNda.file_name}</p>
                          <Badge className="bg-green-600">Validated</Badge>
                        </div>
                        <p className="text-xs text-green-600">
                          {formatFileSize(signedNda.file_size)} • {new Date(signedNda.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => viewDocument('rfx-signed-ndas', signedNda.file_path, 'Signed NDA')}
                          disabled={loadingFile?.bucket === 'rfx-signed-ndas' && loadingFile?.filePath === signedNda.file_path}
                          className="flex-1 bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
                        >
                          {loadingFile?.type === 'view' && loadingFile?.bucket === 'rfx-signed-ndas' && loadingFile?.filePath === signedNda.file_path ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => downloadDocument('rfx-signed-ndas', signedNda.file_path, signedNda.file_name)}
                          disabled={loadingFile?.bucket === 'rfx-signed-ndas' && loadingFile?.filePath === signedNda.file_path}
                        >
                          {loadingFile?.type === 'download' && loadingFile?.bucket === 'rfx-signed-ndas' && loadingFile?.filePath === signedNda.file_path ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No signed document</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab 2: Document Upload */}
          <TabsContent value="documents" className="space-y-6">
            {invitationId && (
              <SupplierDocumentUpload 
                invitationId={invitationId} 
                hideSubmitButton={true}
                onSubmitButtonReady={setSubmitButtonProps}
                encryptFile={encryptFile || undefined}
                decryptFile={decryptFile || undefined}
                isEncrypted={isEncrypted}
              />
            )}
          </TabsContent>

          {/* Tab 3: Announcements */}
          <TabsContent value="announcements" className="space-y-6">
            {invitation?.rfx_id && (
              <AnnouncementsBoard 
                rfxId={invitation.rfx_id} 
                readOnly={true}
                decrypt={decrypt}
                decryptFile={decryptFile}
                isEncrypted={isEncrypted}
                isCryptoReady={isCryptoReady}
              />
            )}
          </TabsContent>

          {/* Tab 4: Chat (scoped to this invitation's company only) */}
          <TabsContent value="chat" className="space-y-6">
            {rfxId && companyId && (
              <RFXSupplierChat
                mode="supplier"
                rfxId={rfxId}
                companyId={companyId}
                companyName={invitation?.company_name || null}
                allowUploads={true}
                isActive={activeTab === 'chat'}
              />
            )}
          </TabsContent>

          {/* Tab 5: Information */}
          <TabsContent value="info" className="space-y-6">
            {/* Specifications Card - Contenedora de todas las tarjetas */}
            <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <FileText className="h-5 w-5 text-[#1A1F2C]" />
                      Specifications
                    </CardTitle>
                    <CardDescription>
                      Complete RFX specifications and requirements
                    </CardDescription>
                  </div>
                  <Button
                    onClick={viewSpecsPDF}
                    disabled={isGeneratingSpecsPdf}
                    className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white"
                  >
                    {isGeneratingSpecsPdf ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        View PDF
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Project Description - Collapsible */}
                <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
                  <Collapsible open={isDescriptionOpen} onOpenChange={setIsDescriptionOpen}>
                    <CollapsibleTrigger className="w-full px-6 py-4 hover:bg-gray-50 transition-colors rounded-t-xl">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-500" />
                          <div className="text-left">
                            <h3 className="font-semibold text-black">📋 Project Description</h3>
                            <p className="text-sm text-gray-500">Objectives and scope of the RFX</p>
                          </div>
                        </div>
                        <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${isDescriptionOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-6 pb-6 pt-0">
                        {rfxSpecs?.description && rfxSpecs.description.trim() ? (
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <MarkdownRenderer
                              content={rfxSpecs.description}
                              decryptFile={decryptFile || undefined}
                              isEncrypted={isEncrypted}
                            />
                          </div>
                        ) : (
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground italic">No project description provided</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>

                {/* Technical Requirements - Collapsible */}
                <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
                  <Collapsible open={isTechnicalOpen} onOpenChange={setIsTechnicalOpen}>
                    <CollapsibleTrigger className="w-full px-6 py-4 hover:bg-gray-50 transition-colors rounded-t-xl">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-500" />
                          <div className="text-left">
                            <h3 className="font-semibold text-black">⚙️ Technical Requirements</h3>
                            <p className="text-sm text-gray-500">Technical requirements and standards</p>
                          </div>
                        </div>
                        <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${isTechnicalOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-6 pb-6 pt-0">
                        {rfxSpecs?.technical_requirements && rfxSpecs.technical_requirements.trim() ? (
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <MarkdownRenderer
                              content={rfxSpecs.technical_requirements}
                              decryptFile={decryptFile || undefined}
                              isEncrypted={isEncrypted}
                            />
                          </div>
                        ) : (
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground italic">No technical requirements provided</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>

                {/* Company Requirements - Collapsible */}
                <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
                  <Collapsible open={isCompanyOpen} onOpenChange={setIsCompanyOpen}>
                    <CollapsibleTrigger className="w-full px-6 py-4 hover:bg-gray-50 transition-colors rounded-t-xl">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-500" />
                          <div className="text-left">
                            <h3 className="font-semibold text-black">🏢 Company Requirements</h3>
                            <p className="text-sm text-gray-500">Required qualifications and experience</p>
                          </div>
                        </div>
                        <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${isCompanyOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-6 pb-6 pt-0">
                        {rfxSpecs?.company_requirements && rfxSpecs.company_requirements.trim() ? (
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <MarkdownRenderer
                              content={rfxSpecs.company_requirements}
                              decryptFile={decryptFile || undefined}
                              isEncrypted={isEncrypted}
                            />
                          </div>
                        ) : (
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground italic">No company requirements provided</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>

                {/* Project Timeline Card - Collapsible */}
                {timeline.length > 0 && (
                  <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
                    <Collapsible open={isTimelineOpen} onOpenChange={setIsTimelineOpen}>
                      <CollapsibleTrigger className="w-full px-6 py-4 hover:bg-gray-50 transition-colors rounded-t-xl">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-gray-500" />
                            <div className="text-left">
                              <h3 className="font-semibold text-black">🗓️ Project Timeline</h3>
                              <p className="text-sm text-gray-500">Proposed project timeline and milestones</p>
                            </div>
                          </div>
                          <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${isTimelineOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-6 pb-6 pt-0">
                          <ProjectTimelineEditor 
                            milestones={timeline}
                            onChange={() => {}} // Read-only, no changes allowed
                            readOnly={true}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                )}

                {/* Related Files Card - Collapsible */}
                <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
                  <Collapsible open={isRelatedFilesOpen} onOpenChange={setIsRelatedFilesOpen}>
                    <CollapsibleTrigger className="w-full px-6 py-4 hover:bg-gray-50 transition-colors rounded-t-xl">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-500" />
                          <div className="text-left">
                            <h3 className="font-semibold text-black">📎 Related Files</h3>
                            <p className="text-sm text-gray-500">
                              {relatedFiles.length} file{relatedFiles.length !== 1 ? 's' : ''} attached by buyer
                            </p>
                          </div>
                        </div>
                        <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${isRelatedFilesOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-6 pb-6 pt-0">
                        {relatedFiles.length === 0 ? (
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground italic">No related files uploaded</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {relatedFiles.map((file) => (
                              <div
                                key={file.path}
                                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <FileText className="h-5 w-5 text-[#1A1F2C] flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{file.originalName}</p>
                                    <p className="text-xs text-gray-500">
                                      {formatFileSize(file.size)}
                                      {file.createdAt ? ` • ${new Date(file.createdAt).toLocaleDateString()}` : ''}
                                      {file.isEncrypted ? ' • Encrypted' : ''}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => viewDocument('rfx-images', file.path, file.originalName)}
                                    disabled={loadingFile?.bucket === 'rfx-images' && loadingFile?.filePath === file.path}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => downloadDocument('rfx-images', file.path, file.originalName)}
                                    disabled={loadingFile?.bucket === 'rfx-images' && loadingFile?.filePath === file.path}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>

                {/* Attached Images Card - Collapsible */}
                {imageCategories.length > 0 && (
                  <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
                    <Collapsible open={isImagesOpen} onOpenChange={setIsImagesOpen}>
                      <CollapsibleTrigger className="w-full px-6 py-4 hover:bg-gray-50 transition-colors rounded-t-xl">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3">
                            <ImageIcon className="w-5 h-5 text-gray-500" />
                            <div className="text-left">
                              <h3 className="font-semibold text-black">🖼️ Attached Images</h3>
                              <p className="text-sm text-gray-500">
                                {imageCategories.reduce((total, cat) => total + cat.images.length, 0)} image{imageCategories.reduce((total, cat) => total + cat.images.length, 0) !== 1 ? 's' : ''} across {imageCategories.length} categor{imageCategories.length !== 1 ? 'ies' : 'y'}
                              </p>
                            </div>
                          </div>
                          <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${isImagesOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-6 pb-6 pt-0">
                          <div className="space-y-6">
                            {imageCategories.map((category) => (
                              <div key={category.id} className="space-y-3">
                                <h4 className="text-sm font-semibold text-[#1A1F2C]">
                                  {category.name} ({category.images.length} {category.images.length === 1 ? 'image' : 'images'})
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                  {category.images.map((imageUrl, index) => (
                                    <div key={index} className="group relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                                      <EncryptedImageForCompany
                                        src={imageUrl}
                                        decryptFile={decryptFile}
                                        isEncrypted={isEncrypted}
                                        alt={`${category.name} - Image ${index + 1}`}
                                        className="w-full h-32 object-cover cursor-pointer"
                                        onClick={() => setViewingImage(imageUrl)}
                                      />
                                      <div className="p-2 bg-white">
                                        <p className="text-xs truncate">{category.name} - Image {index + 1}</p>
                                        <div className="flex gap-1 mt-2">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 text-xs flex-1"
                                            onClick={() => setViewingImage(imageUrl)}
                                          >
                                            <Eye className="h-3 w-3 mr-1" />
                                            View
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 text-xs flex-1"
                                            onClick={() => window.open(imageUrl, '_blank')}
                                          >
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            Open
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 text-xs flex-1"
                                            onClick={() => {
                                              const a = document.createElement('a');
                                              a.href = imageUrl;
                                              a.download = `${category.name}-image-${index + 1}`;
                                              a.click();
                                            }}
                                          >
                                            <Download className="h-3 w-3 mr-1" />
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* PDF Viewer Modal */}
      <Dialog open={!!viewingPdf} onOpenChange={(open) => {
        if (!open && viewingPdf?.url) {
          URL.revokeObjectURL(viewingPdf.url);
          setViewingPdf(null);
        }
      }}>
        <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#1A1F2C]" />
              {viewingPdf?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-6">
            {viewingPdf?.url ? (
              <iframe
                src={viewingPdf.url}
                className="w-full h-full rounded-lg border border-gray-200"
                title={viewingPdf.title}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-[#1A1F2C]" />
              </div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button onClick={() => {
              if (viewingPdf?.url) URL.revokeObjectURL(viewingPdf.url);
              setViewingPdf(null);
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Viewer Modal */}
      <Dialog open={!!viewingImage} onOpenChange={(open) => !open && setViewingImage(null)}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-[#1A1F2C]" />
              Image Preview
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-6 flex items-center justify-center bg-gray-50">
            {viewingImage ? (
              <EncryptedImageForCompany
                src={viewingImage}
                decryptFile={decryptFile}
                isEncrypted={isEncrypted}
                alt="Preview"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-[#1A1F2C]" />
              </div>
            )}
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button onClick={() => setViewingImage(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default RFXViewer;

