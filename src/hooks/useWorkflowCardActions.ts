import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { EnrichmentPayload, EmployeePerson } from '@/types/rfxEnrichment';
import { getRfxAgentHttpBaseUrl } from '@/utils/rfxAgentHttpBaseUrl';
import type { Question } from '@/hooks/useRFXQuestionnaire';

// Datos de contacto y borradores asociados a una tarjeta del kanban.
// candidateId === id_company_revision.

export interface ContactInfo {
  emails: string[];
  phones: string[];
  keyPeople: EmployeePerson[];
  companyLinkedinUrl: string | null;
}

export interface ContactDrafts {
  email_subject: string;
  email_body: string;
  phone_script: string;
  linkedin_message: string;
}

const EMPTY_DRAFTS: ContactDrafts = {
  email_subject: '',
  email_body: '',
  phone_script: '',
  linkedin_message: '',
};

const toStringArray = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      /* no-op */
    }
  }
  return [];
};

interface UseWorkflowCardActionsOptions {
  readOnly?: boolean;
}

export const useWorkflowCardActions = (
  rfxId: string | undefined,
  candidateId: string | undefined,
  options: UseWorkflowCardActionsOptions = {},
) => {
  const { readOnly = false } = options;
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [contact, setContact] = useState<ContactInfo>({
    emails: [],
    phones: [],
    keyPeople: [],
    companyLinkedinUrl: null,
  });
  const [drafts, setDrafts] = useState<ContactDrafts>(EMPTY_DRAFTS);
  const [hasStoredDrafts, setHasStoredDrafts] = useState(false);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [specificQuestions, setSpecificQuestions] = useState<Question[]>([]);
  const [regeneratingSpecific, setRegeneratingSpecific] = useState(false);

  const load = useCallback(async () => {
    if (!rfxId || !candidateId) return;
    setLoading(true);
    try {
      const [revision, enrichment, draftsRow, invitationRow] = await Promise.all([
        supabase
          .from('company_revision' as any)
          .select('contact_emails, contact_phones, company_id')
          .eq('id', candidateId)
          .maybeSingle(),
        supabase
          .from('rfx_candidate_company_enrichment' as any)
          .select('enrichment_payload')
          .eq('rfx_id', rfxId)
          .eq('id_company_revision', candidateId)
          .maybeSingle(),
        supabase
          .from('rfx_workflow_contact_drafts' as any)
          .select('email_subject, email_body, phone_script, linkedin_message')
          .eq('rfx_id', rfxId)
          .eq('candidate_id', candidateId)
          .maybeSingle(),
        supabase
          .from('rfx_questionnaire_invitations' as any)
          .select('token, specific_questions')
          .eq('rfx_id', rfxId)
          .eq('candidate_id', candidateId)
          .maybeSingle(),
      ]);

      const revisionRow = (revision.data as any) || {};
      const emails = toStringArray(revisionRow.contact_emails);
      const phones = toStringArray(revisionRow.contact_phones);
      const companyFk = revisionRow.company_id as string | undefined;

      const payload = (enrichment.data as any)?.enrichment_payload as EnrichmentPayload | undefined;
      const keyPeople = (payload?.employees?.key_people ?? []).filter(
        (p): p is EmployeePerson => Boolean(p && p.name),
      );

      let companyLinkedinUrl: string | null = null;
      if (companyFk) {
        const { data: companyRow } = await supabase
          .from('company' as any)
          .select('linkedin_url')
          .eq('id', companyFk)
          .maybeSingle();
        companyLinkedinUrl = (companyRow as any)?.linkedin_url || null;
      }

      setContact({ emails, phones, keyPeople, companyLinkedinUrl });

      const d = (draftsRow.data as any) || null;
      if (d) {
        setDrafts({
          email_subject: d.email_subject || '',
          email_body: d.email_body || '',
          phone_script: d.phone_script || '',
          linkedin_message: d.linkedin_message || '',
        });
        setHasStoredDrafts(true);
      } else {
        setDrafts(EMPTY_DRAFTS);
        setHasStoredDrafts(false);
      }

      const inv = (invitationRow.data as any) || null;
      setInvitationToken(inv?.token ?? null);
      const sq = inv?.specific_questions;
      setSpecificQuestions(Array.isArray(sq) ? (sq as Question[]) : []);
    } finally {
      setLoading(false);
    }
  }, [rfxId, candidateId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Crea o recupera la invitación para este candidato (lazy).
  const ensureInvitation = useCallback(async (): Promise<string | null> => {
    if (readOnly || !rfxId || !candidateId) return invitationToken;
    if (invitationToken) return invitationToken;

    const { data, error } = await supabase
      .from('rfx_questionnaire_invitations' as any)
      .upsert(
        { rfx_id: rfxId, candidate_id: candidateId },
        { onConflict: 'rfx_id,candidate_id', ignoreDuplicates: false },
      )
      .select('token')
      .maybeSingle();

    if (error) {
      console.error('[useWorkflowCardActions] ensureInvitation error', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    const token = (data as any)?.token ?? null;
    setInvitationToken(token);
    return token;
  }, [readOnly, rfxId, candidateId, invitationToken, toast]);

  // Llama al back para generar borradores y persiste en Supabase.
  const generateDrafts = useCallback(
    async (symmetricKey: string, candidateName: string) => {
      if (readOnly || !rfxId || !candidateId) return;
      setGenerating(true);
      try {
        const endpoint = `${getRfxAgentHttpBaseUrl()}/api/rfxs/${rfxId}/workflow/contact-drafts/${candidateId}/generate`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symmetric_key: symmetricKey,
            candidate_name: candidateName,
            user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
          }),
        });
        const json = await response.json();
        if (!json.success) throw new Error(json.error || 'Generation failed');

        const next = json.drafts as ContactDrafts;
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('rfx_workflow_contact_drafts' as any)
          .upsert(
            {
              rfx_id: rfxId,
              candidate_id: candidateId,
              email_subject: next.email_subject,
              email_body: next.email_body,
              phone_script: next.phone_script,
              linkedin_message: next.linkedin_message,
              generated_by: user?.id,
            },
            { onConflict: 'rfx_id,candidate_id' },
          );
        if (error) throw error;

        setDrafts(next);
        setHasStoredDrafts(true);
      } catch (e: any) {
        console.error('[useWorkflowCardActions] generateDrafts error', e);
        toast({ title: 'Error', description: e.message || 'Generation failed', variant: 'destructive' });
      } finally {
        setGenerating(false);
      }
    },
    [readOnly, rfxId, candidateId, toast],
  );

  // Persiste ediciones manuales del borrador.
  const updateDraftField = useCallback(
    async (field: keyof ContactDrafts, value: string) => {
      if (readOnly || !rfxId || !candidateId) return;
      setDrafts((prev) => ({ ...prev, [field]: value }));
    },
    [readOnly, rfxId, candidateId],
  );

  const persistDrafts = useCallback(async () => {
    if (readOnly || !rfxId || !candidateId || !hasStoredDrafts) return;
    const { error } = await supabase
      .from('rfx_workflow_contact_drafts' as any)
      .update({
        email_subject: drafts.email_subject,
        email_body: drafts.email_body,
        phone_script: drafts.phone_script,
        linkedin_message: drafts.linkedin_message,
      })
      .eq('rfx_id', rfxId)
      .eq('candidate_id', candidateId);
    if (error) {
      console.error('[useWorkflowCardActions] persistDrafts error', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }, [readOnly, rfxId, candidateId, hasStoredDrafts, drafts, toast]);

  // Regenera las preguntas específicas de esta empresa (llama al back).
  const regenerateSpecific = useCallback(
    async (symmetricKey: string): Promise<boolean> => {
      if (readOnly || !rfxId || !candidateId) return false;
      setRegeneratingSpecific(true);
      try {
        const endpoint = `${getRfxAgentHttpBaseUrl()}/api/rfxs/${rfxId}/questionnaire/specific/${candidateId}/generate`;
        const { data: { user } } = await supabase.auth.getUser();
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symmetric_key: symmetricKey, user_id: user?.id ?? null }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Failed');
        const next = (json.specific_questions as Question[]) || [];
        setSpecificQuestions(next);
        return true;
      } catch (e: any) {
        console.error('[useWorkflowCardActions] regenerateSpecific', e);
        toast({ title: 'Error', description: e.message || 'Failed', variant: 'destructive' });
        return false;
      } finally {
        setRegeneratingSpecific(false);
      }
    },
    [readOnly, rfxId, candidateId, toast],
  );

  // Persiste ediciones locales de las específicas (upsert en invitación).
  const saveSpecific = useCallback(
    async (next: Question[]): Promise<boolean> => {
      if (readOnly || !rfxId || !candidateId) return false;
      setSpecificQuestions(next);
      const { error } = await supabase
        .from('rfx_questionnaire_invitations' as any)
        .upsert(
          {
            rfx_id: rfxId,
            candidate_id: candidateId,
            specific_questions: next,
            specific_questions_updated_at: new Date().toISOString(),
          },
          { onConflict: 'rfx_id,candidate_id' },
        );
      if (error) {
        console.error('[useWorkflowCardActions] saveSpecific', error);
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return false;
      }
      return true;
    },
    [readOnly, rfxId, candidateId, toast],
  );

  return {
    loading,
    contact,
    drafts,
    hasStoredDrafts,
    generating,
    invitationToken,
    specificQuestions,
    regeneratingSpecific,
    generateDrafts,
    updateDraftField,
    persistDrafts,
    ensureInvitation,
    regenerateSpecific,
    saveSpecific,
    reload: load,
  };
};
