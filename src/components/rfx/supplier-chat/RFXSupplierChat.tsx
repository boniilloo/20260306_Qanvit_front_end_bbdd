import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, Loader2, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import SmartLogo from '@/components/ui/SmartLogo';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import { useRFXCryptoForCompany } from '@/hooks/useRFXCryptoForCompany';
import ChatThread, { ChatThreadMessage } from '@/components/rfx/chat/ChatThread';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import RFXFileUploadPreview from '@/components/rfx/RFXFileUploadPreview';
import RFXSupplierQnA from '@/components/rfx/supplier-qna/RFXSupplierQnA';
import type { MessageImage, MessageDocument } from '@/types/chat';
import {
  RFX_CHAT_STORAGE,
  decryptDocument,
  decryptImage,
  downloadDecryptedDocument,
  encryptAndUploadAttachment,
  encryptAndUploadImage,
} from '@/utils/rfxChatFileUtils';
import { useRFXQnAUnreadCount } from '@/hooks/useRFXQnAUnreadCount';
import { useRFXQnAUnreadCounts } from '@/hooks/useRFXQnAUnreadCounts';
import { Badge } from '@/components/ui/badge';

type SupplierListItem = {
  invitationId: string;
  companyId: string;
  companyName: string;
  companyLogo?: string | null;
  companyWebsite?: string | null;
};

type DbChatMessage = {
  id: string;
  rfx_id: string;
  supplier_company_id: string;
  sender_user_id: string;
  sender_kind: 'buyer' | 'supplier';
  sender_display_role: string;
  sender_display_name: string;
  sender_display_surname: string;
  content_encrypted: string;
  attachments?: any;
  created_at: string;
};

interface RFXSupplierChatProps {
  rfxId: string;
  /**
   * - buyer: used in /rfxs/responses (shows supplier list, uses user crypto via useRFXCrypto)
   * - supplier: used in /rfx-viewer (single thread, uses company crypto via useRFXCryptoForCompany)
   */
  mode?: 'buyer' | 'supplier';
  /**
   * When false, the component should NOT mark threads as read.
   * This is important when the chat is mounted inside tabbed UIs where inactive tabs remain mounted.
   */
  isActive?: boolean;
  /** Buyer mode: list of suppliers */
  suppliers?: SupplierListItem[];
  /** Supplier mode: fixed companyId for the thread */
  companyId?: string;
  /** Supplier mode: optional companyName for title */
  companyName?: string | null;
  readOnly?: boolean;
  /** Allow uploading attachments in this chat. Defaults to true only for buyer mode. */
  allowUploads?: boolean;
  /** Enables console debug logs (DEV only). */
  debug?: boolean;
}

