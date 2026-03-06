import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, X, Eye, Loader2, Trash2, Download, CheckCircle2, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { userCrypto } from '@/lib/userCrypto';

interface SupplierDocumentUploadProps {
  invitationId: string;
  onSubmitButtonReady?: (props: {
    canSubmit: boolean;
    isSubmitted: boolean;
    isSubmitting: boolean;
    onOpenSubmitModal: () => void;
  }) => void;
  hideSubmitButton?: boolean;
  encryptFile?: (fileBuffer: ArrayBuffer) => Promise<{ iv: string, data: ArrayBuffer } | null>;
  decryptFile?: (encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>;
  isEncrypted?: boolean;
}

type DocumentCategory = 'proposal' | 'offer' | 'other';

interface DocumentFile {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  category: DocumentCategory;
  uploaded_at: string;
  uploaded_by: string;
}

interface UploaderInfo {
  name?: string;
  surname?: string;
  email?: string;
}

export const SupplierDocumentUpload: React.FC<SupplierDocumentUploadProps> = ({ 
  invitationId, 
  onSubmitButtonReady, 
  hideSubmitButton = false,
  encryptFile,
  decryptFile,
  isEncrypted = false
}) => {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [uploaderInfo, setUploaderInfo] = useState<Record<string, UploaderInfo>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingCategory, setUploadingCategory] = useState<DocumentCategory | null>(null);
  const [isUploadingAny, setIsUploadingAny] = useState(false);
  const [dragOverCategory, setDragOverCategory] = useState<DocumentCategory | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invitationStatus, setInvitationStatus] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<{ id: string; filePath: string; fileName: string } | null>(null);

  useEffect(() => {
    loadDocuments();
  }, [invitationId]);

  // Load invitation status
  useEffect(() => {
    const loadInvitationStatus = async () => {
      const { data } = await supabase
        .from('rfx_company_invitations' as any)
        .select('status')
        .eq('id', invitationId)
        .maybeSingle();
      if (data) {
        setInvitationStatus(data.status);
      }
    };
    loadInvitationStatus();
  }, [invitationId, documents]);

  const loadDocuments = async () => {
    try {
      console.log('📥 [Load Documents] Starting to load documents for invitation:', invitationId);
      setIsLoading(true);
      const { data, error } = await supabase
        .from('rfx_supplier_documents' as any)
        .select('*')
        .eq('rfx_company_invitation_id', invitationId)
        .order('uploaded_at', { ascending: false });

      console.log('📥 [Load Documents] Query result:', {
        data,
        error,
        dataLength: data?.length,
        errorCode: error?.code,
        errorMessage: error?.message,
      });

      if (error && error.code !== 'PGRST116') {
        console.error('❌ [Load Documents] Error loading documents:', error);
        return;
      }

      const docs = (data as DocumentFile[]) || [];
      console.log('📥 [Load Documents] Setting documents state:', {
        docsCount: docs.length,
        docs: docs.map(d => ({ id: d.id, file_name: d.file_name, uploaded_by: d.uploaded_by })),
      });
      setDocuments(docs);

      // Load uploader information for all unique uploaded_by IDs
      const uploaderIds = Array.from(new Set(docs.map(doc => doc.uploaded_by).filter(Boolean)));
      if (uploaderIds.length > 0) {
        try {
          const { data: userInfoData, error: userInfoError } = await supabase
            .rpc('get_basic_user_info', { p_user_ids: uploaderIds });

          if (userInfoError) {
            console.error('Error loading uploader info:', userInfoError);
          } else if (userInfoData) {
            const infoMap: Record<string, UploaderInfo> = {};
            userInfoData.forEach((user: any) => {
              const userId = user.auth_user_id || user.id;
              infoMap[userId] = {
                name: user.name || undefined,
                surname: user.surname || undefined,
                email: user.email || undefined,
              };
            });
            setUploaderInfo(infoMap);
          }
        } catch (err) {
          console.error('Error fetching uploader info:', err);
        }
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const validateFile = (file: File, category: DocumentCategory): string | null => {
    if (file.size > 15 * 1024 * 1024) {
      return 'File size must be less than 15MB';
    }
    
    // Check if category already has 5 files
    const categoryDocuments = documents.filter(doc => doc.category === category);
    if (categoryDocuments.length >= 5) {
      return `Maximum 5 files allowed per category. This category already has ${categoryDocuments.length} files.`;
    }
    
    return null;
  };

  const uploadFile = async (file: File, category: DocumentCategory) => {
    const validationError = validateFile(file, category);
    if (validationError) {
      toast({
        title: 'Invalid file',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploadingCategory(category);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate unique file path
      const timestamp = Date.now();
      const originalFileName = `${invitationId}/${category}/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Read file as ArrayBuffer
      const fileBuffer = await file.arrayBuffer();
      
      if (!isEncrypted || !encryptFile) {
        throw new Error('Secure upload is not ready yet. Please wait for encryption keys and try again.');
      }
      
      // Encrypt file before upload (required)
      console.log('🔐 [SupplierDocumentUpload] Encrypting file before upload:', file.name);
      const encrypted = await encryptFile(fileBuffer);
      if (!encrypted) {
        throw new Error('Failed to encrypt file');
      }
      
      // Concatenate IV (12 bytes) + encrypted data
      const ivBuffer = userCrypto.base64ToArrayBuffer(encrypted.iv);
      const combinedBuffer = new Uint8Array(ivBuffer.byteLength + encrypted.data.byteLength);
      combinedBuffer.set(new Uint8Array(ivBuffer), 0);
      combinedBuffer.set(new Uint8Array(encrypted.data), ivBuffer.byteLength);
      
      // Upload encrypted binary with .enc extension
      const finalFileName = `${originalFileName}.enc`;
      const fileToUpload = new Blob([combinedBuffer]);
      console.log('🔐 [SupplierDocumentUpload] File encrypted, size:', fileToUpload.size);

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('rfx-supplier-documents')
        .upload(finalFileName, fileToUpload, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Save metadata to database (store original file name, not encrypted path)
      const { data: documentData, error: dbError } = await supabase
        .from('rfx_supplier_documents' as any)
        .insert({
          rfx_company_invitation_id: invitationId,
          file_path: finalFileName, // Store encrypted path if encrypted
          file_name: file.name, // Store original file name
          file_size: file.size, // Store original file size
          category: category,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      toast({
        title: 'File uploaded',
        description: `The ${file.name} has been uploaded successfully`,
      });

      await loadDocuments();
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
    } finally {
      setUploadingCategory(null);
    }
  };

  const handleSubmitProposal = async () => {
    try {
      setIsSubmitting(true);

      // Get RFX ID for notifications
      const { data: invitationData } = await supabase
        .from('rfx_company_invitations' as any)
        .select('rfx_id')
        .eq('id', invitationId)
        .maybeSingle();

      const { error: updErr } = await supabase
        .from('rfx_company_invitations' as any)
        .update({ status: 'submitted' })
        .eq('id', invitationId);
      
      if (updErr) {
        throw updErr;
      }

      // Create in-app notifications when status changes to "submitted"
      try {
        const { error: notifyErr } = await supabase.rpc('create_notifications_on_rfx_submitted', {
          p_invitation_id: invitationId
        });
        if (notifyErr) {
          console.warn('Error creating notifications:', notifyErr);
        } else {
          // Small delay to ensure notifications are created
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Send notification emails
          if (invitationData?.rfx_id) {
            try {
              await supabase.functions.invoke('send-notification-email', {
                body: { 
                  type: 'supplier_document_uploaded', 
                  targetType: 'rfx', 
                  targetId: invitationData.rfx_id 
                }
              });
            } catch (emailErr) {
              console.warn('Failed to send notification emails:', emailErr);
              // Don't fail if email sending fails
            }
          }
        }
      } catch (notifyErr) {
        console.warn('Exception creating notifications:', notifyErr);
        // Don't fail if notification creation fails
      }

      toast({
        title: 'Proposal submitted',
        description: 'Your proposal has been successfully submitted',
      });

      setShowSubmitModal(false);
      
      // Reload to update status
      await loadDocuments();
    } catch (error: any) {
      console.error('Error submitting proposal:', error);
      toast({
        title: 'Submission failed',
        description: error.message || 'Failed to submit proposal',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent, category: DocumentCategory) => {
    e.preventDefault();
    setDragOverCategory(null);

    const files = Array.from(e.dataTransfer.files);
    setIsUploadingAny(true);
    try {
      for (const file of files) {
        await uploadFile(file, category);
      }
    } finally {
      setIsUploadingAny(false);
    }
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, category: DocumentCategory) => {
    const files = Array.from(e.target.files || []);
    setIsUploadingAny(true);
    try {
      for (const file of files) {
        await uploadFile(file, category);
      }
    } finally {
      setIsUploadingAny(false);
    }
    e.target.value = '';
  }, []);

  const handleDeleteClick = (documentId: string, filePath: string, fileName: string) => {
    setDocumentToDelete({ id: documentId, filePath, fileName });
    setShowDeleteModal(true);
  };

  const deleteFile = async (documentId: string, filePath: string) => {
    try {
      console.log('🗑️ [Delete File] Starting deletion process', {
        documentId,
        filePath,
        invitationId,
      });

      // Get current user info
      const { data: { user } } = await supabase.auth.getUser();
      console.log('👤 [Delete File] Current user:', {
        userId: user?.id,
        email: user?.email,
      });

      // Get document info before deletion to check permissions
      const { data: docData, error: docError } = await supabase
        .from('rfx_supplier_documents' as any)
        .select('*, rfx_company_invitations!inner(company_id)')
        .eq('id', documentId)
        .single();

      console.log('📄 [Delete File] Document data:', {
        docData,
        docError,
        uploadedBy: docData?.uploaded_by,
        companyId: docData?.rfx_company_invitations?.company_id,
      });

      // Check if user is member of the company
      if (user?.id) {
        const { data: companyMembership } = await supabase
          .from('company_admin_requests' as any)
          .select('company_id, status')
          .eq('user_id', user.id)
          .eq('status', 'approved');

        console.log('🏢 [Delete File] User company memberships:', companyMembership);
      }

      // Delete from database first (this will fail if RLS doesn't allow it)
      console.log('🗄️ [Delete File] Attempting database delete...');
      const { error: dbError, data: dbData } = await supabase
        .from('rfx_supplier_documents' as any)
        .delete()
        .eq('id', documentId)
        .select();

      console.log('🗄️ [Delete File] Database delete result:', {
        dbError,
        dbData,
        errorCode: dbError?.code,
        errorMessage: dbError?.message,
        errorDetails: dbError?.details,
        errorHint: dbError?.hint,
      });

      if (dbError) {
        console.error('❌ [Delete File] Database delete error:', {
          code: dbError.code,
          message: dbError.message,
          details: dbError.details,
          hint: dbError.hint,
          fullError: dbError,
        });
        
        // Check if it's a permission error
        if (dbError.code === '42501' || dbError.message?.includes('permission') || dbError.message?.includes('policy') || dbError.message?.includes('RLS')) {
          console.error('🚫 [Delete File] Permission denied by RLS policy');
          throw new Error('You do not have permission to delete this file. Only members of your company can delete documents from this RFX invitation.');
        }
        throw dbError;
      }

      console.log('✅ [Delete File] Database delete successful');

      // Verify the document was actually deleted
      const { data: verifyData, error: verifyError } = await supabase
        .from('rfx_supplier_documents' as any)
        .select('id')
        .eq('id', documentId)
        .maybeSingle();

      console.log('🔍 [Delete File] Verification query:', {
        verifyData,
        verifyError,
        documentStillExists: !!verifyData,
      });

      if (verifyData) {
        console.error('❌ [Delete File] Document still exists after DELETE! This indicates an RLS policy issue.');
        throw new Error('The document could not be deleted. This may be due to permission restrictions.');
      }

      // Delete from storage (only if database delete succeeded)
      console.log('📦 [Delete File] Attempting storage delete...');
      const { error: storageError, data: storageData } = await supabase.storage
        .from('rfx-supplier-documents')
        .remove([filePath]);

      console.log('📦 [Delete File] Storage delete result:', {
        storageError,
        storageData,
        errorCode: storageError?.statusCode,
        errorMessage: storageError?.message,
      });

      if (storageError) {
        console.error('⚠️ [Delete File] Storage delete error:', {
          statusCode: storageError.statusCode,
          message: storageError.message,
          fullError: storageError,
        });
        // If storage delete fails but DB delete succeeded, log it but don't fail
        // The file will be orphaned in storage but removed from the database
        console.warn('⚠️ [Delete File] File removed from database but storage deletion failed');
      } else {
        console.log('✅ [Delete File] Storage delete successful');
      }

      // Close modal first
      setShowDeleteModal(false);
      setDocumentToDelete(null);

      // Reload documents to refresh the UI
      console.log('🔄 [Delete File] Reloading documents...');
      await loadDocuments();
      console.log('✅ [Delete File] Documents reloaded');

      toast({
        title: 'File deleted',
        description: 'The file has been deleted successfully',
      });
      
      console.log('✅ [Delete File] Deletion process completed successfully');
    } catch (error: any) {
      console.error('❌ [Delete File] Error in deletion process:', {
        error,
        message: error.message,
        stack: error.stack,
        code: error.code,
      });
      toast({
        title: 'Delete failed',
        description: error.message || 'Failed to delete file. Please make sure you have permission to delete this document.',
        variant: 'destructive',
      });
    }
  };

  const viewFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('rfx-supplier-documents')
        .download(filePath);

      if (error) throw error;

      // Check if file is encrypted (.enc extension)
      const isEncryptedFile = isEncrypted && filePath.endsWith('.enc') && decryptFile;
      
      if (isEncryptedFile && decryptFile) {
        console.log('🔐 [SupplierDocumentUpload] Decrypting file for viewing:', fileName);
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
        
        // Detect MIME type based on original extension
        const originalExt = fileName.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = 'application/pdf';
        if (originalExt === 'doc') mimeType = 'application/msword';
        else if (originalExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (originalExt === 'xls') mimeType = 'application/vnd.ms-excel';
        else if (originalExt === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (originalExt === 'txt') mimeType = 'text/plain';
        
        // Create blob from decrypted data
        const blob = new Blob([decryptedBuffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        setViewingPdf({ url, title: fileName });
      } else {
        // Not encrypted, use directly
        const url = URL.createObjectURL(data);
        setViewingPdf({ url, title: fileName });
      }
    } catch (error: any) {
      console.error('Error viewing file:', error);
      toast({
        title: 'Error',
        description: 'Failed to view file',
        variant: 'destructive',
      });
    }
  };

  const downloadFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('rfx-supplier-documents')
        .download(filePath);

      if (error) throw error;

      // Check if file is encrypted (.enc extension)
      const isEncryptedFile = isEncrypted && filePath.endsWith('.enc') && decryptFile;
      
      let blob: Blob;
      
      if (isEncryptedFile && decryptFile) {
        console.log('🔐 [SupplierDocumentUpload] Decrypting file for download:', fileName);
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
        
        // Detect MIME type based on original extension
        const originalExt = fileName.split('.').pop()?.toLowerCase() || 'pdf';
        let mimeType = 'application/pdf';
        if (originalExt === 'doc') mimeType = 'application/msword';
        else if (originalExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (originalExt === 'xls') mimeType = 'application/vnd.ms-excel';
        else if (originalExt === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (originalExt === 'txt') mimeType = 'text/plain';
        
        // Create blob from decrypted data
        blob = new Blob([decryptedBuffer], { type: mimeType });
      } else {
        // Not encrypted, use directly
        blob = data;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Error downloading file:', error);
      toast({
        title: 'Error',
        description: 'Failed to download file',
        variant: 'destructive',
      });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getCategoryLabel = (category: DocumentCategory): string => {
    switch (category) {
      case 'proposal':
        return 'Proposal';
      case 'offer':
        return 'Quotations';
      case 'other':
        return 'Other Documents';
      default:
        return category;
    }
  };

  const getCategoryDescription = (category: DocumentCategory): string => {
    switch (category) {
      case 'proposal':
        return 'Technical document as a proposal to the RFX where you describe your solution';
      case 'offer':
        return 'Upload your best quotation to your proposal. It\'s not mandatory in this stage';
      case 'other':
        return 'Any additional document or file';
      default:
        return '';
    }
  };

  const getCategoryAccept = (category: DocumentCategory): string => {
    return '*';
  };

  const renderCategoryCard = (category: DocumentCategory) => {
    const categoryDocuments = documents.filter(doc => doc.category === category);
    const isUploading = isUploadingAny; // Show loading in all categories when uploading any
    const isDragOver = dragOverCategory === category;
    const hasDocuments = categoryDocuments.length > 0;
    const isAtLimit = categoryDocuments.length >= 5;

    return (
      <Card key={category} className="border border-gray-200 rounded-xl shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#1A1F2C]" />
                {getCategoryLabel(category)}
              </CardTitle>
              <CardDescription>
                {getCategoryDescription(category)}
                {' • Any file format • End-to-end encrypted'}
                {isAtLimit && ' • Maximum 5 files reached'}
              </CardDescription>
            </div>
            {hasDocuments && (
              <input
                type="file"
                accept={getCategoryAccept(category)}
                multiple
                onChange={(e) => handleFileInput(e, category)}
                className="hidden"
                id={`file-upload-${category}`}
                disabled={isUploading || isAtLimit}
              />
            )}
            {hasDocuments && !isAtLimit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => document.getElementById(`file-upload-${category}`)?.click()}
                className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white border-[#1A1F2C]"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload another file'
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Area - Only show when no documents */}
          {!hasDocuments && (
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragOver
                  ? 'border-[#80c8f0] bg-[#80c8f0]/5'
                  : 'border-gray-300 hover:border-[#80c8f0]/50'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCategory(category);
              }}
              onDragLeave={() => setDragOverCategory(null)}
              onDrop={(e) => handleDrop(e, category)}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-8 w-8 mx-auto mb-4 text-[#80c8f0] animate-spin" />
                  <p className="text-sm text-gray-600">Uploading files...</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-600 mb-2">
                    Drag files here or click to select
                  </p>
                  <input
                    type="file"
                    accept={getCategoryAccept(category)}
                    multiple
                    onChange={(e) => handleFileInput(e, category)}
                    className="hidden"
                    id={`file-upload-${category}`}
                    disabled={isUploading || isAtLimit}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUploading || isAtLimit}
                    onClick={() => document.getElementById(`file-upload-${category}`)?.click()}
                    className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90 text-white border-[#1A1F2C]"
                  >
                    {isUploading ? 'Uploading...' : 'Select Files'}
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    {'Maximum 15MB per file • All file types • End-to-end encrypted • Maximum 5 files'}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Documents List */}
          {hasDocuments && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-[#1A1F2C]">
                Uploaded Documents ({categoryDocuments.length})
              </h4>
              <div className="space-y-2">
                {categoryDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="h-5 w-5 text-[#1A1F2C] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {doc.file_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(() => {
                            const uploader = uploaderInfo[doc.uploaded_by];
                            const uploaderName = uploader 
                              ? `${uploader.name || ''} ${uploader.surname || ''}`.trim() || uploader.email || 'Unknown'
                              : 'Unknown';
                            const uploaderEmail = uploader?.email ? ` (${uploader.email})` : '';
                            const uploadDate = new Date(doc.uploaded_at).toISOString().split('T')[0];
                            return `Uploaded by ${uploaderName}${uploaderEmail} at ${uploadDate}`;
                          })()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => viewFile(doc.file_path, doc.file_name)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadFile(doc.file_path, doc.file_name)}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteClick(doc.id, doc.file_path, doc.file_name)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Check if proposal can be submitted (has both proposal and offer)
  const hasProposal = documents.some(d => d.category === 'proposal');
  const hasOffer = documents.some(d => d.category === 'offer');
  const canSubmit = hasProposal && hasOffer;
  const isSubmitted = invitationStatus === 'submitted';

  // Expose submit button props to parent if callback provided
  useEffect(() => {
    if (onSubmitButtonReady) {
      onSubmitButtonReady({
        canSubmit,
        isSubmitted,
        isSubmitting,
        onOpenSubmitModal: () => setShowSubmitModal(true),
      });
    }
  }, [canSubmit, isSubmitted, isSubmitting, onSubmitButtonReady]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-[#80c8f0]" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {renderCategoryCard('proposal')}
        {renderCategoryCard('offer')}
        {renderCategoryCard('other')}
        
        {/* Submit Button - Only render if not hidden */}
        {!hideSubmitButton && !isSubmitted && (
          <Card className="border border-gray-200 rounded-xl shadow-sm bg-white">
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
                    {canSubmit 
                      ? 'Ready to submit your proposal. Make sure all documents are correct before submitting.'
                      : 'You need to upload at least one proposal and one quotation document before submitting.'}
                  </p>
                </div>
                <Button
                  onClick={() => setShowSubmitModal(true)}
                  disabled={!canSubmit || isSubmitting}
                  className="bg-[#7de19a] hover:bg-[#7de19a]/90 text-[#1A1F2C]"
                >
                  {isSubmitting ? (
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

        {!hideSubmitButton && isSubmitted && (
          <Card className="border border-[#7de19a] rounded-xl shadow-sm bg-[#7de19a]/10">
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
      </div>

      {/* Submit Confirmation Modal */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Submission</DialogTitle>
            <DialogDescription>
              Are you sure you want to submit your proposal? Once submitted, you won't be able to make changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSubmitModal(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitProposal}
              disabled={isSubmitting}
              className="bg-[#7de19a] hover:bg-[#7de19a]/90 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Confirm Submission'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={(open) => {
        if (!open) {
          setShowDeleteModal(false);
          setDocumentToDelete(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{documentToDelete?.fileName}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false);
                setDocumentToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (documentToDelete) {
                  deleteFile(documentToDelete.id, documentToDelete.filePath);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        </DialogContent>
      </Dialog>

    </>
  );
};

