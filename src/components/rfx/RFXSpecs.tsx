import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Save, AlertCircle, Check, X, Eye, Download, Upload, Trash2, FileText, Shield, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { userCrypto } from '@/lib/userCrypto';
import HunkDiffList from './HunkDiffList';
import { parseUnifiedDiff, applyUnifiedDiff, applyHunk, diffHasChanges } from '@/lib/unifiedDiff';
import type { Hunk } from '@/lib/unifiedDiff';
import ProjectTimelineEditor, { TimelineMilestone } from '@/components/rfx/ProjectTimelineEditor';
import RFXImagesCard, { ImageCategory } from '@/components/rfx/RFXImagesCard';
import { useRFXSpecsPDFGenerator } from '@/hooks/useRFXSpecsPDFGenerator';
import MarkdownEditor from '@/components/ui/MarkdownEditor';
import TodoWarning from '@/components/ui/TodoWarning';
import ProposalSuggestionsWarning from '@/components/ui/ProposalSuggestionsWarning';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import AgentHelperDialog from './AgentHelperDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';

export type ProposalSuggestion = {
  id: string;
  title: string;
  rationale?: string;
  impactedPaths?: string[];
  diffs: Record<string, string>;
  /** @deprecated Legacy JSON Patch format for backward compat with stored messages */
  patch?: any[];
};

export interface RFXSpecsRef {
  handleSave: () => Promise<void>;
  handleDownloadPDF: () => Promise<void>;
  isSaving: boolean;
  isGeneratingPDF: boolean;
  expandSection?: (section: 'images' | 'pdf') => void;
  getImageCategories: () => ImageCategory[];
  getPdfCustomization: () => {
    pdf_header_bg_color: string;
    pdf_header_text_color: string;
    pdf_section_header_bg_color: string;
    pdf_section_header_text_color: string;
    pdf_logo_url: string;
    pdf_logo_bg_color: string;
    pdf_logo_bg_enabled: boolean;
    pdf_pages_logo_url: string;
    pdf_pages_logo_bg_color: string;
    pdf_pages_logo_bg_enabled: boolean;
    pdf_pages_logo_use_header: boolean;
  };
}

interface RFXSpecsProps {
  rfxId: string;
  projectName?: string;
  currentSpecs: {
    description: string;
    technical_requirements: string;
    company_requirements: string;
  };
  onSpecsChange: (specs: {
    description: string;
    technical_requirements: string;
    company_requirements: string;
  }) => void;
  pendingProposals?: ProposalSuggestion[];
  hiddenProposals?: Record<string, Set<string>>;
  onAcceptProposal?: (suggestionId: string, fieldName: string) => Promise<void>;
  onRejectProposal?: (suggestionId: string, fieldName: string) => void;
  onShowProposal?: (suggestionId: string, fieldName: string) => void;
  onAllProposalsApplied?: (fieldName: string) => void;
  isAutoSaving?: boolean;
  isGeneratingProposals?: boolean;
  isArchived?: boolean;
  onSavingChange?: (isSaving: boolean) => void;
  onGeneratingPDFChange?: (isGeneratingPDF: boolean) => void;
  onPDFBlobGenerated?: (blob: Blob) => void;
  onCommitStatusChange?: () => void;
  // Read-only mode & initial data for public viewers
  readOnly?: boolean;
  initialTimeline?: TimelineMilestone[];
  initialImageCategories?: ImageCategory[];
  initialPdfCustomization?: Partial<RFXSpecsData>;
  publicCrypto?: {
    // For public RFXs, use the unencrypted key-based crypto
    isLoading: boolean;
    isReady: boolean;
    error: string | null;
    isEncrypted: boolean;
    encrypt: (text: string) => Promise<string>;
    decrypt: (text: string) => Promise<string>;
    encryptFile: (buffer: ArrayBuffer) => Promise<{ iv: string, data: ArrayBuffer } | null>;
    decryptFile: (buffer: ArrayBuffer, iv: string) => Promise<ArrayBuffer | null>;
    key: CryptoKey | null;
  };
}

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

interface RelatedFileItem {
  path: string;
  name: string;
  originalName: string;
  size: number;
  createdAt: string | null;
  isEncrypted: boolean;
}

const extractInlineImageUrlsFromMarkdown = (markdown: string): string[] => {
  if (!markdown) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  const imageRegex = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const rawUrl = (match[1] || '').trim();
    if (!rawUrl || seen.has(rawUrl)) continue;
    seen.add(rawUrl);
    urls.push(rawUrl);
  }

  return urls;
};