const RFXSupplierChat: React.FC<RFXSupplierChatProps> = ({
  rfxId,
  mode,
  isActive = true,
  suppliers,
  companyId,
  companyName,
  readOnly = false,
  allowUploads,
  debug = false,
}) => {
  const { toast } = useToast();
  const computedMode: 'buyer' | 'supplier' =
    mode || (suppliers && suppliers.length > 0 ? 'buyer' : 'supplier');

  // Call both hooks unconditionally (required by React rules). The "inactive" hook receives nulls and early-returns.
  const buyerCrypto = useRFXCrypto(computedMode === 'buyer' ? rfxId : null);
  const companyCrypto = useRFXCryptoForCompany(
    computedMode === 'supplier' ? rfxId : null,
    computedMode === 'supplier' ? companyId || null : null
  );

  const crypto = computedMode === 'buyer' ? buyerCrypto : companyCrypto;
  const { encrypt, decrypt, encryptFile, decryptFile } = crypto;
  const isCryptoReady = crypto.isReady;
  const isCryptoLoading = crypto.isLoading;
  const debugEnabled = !!debug && !!import.meta.env.DEV;

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const activeCompanyId = computedMode === 'buyer' ? selectedCompanyId : companyId || null;
  const selectedSupplier = useMemo(() => {
    if (computedMode === 'buyer') {
      return (suppliers || []).find((s) => s.companyId === selectedCompanyId) || null;
    }
    return activeCompanyId
      ? {
          invitationId: '',
          companyId: activeCompanyId,
          companyName: companyName || 'Supplier',
          companyLogo: null,
          companyWebsite: null,
        }
      : null;
  }, [computedMode, suppliers, selectedCompanyId, activeCompanyId, companyName]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ name: string; surname: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const [activeView, setActiveView] = useState<'chat' | 'qna'>('chat');
  const [focusQnaId, setFocusQnaId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('IDLE');
  
  // Track unread Q&A count for current company
  const { unreadCount: qnaUnreadCount, refetch: refetchQnaUnreadCount } = useRFXQnAUnreadCount(rfxId, activeCompanyId);
  
  // Track unread Q&A counts for all companies (buyer mode only)
  const { unreadCounts: qnaUnreadCounts, refetch: refetchQnaUnreadCounts } = useRFXQnAUnreadCounts(computedMode === 'buyer' ? rfxId : null);

  // Pending attachments (already encrypted+uploaded; only metadata persisted in DB)
  const [pendingImages, setPendingImages] = useState<MessageImage[]>([]);
  const [pendingDocuments, setPendingDocuments] = useState<MessageDocument[]>([]);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string } | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);
  // Debug: avoid spamming console on re-renders
  const loggedAttachmentKeysRef = useRef<Set<string>>(new Set());

  // pick first supplier by default
  useEffect(() => {
    if (computedMode !== 'buyer') return;
    const list = suppliers || [];
    if (!selectedCompanyId && list.length > 0) {
      setSelectedCompanyId(list[0].companyId);
    }
  }, [computedMode, suppliers, selectedCompanyId]);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user || null;
      setCurrentUserId(user?.id || null);
      if (!user) return;

      // Load unread counts
      if (rfxId) {
        const { data: counts } = await supabase.rpc('get_rfx_supplier_unread_counts', {
          p_rfx_id: rfxId
        });
        if (counts) {
          const map: Record<string, number> = {};
          (counts as any[]).forEach((c: any) => {
             map[c.company_id] = Number(c.unread_count);
          });
          setUnreadCounts(map);
        }
      }

      // Snapshot name/surname at send-time, but we also fetch it once for convenience.
      const { data: prof } = await supabase
        .from('app_user' as any)
        .select('name, surname')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      setCurrentUserProfile({
        name: String((prof as any)?.name || ''),
        surname: String((prof as any)?.surname || ''),
      });
    };
    loadUser();
  }, []);

  const canLoad = !!activeCompanyId && isCryptoReady;

  // Track whether the document/tab is visible (helps avoid marking as read in background tabs)
  const [isPageVisible, setIsPageVisible] = useState<boolean>(
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  );
  useEffect(() => {
    const onVisibility = () => setIsPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const shouldMarkAsRead = isActive && isPageVisible && activeView === 'chat' && !readOnly;

  const markAsRead = useCallback(async (companyIdToMark: string) => {
    if (!rfxId || !currentUserId) return;
    try {
      await supabase.from('rfx_chat_read_status' as any).upsert(
        {
          rfx_id: rfxId,
          supplier_company_id: companyIdToMark,
          user_id: currentUserId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'rfx_id, supplier_company_id, user_id' }
      );
      // Clear local count
      setUnreadCounts(prev => ({ ...prev, [companyIdToMark]: 0 }));
    } catch (err) {
      console.error('Failed to mark as read', err);
    }
  }, [rfxId, currentUserId]);

  const fetchMessages = useCallback(async () => {
    if (!canLoad) return;
    if (!activeCompanyId) return;

    setLoading(true);
    setError(null);
    try {
      // Only mark as read if the chat view is actually active/visible.
      if (shouldMarkAsRead) {
        markAsRead(activeCompanyId);
      }

      const { data, error: fetchError } = await supabase
        .from('rfx_supplier_chat_messages' as any)
        .select('*')
        .eq('rfx_id', rfxId)
        .eq('supplier_company_id', activeCompanyId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      const rows: DbChatMessage[] = (data || []) as any;

      const decrypted: ChatThreadMessage[] = await Promise.all(
        rows.map(async (row) => {
          const text = await decrypt(String(row.content_encrypted || ''));
          return {
            id: row.id,
            senderUserId: row.sender_user_id,
            senderDisplayRole: row.sender_display_role,
            senderDisplayName: row.sender_display_name,
            senderDisplaySurname: row.sender_display_surname,
            createdAt: row.created_at,
            text,
            attachments: Array.isArray((row as any).attachments) ? (row as any).attachments : [],
          };
        })
      );

      setMessages(decrypted);

      // Safety: if we loaded messages while active, mark read again to align with latest message timestamps.
      if (shouldMarkAsRead) {
        markAsRead(activeCompanyId);
      }
    } catch (err: any) {
      console.error('❌ [RFXSupplierChat] Failed to fetch messages:', err);
      setError(err?.message || 'Failed to load messages');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, activeCompanyId, rfxId, decrypt, markAsRead, shouldMarkAsRead]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime: refresh on inserts for this (rfx, company) thread
  useEffect(() => {
    if (!rfxId) return;

    const channel = supabase
      .channel(`rfx_supplier_chat_messages:${rfxId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rfx_supplier_chat_messages',
          filter: `rfx_id=eq.${rfxId}`,
        },
        async (payload) => {
          const row: any = payload.new;
          if (!row) return;

          const msgCompanyId = String(row.supplier_company_id);
          const isCurrentChat = activeCompanyId && msgCompanyId === String(activeCompanyId);

          if (isCurrentChat) {
            // If the chat UI isn't active/visible, don't treat this as read.
            // Instead, count it as unread so notifications + email logic can trigger.
            if (!shouldMarkAsRead) {
              if (row.sender_user_id !== currentUserId) {
                setUnreadCounts((prev) => ({
                  ...prev,
                  [msgCompanyId]: (prev[msgCompanyId] || 0) + 1,
                }));
              }
              return;
            }

            // Ignore own messages arriving via realtime to avoid duplication with optimistic UI updates.
            // The onSend function handles refreshing the list to canonicalize IDs.
            if (row.sender_user_id === currentUserId) return;

            // Decrypt and append immediately
            try {
              const text = await decrypt(String(row.content_encrypted || ''));
              const newMessage: ChatThreadMessage = {
                id: row.id,
                senderUserId: row.sender_user_id,
                senderDisplayRole: row.sender_display_role,
                senderDisplayName: row.sender_display_name,
                senderDisplaySurname: row.sender_display_surname,
                createdAt: row.created_at,
                text,
                attachments: Array.isArray(row.attachments) ? row.attachments : [],
              };
              
              setMessages(prev => {
                // Avoid duplicates if fetchMessages also ran
                if (prev.some(m => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
              });

              // Mark read again since we are looking at it
              if (shouldMarkAsRead) {
                markAsRead(activeCompanyId);
              }

            } catch (err) {
              console.error('Error decrypting realtime message', err);
            }
          } else {
            // Not current chat -> increment unread count
            // Only count if it's not our own message (edge case if we have multiple tabs open)
            if (row.sender_user_id !== currentUserId) {
                setUnreadCounts(prev => ({
                    ...prev,
                    [msgCompanyId]: (prev[msgCompanyId] || 0) + 1
                }));
            }
          }
        }
      )
      .subscribe((status) => {
        setRealtimeStatus(String(status));
        if (debugEnabled) {
          console.log('🔌 [RFXSupplierChat] realtime status:', status);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('⚠️ [RFXSupplierChat] realtime subscription issue:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, activeCompanyId, decrypt, currentUserId, markAsRead, shouldMarkAsRead, debugEnabled]);

  // Re-sync messages when the chat becomes active again (tab switch or returning to the browser tab).
  useEffect(() => {
    if (!isActive) return;
    if (!isPageVisible) return;
    if (activeView !== 'chat') return;
    fetchMessages();
  }, [isActive, isPageVisible, activeView, fetchMessages]);

  const uploadsEnabled =
    (allowUploads ?? (computedMode === 'buyer')) && !readOnly && !!encryptFile && isCryptoReady;

  const onFilesSelected = useCallback(
    async (files: FileList) => {
      if (!uploadsEnabled) return;
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;
      if (debugEnabled) {
        console.log('📎 [RFXSupplierChat] onFilesSelected:', {
          rfxId,
          activeCompanyId,
          mode: computedMode,
          count: fileArray.length,
          files: fileArray.map((f) => ({ name: f.name, size: f.size, type: f.type })),
        });
      }

      // Enforce per-message attachment count limit
      const existing = pendingImages.length + pendingDocuments.length;
      if (existing + fileArray.length > RFX_CHAT_STORAGE.MAX_ATTACHMENTS_PER_MESSAGE) {
        toast({
          title: 'Too many files',
          description: `Maximum ${RFX_CHAT_STORAGE.MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`,
          variant: 'destructive',
        });
        return;
      }

      setIsEncrypting(true);
      setUploadProgress({ done: 0, total: fileArray.length });
      try {
        const nextImages: MessageImage[] = [];
        const nextDocs: MessageDocument[] = [];

        let processed = 0;
        for (const f of fileArray) {
          if (debugEnabled) {
            console.log('🔐 [RFXSupplierChat] processing file:', { name: f.name, size: f.size, type: f.type });
          }
          if (f.size > RFX_CHAT_STORAGE.MAX_FILE_SIZE_BYTES) {
            toast({
              title: 'File too large',
              description: `${f.name} exceeds 5MB.`,
              variant: 'destructive',
            });
            if (debugEnabled) console.warn('⚠️ [RFXSupplierChat] file too large, skipping:', f.name);
            continue;
          }

          if (f.type?.startsWith('image/')) {
            const img = await encryptAndUploadImage(f, rfxId, encryptFile);
            nextImages.push(img);
          } else {
            const doc = await encryptAndUploadAttachment(f, rfxId, encryptFile);
            nextDocs.push(doc);
          }

          processed += 1;
          if (debugEnabled) console.log('✅ [RFXSupplierChat] processed:', processed, '/', fileArray.length);
          setUploadProgress({ done: processed, total: fileArray.length });
        }

        if (nextImages.length > 0) setPendingImages((prev) => [...prev, ...nextImages]);
        if (nextDocs.length > 0) setPendingDocuments((prev) => [...prev, ...nextDocs]);
        if (debugEnabled) {
          console.log('📎 [RFXSupplierChat] upload done. queued:', { images: nextImages.length, docs: nextDocs.length });
        }
      } catch (err: any) {
        console.error('❌ [RFXSupplierChat] Failed to encrypt/upload attachments:', err);
        toast({
          title: 'Upload failed',
          description: err?.message || 'Failed to encrypt/upload files',
          variant: 'destructive',
        });
      } finally {
        setIsEncrypting(false);
        setUploadProgress(null);
        if (debugEnabled) console.log('🏁 [RFXSupplierChat] finished upload flow');
      }
    },
    [
      uploadsEnabled,
      pendingImages.length,
      pendingDocuments.length,
      toast,
      rfxId,
      encryptFile,
      debugEnabled,
      activeCompanyId,
      computedMode,
    ]
  );

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removePendingDocument = useCallback((index: number) => {
    setPendingDocuments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const renderMessageExtra = useCallback(
    (m: ChatThreadMessage) => {
      const attachments: any[] = Array.isArray((m as any).attachments) ? ((m as any).attachments as any[]) : [];
      if (!attachments || attachments.length === 0) return null;

      return (
        <div className="space-y-2">
          {attachments.map((a, idx) => {
            const kind = String(a?.kind || 'file');
            if (kind === 'qna_reference') {
              const qnaId = String(a?.qnaId || a?.qna_id || a?.id || '');
              return (
                <button
                  key={`${m.id}_qna_${idx}`}
                  type="button"
                  className="w-full text-left rounded-lg border border-[#80c8f0]/40 bg-[#80c8f0]/10 px-3 py-2 hover:bg-[#80c8f0]/15 transition-colors"
                  onClick={() => {
                    if (!qnaId) return;
                    setActiveView('qna');
                    setFocusQnaId(qnaId);
                  }}
                >
                  <div className="text-xs font-semibold text-[#1A1F2C]">Q&amp;A reference</div>
                  <div className="text-[11px] text-gray-600">Click to open this question in the Q&amp;A view</div>
                </button>
              );
            }

            const filename = String(a?.filename || 'attachment');
            const encryptedUrl = String(a?.encryptedUrl || a?.url || '');
            const isImage = kind === 'image';

            // One-time debug log per attachment
            const debugKey = `${m.id}:${idx}:${filename}:${encryptedUrl}`;
            if (debugEnabled && !loggedAttachmentKeysRef.current.has(debugKey)) {
              loggedAttachmentKeysRef.current.add(debugKey);
              console.log('🧩 [RFXSupplierChat] attachment debug:', {
                messageId: m.id,
                idx,
                kind,
                filename,
                encryptedUrl,
                raw: a,
              });
            }

            return (
              <div key={`${m.id}_${idx}`} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#1A1F2C] truncate">{filename}</div>
                  <div className="text-[11px] text-gray-500">Encrypted attachment</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isImage && decryptFile && encryptedUrl && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-[#1A1F2C] hover:underline"
                      onClick={async () => {
                        try {
                          const url = await decryptImage(encryptedUrl, decryptFile);
                          setViewingImage({ url, title: filename });
                        } catch (err: any) {
                          toast({
                            title: 'Failed to view image',
                            description: err?.message || 'Could not decrypt image',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  )}

                  {!isImage && decryptFile && encryptedUrl && (
                    (() => {
                      const mt = String(
                        a?.mimeType ||
                          a?.mime_type ||
                          a?.format ||
                          a?.contentType ||
                          a?.content_type ||
                          ''
                      ).toLowerCase();
                      const lowerName = filename.toLowerCase();
                      const urlFileName = String(encryptedUrl || '')
                        .split('/')
                        .pop()
                        ?.split('?')[0]
                        ?.toLowerCase() || '';
                      const urlWithoutEnc = urlFileName.endsWith('.enc') ? urlFileName.slice(0, -4) : urlFileName;

                      const isPdf =
                        mt === 'application/pdf' ||
                        mt.includes('pdf') ||
                        lowerName.endsWith('.pdf') ||
                        lowerName.endsWith('.pdf.enc') ||
                        urlFileName.endsWith('.pdf') ||
                        urlFileName.endsWith('.pdf.enc') ||
                        urlWithoutEnc.endsWith('.pdf');

                      // Debug why PDF view might not show
                      const debugKey2 = `${debugKey}:pdfcheck`;
                      if (debugEnabled && !loggedAttachmentKeysRef.current.has(debugKey2)) {
                        loggedAttachmentKeysRef.current.add(debugKey2);
                        console.log('🧾 [RFXSupplierChat] pdf detection:', {
                          messageId: m.id,
                          idx,
                          mt,
                          lowerName,
                          urlFileName,
                          urlWithoutEnc,
                          isPdf,
                        });
                      }

                      if (!isPdf) return null;
                      return (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-[#1A1F2C] hover:underline"
                          onClick={async () => {
                            try {
                              const blob = await decryptDocument(encryptedUrl, decryptFile);
                              const url = URL.createObjectURL(blob);
                              setViewingPdf({ url, title: filename.endsWith('.enc') ? filename.slice(0, -4) : filename });
                            } catch (err: any) {
                              toast({
                                title: 'Failed to view PDF',
                                description: err?.message || 'Could not decrypt PDF',
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      );
                    })()
                  )}

                  {decryptFile && encryptedUrl && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-[#1A1F2C] hover:underline"
                      onClick={async () => {
                        try {
                          await downloadDecryptedDocument(encryptedUrl, filename, decryptFile);
                        } catch (err: any) {
                          toast({
                            title: 'Download failed',
                            description: err?.message || 'Could not decrypt/download file',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    },
    [decryptFile, toast, debugEnabled]
  );

  const sendQnaReferenceToChat = useCallback(
    async (qnaId: string) => {
      if (readOnly) return;
      if (computedMode !== 'buyer') throw new Error('Only buyers can move Q&A to chat');
      if (!activeCompanyId) throw new Error('No supplier selected');
      if (!qnaId) throw new Error('Missing Q&A id');

      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!user) throw new Error('You must be logged in');

        const { data: prof } = await supabase
          .from('app_user' as any)
          .select('name, surname')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        const name = String((prof as any)?.name || currentUserProfile?.name || '');
        const surname = String((prof as any)?.surname || currentUserProfile?.surname || '');

        const senderRole = 'RFX member - buyer';
        const senderKind = 'buyer';

        const text = '📌 Q&A moved to chat';
        const encrypted = await encrypt(text);

        const attachmentsPayload = [
          {
            kind: 'qna_reference',
            qnaId,
            createdAt: new Date().toISOString(),
          },
        ];

        // Optimistic append
        const tempId = `tmp_qna_${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: tempId,
            senderUserId: user.id,
            senderDisplayRole: senderRole,
            senderDisplayName: name,
            senderDisplaySurname: surname,
            createdAt: new Date().toISOString(),
            text,
            attachments: attachmentsPayload,
          },
        ]);

        const { error: insertError } = await supabase.from('rfx_supplier_chat_messages' as any).insert({
          rfx_id: rfxId,
          supplier_company_id: activeCompanyId,
          sender_user_id: user.id,
          sender_kind: senderKind,
          sender_display_role: senderRole,
          sender_display_name: name,
          sender_display_surname: surname,
          content_encrypted: encrypted,
          attachments: attachmentsPayload,
        } as any);

        if (insertError) throw insertError;
        await fetchMessages();
      } catch (err) {
        // Roll back any optimistic message by reloading canonical data
        await fetchMessages();
        throw err;
      }
    },
    [activeCompanyId, computedMode, currentUserProfile, encrypt, fetchMessages, readOnly, rfxId]
  );

  const viewToggle = useMemo(() => {
    return (
      <ToggleGroup
        type="single"
        value={activeView}
        onValueChange={(v) => {
          const next = (v || '').trim() as 'chat' | 'qna' | '';
          if (!next) return;
          setActiveView(next);
          if (next !== 'qna') {
            setFocusQnaId(null);
          } else {
            // When switching to Q&A view, refresh the unread count immediately
            refetchQnaUnreadCount();
            if (computedMode === 'buyer') {
              refetchQnaUnreadCounts();
            }
          }
        }}
        variant="outline"
        size="sm"
        className="gap-0 bg-white border border-gray-200 rounded-lg p-0.5"
      >
        <ToggleGroupItem
          value="chat"
          className="h-8 px-3 rounded-md data-[state=on]:bg-[#80c8f0]/25 data-[state=on]:text-[#1A1F2C]"
        >
          Chat
        </ToggleGroupItem>
        <ToggleGroupItem
          value="qna"
          className="h-8 px-3 rounded-md data-[state=on]:bg-[#80c8f0]/25 data-[state=on]:text-[#1A1F2C] relative"
        >
          Q&amp;A
          {qnaUnreadCount > 0 && (
            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
              {qnaUnreadCount > 9 ? '9+' : qnaUnreadCount}
            </div>
          )}
        </ToggleGroupItem>
      </ToggleGroup>
    );
  }, [activeView, qnaUnreadCount, refetchQnaUnreadCount, refetchQnaUnreadCounts, computedMode]);

  const onSend = useCallback(async () => {
    if (readOnly) return;
    if (!activeCompanyId) return;
    const text = draft.trim();
    const hasAttachments = pendingImages.length > 0 || pendingDocuments.length > 0;
    if (!text && !hasAttachments) return;

    setSending(true);
    setError(null);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) throw new Error('You must be logged in');

      // Fetch profile again right before send to ensure we persist current display fields
      const { data: prof } = await supabase
        .from('app_user' as any)
        .select('name, surname')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const name = String((prof as any)?.name || currentUserProfile?.name || '');
      const surname = String((prof as any)?.surname || currentUserProfile?.surname || '');

      const encrypted = await encrypt(text);

      const attachmentsPayload = [
        ...pendingImages.map((img) => ({
          kind: 'image',
          filename: img.filename,
          encryptedUrl: (img.metadata as any).encryptedUrl || '',
          size: img.metadata.size,
          mimeType: img.metadata.format || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        })),
        ...pendingDocuments.map((doc) => ({
          kind: 'file',
          filename: doc.filename,
          encryptedUrl: (doc.metadata as any).encryptedUrl || doc.url || '',
          size: doc.metadata.size,
          mimeType: doc.metadata.format || 'application/octet-stream',
          uploadedAt: doc.metadata.uploadedAt || new Date().toISOString(),
        })),
      ];

      const senderKind = computedMode === 'buyer' ? 'buyer' : 'supplier';
      const senderRole =
        computedMode === 'buyer' ? 'RFX member - buyer' : 'Supplier member - supplier';

      // Optimistic append
      const tempId = `tmp_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          senderUserId: user.id,
          senderDisplayRole: senderRole,
          senderDisplayName: name,
          senderDisplaySurname: surname,
          createdAt: new Date().toISOString(),
          text,
          attachments: attachmentsPayload,
        },
      ]);

      const { error: insertError } = await supabase
        .from('rfx_supplier_chat_messages' as any)
        .insert({
          rfx_id: rfxId,
          supplier_company_id: activeCompanyId,
          sender_user_id: user.id,
          sender_kind: senderKind,
          sender_display_role: senderRole,
          sender_display_name: name,
          sender_display_surname: surname,
          content_encrypted: encrypted,
          attachments: attachmentsPayload,
        } as any);

      if (insertError) throw insertError;

      setDraft('');
      setPendingImages([]);
      setPendingDocuments([]);
      // Re-fetch so IDs/order are canonical
      await fetchMessages();
    } catch (err: any) {
      console.error('❌ [RFXSupplierChat] Failed to send message:', err);
      setError(err?.message || 'Failed to send message');
      // Rollback optimistic message by reloading
      await fetchMessages();
    } finally {
      setSending(false);
    }
  }, [
    readOnly,
    activeCompanyId,
    draft,
    rfxId,
    encrypt,
    fetchMessages,
    currentUserProfile,
    pendingImages,
    pendingDocuments,
    computedMode,
  ]);

  if (computedMode === 'buyer' && (!suppliers || suppliers.length === 0)) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No suppliers available for chat yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-12 gap-4">
        {/* Left: supplier list (buyer mode only) */}
        {computedMode === 'buyer' && (
          <div className="col-span-3">
            <Card className="h-[70vh] overflow-hidden">
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-[#f1f1f1]">
                  <div className="text-sm font-semibold text-[#1A1F2C]">Supplier chats</div>
                  <div className="text-xs text-gray-600">Select a supplier to message</div>
                </div>
                <div className="overflow-y-auto h-[calc(70vh-52px)]">
                  {(suppliers || []).map((s) => {
                    const isSelected = s.companyId === selectedCompanyId;
                    const unread = unreadCounts[s.companyId] || 0;
                    const qnaUnread = qnaUnreadCounts[s.companyId] || 0;
                    const hasAnyUnread = unread > 0 || qnaUnread > 0;
                    
                    return (
                      <button
                        key={s.companyId}
                        onClick={() => setSelectedCompanyId(s.companyId)}
                        className={`w-full px-4 py-3 flex items-center gap-3 border-b text-left hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-[#80c8f0]/10' : ''
                        }`}
                      >
                        <div className="relative">
                          <SmartLogo
                            logoUrl={s.companyLogo}
                            websiteUrl={s.companyWebsite}
                            companyName={s.companyName}
                            size="sm"
                            className="rounded-xl"
                            isSupplierRoute={true}
                          />
                          {unread > 0 && (
                            <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                              {unread > 9 ? '9+' : unread}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                             <div className="text-sm font-medium text-[#1A1F2C] truncate">{s.companyName}</div>
                             {hasAnyUnread && (
                                <span className="h-2 w-2 rounded-full bg-red-500 shrink-0"></span>
                             )}
                          </div>
                          <div className="flex items-center gap-2 text-xs truncate">
                            {unread > 0 && (
                              <span className={`${hasAnyUnread ? 'text-[#1A1F2C] font-medium' : 'text-gray-600'}`}>
                                {unread} new message{unread > 1 ? 's' : ''}
                              </span>
                            )}
                            {qnaUnread > 0 && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-[#7de19a] text-[#1A1F2C] hover:bg-[#7de19a]">
                                {qnaUnread} Q&A
                              </Badge>
                            )}
                            {!hasAnyUnread && (
                              <span className="text-gray-600 truncate">{s.companyId}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      {/* Right: chat thread */}
      <div className={computedMode === 'buyer' ? 'col-span-9' : 'col-span-12'}>
        {!isCryptoReady && (
          <div className="h-[70vh] flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b bg-[#f1f1f1] flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[#1A1F2C]">
                {activeView === 'chat' ? 'Chat' : 'Questions & Answers'}
              </div>
              {viewToggle}
            </div>
            <div className="flex-1 flex items-center justify-center gap-3 text-sm text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin text-[#80c8f0]" />
              Loading encryption keys...
            </div>
          </div>
        )}

        {isCryptoReady && activeView === 'chat' && (
          <ChatThread
            currentUserId={currentUserId}
            title={computedMode === 'buyer' ? (selectedSupplier ? selectedSupplier.companyName : 'Chat') : 'Chat with buyer'}
            subtitle="Messages are encrypted with the RFX symmetric key."
            headerRight={viewToggle}
            messages={messages}
            isLoading={loading || isCryptoLoading}
            error={error}
            draft={draft}
            onDraftChange={setDraft}
            onSend={onSend}
            isSending={sending}
            readOnly={readOnly}
            canSend={draft.trim().length > 0 || pendingImages.length > 0 || pendingDocuments.length > 0}
            renderMessageExtra={renderMessageExtra}
            onFilesSelected={uploadsEnabled ? onFilesSelected : undefined}
            isUploading={isEncrypting}
            uploadPreview={
              <RFXFileUploadPreview
                images={pendingImages}
                documents={pendingDocuments}
                onRemoveImage={removePendingImage}
                onRemoveDocument={removePendingDocument}
                disabled={sending || readOnly}
                isEncrypting={isEncrypting}
                progressPercent={
                  uploadProgress ? (uploadProgress.total > 0 ? (uploadProgress.done / uploadProgress.total) * 100 : 0) : null
                }
                progressLabel={uploadProgress ? `${uploadProgress.done}/${uploadProgress.total}` : null}
              />
            }
          />
        )}

        {isCryptoReady && activeView === 'qna' && activeCompanyId && (
          <RFXSupplierQnA
            rfxId={rfxId}
            companyId={activeCompanyId}
            mode={computedMode}
            readOnly={readOnly}
            isCryptoReady={isCryptoReady}
            isCryptoLoading={isCryptoLoading}
            encrypt={encrypt}
            decrypt={decrypt}
            headerRight={viewToggle}
            focusQnaId={focusQnaId}
            onMoveToChat={computedMode === 'buyer' ? sendQnaReferenceToChat : undefined}
            onMarkAsRead={() => {
              refetchQnaUnreadCount();
              if (computedMode === 'buyer') {
                refetchQnaUnreadCounts();
              }
            }}
          />
        )}
      </div>
      </div>

      <Dialog
        open={!!viewingImage}
        onOpenChange={(open) => {
          if (!open && viewingImage?.url) {
            try {
              URL.revokeObjectURL(viewingImage.url);
            } catch {
              // ignore
            }
          }
          if (!open) setViewingImage(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{viewingImage?.title || 'Image'}</DialogTitle>
          </DialogHeader>
          {viewingImage?.url && (
            <div className="w-full max-h-[70vh] overflow-auto">
              <img src={viewingImage.url} alt={viewingImage.title} className="max-w-full h-auto" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewingPdf}
        onOpenChange={(open) => {
          if (!open && viewingPdf?.url) {
            try {
              URL.revokeObjectURL(viewingPdf.url);
            } catch {
              // ignore
            }
          }
          if (!open) setViewingPdf(null);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{viewingPdf?.title || 'PDF'}</DialogTitle>
          </DialogHeader>
          {viewingPdf?.url && (
            <iframe
              src={viewingPdf.url}
              className="w-full h-[70vh] rounded-lg border"
              title={viewingPdf.title}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RFXSupplierChat;


