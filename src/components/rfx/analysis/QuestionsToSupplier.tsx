import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';
import { ChevronDown, Loader2, RotateCcw, Plus, Send } from 'lucide-react';
import MarkdownText from './MarkdownText';

interface QuestionsToSupplierProps {
  questions: string[];
  rfxId: string;
  supplierCompanyId: string;
  readOnly?: boolean;
  isCryptoReady?: boolean;
  isCryptoLoading?: boolean;
  encrypt?: (plainText: string) => Promise<string>;
}

const CATEGORIES = [
  'Technical fit',
  'Commercial & Pricing',
  'Schedule & Lead time',
  'Quality & Compliance',
  'Documentation & Training',
  'Warranty & Support',
  'Other',
] as const;

type Category = string;

const categorizeQuestion = (question: string): string => {
  const lowerQuestion = question.toLowerCase();
  if (
    lowerQuestion.includes('performance') ||
    lowerQuestion.includes('technical') ||
    lowerQuestion.includes('interface') ||
    lowerQuestion.includes('detection') ||
    lowerQuestion.includes('system')
  ) {
    return 'Technical fit';
  }
  if (
    lowerQuestion.includes('price') ||
    lowerQuestion.includes('cost') ||
    lowerQuestion.includes('currency') ||
    lowerQuestion.includes('payment') ||
    lowerQuestion.includes('tco')
  ) {
    return 'Commercial & Pricing';
  }
  if (
    lowerQuestion.includes('lead time') ||
    lowerQuestion.includes('schedule') ||
    lowerQuestion.includes('milestone') ||
    lowerQuestion.includes('delivery')
  ) {
    return 'Schedule & Lead time';
  }
  if (
    lowerQuestion.includes('fat') ||
    lowerQuestion.includes('sat') ||
    lowerQuestion.includes('test') ||
    lowerQuestion.includes('quality') ||
    lowerQuestion.includes('acceptance')
  ) {
    return 'Quality & Compliance';
  }
  if (
    lowerQuestion.includes('training') ||
    lowerQuestion.includes('documentation') ||
    lowerQuestion.includes('manual') ||
    lowerQuestion.includes('language')
  ) {
    return 'Documentation & Training';
  }
  if (
    lowerQuestion.includes('warranty') ||
    lowerQuestion.includes('support') ||
    lowerQuestion.includes('spare parts') ||
    lowerQuestion.includes('maintenance')
  ) {
    return 'Warranty & Support';
  }
  return 'Other';
};

type QuestionItem = {
  id: string;
  category: Category;
  original: string;
  text: string;
  enabled: boolean;
  isNew?: boolean;
};

const questionSchema = z.string().trim().min(3, 'Question is too short').max(4000, 'Question is too long');

