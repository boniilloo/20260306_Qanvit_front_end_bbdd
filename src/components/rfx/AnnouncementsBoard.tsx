import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MessageSquare, Send, Edit2, Trash2, X, Save, Upload, FileText, Download, Eye, Paperclip } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import MarkdownEditor from '@/components/ui/MarkdownEditor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { userCrypto } from '@/lib/userCrypto';

interface Attachment {
  id: string;
  announcement_id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type?: string;
  uploaded_at: string;
}

interface Announcement {
  id: string;
  rfx_id: string;
  user_id: string;
  subject: string;
  message: string;
  created_at: string;
  updated_at: string;
  attachments?: Attachment[];
  creator?: {
    name?: string;
    surname?: string;
    email?: string;
  };
}

interface AnnouncementsBoardProps {
  rfxId: string;
  readOnly?: boolean;
  // Props for decryption when readOnly (from RFXViewer)
  decrypt?: (encryptedText: string) => Promise<string>;
  decryptFile?: (encryptedBuffer: ArrayBuffer, ivBase64: string) => Promise<ArrayBuffer | null>;
  isEncrypted?: boolean;
  isCryptoReady?: boolean;
}

const AnnouncementsBoard: React.FC<AnnouncementsBoardProps> = ({ 
  rfxId, 
  readOnly = false,
  decrypt: decryptProp,
  decryptFile: decryptFileProp,
  isEncrypted: isEncryptedProp,
  isCryptoReady: isCryptoReadyProp
}) => {
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use RFX crypto hook when NOT readOnly (for encryption/decryption in RFXResponsesPage)
  const { encrypt, decrypt: decryptHook, encryptFile: encryptFileHook, decryptFile: decryptFileHook, isEncrypted: isEncryptedHook, isReady: isCryptoReadyHook } = useRFXCrypto(readOnly ? null : rfxId);
  
  // Determine which encryption/decryption functions to use
  const isEncrypted = readOnly ? (isEncryptedProp ?? false) : isEncryptedHook;
  const isCryptoReady = readOnly ? (isCryptoReadyProp ?? true) : isCryptoReadyHook;
  const encryptFn = readOnly ? undefined : encrypt;
  const encryptFileFn = readOnly ? undefined : encryptFileHook;
  // Use decrypt from hook when not readOnly, or from props when readOnly
  const decryptFn = readOnly ? decryptProp : decryptHook;
  const decryptFileFn = readOnly ? decryptFileProp : decryptFileHook;

  // Debug logging for crypto state
  useEffect(() => {
    console.log('📢 [AnnouncementsBoard] Crypto state:', {
      rfxId,
      readOnly,
      isEncrypted,
      isCryptoReady,
      hasDecryptFn: !!decryptFn,
      hasDecryptFileFn: !!decryptFileFn,
      isEncryptedProp,
      isCryptoReadyProp
    });
  }, [rfxId, readOnly, isEncrypted, isCryptoReady, decryptFn, decryptFileFn, isEncryptedProp, isCryptoReadyProp]);

  const loadAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      
      console.log('📢 [AnnouncementsBoard] loadAnnouncements called:', {
        isEncrypted,
        isCryptoReady,
        hasDecryptFn: !!decryptFn
      });
      
      // Wait for crypto to be ready if encrypted
      if (isEncrypted && !isCryptoReady) {
        console.log('📢 [AnnouncementsBoard] Waiting for crypto to be ready...');
        setLoading(false);
        return;
      }
      
      // Load announcements
      const { data, error } = await supabase
        .from('rfx_announcements' as any)
        .select('*')
        .eq('rfx_id', rfxId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load creator information and attachments for each announcement
      const announcementsWithData = await Promise.all(
        (data || []).map(async (announcement: any) => {
          try {
            // Load creator info using RPC function (bypasses RLS restrictions)
            const { data: creatorData } = await supabase
              .rpc('get_announcement_creator_info', {
                p_user_id: announcement.user_id,
                p_rfx_id: rfxId,
              });

            // Load attachments
            const { data: attachmentsData } = await supabase
              .from('rfx_announcement_attachments' as any)
              .select('*')
              .eq('announcement_id', announcement.id)
              .order('uploaded_at', { ascending: true });

            // Decrypt subject and message if we have decrypt function
            let decryptedSubject = announcement.subject;
            let decryptedMessage = announcement.message;
            
            // Try to decrypt if we have a decrypt function, regardless of isEncrypted flag
            // This handles cases where public RFXs might still have encrypted announcements
            if (decryptFn) {
              try {
                // Check if data is encrypted (starts with '{' indicating JSON format)
                const isSubjectEncrypted = typeof announcement.subject === 'string' && announcement.subject.trim().startsWith('{');
                const isMessageEncrypted = typeof announcement.message === 'string' && announcement.message.trim().startsWith('{');
                
                console.log('📢 [AnnouncementsBoard] Decrypting announcement:', {
                  id: announcement.id,
                  isSubjectEncrypted,
                  isMessageEncrypted,
                  hasDecryptFn: !!decryptFn
                });
                
                if (isSubjectEncrypted) {
                  decryptedSubject = await decryptFn(announcement.subject);
                }
                if (isMessageEncrypted) {
                  decryptedMessage = await decryptFn(announcement.message);
                }
                
                console.log('📢 [AnnouncementsBoard] Decryption successful:', {
                  id: announcement.id,
                  subjectLength: decryptedSubject?.length || 0,
                  messageLength: decryptedMessage?.length || 0
                });
              } catch (decryptError) {
                console.error('❌ [AnnouncementsBoard] Error decrypting announcement:', decryptError);
                // Keep encrypted data if decryption fails
              }
            } else {
              console.log('📢 [AnnouncementsBoard] No decrypt function available, skipping decryption');
            }

            return {
              ...announcement,
              subject: decryptedSubject,
              message: decryptedMessage,
              attachments: attachmentsData || [],
              creator: creatorData && creatorData.length > 0 ? {
                name: creatorData[0].name || undefined,
                surname: creatorData[0].surname || undefined,
              } : undefined,
            };
          } catch (error) {
            console.error('Error loading announcement data:', error);
            return {
              ...announcement,
              attachments: [],
            };
          }
        })
      );

      setAnnouncements(announcementsWithData);
    } catch (error: any) {
      console.error('Error loading announcements:', error);
      toast({
        title: 'Error',
        description: 'Failed to load announcements',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [rfxId, isEncrypted, isCryptoReady, decryptFn]);

  useEffect(() => {
    if (rfxId) {
      loadAnnouncements();
    }
  }, [rfxId, loadAnnouncements]);

  const validateFile = (file: File): string | null => {
    if (file.size > 5 * 1024 * 1024) {
      return 'File size must be less than 5MB';
    }
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;

    // Check total files limit
    if (selectedFiles.length + files.length > 5) {
      toast({
        title: 'Too many files',
        description: 'Maximum 5 files per announcement',
        variant: 'destructive',
      });
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        toast({
          title: 'Invalid file',
          description: `${file.name}: ${error}`,
          variant: 'destructive',
        });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setSelectedFiles([...selectedFiles, ...validFiles]);
    }

    // Reset input
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!subject.trim()) {
      toast({
        title: 'Error',
        description: 'Subject cannot be empty',
        variant: 'destructive',
      });
      return;
    }
    
    if (!message.trim()) {
      toast({
        title: 'Error',
        description: 'Message cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      setUploadingFiles(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Encrypt subject and message if encryption is enabled
      let finalSubject = subject.trim();
      let finalMessage = message.trim();
      
      if (isEncrypted && encryptFn) {
        try {
          finalSubject = await encryptFn(subject.trim());
          finalMessage = await encryptFn(message.trim());
        } catch (encryptError) {
          console.error('Error encrypting announcement:', encryptError);
          toast({
            title: 'Error',
            description: 'Failed to encrypt announcement',
            variant: 'destructive',
          });
          return;
        }
      }

      // Create announcement first
      const { data: announcementData, error: announcementError } = await supabase
        .from('rfx_announcements' as any)
        .insert({
          rfx_id: rfxId,
          user_id: user.id,
          subject: finalSubject,
          message: finalMessage,
        })
        .select()
        .single();

      if (announcementError) throw announcementError;

      // Upload files if any
      if (selectedFiles.length > 0 && announcementData) {
        for (const file of selectedFiles) {
          const fileExt = file.name.split('.').pop();
          const timestamp = Date.now();
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const originalFileName = `${(announcementData as any).id}/${timestamp}-${sanitizedFileName}`;

          let fileToUpload: Blob | File = file;
          let finalFileName = originalFileName;

          // Encrypt file if encryption is enabled
          if (isEncrypted && encryptFileFn) {
            try {
              console.log('🔐 [AnnouncementsBoard] Encrypting file before upload:', file.name);
              const fileBuffer = await file.arrayBuffer();
              const encrypted = await encryptFileFn(fileBuffer);
              
              if (!encrypted) {
                throw new Error('Failed to encrypt file');
              }
              
              // Concatenate IV (12 bytes) + encrypted data
              const ivBuffer = userCrypto.base64ToArrayBuffer(encrypted.iv);
              const combinedBuffer = new Uint8Array(ivBuffer.byteLength + encrypted.data.byteLength);
              combinedBuffer.set(new Uint8Array(ivBuffer), 0);
              combinedBuffer.set(new Uint8Array(encrypted.data), ivBuffer.byteLength);
              
              // Upload with .enc extension
              finalFileName = `${originalFileName}.enc`;
              fileToUpload = new Blob([combinedBuffer], { type: 'application/octet-stream' });
              console.log('🔐 [AnnouncementsBoard] File encrypted, size:', fileToUpload.size);
            } catch (encryptError) {
              console.error('Error encrypting file:', encryptError);
              toast({
                title: 'Error',
                description: `Failed to encrypt file ${file.name}`,
                variant: 'destructive',
              });
              continue;
            }
          }

          // Upload to storage
          console.log('📤 [AnnouncementsBoard] Uploading file to storage:', {
            finalFileName,
            fileSize: fileToUpload.size,
            isEncrypted: isEncrypted && encryptFileFn
          });
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('rfx-announcement-attachments')
            .upload(finalFileName, fileToUpload, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            console.error('❌ [AnnouncementsBoard] Error uploading file:', {
              error: uploadError,
              finalFileName,
              errorMessage: uploadError.message,
              errorStatus: (uploadError as any).statusCode
            });
            toast({
              title: 'Error',
              description: `Failed to upload file ${file.name}: ${uploadError.message}`,
              variant: 'destructive',
            });
            continue;
          }
          
          // Use the path returned by the upload, or fallback to finalFileName
          const actualFilePath = uploadData?.path || finalFileName;
          
          if (!uploadData || !uploadData.path) {
            console.error('❌ [AnnouncementsBoard] Upload returned no data or path:', {
              uploadData,
              finalFileName
            });
            toast({
              title: 'Error',
              description: `Upload may have failed for ${file.name}. Please try again.`,
              variant: 'destructive',
            });
            continue;
          }
          
          console.log('✅ [AnnouncementsBoard] File uploaded successfully:', {
            path: actualFilePath,
            finalFileName,
            uploadDataPath: uploadData?.path,
            uploadDataFull: uploadData
          });

          // Try to download immediately to verify it was uploaded correctly
          const { data: verifyData, error: verifyError } = await supabase.storage
            .from('rfx-announcement-attachments')
            .download(actualFilePath);
          
          if (verifyError) {
            console.error('❌ [AnnouncementsBoard] File verification failed - cannot download after upload:', {
              error: verifyError,
              actualFilePath,
              errorMessage: verifyError.message
            });
            toast({
              title: 'Warning',
              description: `File uploaded but cannot be verified. This may be a permissions issue.`,
              variant: 'destructive',
            });
            // Continue anyway - the file might still be there, just not accessible yet
          } else {
            console.log('✅ [AnnouncementsBoard] File verified - can download immediately after upload');
          }

          // Save attachment metadata (use the actual path from upload)
          console.log('💾 [AnnouncementsBoard] Saving attachment metadata to database:', {
            announcement_id: (announcementData as any).id,
            file_path: actualFilePath,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type
          });
          
          const { data: attachmentData, error: attachmentError } = await supabase
            .from('rfx_announcement_attachments' as any)
            .insert({
              announcement_id: (announcementData as any).id,
              file_path: actualFilePath, // Use actual path from upload
              file_name: file.name,
              file_size: file.size,
              mime_type: file.type,
            })
            .select()
            .single();

          if (attachmentError) {
            console.error('❌ [AnnouncementsBoard] Error saving attachment metadata:', {
              error: attachmentError,
              errorMessage: attachmentError.message
            });
            // If attachment metadata fails, try to delete the uploaded file
            await supabase.storage
              .from('rfx-announcement-attachments')
              .remove([actualFilePath]);
            toast({
              title: 'Warning',
              description: `File ${file.name} uploaded but metadata save failed. Please try again.`,
              variant: 'destructive',
            });
            continue;
          }
          
          console.log('✅ [AnnouncementsBoard] Attachment metadata saved successfully:', attachmentData);
        }
      }

      // Send notification emails after announcement is created
      // Small delay to ensure trigger has executed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Invoke email function with filters (like SupplierDocumentUpload does)
      // This approach is more reliable because the edge function uses service role key
      // and can access all notifications regardless of RLS
      try {
        await supabase.functions.invoke('send-notification-email', {
          body: { 
            type: 'rfx_announcement_posted', 
            targetType: 'rfx', 
            targetId: rfxId 
          }
        });
      } catch (emailErr) {
        console.warn('Failed to send notification emails:', emailErr);
        // Don't fail the announcement creation if email sending fails
      }

      setSubject('');
      setMessage('');
      setSelectedFiles([]);
      toast({
        title: 'Success',
        description: 'Announcement posted successfully',
      });
      await loadAnnouncements();
    } catch (error: any) {
      console.error('Error saving announcement:', error);
      toast({
        title: 'Error',
        description: 'Failed to post announcement',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
      setUploadingFiles(false);
    }
  };

  const handleEdit = async () => {
    if (!editingId || !editSubject.trim() || !editMessage.trim()) {
      return;
    }

    try {
      setSaving(true);
      
      // Encrypt subject and message if encryption is enabled
      let finalSubject = editSubject.trim();
      let finalMessage = editMessage.trim();
      
      if (isEncrypted && encryptFn) {
        try {
          finalSubject = await encryptFn(editSubject.trim());
          finalMessage = await encryptFn(editMessage.trim());
        } catch (encryptError) {
          console.error('Error encrypting announcement:', encryptError);
          toast({
            title: 'Error',
            description: 'Failed to encrypt announcement',
            variant: 'destructive',
          });
          return;
        }
      }
      
      const { error } = await supabase
        .from('rfx_announcements' as any)
        .update({ 
          subject: finalSubject,
          message: finalMessage 
        })
        .eq('id', editingId);

      if (error) throw error;

      setEditingId(null);
      setEditSubject('');
      setEditMessage('');
      toast({
        title: 'Success',
        description: 'Announcement updated successfully',
      });
      await loadAnnouncements();
    } catch (error: any) {
      console.error('Error updating announcement:', error);
      toast({
        title: 'Error',
        description: 'Failed to update announcement',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      setDeleting(true);
      const { error } = await supabase
        .from('rfx_announcements' as any)
        .delete()
        .eq('id', deleteId);

      if (error) throw error;

      setDeleteDialogOpen(false);
      setDeleteId(null);
      toast({
        title: 'Success',
        description: 'Announcement deleted successfully',
      });
      await loadAnnouncements();
    } catch (error: any) {
      console.error('Error deleting announcement:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete announcement',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setEditSubject(announcement.subject);
    setEditMessage(announcement.message);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditSubject('');
    setEditMessage('');
  };

  const openDeleteDialog = (id: string) => {
    setDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const downloadFile = async (filePath: string, fileName: string) => {
    try {
      // Check if file is encrypted and we have decrypt function
      const isEncryptedFile = isEncrypted && filePath.endsWith('.enc') && decryptFileFn;
      
      console.log('🔍 [AnnouncementsBoard] Attempting to download file:', {
        filePath,
        fileName,
        isEncrypted,
        hasDecryptFn: !!decryptFileFn,
        isEncryptedFile
      });
      
      // Try to download the file
      const { data, error } = await supabase.storage
        .from('rfx-announcement-attachments')
        .download(filePath);

      if (error) {
        console.error('❌ [AnnouncementsBoard] Error downloading file from storage:', {
          error,
          filePath,
          errorMessage: error.message,
          errorStatus: (error as any).statusCode
        });
        
        // If file doesn't exist and it's supposed to be encrypted, try without .enc
        if (filePath.endsWith('.enc')) {
          const pathWithoutEnc = filePath.replace(/\.enc$/, '');
          console.log('🔄 [AnnouncementsBoard] Retrying download without .enc:', pathWithoutEnc);
          
          const { data: retryData, error: retryError } = await supabase.storage
            .from('rfx-announcement-attachments')
            .download(pathWithoutEnc);
          
          if (!retryError && retryData) {
            console.log('✅ [AnnouncementsBoard] Found file without .enc extension');
            // Use the non-encrypted file
            const url = URL.createObjectURL(retryData);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return;
          } else {
            console.error('❌ [AnnouncementsBoard] File not found with or without .enc');
          }
        }
        
        toast({
          title: 'Error',
          description: `Failed to download file: ${error.message || 'File not found'}`,
          variant: 'destructive',
        });
        throw error;
      }

      let fileBlob: Blob = data;
      
      // Decrypt file if encrypted
      if (isEncryptedFile) {
        try {
          console.log('🔐 [AnnouncementsBoard] Decrypting file for download:', fileName);
          const encryptedBuffer = await data.arrayBuffer();
          
          // Extract IV (first 12 bytes) and encrypted data
          const ivBytes = encryptedBuffer.slice(0, 12);
          const dataBytes = encryptedBuffer.slice(12);
          
          // Convert IV to base64
          const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
          
          // Decrypt
          const decryptedBuffer = await decryptFileFn(dataBytes, ivBase64);
          if (!decryptedBuffer) {
            throw new Error('Failed to decrypt file');
          }
          
          // Detect MIME type based on original extension
          const originalExt = fileName.split('.').pop()?.toLowerCase() || '';
          let mimeType = 'application/octet-stream';
          if (originalExt === 'pdf') mimeType = 'application/pdf';
          else if (originalExt === 'jpg' || originalExt === 'jpeg') mimeType = 'image/jpeg';
          else if (originalExt === 'png') mimeType = 'image/png';
          else if (originalExt === 'doc') mimeType = 'application/msword';
          else if (originalExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          
          fileBlob = new Blob([decryptedBuffer], { type: mimeType });
          console.log('🔐 [AnnouncementsBoard] File decrypted successfully');
        } catch (decryptError) {
          console.error('Error decrypting file:', decryptError);
          toast({
            title: 'Error',
            description: 'Failed to decrypt file',
            variant: 'destructive',
          });
          return;
        }
      }

      const url = URL.createObjectURL(fileBlob);
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

  const viewFile = async (filePath: string, fileName: string, mimeType?: string) => {
    try {
      // For PDFs and images, we can view them directly
      if (mimeType?.startsWith('image/') || mimeType === 'application/pdf') {
        // Check if file is encrypted and we have decrypt function
        const isEncryptedFile = isEncrypted && filePath.endsWith('.enc') && decryptFileFn;
        
        console.log('🔍 [AnnouncementsBoard] Attempting to view file:', {
          filePath,
          fileName,
          isEncrypted,
          hasDecryptFn: !!decryptFileFn,
          isEncryptedFile
        });
        
        // Try to download the file
        const { data, error } = await supabase.storage
          .from('rfx-announcement-attachments')
          .download(filePath);

        if (error) {
          console.error('❌ [AnnouncementsBoard] Error downloading file from storage:', {
            error,
            filePath,
            errorMessage: error.message,
            errorStatus: (error as any).statusCode
          });
          
          // If file doesn't exist and it's supposed to be encrypted, try without .enc
          if (filePath.endsWith('.enc')) {
            const pathWithoutEnc = filePath.replace(/\.enc$/, '');
            console.log('🔄 [AnnouncementsBoard] Retrying download without .enc:', pathWithoutEnc);
            
            const { data: retryData, error: retryError } = await supabase.storage
              .from('rfx-announcement-attachments')
              .download(pathWithoutEnc);
            
            if (!retryError && retryData) {
              console.log('✅ [AnnouncementsBoard] Found file without .enc extension');
              // Use the non-encrypted file
              const url = URL.createObjectURL(retryData);
              setViewingPdf({ url, title: fileName });
              return;
            } else {
              console.error('❌ [AnnouncementsBoard] File not found with or without .enc');
            }
          }
          
          toast({
            title: 'Error',
            description: `Failed to view file: ${error.message || 'File not found'}`,
            variant: 'destructive',
          });
          throw error;
        }

        let fileBlob: Blob = data;
        
        // Decrypt file if encrypted
        if (isEncryptedFile) {
          try {
            console.log('🔐 [AnnouncementsBoard] Decrypting file for viewing:', fileName);
            const encryptedBuffer = await data.arrayBuffer();
            
            // Extract IV (first 12 bytes) and encrypted data
            const ivBytes = encryptedBuffer.slice(0, 12);
            const dataBytes = encryptedBuffer.slice(12);
            
            // Convert IV to base64
            const ivBase64 = userCrypto.arrayBufferToBase64(ivBytes);
            
            // Decrypt
            const decryptedBuffer = await decryptFileFn(dataBytes, ivBase64);
            if (!decryptedBuffer) {
              throw new Error('Failed to decrypt file');
            }
            
            // Detect MIME type based on original extension
            const originalExt = fileName.split('.').pop()?.toLowerCase() || '';
            let detectedMimeType = mimeType || 'application/octet-stream';
            if (originalExt === 'pdf') detectedMimeType = 'application/pdf';
            else if (originalExt === 'jpg' || originalExt === 'jpeg') detectedMimeType = 'image/jpeg';
            else if (originalExt === 'png') detectedMimeType = 'image/png';
            else if (originalExt === 'gif') detectedMimeType = 'image/gif';
            else if (originalExt === 'webp') detectedMimeType = 'image/webp';
            
            fileBlob = new Blob([decryptedBuffer], { type: detectedMimeType });
            console.log('🔐 [AnnouncementsBoard] File decrypted successfully');
          } catch (decryptError) {
            console.error('Error decrypting file:', decryptError);
            toast({
              title: 'Error',
              description: 'Failed to decrypt file',
              variant: 'destructive',
            });
            return;
          }
        }

        const url = URL.createObjectURL(fileBlob);
        setViewingPdf({ url, title: fileName });
      } else {
        // For other file types, just download
        await downloadFile(filePath, fileName);
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

  const getCreatorName = (announcement: Announcement) => {
    if (announcement.creator?.name && announcement.creator?.surname) {
      return `${announcement.creator.name} ${announcement.creator.surname}`;
    }
    if (announcement.creator?.name) {
      return announcement.creator.name;
    }
    return 'Unknown';
  };

  // Check if user can edit/delete (must be the creator)
  const canModify = async (announcement: Announcement) => {
    if (readOnly) return false;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id === announcement.user_id;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex justify-center items-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#22183a]" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Write new announcement (only if not read-only) */}
      {!readOnly && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Post Announcement
            </CardTitle>
            <CardDescription>
              Send announcements to invited suppliers with subject, message, and attachments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Subject field */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Subject <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter announcement subject..."
                disabled={saving || uploadingFiles}
              />
            </div>

            {/* Message body */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Message <span className="text-red-500">*</span>
              </label>
              <div className="border border-gray-200 rounded-md">
                <MarkdownEditor
                  value={message}
                  onChange={(newValue) => setMessage(newValue)}
                  placeholder="Write your announcement message here..."
                  minRows={5}
                  className="w-full"
                />
              </div>
            </div>
            
            {/* File Upload Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Attachments ({selectedFiles.length}/5)
                </label>
                {selectedFiles.length < 5 && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      disabled={saving || uploadingFiles}
                      className="hidden"
                      accept="*/*"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={saving || uploadingFiles}
                      className="text-sm"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Add Files (max 5MB each)
                    </Button>
                  </>
                )}
              </div>
              
              {selectedFiles.length > 0 && (
                <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="h-4 w-4 text-[#22183a] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        disabled={saving || uploadingFiles}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={handleSave}
                disabled={!subject.trim() || !message.trim() || saving || uploadingFiles}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {saving || uploadingFiles ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {uploadingFiles ? 'Uploading...' : 'Posting...'}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Post Announcement
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Announcements list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Announcements ({announcements.length})
          </CardTitle>
          <CardDescription>
            {readOnly 
              ? 'Updates and messages from the RFX creator'
              : 'All announcements posted for this RFX'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <div className="py-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">
                {readOnly 
                  ? 'No announcements yet'
                  : 'No announcements posted yet. Be the first to post one!'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
                >
                  {editingId === announcement.id ? (
                    // Edit mode
                    <div className="space-y-4">
                      {/* Edit Subject */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                          Subject <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          placeholder="Enter announcement subject..."
                          disabled={saving}
                        />
                      </div>
                      
                      {/* Edit Message */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                          Message <span className="text-red-500">*</span>
                        </label>
                        <div className="border border-gray-200 rounded-md">
                          <MarkdownEditor
                            value={editMessage}
                            onChange={(newValue) => setEditMessage(newValue)}
                            placeholder="Edit your announcement message..."
                            minRows={5}
                            className="w-full"
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                        <Button
                          onClick={handleEdit}
                          disabled={!editSubject.trim() || !editMessage.trim() || saving}
                          className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Save Changes
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <>
                      {/* Header with creator info and actions */}
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="font-semibold text-[#22183a]">
                            {getCreatorName(announcement)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(announcement.created_at)}
                            {announcement.updated_at !== announcement.created_at && ' (edited)'}
                          </p>
                        </div>
                        {!readOnly && (
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const canEdit = await canModify(announcement);
                                if (canEdit) {
                                  startEdit(announcement);
                                } else {
                                  toast({
                                    title: 'Error',
                                    description: 'You can only edit your own announcements',
                                    variant: 'destructive',
                                  });
                                }
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                const canEdit = await canModify(announcement);
                                if (canEdit) {
                                  openDeleteDialog(announcement.id);
                                } else {
                                  toast({
                                    title: 'Error',
                                    description: 'Only RFX owners can delete announcements',
                                    variant: 'destructive',
                                  });
                                }
                              }}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {/* Subject - Email style */}
                      <div className="mb-4 pb-3 border-b border-gray-200">
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-semibold text-gray-600 mt-1">Subject:</span>
                          <h3 className="text-lg font-bold text-[#22183a] flex-1">
                            {announcement.subject}
                          </h3>
                        </div>
                      </div>
                      
                      {/* Message Body */}
                      <div className="prose prose-sm max-w-none">
                        <MarkdownRenderer content={announcement.message} />
                      </div>
                      
                      {/* Attachments */}
                      {announcement.attachments && announcement.attachments.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Paperclip className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-semibold text-gray-700">
                              Attachments ({announcement.attachments.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {announcement.attachments.map((attachment) => (
                              <div
                                key={attachment.id}
                                className="flex items-center justify-between p-2 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <FileText className="h-4 w-4 text-[#22183a] flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {attachment.file_name}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {formatFileSize(attachment.file_size)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {(attachment.mime_type?.startsWith('image/') || attachment.mime_type === 'application/pdf') && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => viewFile(attachment.file_path, attachment.file_name, attachment.mime_type)}
                                      className="h-8 w-8 p-0"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => downloadFile(attachment.file_path, attachment.file_name)}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Announcement</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete this announcement? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteId(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF/Image Viewer Modal */}
      <Dialog open={!!viewingPdf} onOpenChange={(open) => {
        if (!open && viewingPdf?.url) {
          URL.revokeObjectURL(viewingPdf.url);
          setViewingPdf(null);
        }
      }}>
        <DialogContent className="max-w-[80vw] w-[80vw] h-[85vh] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#22183a]" />
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
                <Loader2 className="h-8 w-8 animate-spin text-[#22183a]" />
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
    </div>
  );
};

export default AnnouncementsBoard;