// Componente para mostrar logos cifrados
const EncryptedLogoImage = ({ src, decryptFile, isEncrypted, alt = "Logo preview", className = "h-12 w-auto border rounded bg-white p-1" }: { 
  src: string, 
  decryptFile: ((encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>) | null, 
  isEncrypted: boolean,
  alt?: string,
  className?: string
}) => {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    // Track the last created blob URL to always revoke the correct one on unmount / change
    let createdObjectUrl: string | null = null;

    const load = async () => {
      // Si no es una imagen encriptada (no termina en .enc) o no hay función de descifrado, usar src directo
      if (!isEncrypted || !src.endsWith('.enc') || !decryptFile) {
        if (mounted) {
          setObjectUrl(src);
          setLoading(false);
        }
        return;
      }

      try {
        // Descargar el blob cifrado
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        const encryptedBuffer = await response.arrayBuffer();

        // Extraer IV (primeros 12 bytes) y Datos
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);

        // Convertir IV a base64
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);

        // Descifrar
        const decryptedBuffer = await decryptFile(dataBytes, ivBase64);
        
        if (mounted && decryptedBuffer) {
          // Detectar tipo MIME basado en extensión original
          const originalExt = src.split('/').pop()?.split('?')[0].replace('.enc', '').split('.').pop()?.toLowerCase() || 'jpg';
          let mimeType = 'image/jpeg';
          
          if (originalExt === 'png') mimeType = 'image/png';
          else if (originalExt === 'webp') mimeType = 'image/webp';
          else if (originalExt === 'gif') mimeType = 'image/gif';
          else if (originalExt === 'svg') mimeType = 'image/svg+xml';

          // Crear blob y URL
          const blob = new Blob([decryptedBuffer], { type: mimeType });
          const url = URL.createObjectURL(blob);
          createdObjectUrl = url;
          setObjectUrl(url);
          setLoading(false);
        }
      } catch (e) {
        console.error('🔐 [EncryptedLogoImage] Error decrypting logo:', e);
        // Fallback: intentar mostrar como imagen normal
        if (mounted) {
          setObjectUrl(src);
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
      const urlToRevoke = createdObjectUrl;
      if (urlToRevoke && urlToRevoke !== src && urlToRevoke.startsWith('blob:')) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [src, decryptFile, isEncrypted]);

  if (loading) {
    return (
      <div className={className + " flex items-center justify-center bg-gray-50"}>
        <div className="animate-pulse w-8 h-8 bg-gray-200 rounded-full"></div>
      </div>
    );
  }

  if (!objectUrl) {
    return null;
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      className={className}
      onError={(e) => {
        // Fallback en caso de error
        e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDMuNkM4LjEgMy42IDggOC4xIDggMjFIMjFWMy42WiIgZmlsbD0iIzNiODJmNiIgZmlsbC1vcGFjaXR5PSIwLjEiLz4KPHBhdGggZD0iTTIxIDMuNkM4LjEgMy42IDggOC4xIDggMjFIMjFWMy42WiIgc3Ryb2tlPSIjM2I4MmY2IiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+';
      }}
    />
  );
};

const RFXSpecs = forwardRef<RFXSpecsRef, RFXSpecsProps>(({
  rfxId,
  projectName = 'RFX Project',
  currentSpecs,
  onSpecsChange,
  pendingProposals = [],
  hiddenProposals = {
    description: new Set(),
    technical_specifications: new Set(),
    company_requirements: new Set()
  },
  onAcceptProposal,
  onRejectProposal,
  onShowProposal,
  onAllProposalsApplied,
  isAutoSaving = false,
  isGeneratingProposals = false,
  isArchived = false,
  onSavingChange,
  onGeneratingPDFChange,
  onPDFBlobGenerated,
  onCommitStatusChange,
  readOnly = false,
  initialTimeline,
  initialImageCategories,
  initialPdfCustomization,
  publicCrypto
}, ref) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  
  // Use private crypto by default, or public crypto for public RFXs
  const privateCrypto = useRFXCrypto(publicCrypto ? null : rfxId);
  const activeCrypto = publicCrypto || privateCrypto;
  const { encrypt, decrypt, encryptFile, decryptFile, isEncrypted, isLoading: isCryptoLoading, isReady: isCryptoReady } = activeCrypto;
  
  // Pass publicCrypto to PDF generator for public RFXs
  const { generatePDF, isGenerating } = useRFXSpecsPDFGenerator(rfxId, true, publicCrypto);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [description, setDescription] = useState(currentSpecs.description);
  const [technicalRequirements, setTechnicalRequirements] = useState(currentSpecs.technical_requirements);
  const [companyRequirements, setCompanyRequirements] = useState(currentSpecs.company_requirements);
  const [timeline, setTimeline] = useState<TimelineMilestone[]>([]);
  const [imageCategories, setImageCategories] = useState<ImageCategory[]>([]);
  const [pdfHeaderBgColor, setPdfHeaderBgColor] = useState<string>('#22183a');
  const [pdfHeaderTextColor, setPdfHeaderTextColor] = useState<string>('#FFFFFF');
  const [pdfSectionHeaderBgColor, setPdfSectionHeaderBgColor] = useState<string>('#f4a9aa');
  const [pdfSectionHeaderTextColor, setPdfSectionHeaderTextColor] = useState<string>('#FFFFFF');
  const [pdfLogoUrl, setPdfLogoUrl] = useState<string>('');
  const [pdfLogoBgColor, setPdfLogoBgColor] = useState<string>('#FFFFFF');
  const [pdfLogoBgEnabled, setPdfLogoBgEnabled] = useState<boolean>(false);
  const [pdfPagesLogoUrl, setPdfPagesLogoUrl] = useState<string>('');
  const [pdfPagesLogoBgColor, setPdfPagesLogoBgColor] = useState<string>('#FFFFFF');
  const [pdfPagesLogoBgEnabled, setPdfPagesLogoBgEnabled] = useState<boolean>(false);
  const [pdfPagesLogoUseHeader, setPdfPagesLogoUseHeader] = useState<boolean>(true);
  const [relatedFiles, setRelatedFiles] = useState<RelatedFileItem[]>([]);
  const [isLoadingRelatedFiles, setIsLoadingRelatedFiles] = useState(false);
  const [isUploadingRelatedFiles, setIsUploadingRelatedFiles] = useState(false);
  const [isRelatedFilesDragOver, setIsRelatedFilesDragOver] = useState(false);
  const [deletingRelatedPath, setDeletingRelatedPath] = useState<string | null>(null);
  const [downloadingRelatedPath, setDownloadingRelatedPath] = useState<string | null>(null);
  const [previewLoadingRelatedPath, setPreviewLoadingRelatedPath] = useState<string | null>(null);
  const [viewingRelatedFile, setViewingRelatedFile] = useState<{
    url: string;
    title: string;
    mimeType: string;
  } | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // Estado para controlar qué desplegables están expandidos
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  // Flag para controlar si ya se inicializó el estado de expansión
  const [hasInitializedExpansion, setHasInitializedExpansion] = useState(false);
  
  // Loading state for "{t('rfxs.specs_acceptAllInSection')}" buttons — key is `${proposalId}:${fieldName}`
  const [acceptingProposal, setAcceptingProposal] = useState<string | null>(null);

  // Estado para el diálogo de ayuda del agente
  const [showAgentHelperDialog, setShowAgentHelperDialog] = useState(false);
  const [helperDialogField, setHelperDialogField] = useState<string>('');
  
  // Estado para rastrear TODOs en cada sección
  const [todoCount, setTodoCount] = useState({
    description: 0,
    technical: 0,
    company: 0
  });
  
  // Estado para el TODO activo (para resaltado)
  const [activeTodoIndex, setActiveTodoIndex] = useState<number>(-1);
  
  // Notify parent of state changes
  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  useEffect(() => {
    onGeneratingPDFChange?.(isGenerating);
  }, [isGenerating, onGeneratingPDFChange]);
  
  // Función para contar TODOs en un texto
  const countTodosInText = (text: string): number => {
    if (!text) return 0;
    const matches = text.match(/TODO/g);
    return matches ? matches.length : 0;
  };
  
  // Calcular TODOs basándose en el estado actual del texto (independiente de acordeones)
  const calculateTodosFromState = () => {
    const descriptionTodos = countTodosInText(description);
    const technicalTodos = countTodosInText(technicalRequirements);
    const companyTodos = countTodosInText(companyRequirements);
    
    return {
      description: descriptionTodos,
      technical: technicalTodos,
      company: companyTodos
    };
  };
  
  // Calcular el total de TODOs desde el estado actual
  const totalTodos = calculateTodosFromState().description + 
                   calculateTodosFromState().technical + 
                   calculateTodosFromState().company;

  // Calcular el índice relativo para cada campo basado en el índice global
  const getActiveTodoIndexForField = (fieldName: 'description' | 'technical' | 'company'): number => {
    if (activeTodoIndex === -1) return -1;
    
    const todoCounts = calculateTodosFromState();
    let offset = 0;
    
    if (fieldName === 'description') {
      // Description: índices 0 a (count - 1)
      offset = 0;
    } else if (fieldName === 'technical') {
      // Technical: índices (description count) a (description count + technical count - 1)
      offset = todoCounts.description;
    } else if (fieldName === 'company') {
      // Company: índices (description count + technical count) a (total - 1)
      offset = todoCounts.description + todoCounts.technical;
    }
    
    // Calcular el índice relativo dentro del campo
    const relativeIndex = activeTodoIndex - offset;
    
    // Verificar si el índice global está dentro del rango de este campo
    const fieldTodoCount = todoCounts[fieldName];
    if (relativeIndex >= 0 && relativeIndex < fieldTodoCount) {
      return relativeIndex;
    }
    
    return -1; // El TODO activo no está en este campo
  };

  const MAX_RELATED_FILES = 15;
  const MAX_RELATED_FILE_SIZE_BYTES = 15 * 1024 * 1024;
  const relatedFilesFolder = `${rfxId}/related-files`;
  const DOCUMENT_IMAGES_CATEGORY = 'document images';

  const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

  const buildStoredRelatedFileName = (originalName: string, encrypted: boolean) => {
    const safeOriginalName = sanitizeFileName(originalName);
    const encodedOriginalName = encodeURIComponent(safeOriginalName);
    const baseName = `${Date.now()}__${encodedOriginalName}`;
    return encrypted ? `${baseName}.enc` : baseName;
  };

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

  const detectMimeTypeByExtension = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'doc') return 'application/msword';
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === 'xls') return 'application/vnd.ms-excel';
    if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === 'csv') return 'text/csv';
    if (ext === 'txt') return 'text/plain';
    if (ext === 'json') return 'application/json';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'zip') return 'application/zip';
    return 'application/octet-stream';
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const loadRelatedFiles = async () => {
    try {
      setIsLoadingRelatedFiles(true);
      const { data, error } = await supabase.storage
        .from('rfx-images')
        .list(relatedFilesFolder, {
          limit: 100,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;

      const mapped: RelatedFileItem[] = (data || [])
        .filter((file: any) => file?.name && !file.name.endsWith('/'))
        .map((file: any) => {
          const originalName = parseOriginalNameFromStoredFileName(file.name);
          const fileSize = Number(file?.metadata?.size || file?.size || 0);
          return {
            path: `${relatedFilesFolder}/${file.name}`,
            name: file.name,
            originalName,
            size: fileSize,
            createdAt: file?.created_at || null,
            isEncrypted: file.name.endsWith('.enc'),
          };
        });

      setRelatedFiles(mapped);
    } catch (error) {
      console.error('❌ [RFX Specs] Error loading related files:', error);
    } finally {
      setIsLoadingRelatedFiles(false);
    }
  };

  const handleUploadRelatedFiles = async (inputFiles: FileList | null) => {
    if (!inputFiles || inputFiles.length === 0) return;

    const files = Array.from(inputFiles);

    if (relatedFiles.length + files.length > MAX_RELATED_FILES) {
      toast({
        title: 'Too many files',
        description: `You can upload up to ${MAX_RELATED_FILES} related files in total.`,
        variant: 'destructive',
      });
      return;
    }

    const oversized = files.find((file) => file.size > MAX_RELATED_FILE_SIZE_BYTES);
    if (oversized) {
      toast({
        title: 'File too large',
        description: `${oversized.name} exceeds the 15MB limit.`,
        variant: 'destructive',
      });
      return;
    }

    if (!isEncrypted || !encryptFile) {
      toast({
        title: 'Encryption not ready',
        description: 'Secure upload is not ready yet. Please try again in a moment.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUploadingRelatedFiles(true);

      for (const file of files) {
        const fileBuffer = await file.arrayBuffer();
        const encrypted = await encryptFile(fileBuffer);

        if (!encrypted) {
          throw new Error(`Failed to encrypt ${file.name}`);
        }

        const ivBuffer = userCrypto.base64ToArrayBuffer(encrypted.iv);
        const combinedBuffer = new Uint8Array(ivBuffer.byteLength + encrypted.data.byteLength);
        combinedBuffer.set(new Uint8Array(ivBuffer), 0);
        combinedBuffer.set(new Uint8Array(encrypted.data), ivBuffer.byteLength);

        const storedName = buildStoredRelatedFileName(file.name, true);
        const fullPath = `${relatedFilesFolder}/${storedName}`;

        const { error } = await supabase.storage
          .from('rfx-images')
          .upload(fullPath, combinedBuffer.buffer, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'application/octet-stream',
          });

        if (error) throw error;
      }

      await loadRelatedFiles();
      onCommitStatusChange?.();
    } catch (error: any) {
      console.error('❌ [RFX Specs] Error uploading related files:', error);
      toast({
        title: 'Upload failed',
        description: error?.message || 'Could not upload related files',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingRelatedFiles(false);
    }
  };

  const handleDownloadRelatedFile = async (file: RelatedFileItem) => {
    try {
      setDownloadingRelatedPath(file.path);
      const { data, error } = await supabase.storage
        .from('rfx-images')
        .download(file.path);
      if (error) throw error;

      let blobToDownload: Blob = data;
      let fileNameToDownload = file.originalName;

      if (file.isEncrypted) {
        if (!decryptFile) {
          throw new Error('Decryption key not available');
        }

        const encryptedBuffer = await data.arrayBuffer();
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        const decrypted = await decryptFile(dataBytes, ivBase64);
        if (!decrypted) {
          throw new Error('Failed to decrypt file');
        }

        blobToDownload = new Blob([decrypted], {
          type: detectMimeTypeByExtension(file.originalName),
        });
      }

      const url = URL.createObjectURL(blobToDownload);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameToDownload;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('❌ [RFX Specs] Error downloading related file:', error);
      toast({
        title: 'Download failed',
        description: error?.message || 'Could not download file',
        variant: 'destructive',
      });
    } finally {
      setDownloadingRelatedPath(null);
    }
  };

  const handleDeleteRelatedFile = async (file: RelatedFileItem) => {
    try {
      setDeletingRelatedPath(file.path);
      const { error } = await supabase.storage
        .from('rfx-images')
        .remove([file.path]);
      if (error) throw error;

      await loadRelatedFiles();
      onCommitStatusChange?.();
    } catch (error: any) {
      console.error('❌ [RFX Specs] Error deleting related file:', error);
      toast({
        title: 'Delete failed',
        description: error?.message || 'Could not delete file',
        variant: 'destructive',
      });
    } finally {
      setDeletingRelatedPath(null);
    }
  };

  const handlePreviewRelatedFile = async (file: RelatedFileItem) => {
    try {
      setPreviewLoadingRelatedPath(file.path);
      const { data, error } = await supabase.storage
        .from('rfx-images')
        .download(file.path);
      if (error) throw error;

      const mimeType = detectMimeTypeByExtension(file.originalName);
      let blobForPreview: Blob = data;

      if (file.isEncrypted) {
        if (!decryptFile) {
          throw new Error('Decryption key not available');
        }
        const encryptedBuffer = await data.arrayBuffer();
        const ivBytes = encryptedBuffer.slice(0, 12);
        const dataBytes = encryptedBuffer.slice(12);
        const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
        const decrypted = await decryptFile(dataBytes, ivBase64);
        if (!decrypted) {
          throw new Error('Failed to decrypt file');
        }
        blobForPreview = new Blob([decrypted], { type: mimeType });
      } else if (!data.type && mimeType) {
        const raw = await data.arrayBuffer();
        blobForPreview = new Blob([raw], { type: mimeType });
      }

      const url = URL.createObjectURL(blobForPreview);
      setViewingRelatedFile({
        url,
        title: file.originalName,
        mimeType,
      });
    } catch (error: any) {
      console.error('❌ [RFX Specs] Error previewing related file:', error);
      toast({
        title: 'Preview failed',
        description: error?.message || 'Could not open file preview',
        variant: 'destructive',
      });
    } finally {
      setPreviewLoadingRelatedPath(null);
    }
  };

  const handleRelatedFilesDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsRelatedFilesDragOver(false);
    if (isArchived || readOnly || isUploadingRelatedFiles || relatedFiles.length >= MAX_RELATED_FILES) {
      return;
    }
    await handleUploadRelatedFiles(event.dataTransfer.files);
  };

  const handleInlineImageUploaded = (imageUrl: string) => {
    if (!imageUrl) return;
    setImageCategories((prev) => {
      const existingCategoryIndex = prev.findIndex(
        (category) => category.name.trim().toLowerCase() === DOCUMENT_IMAGES_CATEGORY
      );

      if (existingCategoryIndex >= 0) {
        const existingCategory = prev[existingCategoryIndex];
        if (existingCategory.images.includes(imageUrl)) {
          return prev;
        }
        const next = [...prev];
        next[existingCategoryIndex] = {
          ...existingCategory,
          images: [...existingCategory.images, imageUrl],
        };
        return next;
      }

      const newCategory: ImageCategory = {
        id: globalThis.crypto?.randomUUID?.() || `document-images-${Date.now()}`,
        name: DOCUMENT_IMAGES_CATEGORY,
        images: [imageUrl],
      };
      return [...prev, newCategory];
    });
  };

  useEffect(() => {
    const mergedInlineImages = [
      ...extractInlineImageUrlsFromMarkdown(description),
      ...extractInlineImageUrlsFromMarkdown(technicalRequirements),
      ...extractInlineImageUrlsFromMarkdown(companyRequirements),
    ];
    const uniqueInlineImages: string[] = [];
    const seen = new Set<string>();
    for (const url of mergedInlineImages) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      uniqueInlineImages.push(url);
    }

    setImageCategories((prev) => {
      const categoryIndex = prev.findIndex(
        (category) => category.name.trim().toLowerCase() === DOCUMENT_IMAGES_CATEGORY
      );

      if (categoryIndex === -1) {
        if (uniqueInlineImages.length === 0) return prev;
        return [
          ...prev,
          {
            id: globalThis.crypto?.randomUUID?.() || `document-images-${Date.now()}`,
            name: DOCUMENT_IMAGES_CATEGORY,
            images: uniqueInlineImages,
          },
        ];
      }

      const currentCategory = prev[categoryIndex];
      const currentImages = currentCategory.images || [];
      const hasSameImages =
        currentImages.length === uniqueInlineImages.length &&
        currentImages.every((img, idx) => img === uniqueInlineImages[idx]);

      if (hasSameImages) return prev;

      const next = [...prev];
      next[categoryIndex] = {
        ...currentCategory,
        images: uniqueInlineImages,
      };
      return next;
    });
  }, [description, technicalRequirements, companyRequirements]);

  // Sincronizar el estado de TODOs cuando cambien los textos
  useEffect(() => {
    const newTodoCount = calculateTodosFromState();
    setTodoCount(newTodoCount);
  }, [description, technicalRequirements, companyRequirements]);

  // Función para verificar si todos los campos principales están vacíos
  // Usa currentSpecs como fuente de verdad única (se sincroniza con estados locales)
  const areAllFieldsEmpty = () => {
    return (
      (!currentSpecs.description || currentSpecs.description.trim() === '') &&
      (!currentSpecs.technical_requirements || currentSpecs.technical_requirements.trim() === '') &&
      (!currentSpecs.company_requirements || currentSpecs.company_requirements.trim() === '')
    );
  };

  // Función para verificar si ya se mostró el diálogo para esta RFX
  const hasShownHelperDialog = () => {
    const storageKey = `rfx-helper-dialog-shown:${rfxId}`;
    return sessionStorage.getItem(storageKey) === 'true';
  };

  // Función para marcar que se mostró el diálogo para esta RFX
  const markHelperDialogAsShown = () => {
    const storageKey = `rfx-helper-dialog-shown:${rfxId}`;
    sessionStorage.setItem(storageKey, 'true');
  };

  // Función para manejar el clic en un campo de texto
  const handleFieldClick = (fieldName: string) => {
    // Solo mostrar el diálogo si todos los campos están vacíos Y no se ha mostrado antes
    if (areAllFieldsEmpty() && !hasShownHelperDialog()) {
      setHelperDialogField(fieldName);
      setShowAgentHelperDialog(true);
    }
  };

  // Función para manejar el cierre del diálogo
  const handleCloseHelperDialog = () => {
    markHelperDialogAsShown();
    setShowAgentHelperDialog(false);
  };

  useEffect(() => {
    if (readOnly) {
      // En modo solo lectura no necesitamos cargar ni escribir en BD
      setHasInitializedExpansion(false);
      return;
    }

    // Only fetch if crypto is ready
    if (isCryptoReady) {
      fetchSpecs();
      // Resetear el flag de inicialización cuando cambie el RFX
      setHasInitializedExpansion(false);
    }
  }, [rfxId, readOnly, isCryptoReady]);

  useEffect(() => {
    if (!rfxId) return;
    loadRelatedFiles();
  }, [rfxId]);

  // Sync local state with props when they change
  // Use individual values as dependencies instead of the whole object to avoid unnecessary re-syncs
  useEffect(() => {
    // Only update if values are actually different to avoid resetting editor content
    if (currentSpecs.description !== description) {
      setDescription(currentSpecs.description);
    }
    if (currentSpecs.technical_requirements !== technicalRequirements) {
      setTechnicalRequirements(currentSpecs.technical_requirements);
    }
    if (currentSpecs.company_requirements !== companyRequirements) {
      setCompanyRequirements(currentSpecs.company_requirements);
    }
  }, [currentSpecs.description, currentSpecs.technical_requirements, currentSpecs.company_requirements]);

  // Initialize state from initial* props in read-only mode (for public viewers)
  useEffect(() => {
    if (!readOnly) return;

    if (initialTimeline && initialTimeline.length > 0) {
      setTimeline(initialTimeline);
    }
    if (initialImageCategories) {
      setImageCategories(initialImageCategories);
    }
    if (initialPdfCustomization) {
      setPdfHeaderBgColor(initialPdfCustomization.pdf_header_bg_color || '#22183a');
      setPdfHeaderTextColor(initialPdfCustomization.pdf_header_text_color || '#FFFFFF');
      setPdfSectionHeaderBgColor(initialPdfCustomization.pdf_section_header_bg_color || '#f4a9aa');
      setPdfSectionHeaderTextColor(initialPdfCustomization.pdf_section_header_text_color || '#FFFFFF');
      setPdfLogoUrl(initialPdfCustomization.pdf_logo_url || '');
      setPdfLogoBgColor(initialPdfCustomization.pdf_logo_bg_color || '#FFFFFF');
      setPdfLogoBgEnabled(Boolean(initialPdfCustomization.pdf_logo_bg_enabled));
      setPdfPagesLogoUrl(initialPdfCustomization.pdf_pages_logo_url || '');
      setPdfPagesLogoBgColor(initialPdfCustomization.pdf_pages_logo_bg_color || '#FFFFFF');
      setPdfPagesLogoBgEnabled(Boolean(initialPdfCustomization.pdf_pages_logo_bg_enabled));
      setPdfPagesLogoUseHeader(initialPdfCustomization.pdf_pages_logo_use_header ?? true);
    }

    setIsInitialLoad(false);
    setLoading(false);
  }, [readOnly, initialTimeline, initialImageCategories, initialPdfCustomization]);

  // Auto-save timeline when it changes (after initial load)
  useEffect(() => {
    if (!isInitialLoad && !readOnly && timeline.length > 0) {
      if (!isEncrypted) return;
      
      const timeoutId = setTimeout(async () => {
        try {
          const [encryptedDesc, encryptedTech, encryptedComp] = await Promise.all([
            encrypt(description),
            encrypt(technicalRequirements),
            encrypt(companyRequirements)
          ]);

          const specsData: RFXSpecsData = {
            rfx_id: rfxId,
            description: encryptedDesc,
            technical_requirements: encryptedTech,
            company_requirements: encryptedComp,
            project_timeline: timeline,
            image_categories: imageCategories,
          };

          const { error } = await supabase
            .from('rfx_specs' as any)
            .upsert(specsData, { onConflict: 'rfx_id' });
          if (error) throw error;
          
          // Refresh commit status to detect uncommitted changes
          onCommitStatusChange?.();
        } catch (err: any) {
          console.error('❌ [RFX Specs] Error auto-saving timeline:', err);
        }
      }, 1000); // Debounce de 1 segundo

      return () => clearTimeout(timeoutId);
    }
  }, [timeline, isInitialLoad, onCommitStatusChange, isEncrypted]);

  // Auto-save image categories when they change (after initial load)
  useEffect(() => {
    if (!isInitialLoad && !readOnly && imageCategories.length >= 0) {
      if (!isEncrypted) return;

      const timeoutId = setTimeout(async () => {
        try {
          const [encryptedDesc, encryptedTech, encryptedComp] = await Promise.all([
            encrypt(description),
            encrypt(technicalRequirements),
            encrypt(companyRequirements)
          ]);

          const specsData: RFXSpecsData = {
            rfx_id: rfxId,
            description: encryptedDesc,
            technical_requirements: encryptedTech,
            company_requirements: encryptedComp,
            project_timeline: timeline,
            image_categories: imageCategories,
          };

          const { error } = await supabase
            .from('rfx_specs' as any)
            .upsert(specsData, { onConflict: 'rfx_id' });
          if (error) throw error;
          
          // Refresh commit status to detect uncommitted changes
          onCommitStatusChange?.();
        } catch (err: any) {
          console.error('❌ [RFX Specs] Error auto-saving image categories:', err);
        }
      }, 1000); // Debounce de 1 segundo

      return () => clearTimeout(timeoutId);
    }
  }, [imageCategories, isInitialLoad, onCommitStatusChange, isEncrypted]);

  // Auto-save PDF customization when any related field changes (after initial load)
  useEffect(() => {
    if (!isInitialLoad && !readOnly) {
      if (!isEncrypted) return;

      const timeoutId = setTimeout(async () => {
        try {
          const [encryptedDesc, encryptedTech, encryptedComp] = await Promise.all([
            encrypt(description),
            encrypt(technicalRequirements),
            encrypt(companyRequirements)
          ]);

          const specsData: RFXSpecsData = {
            rfx_id: rfxId,
            description: encryptedDesc,
            technical_requirements: encryptedTech,
            company_requirements: encryptedComp,
            project_timeline: timeline,
            image_categories: imageCategories,
            pdf_header_bg_color: pdfHeaderBgColor,
            pdf_header_text_color: pdfHeaderTextColor,
            pdf_section_header_bg_color: pdfSectionHeaderBgColor,
            pdf_section_header_text_color: pdfSectionHeaderTextColor,
            pdf_logo_url: pdfLogoUrl,
            pdf_logo_bg_color: pdfLogoBgColor,
            pdf_logo_bg_enabled: pdfLogoBgEnabled,
            pdf_pages_logo_url: pdfPagesLogoUrl,
            pdf_pages_logo_bg_color: pdfPagesLogoBgColor,
            pdf_pages_logo_bg_enabled: pdfPagesLogoBgEnabled,
            pdf_pages_logo_use_header: pdfPagesLogoUseHeader,
          };

          const { error } = await supabase
            .from('rfx_specs' as any)
            .upsert(specsData, { onConflict: 'rfx_id' });
          if (error) throw error;
          
          // Refresh commit status to detect uncommitted changes
          onCommitStatusChange?.();
        } catch (err: any) {
          console.error('❌ [RFX Specs] Error auto-saving PDF customization:', err);
        }
      }, 1000); // Debounce to avoid frequent writes while editing

      return () => clearTimeout(timeoutId);
    }
  }, [
    pdfHeaderBgColor,
    pdfHeaderTextColor,
    pdfSectionHeaderBgColor,
    pdfSectionHeaderTextColor,
    pdfLogoUrl,
    pdfLogoBgColor,
    pdfLogoBgEnabled,
    pdfPagesLogoUrl,
    pdfPagesLogoBgColor,
    pdfPagesLogoBgEnabled,
    pdfPagesLogoUseHeader,
    isInitialLoad,
    onCommitStatusChange,
    isEncrypted
  ]);

  // Función para determinar qué secciones deben estar expandidas por defecto
  const getDefaultExpandedSections = (): string[] => {
    const sections: string[] = [];
    
    // Solo expandir secciones que tienen contenido o propuestas pendientes
    if (description.trim() || getProposalsForField('description').length > 0) {
      sections.push('description');
    }
    if (technicalRequirements.trim() || getProposalsForField('technical_specifications').length > 0) {
      sections.push('technical');
    }
    if (companyRequirements.trim() || getProposalsForField('company_requirements').length > 0) {
      sections.push('company');
    }
    
    return sections;
  };

  // Inicializar secciones expandidas solo una vez al cargar la página
  useEffect(() => {
    if (!hasInitializedExpansion) {
      const defaultSections = getDefaultExpandedSections();
      setExpandedSections(defaultSections);
      setHasInitializedExpansion(true);
    }
  }, [hasInitializedExpansion, description, technicalRequirements, companyRequirements]);

  // Expandir automáticamente secciones cuando lleguen propuestas (solo si ya se inicializó)
  useEffect(() => {
    if (hasInitializedExpansion) {
      const sectionsWithProposals: string[] = [];
      
      if (getProposalsForField('description').length > 0) {
        sectionsWithProposals.push('description');
      }
      if (getProposalsForField('technical_specifications').length > 0) {
        sectionsWithProposals.push('technical');
      }
      if (getProposalsForField('company_requirements').length > 0) {
        sectionsWithProposals.push('company');
      }
      
      // Si hay propuestas, expandir las secciones correspondientes
      if (sectionsWithProposals.length > 0) {
        setExpandedSections(prev => {
          const newExpanded = [...new Set([...prev, ...sectionsWithProposals])];
          return newExpanded;
        });
      }
    }
  }, [pendingProposals, hasInitializedExpansion]);

  // Expandir automáticamente las tres secciones principales cuando se están generando propuestas Y todos los campos están vacíos
  useEffect(() => {
    const allEmpty = (
      (!currentSpecs.description || currentSpecs.description.trim() === '') &&
      (!currentSpecs.technical_requirements || currentSpecs.technical_requirements.trim() === '') &&
      (!currentSpecs.company_requirements || currentSpecs.company_requirements.trim() === '')
    );
    
    if (isGeneratingProposals && allEmpty && hasInitializedExpansion) {
      setExpandedSections(prev => {
        const mainSections = ['description', 'technical', 'company'];
        const newExpanded = [...new Set([...prev, ...mainSections])];
        return newExpanded;
      });
    }
  }, [isGeneratingProposals, currentSpecs, hasInitializedExpansion]);

  // Helper: check if a proposal affects a given field
  const proposalAffectsField = (proposal: ProposalSuggestion, fieldPath: string): boolean => {
    const diffKey = `/${fieldPath}`;
    if (proposal.diffs && diffKey in proposal.diffs) return true;
    if (proposal.impactedPaths?.some(p => p.includes(fieldPath))) return true;
    // Legacy fallback
    if (proposal.patch?.some((op: any) => op.path?.includes(fieldPath))) return true;
    return false;
  };

  // Filter proposals by field (excluding hidden ones)
  const getProposalsForField = (fieldPath: string): ProposalSuggestion[] => {
    return pendingProposals.filter(proposal => {
      if (!proposalAffectsField(proposal, fieldPath)) return false;
      if (hiddenProposals[fieldPath]?.has(proposal.id)) return false;
      return true;
    });
  };

  // Get hidden proposals for a field
  const getHiddenProposalsForField = (fieldPath: string): ProposalSuggestion[] => {
    return pendingProposals.filter(proposal => {
      if (!proposalAffectsField(proposal, fieldPath)) return false;
      return hiddenProposals[fieldPath]?.has(proposal.id) ?? false;
    });
  };

  // Get the diff string for a field from a proposal
  const getDiffForField = (proposal: ProposalSuggestion, fieldName: string): string | null => {
    const key = `/${fieldName}`;
    if (proposal.diffs && key in proposal.diffs) {
      return proposal.diffs[key];
    }
    return null;
  };

  // Get all hunks for a field across all visible proposals
  const getHunksForField = (fieldName: string): Hunk[] => {
    const proposals = getProposalsForField(fieldName);
    const hunks: Hunk[] = [];
    for (const p of proposals) {
      const diff = getDiffForField(p, fieldName);
      if (diff) {
        hunks.push(...parseUnifiedDiff(diff));
      }
    }
    return hunks;
  };

  // Check if a field has any pending diff changes
  const fieldHasDiffChanges = (fieldName: string): boolean => {
    const proposals = getProposalsForField(fieldName);
    return proposals.some(p => {
      const diff = getDiffForField(p, fieldName);
      return diff ? diffHasChanges(diff) : false;
    });
  };

  // Calculate proposed text for a field by applying all diffs
  const getProposedTextForField = (fieldName: string, currentValue: string): string => {
    const fieldProposals = getProposalsForField(fieldName);
    if (fieldProposals.length === 0) return currentValue;

    let result = currentValue;
    for (const proposal of fieldProposals) {
      const diff = getDiffForField(proposal, fieldName);
      if (diff) {
        result = applyUnifiedDiff(result, diff);
      }
    }
    return result;
  };


  const handleNavigateToProposal = (index: number) => {
    const proposal = pendingProposals[index];
    if (!proposal) {
      return;
    }

    // Determine which field this proposal affects and expand that section
    let sectionToExpand = '';
    if (proposalAffectsField(proposal, 'description')) {
      sectionToExpand = 'description';
    } else if (proposalAffectsField(proposal, 'technical_specifications')) {
      sectionToExpand = 'technical';
    } else if (proposalAffectsField(proposal, 'company_requirements')) {
      sectionToExpand = 'company';
    }

    if (sectionToExpand) {
      setExpandedSections(prev => {
        if (!prev.includes(sectionToExpand)) {
          const newSections = [...prev, sectionToExpand];
          return newSections;
        }
        return prev;
      });

      // Scroll to the section after a short delay to allow for expansion
      setTimeout(() => {
        const sectionElement = document.querySelector(`[data-section="${sectionToExpand}"]`);
        if (sectionElement) {
          sectionElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
        } else {
          // Try alternative selectors
          const accordionTrigger = document.querySelector(`[data-accordion-trigger="${sectionToExpand}"]`);
          if (accordionTrigger) {
            accordionTrigger.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'start' 
            });
          }
        }
      }, 100);
    }
  };

  const fetchSpecs = async () => {
    try {
      setLoading(true);
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
        const [desc, tech, comp] = await Promise.all([
          decrypt((data as any).description || ''),
          decrypt((data as any).technical_requirements || ''),
          decrypt((data as any).company_requirements || '')
        ]);

        setDescription(desc);
        setTechnicalRequirements(tech);
        setCompanyRequirements(comp);
        setTimeline(((data as any).project_timeline as TimelineMilestone[]) || []);
        setImageCategories(((data as any).image_categories as ImageCategory[]) || []);
        setPdfHeaderBgColor((data as any).pdf_header_bg_color || '#22183a');
        setPdfHeaderTextColor((data as any).pdf_header_text_color || '#FFFFFF');
        setPdfSectionHeaderBgColor((data as any).pdf_section_header_bg_color || '#f4a9aa');
        setPdfSectionHeaderTextColor((data as any).pdf_section_header_text_color || '#FFFFFF');
        setPdfLogoUrl((data as any).pdf_logo_url || '');
        setPdfLogoBgColor((data as any).pdf_logo_bg_color || '#FFFFFF');
        setPdfLogoBgEnabled(Boolean((data as any).pdf_logo_bg_enabled));
        setPdfPagesLogoUrl((data as any).pdf_pages_logo_url || '');
        setPdfPagesLogoBgColor((data as any).pdf_pages_logo_bg_color || '#FFFFFF');
        setPdfPagesLogoBgEnabled(Boolean((data as any).pdf_pages_logo_bg_enabled));
        setPdfPagesLogoUseHeader((data as any).pdf_pages_logo_use_header ?? true);
      }
      // Mark initial load as complete after a short delay
      setTimeout(() => setIsInitialLoad(false), 500);
    } catch (err: any) {
      console.error('❌ [RFX Specs] Error fetching specs:', err);
      toast({
        title: 'Error',
        description: 'Failed to load specifications',
        variant: 'destructive',
      });
      setIsInitialLoad(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Security check: Ensure encryption is available
      if (!isEncrypted) {
        throw new Error('Cannot save: Encryption key not available');
      }

      const [encryptedDesc, encryptedTech, encryptedComp] = await Promise.all([
        encrypt(description),
        encrypt(technicalRequirements),
        encrypt(companyRequirements)
      ]);

      const specsData: RFXSpecsData = {
        rfx_id: rfxId,
        description: encryptedDesc,
        technical_requirements: encryptedTech,
        company_requirements: encryptedComp,
        project_timeline: timeline,
        image_categories: imageCategories,
        pdf_header_bg_color: pdfHeaderBgColor,
        pdf_header_text_color: pdfHeaderTextColor,
        pdf_section_header_bg_color: pdfSectionHeaderBgColor,
        pdf_section_header_text_color: pdfSectionHeaderTextColor,
        pdf_logo_url: pdfLogoUrl,
        pdf_logo_bg_color: pdfLogoBgColor,
        pdf_logo_bg_enabled: pdfLogoBgEnabled,
        pdf_pages_logo_url: pdfPagesLogoUrl,
        pdf_pages_logo_bg_color: pdfPagesLogoBgColor,
        pdf_pages_logo_bg_enabled: pdfPagesLogoBgEnabled,
        pdf_pages_logo_use_header: pdfPagesLogoUseHeader,
      };

      const { error } = await supabase
        .from('rfx_specs' as any)
        .upsert(specsData, { onConflict: 'rfx_id' });
      if (error) throw error;
    } catch (err: any) {
      console.error('❌ [RFX Specs] Error saving specs:', err);
      toast({
        title: 'Error',
        description: err.message === 'Cannot save: Encryption key not available'
          ? 'Cannot save securely: Encryption key missing'
          : (err.message || 'Failed to save specifications'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    const result = await generatePDF(rfxId, projectName, true); // Pass true to return blob
    if (result instanceof Blob && onPDFBlobGenerated) {
      onPDFBlobGenerated(result);
    }
  };

  const expandSection = (section: 'images' | 'pdf') => {
    const sectionValue = section === 'images' ? 'images' : 'pdf';
    setExpandedSections(prev => {
      if (!prev.includes(sectionValue)) {
        return [...prev, sectionValue];
      }
      return prev;
    });
  };

  // Expose handleSave and handleDownloadPDF via ref
  useImperativeHandle(ref, () => ({
    handleSave,
    handleDownloadPDF,
    isSaving: saving,
    isGeneratingPDF: isGenerating,
    expandSection,
    getImageCategories: () => imageCategories,
    getPdfCustomization: () => ({
      pdf_header_bg_color: pdfHeaderBgColor,
      pdf_header_text_color: pdfHeaderTextColor,
      pdf_section_header_bg_color: pdfSectionHeaderBgColor,
      pdf_section_header_text_color: pdfSectionHeaderTextColor,
      pdf_logo_url: pdfLogoUrl,
      pdf_logo_bg_color: pdfLogoBgColor,
      pdf_logo_bg_enabled: pdfLogoBgEnabled,
      pdf_pages_logo_url: pdfPagesLogoUrl,
      pdf_pages_logo_bg_color: pdfPagesLogoBgColor,
      pdf_pages_logo_bg_enabled: pdfPagesLogoBgEnabled,
      pdf_pages_logo_use_header: pdfPagesLogoUseHeader,
    }),
  }));

  // Listen for onboarding event to collapse main specification sections
  useEffect(() => {
    const handleOnboardingCollapse = () => {
      setExpandedSections(prev =>
        prev.filter(section => !['description', 'technical', 'company'].includes(section))
      );
    };

    window.addEventListener('onboarding-collapse-main-specs', handleOnboardingCollapse as EventListener);
    return () => {
      window.removeEventListener('onboarding-collapse-main-specs', handleOnboardingCollapse as EventListener);
    };
  }, []);

  // Render pending proposals for a field
  const renderPendingProposals = (fieldName: string, fieldLabel: string, currentValue: string) => {
    const proposals = getProposalsForField(fieldName);
    const hiddenProps = getHiddenProposalsForField(fieldName);
    
    if (proposals.length === 0 && hiddenProps.length === 0) return null;

    const hasChanges = fieldHasDiffChanges(fieldName);
    const hunks = getHunksForField(fieldName);

    // Read rejected/accepted hunk indices from localStorage (cross-session persistence)
    const rejectedStorageKey = `rfx-hunk-rejects:${rfxId}:${fieldName}`;
    const acceptedStorageKey = `rfx-hunk-accepts:${rfxId}:${fieldName}`;
    const rejectedRaw = typeof window !== 'undefined' ? localStorage.getItem(rejectedStorageKey) : null;
    const acceptedRaw = typeof window !== 'undefined' ? localStorage.getItem(acceptedStorageKey) : null;
    const rejectedHunks = rejectedRaw ? new Set<number>(JSON.parse(rejectedRaw)) : new Set<number>();
    const acceptedHunks = acceptedRaw ? new Set<number>(JSON.parse(acceptedRaw)) : new Set<number>();
    // Union of both — used to determine when ALL hunks have been handled
    const handledHunks = new Set<number>([...rejectedHunks, ...acceptedHunks]);

    return (
      <div className="mb-4 space-y-2">
        {proposals.length > 0 && hasChanges && hunks.length > 0 && (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-blue-900">Pending changes ({proposals.length})</p>
                    <p className="text-sm text-blue-700 mt-1">
                      Review the proposed changes below
                    </p>
                  </div>
                </div>

                {/* Hunk-level review */}
                <HunkDiffList
                    hunks={hunks}
                    rejectedHunks={handledHunks}
                    onAcceptHunk={(hunkIndex) => {
                      const hunk = hunks[hunkIndex];
                      if (!hunk) return;
                      const lines = (currentValue || '').split('\n');
                      const result = applyHunk(lines, hunk);
                      if (!result.ok) return;
                      const updated = result.lines.join('\n');

                      if (fieldName === 'description') {
                        setDescription(updated);
                        onSpecsChange({
                          description: updated,
                          technical_requirements: technicalRequirements,
                          company_requirements: companyRequirements,
                        });
                      } else if (fieldName === 'technical_specifications') {
                        setTechnicalRequirements(updated);
                        onSpecsChange({
                          description,
                          technical_requirements: updated,
                          company_requirements: companyRequirements,
                        });
                      } else if (fieldName === 'company_requirements') {
                        setCompanyRequirements(updated);
                        onSpecsChange({
                          description,
                          technical_requirements: technicalRequirements,
                          company_requirements: updated,
                        });
                      }

                      // Track accepted hunk so the card hides it immediately
                      const newAccepted = new Set(acceptedHunks);
                      newAccepted.add(hunkIndex);
                      localStorage.setItem(acceptedStorageKey, JSON.stringify(Array.from(newAccepted)));

                      // Check if all hunks are now accepted or rejected
                      const newHandled = new Set([...rejectedHunks, ...newAccepted]);
                      const allHandled = hunks.every((_, i) => newHandled.has(i));
                      if (allHandled) {
                        onAllProposalsApplied?.(fieldName);
                      } else {
                        // Force re-render to hide the just-accepted hunk
                        setDescription(prev => prev);
                      }
                    }}
                    onRejectHunk={(hunkIndex) => {
                      const newRejected = new Set(rejectedHunks);
                      newRejected.add(hunkIndex);
                      localStorage.setItem(
                        rejectedStorageKey,
                        JSON.stringify(Array.from(newRejected)),
                      );
                      // If ALL hunks are now handled (rejected or previously accepted),
                      // send a rejection ACK for each proposal.
                      const newHandled = new Set([...newRejected, ...acceptedHunks]);
                      if (hunks.every((_, i) => newHandled.has(i))) {
                        proposals.forEach(p => onRejectProposal?.(p.id, fieldName));
                      }
                      // Force re-render
                      setDescription(prev => prev);
                    }}
                  />

                {/* Individual proposals with rationale */}
                <div className="space-y-2">
                  {proposals.map(proposal => (
                    <div key={proposal.id} className="bg-white rounded-md p-3 border border-blue-200">
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{proposal.title}</p>
                          {proposal.rationale && (
                            <p className="text-xs text-gray-600 mt-1">{proposal.rationale}</p>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={acceptingProposal === `${proposal.id}:${fieldName}`}
                            onClick={async () => {
                              const key = `${proposal.id}:${fieldName}`;
                              setAcceptingProposal(key);
                              try {
                                await onAcceptProposal?.(proposal.id, fieldName);
                              } finally {
                                setAcceptingProposal(null);
                              }
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {acceptingProposal === `${proposal.id}:${fieldName}` ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3 mr-1" />
                            )}
                            {t('rfxs.specs_acceptAllInSection')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acceptingProposal === `${proposal.id}:${fieldName}`}
                            onClick={() => onRejectProposal?.(proposal.id, fieldName)}
                            className="border-red-300 text-red-600 hover:bg-red-50"
                          >
                            <X className="h-3 w-3 mr-1" />
                            {t('rfxs.specs_hide')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Show hidden proposals button */}
        {hiddenProps.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              hiddenProps.forEach(proposal => {
                onShowProposal?.(proposal.id, fieldName);
              });
            }}
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <Eye className="h-3 w-3 mr-2" />
            {t('rfxs.specs_showHiddenProposals', { count: hiddenProps.length })}
          </Button>
        )}
      </div>
    );
  };

  // Show loading if fetching specs or if crypto is not ready
  if (loading || !isCryptoReady) {
    const isDecrypting = !isCryptoReady && rfxId;
    return (
      <div className="flex flex-col justify-center items-center py-12 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#22183a]"></div>
        {isDecrypting && (
          <p className="text-sm text-gray-600 font-medium">Decrypting RFX info...</p>
        )}
      </div>
    );
  }

  const descriptionProposals = getProposalsForField('description');
  const technicalProposals = getProposalsForField('technical_specifications');
  const companyProposals = getProposalsForField('company_requirements');

  // Solo mostrar skeleton si está generando Y todos los campos están vacíos
  const shouldShowSkeleton = isGeneratingProposals && areAllFieldsEmpty();

  // Componente de skeleton loader para simular que se está generando texto
  const GeneratingTextSkeleton = () => (
    <div className="border border-gray-200 rounded-md bg-white shadow-sm">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#f4a9aa]"></div>
          <span className="text-sm text-black font-medium">Generating content...</span>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[85%]" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[78%]" />
        <Skeleton className="h-4 w-[88%]" />
        <Skeleton className="h-4 w-[95%]" />
        <Skeleton className="h-4 w-[82%]" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Accordion 
        type="multiple" 
        className="w-full space-y-4" 
        value={expandedSections}
        onValueChange={setExpandedSections}
      >
        <AccordionItem value="description" data-section="description" className="border border-gray-200 rounded-xl shadow-sm bg-white">
          <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl" data-onboarding-target="rfx-specs-fields">
            <div className="text-left flex items-center justify-between w-full pr-4">
              <div>
                <h3 className="font-semibold text-black">📋 {t('rfxs.specs_projectDescription')}</h3>
                <p className="text-sm text-gray-500">{t('rfxs.specs_projectDescriptionSub')}</p>
              </div>
              {descriptionProposals.length > 0 && (
                <div className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs font-medium">{descriptionProposals.length} {descriptionProposals.length === 1 ? t('rfxs.specs_pending') : t('rfxs.specs_pending_other')}</span>
                </div>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {shouldShowSkeleton ? (
              <GeneratingTextSkeleton />
            ) : (
              <>
                {renderPendingProposals('description', t('rfxs.specs_projectDescription'), description)}
                <MarkdownEditor
                  placeholder={t('rfxs.specs_descriptionPlaceholder')}
                  value={description}
                  onChange={(newValue) => {
                    // Durante la carga inicial (incluido restore de versiones) ignoramos onChange del editor
                    if (isInitialLoad) {
                      return;
                    }
                    setDescription(newValue);
                    onSpecsChange({
                      description: newValue,
                      technical_requirements: technicalRequirements,
                      company_requirements: companyRequirements
                    });
                  }}
                  onTodoCountChange={(count) => {
                    setTodoCount(prev => ({ ...prev, description: count }));
                  }}
                  onFocus={() => handleFieldClick('description')}
                  minRows={4}
                  activeTodoIndex={getActiveTodoIndexForField('description')}
                  todoOffset={0}
                  disabled={isArchived || readOnly}
                  imageUploadConfig={{
                    enabled: !(isArchived || readOnly),
                    rfxId,
                    isEncrypted,
                    encryptFile: encryptFile || undefined,
                    decryptFile: decryptFile || undefined,
                  }}
                  onInlineImageUploaded={handleInlineImageUploaded}
                />
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="technical" data-section="technical" className="border border-gray-200 rounded-xl shadow-sm bg-white">
          <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
            <div className="text-left flex items-center justify-between w-full pr-4">
              <div>
                <h3 className="font-semibold text-black">⚙️ {t('rfxs.specs_technicalSpecs')}</h3>
                <p className="text-sm text-gray-500">{t('rfxs.specs_technicalSpecsSub')}</p>
              </div>
              {technicalProposals.length > 0 && (
                <div className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs font-medium">{technicalProposals.length} {technicalProposals.length === 1 ? t('rfxs.specs_pending') : t('rfxs.specs_pending_other')}</span>
                </div>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {shouldShowSkeleton ? (
              <GeneratingTextSkeleton />
            ) : (
              <>
                {renderPendingProposals('technical_specifications', t('rfxs.specs_technicalSpecs'), technicalRequirements)}
                <div className="space-y-2">
                  <Label htmlFor="technical-requirements" className="text-sm font-medium">{t('rfxs.specs_detailedTechnicalLabel')}</Label>
                  <MarkdownEditor
                    placeholder={t('rfxs.specs_technicalPlaceholder')}
                    value={technicalRequirements}
                    onChange={(newValue) => {
                      if (isInitialLoad) {
                        return;
                      }
                      setTechnicalRequirements(newValue);
                      onSpecsChange({
                        description: description,
                        technical_requirements: newValue,
                        company_requirements: companyRequirements
                      });
                    }}
                    onTodoCountChange={(count) => {
                      setTodoCount(prev => ({ ...prev, technical: count }));
                    }}
                    onFocus={() => handleFieldClick('technical_specifications')}
                    minRows={6}
                    activeTodoIndex={getActiveTodoIndexForField('technical')}
                    todoOffset={calculateTodosFromState().description}
                    disabled={isArchived || readOnly}
                    imageUploadConfig={{
                      enabled: !(isArchived || readOnly),
                      rfxId,
                      isEncrypted,
                      encryptFile: encryptFile || undefined,
                      decryptFile: decryptFile || undefined,
                    }}
                    onInlineImageUploaded={handleInlineImageUploaded}
                  />
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="company" data-section="company" className="border border-gray-200 rounded-xl shadow-sm bg-white">
          <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
            <div className="text-left flex items-center justify-between w-full pr-4">
              <div>
                <h3 className="font-semibold text-black">🏢 {t('rfxs.specs_companyRequirements')}</h3>
                <p className="text-sm text-gray-500">{t('rfxs.specs_companyRequirementsSub')}</p>
              </div>
              {companyProposals.length > 0 && (
                <div className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs font-medium">{companyProposals.length} {companyProposals.length === 1 ? t('rfxs.specs_pending') : t('rfxs.specs_pending_other')}</span>
                </div>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {shouldShowSkeleton ? (
              <GeneratingTextSkeleton />
            ) : (
              <>
                {renderPendingProposals('company_requirements', t('rfxs.specs_companyRequirements'), companyRequirements)}
                <div className="space-y-2">
                  <Label htmlFor="company-requirements" className="text-sm font-medium">{t('rfxs.specs_companyQualificationsLabel')}</Label>
                  <MarkdownEditor
                    placeholder={t('rfxs.specs_companyPlaceholder')}
                    value={companyRequirements}
                    onChange={(newValue) => {
                      if (isInitialLoad) {
                        return;
                      }
                      setCompanyRequirements(newValue);
                      onSpecsChange({
                        description: description,
                        technical_requirements: technicalRequirements,
                        company_requirements: newValue
                      });
                    }}
                    onTodoCountChange={(count) => {
                      setTodoCount(prev => ({ ...prev, company: count }));
                    }}
                    onFocus={() => handleFieldClick('company_requirements')}
                    minRows={6}
                    activeTodoIndex={getActiveTodoIndexForField('company')}
                    todoOffset={calculateTodosFromState().description + calculateTodosFromState().technical}
                    disabled={isArchived || readOnly}
                    imageUploadConfig={{
                      enabled: !(isArchived || readOnly),
                      rfxId,
                      isEncrypted,
                      encryptFile: encryptFile || undefined,
                      decryptFile: decryptFile || undefined,
                    }}
                    onInlineImageUploaded={handleInlineImageUploaded}
                  />
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="related-files" data-section="related-files" className="border border-gray-200 rounded-xl shadow-sm bg-white">
          <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
            <div className="text-left flex items-center justify-between w-full pr-4">
              <div>
                <h3 className="font-semibold text-black">📎 {t('rfxs.specs_relatedFiles')}</h3>
                <p className="text-sm text-gray-500">
                  {t('rfxs.specs_relatedFilesSub', { max: MAX_RELATED_FILES })}
                </p>
              </div>
              <div className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                {relatedFiles.length}/{MAX_RELATED_FILES}
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  (isArchived || readOnly)
                    ? 'border-muted-foreground/10 bg-muted/5 opacity-50 cursor-not-allowed'
                    : isRelatedFilesDragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
                onDragOver={(isArchived || readOnly) ? undefined : (event) => {
                  event.preventDefault();
                  setIsRelatedFilesDragOver(true);
                }}
                onDragLeave={(isArchived || readOnly) ? undefined : () => setIsRelatedFilesDragOver(false)}
                onDrop={(isArchived || readOnly) ? undefined : handleRelatedFilesDrop}
              >
                <ImageIcon className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  {t('rfxs.specs_dragOrClick')}
                </p>
                <input
                  id="related-files-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    handleUploadRelatedFiles(event.target.files);
                    event.target.value = '';
                  }}
                  disabled={isArchived || readOnly || isUploadingRelatedFiles || relatedFiles.length >= MAX_RELATED_FILES}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('related-files-input')?.click()}
                  disabled={isArchived || readOnly || isUploadingRelatedFiles || relatedFiles.length >= MAX_RELATED_FILES}
                >
                  {isUploadingRelatedFiles ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('rfxs.specs_uploading')}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {t('rfxs.specs_selectFiles')}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('rfxs.specs_maxFilesHint', { max: MAX_RELATED_FILES })}
                </p>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-green-600" />
                {t('rfxs.specs_encryptedFiles')}
              </div>

              {isLoadingRelatedFiles ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('rfxs.specs_loadingRelatedFiles')}
                </div>
              ) : relatedFiles.length === 0 ? (
                <div className="text-sm text-gray-500 border border-dashed rounded-lg p-4">
                  {t('rfxs.specs_noRelatedFiles')}
                </div>
              ) : (
                <div className="space-y-2">
                  {relatedFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[#22183a] shrink-0" />
                          <p className="text-sm font-medium text-gray-900 truncate">{file.originalName}</p>
                          {file.isEncrypted && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 shrink-0">
                              E2E
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatBytes(file.size)}
                          {file.createdAt ? ` • ${new Date(file.createdAt).toLocaleDateString()}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePreviewRelatedFile(file)}
                          disabled={previewLoadingRelatedPath === file.path}
                          className="h-8 w-8 p-0"
                        >
                          {previewLoadingRelatedPath === file.path ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadRelatedFile(file)}
                          disabled={downloadingRelatedPath === file.path}
                          className="h-8 w-8 p-0"
                        >
                          {downloadingRelatedPath === file.path ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteRelatedFile(file)}
                          disabled={isArchived || readOnly || deletingRelatedPath === file.path}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                          {deletingRelatedPath === file.path ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="timeline" className="border border-gray-200 rounded-xl shadow-sm bg-white">
          <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
            <div className="text-left flex items-center justify-between w-full pr-4">
              <div>
                <h3 className="font-semibold text-black">🗓️ {t('rfxs.specs_projectTimeline')}</h3>
                <p className="text-sm text-gray-500">{t('rfxs.specs_projectTimelineSub')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
              <ProjectTimelineEditor
                milestones={timeline}
                onChange={setTimeline}
                readOnly={isArchived || readOnly}
              />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="images" data-section="images" className="border border-gray-200 rounded-xl shadow-sm bg-white">
          <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
            <div className="text-left flex items-center justify-between w-full pr-4">
              <div>
                <h3 className="font-semibold text-black">🖼️ {t('rfxs.specs_images')}</h3>
                <p className="text-sm text-gray-500">{t('rfxs.specs_imagesSub')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <RFXImagesCard
              categories={imageCategories}
              onChange={setImageCategories}
              rfxId={rfxId}
              disabled={isArchived || readOnly}
              lockedCategoryNames={[DOCUMENT_IMAGES_CATEGORY]}
              publicCrypto={publicCrypto}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="pdf" data-section="pdf" className="border border-gray-200 rounded-xl shadow-sm bg-white">
          <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 hover:no-underline rounded-t-xl">
            <div className="text-left flex items-center justify-between w-full pr-4">
              <div>
                <h3 className="font-semibold text-black">🧩 {t('rfxs.specs_pdfCustomizationSection')}</h3>
                <p className="text-sm text-gray-500">{t('rfxs.specs_pdfSub')}</p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${(isArchived || readOnly) ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="space-y-3">
                <Label>Header background color</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={pdfHeaderBgColor} onChange={(e) => setPdfHeaderBgColor(e.target.value)} className="h-9 w-12 rounded border" />
                  <Input value={pdfHeaderBgColor} onChange={(e) => setPdfHeaderBgColor(e.target.value)} />
                </div>
              </div>
              <div className="space-y-3">
                <Label>Header text color</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={pdfHeaderTextColor} onChange={(e) => setPdfHeaderTextColor(e.target.value)} className="h-9 w-12 rounded border" />
                  <Input value={pdfHeaderTextColor} onChange={(e) => setPdfHeaderTextColor(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Section title background color</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={pdfSectionHeaderBgColor} onChange={(e) => setPdfSectionHeaderBgColor(e.target.value)} className="h-9 w-12 rounded border" />
                  <Input value={pdfSectionHeaderBgColor} onChange={(e) => setPdfSectionHeaderBgColor(e.target.value)} />
                </div>
              </div>
              <div className="space-y-3">
                <Label>Section title text color</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={pdfSectionHeaderTextColor} onChange={(e) => setPdfSectionHeaderTextColor(e.target.value)} className="h-9 w-12 rounded border" />
                  <Input value={pdfSectionHeaderTextColor} onChange={(e) => setPdfSectionHeaderTextColor(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3 md:col-span-2">
                <Label>First page header logo</Label>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = async () => {
                            const file = input.files?.[0];
                            if (!file) return;
                            
                            try {
                              const fileExt = file.name.split('.').pop();
                              const fileName = `logo_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
                              
                              let fileToUpload: File | ArrayBuffer = file;
                              let finalFileName = fileName;
                              let uploadOptions: any = {
                                cacheControl: '3600',
                                upsert: false
                              };

                              // Encrypt file if encryption is enabled and key is available
                              if (isEncrypted && encryptFile) {
                                const arrayBuffer = await file.arrayBuffer();
                                const encrypted = await encryptFile(arrayBuffer);
                                
                                if (!encrypted) {
                                  throw new Error("Failed to encrypt logo");
                                }

                                // Prepend IV (12 bytes) to the encrypted data
                                const ivBytes = userCrypto.base64ToArrayBuffer(encrypted.iv);
                                const dataBytes = new Uint8Array(encrypted.data as ArrayBuffer);
                                
                                const combined = new Uint8Array(ivBytes.byteLength + dataBytes.byteLength);
                                combined.set(new Uint8Array(ivBytes), 0);
                                combined.set(dataBytes, ivBytes.byteLength);
                                
                                fileToUpload = combined.buffer;
                                finalFileName = `${fileName}.enc`;
                                uploadOptions.contentType = 'application/octet-stream';
                              }
                              
                              const path = `${rfxId || 'temp'}/pdf/logo/${finalFileName}`;
                              const { error } = await supabase.storage
                                .from('rfx-images')
                                .upload(path, fileToUpload, uploadOptions);
                              if (error) throw error;
                              
                              const { data: { publicUrl } } = supabase.storage
                                .from('rfx-images')
                                .getPublicUrl(path);
                              setPdfLogoUrl(publicUrl);
                            } catch (e: any) {
                              console.error('Error uploading logo:', e);
                              throw e;
                            }
                          };
                          input.click();
                        } catch (e: any) {
                          toast({ title: 'Upload error', description: e.message || 'Failed to upload logo', variant: 'destructive' });
                        }
                      }}
                    >Upload Logo</Button>
                    {pdfLogoUrl && <a href={pdfLogoUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">Open</a>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={pdfLogoBgEnabled} onCheckedChange={(v) => setPdfLogoBgEnabled(Boolean(v))} />
                    <span className="text-sm text-gray-700">Use logo background color</span>
                    <input type="color" value={pdfLogoBgColor} onChange={(e) => setPdfLogoBgColor(e.target.value)} className={`h-9 w-12 rounded border ${pdfLogoBgEnabled ? '' : 'opacity-50'}`} disabled={!pdfLogoBgEnabled} />
                    <Input value={pdfLogoBgColor} onChange={(e) => setPdfLogoBgColor(e.target.value)} className={`max-w-[140px] ${pdfLogoBgEnabled ? '' : 'opacity-50'}`} disabled={!pdfLogoBgEnabled} />
                  </div>
                  {pdfLogoUrl && (
                    <div className="mt-3 flex items-center gap-3">
                      <EncryptedLogoImage 
                        src={pdfLogoUrl} 
                        decryptFile={decryptFile} 
                        isEncrypted={isEncrypted}
                        alt="Logo preview"
                        className="h-12 w-auto border rounded bg-white p-1"
                      />
                      <Button variant="outline" size="sm" onClick={() => setPdfLogoUrl('')}>Remove</Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 md:col-span-2">
                <Label>Other pages header logo</Label>
                <div className="flex items-center gap-3 mb-2">
                  <Switch checked={pdfPagesLogoUseHeader} onCheckedChange={(v) => setPdfPagesLogoUseHeader(Boolean(v))} />
                  <span className="text-sm text-gray-700">Reuse first page logo</span>
                </div>
                {!pdfPagesLogoUseHeader && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = async () => {
                              const file = input.files?.[0];
                              if (!file) return;
                              
                              try {
                                const fileExt = file.name.split('.').pop();
                                const fileName = `logo_pages_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
                                
                                let fileToUpload: File | ArrayBuffer = file;
                                let finalFileName = fileName;
                                let uploadOptions: any = {
                                  cacheControl: '3600',
                                  upsert: false
                                };

                                // Encrypt file if encryption is enabled and key is available
                                if (isEncrypted && encryptFile) {
                                  const arrayBuffer = await file.arrayBuffer();
                                  const encrypted = await encryptFile(arrayBuffer);
                                  
                                  if (!encrypted) {
                                    throw new Error("Failed to encrypt logo");
                                  }

                                  // Prepend IV (12 bytes) to the encrypted data
                                  const ivBytes = userCrypto.base64ToArrayBuffer(encrypted.iv);
                                  const dataBytes = new Uint8Array(encrypted.data as ArrayBuffer);
                                  
                                  const combined = new Uint8Array(ivBytes.byteLength + dataBytes.byteLength);
                                  combined.set(new Uint8Array(ivBytes), 0);
                                  combined.set(dataBytes, ivBytes.byteLength);
                                  
                                  fileToUpload = combined.buffer;
                                  finalFileName = `${fileName}.enc`;
                                  uploadOptions.contentType = 'application/octet-stream';
                                }
                                
                                const path = `${rfxId || 'temp'}/pdf/logo_pages/${finalFileName}`;
                                const { error } = await supabase.storage
                                  .from('rfx-images')
                                  .upload(path, fileToUpload, uploadOptions);
                                if (error) throw error;
                                
                                const { data: { publicUrl } } = supabase.storage
                                  .from('rfx-images')
                                  .getPublicUrl(path);
                                setPdfPagesLogoUrl(publicUrl);
                              } catch (e: any) {
                                console.error('Error uploading pages logo:', e);
                                throw e;
                              }
                            };
                            input.click();
                          } catch (e: any) {
                            toast({ title: 'Upload error', description: e.message || 'Failed to upload logo', variant: 'destructive' });
                          }
                        }}
                      >Upload Logo</Button>
                      {pdfPagesLogoUrl && <a href={pdfPagesLogoUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">Open</a>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={pdfPagesLogoBgEnabled} onCheckedChange={(v) => setPdfPagesLogoBgEnabled(Boolean(v))} />
                      <span className="text-sm text-gray-700">Use logo background color</span>
                      <input type="color" value={pdfPagesLogoBgColor} onChange={(e) => setPdfPagesLogoBgColor(e.target.value)} className={`h-9 w-12 rounded border ${pdfPagesLogoBgEnabled ? '' : 'opacity-50'}`} disabled={!pdfPagesLogoBgEnabled} />
                      <Input value={pdfPagesLogoBgColor} onChange={(e) => setPdfPagesLogoBgColor(e.target.value)} className={`max-w-[140px] ${pdfPagesLogoBgEnabled ? '' : 'opacity-50'}`} disabled={!pdfPagesLogoBgEnabled} />
                    </div>
                    {pdfPagesLogoUrl && (
                      <div className="mt-3 flex items-center gap-3">
                        <EncryptedLogoImage 
                          src={pdfPagesLogoUrl} 
                          decryptFile={decryptFile} 
                          isEncrypted={isEncrypted}
                          alt="Pages logo preview"
                          className="h-12 w-auto border rounded bg-white p-1"
                        />
                        <Button variant="outline" size="sm" onClick={() => setPdfPagesLogoUrl('')}>Remove</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog
        open={!!viewingRelatedFile}
        onOpenChange={(open) => {
          if (!open && viewingRelatedFile?.url) {
            URL.revokeObjectURL(viewingRelatedFile.url);
            setViewingRelatedFile(null);
          }
        }}
      >
        <DialogContent className="max-w-[88vw] w-[88vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="truncate">{viewingRelatedFile?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-6 pb-6">
            {viewingRelatedFile?.url ? (
              viewingRelatedFile.mimeType.startsWith('image/') ? (
                <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
                  <img
                    src={viewingRelatedFile.url}
                    alt={viewingRelatedFile.title}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <iframe
                  src={viewingRelatedFile.url}
                  className="w-full h-full rounded-lg border border-gray-200"
                  title={viewingRelatedFile.title}
                />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* TODO Warning - floating notification */}
      <TodoWarning 
        todoCount={totalTodos} 
        onNavigateToTodo={(index) => setActiveTodoIndex(index)}
      />

      {/* Proposal Suggestions Warning - floating notification */}
      <ProposalSuggestionsWarning 
        suggestions={pendingProposals}
        onNavigateToProposal={handleNavigateToProposal}
      />

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          onClick={handleDownloadPDF}
          disabled={isGenerating}
          variant="outline"
          className="border-[#22183a] text-[#22183a] hover:bg-[#22183a]/5"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#22183a] mr-2"></div>
              {t('rfxs.specs_generatingPdf')}
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              {t('rfxs.specs_downloadAsPdf')}
            </>
          )}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || isArchived || readOnly}
          className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {t('rfxs.specs_saving')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {t('rfxs.specs_saveSpecifications')}
            </>
          )}
        </Button>
      </div>

      {/* Spacer div - 70% viewport height */}
      <div style={{ height: '5vh' }} className="w-full"></div>

      {/* Agent Helper Dialog */}
      <AgentHelperDialog
        isOpen={showAgentHelperDialog}
        onClose={handleCloseHelperDialog}
        fieldName={helperDialogField}
      />
    </div>
  );
});

RFXSpecs.displayName = 'RFXSpecs';

export default RFXSpecs;

