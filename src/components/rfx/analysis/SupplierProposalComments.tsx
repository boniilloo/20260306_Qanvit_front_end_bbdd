import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useRFXCrypto } from '@/hooks/useRFXCrypto';
import MarkdownText from './MarkdownText';

type AuthorInfo = {
  auth_user_id: string;
  email: string;
  name: string;
  surname: string;
  avatar_url: string | null;
};

type CommentRow = {
  id: string;
  rfx_id: string;
  supplier_company_id: string;
  author_id: string;
  comment_encrypted: string;
  created_at: string;
};

type UIComment = {
  id: string;
  authorId: string;
  createdAt: string;
  text: string;
  author?: AuthorInfo;
};

interface SupplierProposalCommentsProps {
  rfxId: string;
  supplierCompanyId: string | null | undefined;
  readOnly?: boolean;
  onCommentCreated?: () => void;
}

const formatName = (author?: AuthorInfo) => {
  const full = [author?.name, author?.surname].filter(Boolean).join(' ').trim();
  return full.length > 0 ? full : 'Member';
};

const formatEmail = (author?: AuthorInfo) => {
  const email = (author?.email || '').trim();
  return email.length > 0 ? email : 'Email not available';
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const SupplierProposalComments: React.FC<SupplierProposalCommentsProps> = ({
  rfxId,
  supplierCompanyId,
  readOnly = false,
  onCommentCreated,
}) => {
  const { decrypt, encrypt, isReady: isCryptoReady } = useRFXCrypto(rfxId);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<UIComment[]>([]);
  const [draft, setDraft] = useState('');

  const canLoad = !!rfxId && !!supplierCompanyId && isCryptoReady;

  const authorIds = useMemo(() => {
    return Array.from(new Set(comments.map((c) => c.authorId))).filter(Boolean);
  }, [comments]);

  const hydrateAuthors = useCallback(
    async (rows: UIComment[]) => {
      const ids = Array.from(new Set(rows.map((r) => r.authorId))).filter(Boolean);
      if (ids.length === 0) return rows;

      const { data, error: rpcError } = await supabase.rpc(
        'get_rfx_comment_authors_info' as any,
        {
          p_rfx_id: rfxId,
          p_user_ids: ids,
        } as any
      );

      if (rpcError) {
        console.warn('⚠️ [SupplierProposalComments] Failed to load author info:', rpcError);
        return rows;
      }

      const map = new Map<string, AuthorInfo>();
      (data || []).forEach((a: any) => {
        map.set(String(a.auth_user_id), {
          auth_user_id: String(a.auth_user_id),
          email: String(a.email || ''),
          name: String(a.name || ''),
          surname: String(a.surname || ''),
          avatar_url: a.avatar_url ?? null,
        });
      });

      return rows.map((r) => ({ ...r, author: map.get(r.authorId) }));
    },
    [rfxId]
  );

  const fetchComments = useCallback(async () => {
    if (!canLoad) return;
    if (!supplierCompanyId) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('rfx_analysis_supplier_comments' as any)
        .select('id, rfx_id, supplier_company_id, author_id, comment_encrypted, created_at')
        .eq('rfx_id', rfxId)
        .eq('supplier_company_id', supplierCompanyId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      const rows: CommentRow[] = (data || []) as any;

      const decryptedRows: UIComment[] = await Promise.all(
        rows.map(async (row) => {
          const text = await decrypt(String(row.comment_encrypted || ''));
          return {
            id: row.id,
            authorId: row.author_id,
            createdAt: row.created_at,
            text,
          };
        })
      );

      const withAuthors = await hydrateAuthors(decryptedRows);
      setComments(withAuthors);
    } catch (err: any) {
      console.error('❌ [SupplierProposalComments] Failed to fetch comments:', err);
      setError(err?.message || 'Failed to load comments');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [canLoad, supplierCompanyId, rfxId, decrypt, hydrateAuthors]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Real-time subscription to keep comments fresh for all members
  useEffect(() => {
    if (!supplierCompanyId || !rfxId) return;

    const channel = supabase
      .channel(`rfx_analysis_supplier_comments:${rfxId}:${supplierCompanyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfx_analysis_supplier_comments',
          filter: `rfx_id=eq.${rfxId}`,
        },
        (payload) => {
          const row: any = payload?.new || payload?.old;
          if (row && String(row.supplier_company_id) !== String(supplierCompanyId)) return;
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rfxId, supplierCompanyId, fetchComments]);

  const onSend = useCallback(async () => {
    if (readOnly) return;
    if (!supplierCompanyId) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error('You must be logged in');

      const encrypted = await encrypt(text);
      const { error: insertError } = await supabase
        .from('rfx_analysis_supplier_comments' as any)
        .insert({
          rfx_id: rfxId,
          supplier_company_id: supplierCompanyId,
          author_id: userId,
          comment_encrypted: encrypted,
        } as any);

      if (insertError) throw insertError;

      setDraft('');
      onCommentCreated?.();
      await fetchComments();
    } catch (err: any) {
      console.error('❌ [SupplierProposalComments] Failed to send comment:', err);
      setError(err?.message || 'Failed to send comment');
    } finally {
      setSending(false);
    }
  }, [readOnly, supplierCompanyId, draft, rfxId, encrypt, fetchComments, onCommentCreated]);

  if (!supplierCompanyId) return null;

  return (
    <Card className="border-[#f4a9aa]/30">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#22183a]">Comments</h3>
            <p className="text-xs text-gray-500">
              Visible to RFX members. Stored encrypted with the RFX symmetric key.
            </p>
          </div>
          <div className="text-xs text-gray-500">
            {authorIds.length > 0 ? `${comments.length} total` : `${comments.length} total`}
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin text-[#f4a9aa]" />
            Loading comments...
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && comments.length === 0 && (
          <div className="text-sm text-gray-600 bg-[#f1f1f1] rounded-lg p-3">
            No comments yet. Add the first one below.
          </div>
        )}

        {comments.length > 0 && (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="text-sm font-medium text-[#22183a]">
                    {formatName(c.author)} ({formatEmail(c.author)})
                  </div>
                  <div className="text-xs text-gray-500">{formatDate(c.createdAt)}</div>
                </div>
                <div className="text-sm text-gray-800">
                  <MarkdownText>{c.text}</MarkdownText>
                </div>
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a comment for this supplier proposal..."
              className="focus-visible:ring-[#f4a9aa]/60"
              disabled={sending}
            />
            <div className="flex justify-end">
              <Button
                onClick={onSend}
                disabled={sending || draft.trim().length === 0}
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SupplierProposalComments;


