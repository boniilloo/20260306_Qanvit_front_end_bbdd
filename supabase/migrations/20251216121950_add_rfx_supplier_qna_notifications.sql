-- -----------------------------------------------------------------------------
-- RFX Supplier Q&A Notifications
--
-- 1. When a question is inserted: notify supplier company members
-- 2. When an answer is added (UPDATE): notify RFX members
-- -----------------------------------------------------------------------------

-- Function: Notify supplier company when a question is asked
create or replace function public.create_notifications_on_rfx_supplier_qna_question()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_supplier_target_url text;
  v_supplier_invitation_id uuid;
  v_title text;
  v_body text;
  v_question_count int;
begin
  -- Only trigger on INSERT (new questions)
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- Count how many questions were inserted in this batch (might be multiple)
  -- For simplicity, we'll notify per question, but we could optimize for batch inserts
  
  v_title := 'New question(s) received';
  v_body := new.asked_display_name || ' ' || new.asked_display_surname || ' (' || new.asked_display_role || ') asked a question.';

  -- Find the invitation ID for the supplier
  select rci.id
  into v_supplier_invitation_id
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.rfx_id
    and rci.company_id = new.supplier_company_id
  order by rci.created_at desc
  limit 1;

  if v_supplier_invitation_id is not null then
    v_supplier_target_url := ('/rfx-viewer/' || v_supplier_invitation_id::text || '#qna')::text;
  else
    v_supplier_target_url := null;
  end if;

  -- Notify all approved company admins (supplier company members)
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    car.user_id,
    'rfx_supplier_qna_question'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.rfx_id as target_id,
    v_supplier_target_url as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from public.company_admin_requests car
  where car.company_id = new.supplier_company_id
    and car.status = 'approved'
    and car.user_id is not null;

  return new;
exception
  when others then
    raise warning 'Error creating notifications for Q&A question %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- Function: Notify RFX members when a supplier answers a question
create or replace function public.create_notifications_on_rfx_supplier_qna_answer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rfx_target_url text;
  v_title text;
  v_body text;
begin
  -- Only trigger on UPDATE
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only notify if answer was just added (answer_encrypted changed from null to non-null)
  if old.answer_encrypted is not null or new.answer_encrypted is null then
    return new;
  end if;

  v_title := 'Question answered';
  v_body := coalesce(
    new.answered_display_name || ' ' || coalesce(new.answered_display_surname, '') || ' (' || coalesce(new.answered_display_role, 'Supplier') || ') answered a question.',
    'A supplier answered your question.'
  );

  v_rfx_target_url := ('/rfxs/responses/' || new.rfx_id::text || '#qna')::text;

  -- Notify all RFX members (buyers) excluding the one who might have triggered this (though unlikely in this case)
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    m.user_id,
    'rfx_supplier_qna_answer'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.rfx_id as target_id,
    v_rfx_target_url as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from public.get_rfx_members(new.rfx_id) m
  where m.user_id is not null
    -- Exclude the supplier user who answered (if they're somehow an RFX member, which shouldn't happen but just in case)
    and (new.answered_by_user_id is null or m.user_id <> new.answered_by_user_id);

  return new;
exception
  when others then
    raise warning 'Error creating notifications for Q&A answer %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- Create triggers
drop trigger if exists trg_create_notifications_on_rfx_supplier_qna_question on public.rfx_supplier_qna;
create trigger trg_create_notifications_on_rfx_supplier_qna_question
after insert on public.rfx_supplier_qna
for each row
execute function public.create_notifications_on_rfx_supplier_qna_question();

drop trigger if exists trg_create_notifications_on_rfx_supplier_qna_answer on public.rfx_supplier_qna;
create trigger trg_create_notifications_on_rfx_supplier_qna_answer
after update on public.rfx_supplier_qna
for each row
execute function public.create_notifications_on_rfx_supplier_qna_answer();

grant execute on function public.create_notifications_on_rfx_supplier_qna_question() to authenticated;
grant execute on function public.create_notifications_on_rfx_supplier_qna_answer() to authenticated;

comment on function public.create_notifications_on_rfx_supplier_qna_question() is
  'Creates in-app notifications for supplier company members when a buyer asks a question in Q&A.';

comment on function public.create_notifications_on_rfx_supplier_qna_answer() is
  'Creates in-app notifications for RFX members when a supplier answers a question.';






