import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import MarkdownText from '@/components/rfx/supplier-qna/MarkdownText';

type DbQnaRow = {
  id: string;
  rfx_id: string;
  supplier_company_id: string;
  category?: string | null;
  asked_by_user_id: string;
  asked_display_role: string;
  asked_display_name: string;
  asked_display_surname: string;
  question_encrypted: string;
  answer_encrypted?: string | null;
  answered_by_user_id?: string | null;
  answered_display_role?: string | null;
  answered_display_name?: string | null;
  answered_display_surname?: string | null;
  created_at: string;
  answered_at?: string | null;
};

type QnaItem = {
  id: string;
  category: string;
  askedByUserId: string;
  askedDisplayRole: string;
  askedDisplayName: string;
  askedDisplaySurname: string;
  askedAt: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  answeredByUserId: string | null;
  answeredDisplayRole: string | null;
  answeredDisplayName: string | null;
  answeredDisplaySurname: string | null;
};

const questionSchema = z
  .string()
  .trim()
  .min(3, 'Write a slightly more detailed question.')
  .max(4000, 'Question is too long.');

const answerSchema = z.string().trim().min(1, 'Answer cannot be empty.').max(8000, 'Answer is too long.');

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};

const displayPerson = (name?: string | null, surname?: string | null, role?: string | null) => {
  const full = `${name || ''} ${surname || ''}`.trim();
  const r = (role || '').trim();
  return r ? `${full} • ${r}` : full || 'Unknown';
};

interface RFXSupplierQnAProps {
  rfxId: string;
  companyId: string;
  mode: 'buyer' | 'supplier';
  readOnly?: boolean;
  isCryptoReady: boolean;
  isCryptoLoading?: boolean;
  encrypt: (plainText: string) => Promise<string>;
  decrypt: (encryptedText: string) => Promise<string>;
  headerRight?: React.ReactNode;
  /** When set, auto-scrolls to this Q&A item and highlights it */
  focusQnaId?: string | null;
  /** Buyer-only: send a reference of this Q&A to the normal chat */
  onMoveToChat?: (qnaId: string) => Promise<void>;
  /** Callback to refresh unread counts after marking as read */
  onMarkAsRead?: () => void;
}