const QuestionsToSupplier: React.FC<QuestionsToSupplierProps> = ({
  questions,
  rfxId,
  supplierCompanyId,
  readOnly = false,
  isCryptoReady = false,
  isCryptoLoading = false,
  encrypt,
}) => {
  const [expandedThemes, setExpandedThemes] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const [newCategory, setNewCategory] = useState<string>('');
  const [newQuestionText, setNewQuestionText] = useState('');

  // Re-init when supplier changes or new analysis arrives
  useEffect(() => {
    const normalized = (questions || []).filter((q) => typeof q === 'string' && q.trim().length > 0);
    const next: QuestionItem[] = normalized.map((q, idx) => {
      const text = q.trim();
      return {
        id: `${supplierCompanyId}:${idx}`,
        category: categorizeQuestion(text),
        original: text,
        text,
        enabled: true,
      };
    });
    setItems(next);
    setExpandedThemes(new Set());
  }, [supplierCompanyId, questions]);

  const grouped = useMemo(() => {
    const map = new Map<string, QuestionItem[]>();
    items.forEach((it) => {
      const cat = it.category || 'Other';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)?.push(it);
    });
    // Convert to record
    const result: Record<string, QuestionItem[]> = {};
    map.forEach((arr, cat) => {
      result[cat] = arr;
    });
    return result;
  }, [items]);

  const themeNames = Object.keys(grouped);
  const enabledCount = items.filter((i) => i.enabled && i.text.trim().length > 0).length;
  const disabledCount = items.filter((i) => !i.enabled).length;

  const toggleTheme = (theme: string) => {
    const newExpanded = new Set(expandedThemes);
    if (newExpanded.has(theme)) {
      newExpanded.delete(theme);
    } else {
      newExpanded.add(theme);
    }
    setExpandedThemes(newExpanded);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Questions to supplier</CardTitle>
        <p className="text-sm text-gray-500">
          AI-suggested questions grouped by theme. You can review, edit, disable, and send them to the supplier.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {themeNames.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">No questions generated</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {themeNames.map((theme) => {
              const isExpanded = expandedThemes.has(theme);
              const themeQuestions = grouped[theme] || [];

              return (
                <Collapsible
                  key={theme}
                  open={isExpanded}
                  onOpenChange={() => toggleTheme(theme)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between p-3 bg-[#f1f1f1] hover:bg-[#e5e7eb] rounded-lg transition-colors">
                      <span className="font-medium text-sm text-[#22183a]">
                        {theme} ({themeQuestions.length})
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-gray-500 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-4 pr-2 py-2 space-y-2">
                      {themeQuestions.map((q) => (
                        <div
                          key={q.id}
                          className={`text-sm py-2 border-l-2 pl-3 ${
                            q.enabled ? 'text-gray-700 border-[#f4a9aa]' : 'text-gray-400 border-gray-300 line-through'
                          }`}
                        >
                          <MarkdownText>{q.text}</MarkdownText>
                          {!q.enabled && (
                            <span className="ml-2 inline-flex">
                              <Badge variant="outline" className="text-[10px]">Disabled</Badge>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Review & Send Button */}
        {themeNames.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-xs text-gray-600">
                <span className="font-medium text-[#22183a]">{enabledCount}</span> enabled
                {disabledCount > 0 && (
                  <>
                    {' '}
                    • <span className="font-medium text-[#22183a]">{disabledCount}</span> disabled
                  </>
                )}
              </div>
              {(isCryptoLoading || (!isCryptoReady && !readOnly)) && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f4a9aa]" />
                  Loading keys...
                </div>
              )}
            </div>
            <Button
              className="w-full bg-[#22183a] hover:bg-[#22183a]/90 text-white"
              onClick={() => setIsModalOpen(true)}
              disabled={readOnly}
            >
              Review & send
            </Button>
          </div>
        )}

        {/* Review & Send Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-4xl w-[90vw] max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <DialogTitle>Review &amp; send questions</DialogTitle>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-[#f4a9aa] text-[#22183a] hover:bg-[#f4a9aa]/10"
                    onClick={() => {
                      setItems((prev) => prev.map((it) => ({ ...it, enabled: true })));
                    }}
                  >
                    Enable all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-gray-300 text-[#22183a] hover:bg-[#f1f1f1]"
                    onClick={() => {
                      setItems((prev) => prev.map((it) => ({ ...it, enabled: false })));
                    }}
                  >
                    Disable all
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto pr-2 space-y-5">
              {/* Add question */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-sm font-semibold text-[#22183a]">Add a question</div>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Category (optional)</div>
                    <Input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="e.g., Technical fit, Commercial & Pricing, etc."
                      className="h-9"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Question</div>
                    <Textarea
                      value={newQuestionText}
                      onChange={(e) => setNewQuestionText(e.target.value)}
                      placeholder="Write a new question..."
                      className="min-h-[64px] max-h-[160px]"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    className="border-gray-200 text-[#22183a] hover:bg-[#f1f1f1]"
                    onClick={() => {
                      const parsed = questionSchema.safeParse(newQuestionText);
                      if (!parsed.success) {
                        toast({
                          title: 'Invalid question',
                          description: parsed.error.issues[0]?.message || 'Invalid',
                          variant: 'destructive',
                        });
                        return;
                      }
                      const txt = parsed.data.trim();
                      setItems((prev) => [
                        {
                          id: `${supplierCompanyId}:new:${Date.now()}`,
                          category: newCategory.trim() || 'Other',
                          original: txt,
                          text: txt,
                          enabled: true,
                          isNew: true,
                        },
                        ...prev,
                      ]);
                      setNewQuestionText('');
                      setNewCategory('');
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Questions list */}
              {items.map((q, idx) => {
                const isEdited = q.text.trim() !== q.original.trim();
                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border p-4 ${
                      q.enabled ? 'border-gray-200 bg-white' : 'border-gray-200 bg-[#f1f1f1]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#22183a]">
                          Question {idx + 1} <span className="text-gray-600 font-medium">(category: {q.category})</span>{' '}
                          {!q.enabled && <Badge variant="outline" className="ml-2 text-[10px]">Disabled</Badge>}
                          {isEdited && <Badge className="ml-2 bg-[#f4a9aa]/20 text-[#22183a] border border-[#f4a9aa]/40">Edited</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">Send</span>
                          <Switch
                            checked={q.enabled}
                            onCheckedChange={(checked) => {
                              setItems((prev) => prev.map((it) => (it.id === q.id ? { ...it, enabled: !!checked } : it)));
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-600 mb-1">Content</div>
                      <Textarea
                        value={q.text}
                        onChange={(e) => {
                          const value = e.target.value;
                          setItems((prev) => prev.map((it) => (it.id === q.id ? { ...it, text: value } : it)));
                        }}
                        className="min-h-[72px] max-h-[220px]"
                        disabled={readOnly}
                      />
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-[11px] text-gray-500">
                          Original saved • You can restore anytime.
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-gray-200 text-[#22183a] hover:bg-[#f1f1f1]"
                          onClick={() => {
                            setItems((prev) => prev.map((it) => (it.id === q.id ? { ...it, text: it.original } : it)));
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-2" />
                          Restore
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter className="pt-4 border-t border-gray-200">
              <Button
                variant="outline"
                className="border-gray-200 text-[#22183a] hover:bg-[#f1f1f1]"
                onClick={() => setIsModalOpen(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                className="bg-[#22183a] hover:bg-[#22183a]/90 text-white"
                disabled={readOnly || sending || enabledCount === 0 || !encrypt || !isCryptoReady}
                onClick={async () => {
                  if (!encrypt) return;
                  if (!isCryptoReady) {
                    toast({
                      title: 'Encryption not ready',
                      description: 'Please wait for encryption keys to load.',
                      variant: 'destructive',
                    });
                    return;
                  }

                  const toSend = items.filter((i) => i.enabled && i.text.trim().length > 0);
                  if (toSend.length === 0) return;

                  setSending(true);
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

                    const encryptedQuestions = await Promise.all(
                      toSend.map(async (q) => {
                        const parsed = questionSchema.safeParse(q.text);
                        if (!parsed.success) {
                          throw new Error(`Invalid question: ${parsed.error.issues[0]?.message || 'Invalid'}`);
                        }
                        const cipher = await encrypt(parsed.data.trim());
                        return {
                          rfx_id: rfxId,
                          supplier_company_id: supplierCompanyId,
                          asked_by_user_id: user.id,
                          asked_display_role: 'RFX member - buyer',
                          asked_display_name: name,
                          asked_display_surname: surname,
                          question_encrypted: cipher,
                        };
                      })
                    );

                    const { error } = await supabase.from('rfx_supplier_qna' as any).insert(encryptedQuestions as any);
                    if (error) throw error;

                    toast({
                      title: 'Questions sent',
                      description: `Sent ${encryptedQuestions.length} questions to the supplier.`,
                    });
                    setIsModalOpen(false);
                  } catch (err: any) {
                    console.error('❌ [QuestionsToSupplier] Failed to send questions:', err);
                    toast({
                      title: 'Failed to send',
                      description: err?.message || 'Could not send questions',
                      variant: 'destructive',
                    });
                  } finally {
                    setSending(false);
                  }
                }}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Send to supplier
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default QuestionsToSupplier;