const RFXSupplierQnA: React.FC<RFXSupplierQnAProps> = ({
  rfxId,
  companyId,
  mode,
  readOnly = false,
  isCryptoReady,
  isCryptoLoading = false,
  encrypt,
  decrypt,
  headerRight,
  focusQnaId,
  onMoveToChat,
  onMarkAsRead,
}) => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QnaItem[]>([]);

  const [questionDraft, setQuestionDraft] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const canAsk = mode === 'buyer' && !readOnly;
  const canAnswer = mode === 'supplier' && !readOnly;
  const canLoad = !!rfxId && !!companyId && isCryptoReady;

  // Track which items have been viewed by the current user
  const [viewedItems, setViewedItems] = useState<Set<string>>(new Set());

  // Mark a Q&A item as read
  const markAsRead = useCallback(async (qnaId: string) => {
    if (!rfxId || !companyId) return;
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) return;

      await supabase.from('rfx_qna_read_status' as any).upsert(
        {
          rfx_id: rfxId,
          supplier_company_id: companyId,
          user_id: user.id,
          qna_id: qnaId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'qna_id, user_id' }
      );

      setViewedItems((prev) => new Set(prev).add(qnaId));
      
      // Notify parent to refresh unread count
      if (onMarkAsRead) {
        onMarkAsRead();
      }
    } catch (err) {
      console.error('Failed to mark Q&A as read:', err);
    }
  }, [rfxId, companyId, onMarkAsRead]);

  const fetchQna = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('rfx_supplier_qna' as any)
        .select('*')
        .eq('rfx_id', rfxId)
        .eq('supplier_company_id', companyId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      const rows: DbQnaRow[] = (data || []) as any;

      const decrypted: QnaItem[] = await Promise.all(
        rows.map(async (row) => {
          const question = await decrypt(String(row.question_encrypted || ''));
          const answer = row.answer_encrypted ? await decrypt(String(row.answer_encrypted)) : null;
          return {
            id: row.id,
            category: String(row.category || 'Other'),
            askedByUserId: row.asked_by_user_id,
            askedDisplayRole: row.asked_display_role,
            askedDisplayName: row.asked_display_name,
            askedDisplaySurname: row.asked_display_surname,
            askedAt: row.created_at,
            question,
            answer,
            answeredAt: row.answered_at || null,
            answeredByUserId: row.answered_by_user_id || null,
            answeredDisplayRole: row.answered_display_role || null,
            answeredDisplayName: row.answered_display_name || null,
            answeredDisplaySurname: row.answered_display_surname || null,
          };
        })
      );

      setItems(decrypted);

      // Load read status for all items
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (user) {
        const { data: readStatus } = await supabase
          .from('rfx_qna_read_status' as any)
          .select('qna_id')
          .eq('rfx_id', rfxId)
          .eq('supplier_company_id', companyId)
          .eq('user_id', user.id);

        if (readStatus) {
          const readIds = new Set((readStatus as any[]).map((r: any) => r.qna_id));
          setViewedItems(readIds);
        }
      }
    } catch (err: any) {
      console.error('❌ [RFXSupplierQnA] Failed to fetch Q&A:', err);
      setError(err?.message || 'Failed to load Q&A');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, companyId, rfxId, decrypt]);

  useEffect(() => {
    fetchQna();
  }, [fetchQna]);

  // Realtime refresh
  useEffect(() => {
    if (!rfxId || !companyId) return;
    const channel = supabase
      .channel(`rfx_supplier_qna:${rfxId}:${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rfx_supplier_qna', filter: `rfx_id=eq.${rfxId}` },
        (payload) => {
          const row: any = payload?.new || payload?.old;
          if (row && String(row.supplier_company_id) !== String(companyId)) return;
          fetchQna();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, companyId, fetchQna]);

  // Focus/highlight
  useEffect(() => {
    if (!focusQnaId) return;
    const el = itemRefs.current[focusQnaId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(focusQnaId);
    const t = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(t);
  }, [focusQnaId, items.length]);

  // Mark items as read when they're visible and meet conditions
  useEffect(() => {
    if (!canLoad || items.length === 0) return;
    
    const markItemsAsRead = async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) return;

      // Mark items as read based on role
      items.forEach((item) => {
        // Skip if already viewed
        if (viewedItems.has(item.id)) return;

        // For buyers: mark as read if answered
        // For suppliers: mark as read when shown (unanswered questions)
        const shouldMarkRead = 
          (mode === 'buyer' && item.answer !== null) ||
          (mode === 'supplier' && item.answer === null);

        if (shouldMarkRead) {
          markAsRead(item.id);
        }
      });
    };

    markItemsAsRead();
  }, [items, canLoad, mode, viewedItems, markAsRead]);

  const onAsk = useCallback(async () => {
    if (!canAsk) return;
    if (!canLoad) return;
    const parsed = questionSchema.safeParse(questionDraft);
    if (!parsed.success) {
      toast({ title: 'Invalid question', description: parsed.error.issues[0]?.message || 'Invalid', variant: 'destructive' });
      return;
    }

    setSending('ask');
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) throw new Error('You must be logged in');

      const { data: prof } = await supabase
        .from('app_user' as any)
        .select('name, surname')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const name = String((prof as any)?.name || '');
      const surname = String((prof as any)?.surname || '');

      const encrypted = await encrypt(parsed.data);

      const { error: insertError } = await supabase.from('rfx_supplier_qna' as any).insert({
        rfx_id: rfxId,
        supplier_company_id: companyId,
        asked_by_user_id: user.id,
        asked_display_role: 'RFX member - buyer',
        asked_display_name: name,
        asked_display_surname: surname,
        question_encrypted: encrypted,
      } as any);

      if (insertError) throw insertError;
      setQuestionDraft('');
      await fetchQna();
    } catch (err: any) {
      console.error('❌ [RFXSupplierQnA] Failed to ask question:', err);
      toast({ title: 'Failed to ask', description: err?.message || 'Could not create question', variant: 'destructive' });
    } finally {
      setSending(null);
    }
  }, [canAsk, canLoad, companyId, encrypt, fetchQna, questionDraft, rfxId, toast]);

  const onAnswer = useCallback(
    async (qnaId: string) => {
      if (!canAnswer) return;
      if (!canLoad) return;
      const draft = String(answerDrafts[qnaId] || '');
      const parsed = answerSchema.safeParse(draft);
      if (!parsed.success) {
        toast({ title: 'Invalid answer', description: parsed.error.issues[0]?.message || 'Invalid', variant: 'destructive' });
        return;
      }

      setSending(qnaId);
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!user) throw new Error('You must be logged in');

        const { data: prof } = await supabase
          .from('app_user' as any)
          .select('name, surname')
          .eq('auth_user_id', user.id)
          .maybeSingle();

        const name = String((prof as any)?.name || '');
        const surname = String((prof as any)?.surname || '');

        const encrypted = await encrypt(parsed.data);

        const { error: updError } = await supabase
          .from('rfx_supplier_qna' as any)
          .update({
            answer_encrypted: encrypted,
            answered_by_user_id: user.id,
            answered_display_role: 'Supplier member - supplier',
            answered_display_name: name,
            answered_display_surname: surname,
            answered_at: new Date().toISOString(),
          } as any)
          .eq('id', qnaId);

        if (updError) throw updError;

        setAnswerDrafts((prev) => ({ ...prev, [qnaId]: '' }));
        await fetchQna();
      } catch (err: any) {
        console.error('❌ [RFXSupplierQnA] Failed to answer:', err);
        toast({ title: 'Failed to answer', description: err?.message || 'Could not save answer', variant: 'destructive' });
      } finally {
        setSending(null);
      }
    },
    [answerDrafts, canAnswer, canLoad, encrypt, fetchQna, toast]
  );

  const subtitle = useMemo(() => {
    if (mode === 'buyer') return 'Ask questions to this supplier. Messages are encrypted with the RFX symmetric key.';
    return 'Answer buyer questions. Messages are encrypted with the RFX symmetric key.';
  }, [mode]);

  return (
    <div className="h-[70vh] flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b bg-[#f1f1f1]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#22183a] truncate">Questions &amp; Answers</div>
            <div className="text-xs text-gray-600">{subtitle}</div>
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
        {!isCryptoReady && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin text-[#f4a9aa]" />
            Loading encryption keys...
          </div>
        )}

        {isCryptoReady && (loading || isCryptoLoading) && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin text-[#f4a9aa]" />
            Loading Q&amp;A...
          </div>
        )}

        {isCryptoReady && error && <div className="text-sm text-red-600">{error}</div>}

        {isCryptoReady && canAsk && (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#22183a] mb-2">
              <MessageSquarePlus className="h-4 w-4 text-[#f4a9aa]" />
              New question
            </div>
            <Textarea
              value={questionDraft}
              onChange={(e) => setQuestionDraft(e.target.value)}
              placeholder="Write your question (only buyers can ask here)..."
              className="min-h-[80px] max-h-[180px] focus-visible:ring-[#f4a9aa]/60"
              disabled={sending === 'ask'}
            />
            <div className="mt-2 flex justify-end">
              <Button
                onClick={onAsk}
                disabled={sending === 'ask' || questionDraft.trim().length === 0}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {sending === 'ask' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Ask
              </Button>
            </div>
          </div>
        )}

        {isCryptoReady && !loading && !error && items.length === 0 && (
          <div className="text-sm text-gray-600 bg-[#f1f1f1] rounded-lg p-3">No questions yet.</div>
        )}

        {isCryptoReady &&
          items.map((q) => {
            const isHighlighted = highlightId === q.id;
            // Check if this question has been answered (regardless of who answered it)
            const isAnswered = q.answer !== null && q.answer.trim().length > 0;

            // Determine border style
            let borderClass = 'border-gray-200';
            let borderWidth = 'border';
            
            if (isHighlighted) {
              borderClass = 'border-[#f4a9aa]';
            } else if (isAnswered) {
              // Green border for all answered questions
              borderClass = 'border-[#f4a9aa]';
              borderWidth = 'border-2';
            }
            
            return (
              <div
                key={q.id}
                ref={(el) => {
                  itemRefs.current[q.id] = el;
                }}
                className={`rounded-2xl ${borderWidth} ${borderClass} px-4 py-3 transition-colors ${
                  isHighlighted ? 'bg-[#f4a9aa]/10' : 'bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-700 truncate">
                      {displayPerson(q.askedDisplayName, q.askedDisplaySurname, q.askedDisplayRole)}
                    </div>
                    <div className="text-[11px] text-gray-500">{formatDate(q.askedAt)}</div>
                  </div>
                  {mode === 'buyer' && !readOnly && onMoveToChat && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-gray-200 text-[#22183a] hover:bg-[#f1f1f1]"
                      onClick={async () => {
                        try {
                          setSending(`move:${q.id}`);
                          await onMoveToChat(q.id);
                          toast({ title: 'Sent to chat', description: 'A reference to this Q&A was added to the chat.' });
                        } catch (err: any) {
                          toast({
                            title: 'Failed to send to chat',
                            description: err?.message || 'Could not create chat reference',
                            variant: 'destructive',
                          });
                        } finally {
                          setSending(null);
                        }
                      }}
                      disabled={sending === `move:${q.id}`}
                    >
                      {sending === `move:${q.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Move to chat'}
                    </Button>
                  )}
                </div>

                <div className="mt-2 text-sm text-[#22183a]">
                  <MarkdownText>{q.question}</MarkdownText>
                </div>

                <div className="mt-3 rounded-xl border border-gray-200 bg-[#f1f1f1] px-3 py-2">
                  {q.answer ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-700 truncate">
                            {displayPerson(q.answeredDisplayName, q.answeredDisplaySurname, q.answeredDisplayRole)}
                          </div>
                          {q.answeredAt && <div className="text-[11px] text-gray-500">{formatDate(q.answeredAt)}</div>}
                        </div>
                      </div>
                      <div className="mt-1 text-sm text-[#22183a]">
                        <MarkdownText>{q.answer}</MarkdownText>
                      </div>
                    </>
                  ) : canAnswer ? (
                    <>
                      <Textarea
                        value={answerDrafts[q.id] || ''}
                        onChange={(e) => setAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Write an answer (only suppliers can answer here)..."
                        className="min-h-[64px] max-h-[180px] focus-visible:ring-[#f4a9aa]/60 bg-white"
                        disabled={sending === q.id}
                      />
                      <div className="mt-2 flex justify-end">
                        <Button
                          onClick={() => onAnswer(q.id)}
                          disabled={sending === q.id || (answerDrafts[q.id] || '').trim().length === 0}
                          className="bg-[#f4a9aa] hover:bg-[#f4a9aa]/90 text-[#22183a]"
                        >
                          {sending === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                          Answer
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-600">Waiting for supplier answer.</div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default RFXSupplierQnA;


