
-- Create required extensions if not exists
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_notify_on_email_confirmed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  endpoint text := 'https://fukzxedgbszcpakqkrjf.supabase.co/functions/v1/auth-onboarding-email';
  payload  text;
begin
  if new.email_confirmed_at is not null
     and (old.email_confirmed_at is null or old.email_confirmed_at <> new.email_confirmed_at) then

    payload := jsonb_build_object(
      'type','auth.user.email_confirmed',
      'record', jsonb_build_object(
        'id', new.id,
        'email', new.email,
        'email_confirmed_at', new.email_confirmed_at
      )
    )::text;

    -- llama a la edge function usando pg_net o http según tu extensión disponible
    perform extensions.http_post(endpoint::text, payload::text, 'application/json'::text);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."_notify_on_email_confirmed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_rfx_add_member_on_accept"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_debug_info text;
BEGIN
  -- Only process when status changes to 'accepted'
  IF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    v_debug_info := 'Accepting invitation ' || NEW.id || ' for RFX ' || NEW.rfx_id || ' by user ' || NEW.target_user_id;
    RAISE NOTICE '%', v_debug_info;

    -- Insert the membership record
    -- Using SECURITY DEFINER allows this to bypass RLS policies
    INSERT INTO public.rfx_members (rfx_id, user_id, role)
    VALUES (NEW.rfx_id, NEW.target_user_id, 'editor')
    ON CONFLICT (rfx_id, user_id) DO NOTHING;

    -- Set responded_at if not already set
    NEW.responded_at := COALESCE(NEW.responded_at, NOW());
    
    v_debug_info := 'Member added successfully';
    RAISE NOTICE '%', v_debug_info;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."_rfx_add_member_on_accept"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."_rfx_add_member_on_accept"() IS 'Auto-add member when invitation status becomes accepted - runs with SECURITY DEFINER to bypass RLS';



CREATE OR REPLACE FUNCTION "public"."approve_company_admin_request"("p_request_id" "uuid", "p_processor_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  is_processor_admin boolean;
BEGIN
  -- Lock the target request row to prevent race conditions
  SELECT user_id, company_id INTO v_user_id, v_company_id
  FROM company_admin_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin request not found';
  END IF;

  -- Allow developers or approved admins of the same company to process
  SELECT EXISTS (
    SELECT 1 FROM company_admin_requests car
    WHERE car.company_id = v_company_id
      AND car.user_id = p_processor_user_id
      AND car.status = 'approved'
  ) INTO is_processor_admin;

  IF NOT (is_processor_admin OR public.has_developer_access()) THEN
    RAISE EXCEPTION 'Not authorized to approve admin requests for this company';
  END IF;

  -- Update request status only if still pending
  UPDATE company_admin_requests
  SET status = 'approved', processed_at = now(), processed_by = p_processor_user_id
  WHERE id = p_request_id AND status = 'pending';

  -- Grant admin privileges and bind the user to the company in app_user
  UPDATE app_user
  SET is_admin = true, company_id = v_company_id
  WHERE auth_user_id = v_user_id;

  IF NOT FOUND THEN
    -- Create profile if not exists
    INSERT INTO app_user (auth_user_id, is_admin, company_id)
    VALUES (v_user_id, true, v_company_id);
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."approve_company_admin_request"("p_request_id" "uuid", "p_processor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."batch_increment_embedding_counters"("p_embedding_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Insertar nuevos registros con contador 1 para embeddings que no existen
    INSERT INTO embedding_usage_counters (embedding_id, usage_count)
    SELECT 
        unnest(p_embedding_ids),
        1
    ON CONFLICT (embedding_id) DO NOTHING;
    
    -- Incrementar contadores para todos los embeddings (incluyendo los que ya existían)
    UPDATE embedding_usage_counters 
    SET usage_count = usage_count + 1
    WHERE embedding_id = ANY(p_embedding_ids);
END;
$$;


ALTER FUNCTION "public"."batch_increment_embedding_counters"("p_embedding_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."call_embed_edge_function"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM supabase_functions.http_request(  -- Asegúrate de que la función esté en el esquema correcto
    'https://fukzxedgbszcpakqkrjf.supabase.co/functions/v1/embed',  -- tu URL
    'POST',                                                      -- método HTTP
    json_build_object(                                           -- headers
      'Content-Type', 'application/json',
      'Authorization',  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  -- tu service_role_key
    )::text,
    json_build_object(                                           -- body
      'new', row_to_json(NEW)
    )::text,
    '10000'  -- timeout en milisegundos
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."call_embed_edge_function"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_rfx_invitation"("p_invitation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare v_rfx_id uuid;
begin
  select rfx_id into v_rfx_id from public.rfx_invitations where id = p_invitation_id;
  if v_rfx_id is null then
    return false;
  end if;
  if not exists (select 1 from public.rfxs r where r.id = v_rfx_id and r.user_id = auth.uid()) then
    raise exception 'Access denied. Only owner can cancel invitations.' using errcode = 'P0001';
  end if;
  update public.rfx_invitations set status = 'cancelled', responded_at = coalesce(responded_at, now()) where id = p_invitation_id;
  return true;
end;
$$;


ALTER FUNCTION "public"."cancel_rfx_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rfx_invitation_status"("p_rfx_id" "uuid", "p_user_id" "uuid") RETURNS TABLE("is_member" boolean, "has_pending_invite" boolean, "invite_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_debug_info text;
begin
  -- Log input
  v_debug_info := 'Checking RFX ' || p_rfx_id || ' for user ' || p_user_id;
  raise notice '%', v_debug_info;

  return query
  select 
    exists(
      select 1 from public.rfx_members 
      where rfx_id = p_rfx_id and user_id = p_user_id
    ) as is_member,
    exists(
      select 1 from public.rfx_invitations 
      where rfx_id = p_rfx_id 
      and target_user_id = p_user_id 
      and status = 'pending'
    ) as has_pending_invite,
    (
      select id from public.rfx_invitations
      where rfx_id = p_rfx_id 
      and target_user_id = p_user_id 
      and status = 'pending'
      limit 1
    ) as invite_id;
end;
$$;


ALTER FUNCTION "public"."check_rfx_invitation_status"("p_rfx_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_company_rfx_invitation_notifications"("p_rfx_id" "uuid", "p_company_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") RETURNS TABLE("notification_id" "uuid", "company_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'company'::text as scope,
    cid as company_id,
    'company_invited_to_rfx'::text as type,
    p_title as title,
    p_body as body,
    'rfx'::text as target_type,
    p_rfx_id as target_id,
    p_target_url as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from unnest(p_company_ids) as cid
  returning id as notification_id, public.notification_events.company_id;
end;
$$;


ALTER FUNCTION "public"."create_company_rfx_invitation_notifications"("p_rfx_id" "uuid", "p_company_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_company_rfx_invitation_notifications"("p_rfx_id" "uuid", "p_company_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") IS 'Creates company-scoped notifications for all invited companies on an RFX (SECURITY DEFINER). Returns created notification ids and company ids.';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_company_invitation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rfx_name text;
  v_title text;
  v_body text;
  v_notifications_created int;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  raise notice 'Creating notification for company invitation: rfx_id=%, company_id=%', new.rfx_id, new.company_id;

  -- Fetch RFX name
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = new.rfx_id;

  -- Build notification content
  v_title := 'Your company was invited to an RFX';
  v_body := coalesce(
    'Your company has been invited to participate in RFX "' || coalesce(v_rfx_name, '') || '". Next step: your team must sign the NDA before accessing the RFX information.',
    'Your company has been invited to participate in an RFX.'
  );

  -- Insert company-scoped notification
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  values (
    'company',
    new.company_id,
    'company_invited_to_rfx',
    v_title,
    v_body,
    'rfx',
    new.rfx_id,
    '/rfxs',
    'both',
    0
  );

  get diagnostics v_notifications_created = row_count;
  raise notice 'Notifications created for company invitation: %', v_notifications_created;

  return new;
exception
  when others then
    -- Log error but don't fail the invitation insert
    raise warning 'Error creating notifications for company invitation rfx_id=%, company_id=%: %', new.rfx_id, new.company_id, sqlerrm;
    raise notice 'Error details: SQLSTATE=%, SQLERRM=%', sqlstate, sqlerrm;
    return new;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_company_invitation"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_company_invitation"() IS 'Creates in-app and email notifications when a company is invited to an RFX (SECURITY DEFINER).';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_nda_validated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invitation record;
  v_rfx_name text;
  v_company_name text;
  v_company_slug text;
  v_target_url text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only act on transition to validated_by_fq_source = true
  if (coalesce(old.validated_by_fq_source, false) = false)
     and (coalesce(new.validated_by_fq_source, false) = true) then

    -- Load invitation context
    select rci.id, rci.rfx_id, rci.company_id
      into v_invitation
    from public.rfx_company_invitations rci
    where rci.id = new.rfx_company_invitation_id;

    if v_invitation.rfx_id is null then
      return new;
    end if;

    -- RFX name
    select r.name into v_rfx_name
    from public.rfxs r
    where r.id = v_invitation.rfx_id;

    -- Company name: prefer billing info, fallback to active company_revision
    select bi.company_name into v_company_name
    from public.company_billing_info bi
    where bi.company_id = v_invitation.company_id;

    if v_company_name is null then
      select cr.nombre_empresa into v_company_name
      from public.company_revision cr
      where cr.company_id = v_invitation.company_id
        and coalesce(cr.is_active, false) = true
      order by cr.created_at desc
      limit 1;
    end if;

    -- Get company_slug from active company_revision
    select cr.slug into v_company_slug
    from public.company_revision cr
    where cr.company_id = v_invitation.company_id
      and coalesce(cr.is_active, false) = true
    order by cr.created_at desc
    limit 1;

    -- Build target_url using company_slug if available, fallback to UUID
    if v_company_slug is not null and v_company_slug != '' then
      v_target_url := '/suppliers/' || v_company_slug || '?tab=manage&subtab=rfxs';
    else
      -- Fallback to UUID if slug is not available (shouldn't happen in normal cases)
      v_target_url := '/suppliers/' || v_invitation.company_id::text || '?tab=manage&subtab=rfxs';
    end if;

    -- 1) Company-wide notification (email + in-app)
    insert into public.notification_events (
      scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
    )
    values (
      'company',
      v_invitation.company_id,
      'supplier_nda_validated',
      'Your company''s NDA was validated',
      coalesce('The signed NDA for RFX "' || coalesce(v_rfx_name, '') || '" has been validated. Your team can now access the RFX.', 'Your NDA was validated. You can now access the RFX.'),
      'rfx',
      v_invitation.rfx_id,
      v_target_url,
      'both',
      0
    );

    -- 2) Notify RFX owner and editors (in-app only)
    insert into public.notification_events (
      scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
    )
    select
      'user'::text as scope,
      m.user_id,
      'supplier_nda_completed'::text as type,
      'Supplier completed NDA process'::text as title,
      coalesce('Company "' || coalesce(v_company_name, 'Supplier') || '" completed the NDA process for RFX "' || coalesce(v_rfx_name, '') || '". They can now access the RFX.', 'Supplier completed NDA process.') as body,
      'rfx'::text as target_type,
      v_invitation.rfx_id as target_id,
      ('/rfxs/responses/' || v_invitation.rfx_id::text)::text as target_url,
      'in_app'::text as delivery_channel,
      0 as priority
    from public.get_rfx_members(v_invitation.rfx_id) m
    where m.user_id is not null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_nda_validated"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_nda_validated"() IS 'Creates notifications when an NDA is validated: company (both) and RFX owner/editors (in-app). Uses company_slug for supplier URL and /rfxs/responses/ for RFX owner notifications.';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_rfx_announcement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rfx_name text;
  v_creator_name text;
  v_title text;
  v_body text;
  v_company_count int;
  v_notifications_created int;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  raise notice 'Trigger executed for announcement % in RFX %', new.id, new.rfx_id;

  -- RFX name (bypass RLS by using SECURITY DEFINER)
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = new.rfx_id;

  raise notice 'RFX name: %', coalesce(v_rfx_name, 'NULL');

  -- Creator name (from app_user only, fallback to 'A team member')
  select 
    coalesce(
      nullif(trim(au.name || ' ' || coalesce(au.surname, '')), ''),
      'A team member'
    ) into v_creator_name
  from public.app_user au
  where au.auth_user_id = new.user_id
  limit 1;

  if v_creator_name is null or v_creator_name = '' then
    v_creator_name := 'A team member';
  end if;

  raise notice 'Creator name: %', v_creator_name;

  -- Build notification content
  v_title := coalesce('New announcement: ' || new.subject, 'New announcement in RFX');
  v_body := coalesce(
    v_creator_name || ' posted a new announcement in RFX "' || coalesce(v_rfx_name, '') || '": ' || coalesce(new.subject, 'Announcement'),
    'A new announcement was posted in your RFX.'
  );

  raise notice 'Title: %', v_title;
  raise notice 'Body: %', v_body;

  -- Count companies to notify
  -- Use SECURITY DEFINER to bypass RLS - we can read all invitations for this RFX
  select count(*) into v_company_count
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.rfx_id
    and rci.status not in ('declined', 'cancelled');

  raise notice 'Companies to notify: %', v_company_count;

  -- Insert one company-scoped notification per company related to the RFX
  -- SECURITY DEFINER allows us to read all rfx_company_invitations for this RFX
  -- and insert into notification_events without RLS restrictions
  -- Use invitation id (rci.id) to create URL pointing to /rfx-viewer/{invitationId}
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'company'::text as scope,
    rci.company_id,
    'rfx_announcement_posted'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.rfx_id as target_id,
    ('/rfx-viewer/' || rci.id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.rfx_id
    -- Only notify companies that have accepted the invitation (not declined or cancelled)
    and rci.status not in ('declined', 'cancelled');

  get diagnostics v_notifications_created = row_count;
  raise notice 'Notifications created: %', v_notifications_created;

  -- Always return new, even if no notifications were created
  return new;
exception
  when others then
    -- Log error but don't fail the announcement insert
    raise warning 'Error creating notifications for announcement %: %', new.id, sqlerrm;
    raise notice 'Error details: SQLSTATE=%, SQLERRM=%', sqlstate, sqlerrm;
    return new;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_rfx_announcement"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_rfx_announcement"() IS 'Creates in-app and email notifications to all companies related to an RFX when an announcement is posted (SECURITY DEFINER). Notification URL points to /rfx-viewer/{invitationId} for each invited company.';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_rfx_requirements_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rfx_name text;
  v_title text;
  v_body text;
  v_notifications_created int;
  v_company_count int;
begin
  -- Only trigger on UPDATE of sent_commit_id
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only notify if sent_commit_id actually changed AND RFX is not in draft status
  if old.sent_commit_id is not distinct from new.sent_commit_id then
    return new;
  end if;

  if new.status = 'draft' then
    raise notice 'Skipping notification for draft RFX (rfx_id=%)', new.id;
    return new;
  end if;

  raise notice 'Creating notifications for RFX requirements update: rfx_id=%', new.id;

  -- Fetch RFX name
  v_rfx_name := new.name;

  -- Count companies to notify
  select count(*) into v_company_count
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.id
    -- Only notify companies that have not declined or cancelled
    and rci.status not in ('declined', 'cancelled');

  raise notice 'Companies to notify about requirements update: %', v_company_count;

  -- Build notification content
  v_title := 'RFX requirements have been updated';
  v_body := coalesce(
    'The buyer has adjusted the requirements for RFX "' || coalesce(v_rfx_name, '') || '". Please review the updated specifications.',
    'The requirements for an RFX you are participating in have been updated.'
  );

  -- Insert one company-scoped notification per invited company
  insert into public.notification_events (
    scope, company_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'company'::text as scope,
    rci.company_id,
    'rfx_requirements_updated'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    new.id as target_id,
    ('/rfxs/responses/' || new.id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.rfx_company_invitations rci
  where rci.rfx_id = new.id
    -- Only notify companies that have not declined or cancelled
    and rci.status not in ('declined', 'cancelled');

  get diagnostics v_notifications_created = row_count;
  raise notice 'Notifications created for RFX requirements update: %', v_notifications_created;

  return new;
exception
  when others then
    -- Log error but don't fail the RFX update
    raise warning 'Error creating notifications for RFX requirements update (rfx_id=%): %', new.id, sqlerrm;
    raise notice 'Error details: SQLSTATE=%, SQLERRM=%', sqlstate, sqlerrm;
    return new;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_rfx_requirements_update"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_rfx_requirements_update"() IS 'Creates in-app and email notifications to all invited companies when RFX requirements are updated (sent_commit_id changes) (SECURITY DEFINER).';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_rfx_sent"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_title text;
  v_body text;
begin
  if tg_op = 'UPDATE'
     and coalesce(old.status, '') = 'draft'
     and new.status = 'revision requested by buyer' then
     
     v_title := 'New RFX sent for review';
     v_body  := coalesce('The RFX "' || new.name || '" was sent. Please review it in RFX Management.', 'A new RFX was sent. Please review it in RFX Management.');

     insert into public.notification_events (
       scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
     )
     select
       'user'::text as scope,
       da.user_id as user_id,         -- auth.users.id
       'rfx_sent_for_review'::text as type,
       v_title as title,
       v_body as body,
       'rfx'::text as target_type,
       new.id as target_id,
       '/rfx-management'::text as target_url,
       'both'::text as delivery_channel,
       0 as priority
     from public.developer_access da
     where da.user_id is not null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_rfx_sent"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_rfx_sent"() IS 'Creates per-developer notifications (user scope, auth.users.id) when an RFX moves from draft to revision requested by buyer. Target /rfx-management. Delivery channel: both.';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_rfx_submitted"("p_invitation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invitation record;
  v_rfx_name text;
  v_company_name text;
  v_title text;
  v_body text;
  v_notifications_created int;
begin
  -- Load invitation context (rfx_id, company_id)
  select rci.id, rci.rfx_id, rci.company_id
    into v_invitation
  from public.rfx_company_invitations rci
  where rci.id = p_invitation_id;

  if v_invitation.rfx_id is null then
    raise warning 'No RFX found for invitation_id: %', p_invitation_id;
    return;
  end if;

  -- RFX name
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = v_invitation.rfx_id;

  -- Company name: prefer billing info, fallback to active company_revision
  select bi.company_name into v_company_name
  from public.company_billing_info bi
  where bi.company_id = v_invitation.company_id;

  if v_company_name is null then
    select cr.nombre_empresa into v_company_name
    from public.company_revision cr
    where cr.company_id = v_invitation.company_id
      and coalesce(cr.is_active, false) = true
    order by cr.created_at desc
    limit 1;
  end if;

  v_title := 'Supplier has submitted documents for your RFX';
  v_body  := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" has submitted all required documents (proposal and offer) for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A supplier has submitted all required documents for your RFX.'
  );

  -- Insert one user-scoped notification per RFX owner and editor
  -- Get members directly (bypassing get_rfx_members access check since we're SECURITY DEFINER)
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    m.user_id,                                 -- auth.users.id
    'supplier_document_uploaded'::text as type,
    v_title as title,
    v_body  as body,
    'rfx'::text as target_type,
    v_invitation.rfx_id as target_id,
    ('/rfxs/responses/' || v_invitation.rfx_id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from (
    -- Get owner
    select r.user_id
    from public.rfxs r
    where r.id = v_invitation.rfx_id
    union
    -- Get all members
    select m.user_id
    from public.rfx_members m
    where m.rfx_id = v_invitation.rfx_id
  ) m
  where m.user_id is not null;

  get diagnostics v_notifications_created = row_count;
  raise notice 'Notifications created for RFX submitted: %', v_notifications_created;

exception
  when others then
    -- Log error but don't fail the operation
    raise warning 'Error creating notifications for RFX submitted (invitation_id=%): %', p_invitation_id, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_rfx_submitted"("p_invitation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_rfx_submitted"("p_invitation_id" "uuid") IS 'Creates in-app and email notifications to RFX owner and editors when a supplier submission status changes to "submitted" (SECURITY DEFINER).';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_supplier_accept"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rfx_name text;
  v_company_name text;
  v_title text;
  v_body text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if coalesce(old.status, '') = 'waiting for supplier approval'
     and new.status in ('supplier evaluating RFX', 'waiting NDA signing') then

    -- RFX name
    select r.name into v_rfx_name
    from public.rfxs r
    where r.id = new.rfx_id;

    -- Company name: billing info first
    select bi.company_name into v_company_name
    from public.company_billing_info bi
    where bi.company_id = new.company_id;

    -- Fallback: latest active company_revision
    if v_company_name is null then
      select cr.nombre_empresa into v_company_name
      from public.company_revision cr
      where cr.company_id = new.company_id
        and coalesce(cr.is_active, false) = true
      order by cr.created_at desc
      limit 1;
    end if;

    v_title := 'Supplier accepted your RFX';
    v_body  := coalesce('"' || coalesce(v_company_name, 'A supplier') || '" accepted the invitation to participate in RFX "' || coalesce(v_rfx_name, '') || '".',
                        'A supplier accepted the RFX invitation.');

    insert into public.notification_events (
      scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
    )
    select
      'user'::text as scope,
      m.user_id,
      'rfx_supplier_accepted'::text as type,
      v_title as title,
      v_body  as body,
      'rfx'::text as target_type,
      new.rfx_id as target_id,
      ('/rfxs/responses/' || new.rfx_id::text)::text as target_url,
      'in_app'::text as delivery_channel,
      0 as priority
    from public.get_rfx_members(new.rfx_id) m
    where m.user_id is not null;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_supplier_accept"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_supplier_accept"() IS 'Creates in-app notifications to RFX owner and editors when a supplier company accepts an invitation. Uses /rfxs/responses/ for notification URL.';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_supplier_document_upload"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invitation record;
  v_rfx_name text;
  v_company_name text;
  v_category_label text;
  v_title text;
  v_body text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- Load invitation context (rfx_id, company_id)
  select rci.id, rci.rfx_id, rci.company_id
    into v_invitation
  from public.rfx_company_invitations rci
  where rci.id = new.rfx_company_invitation_id;

  if v_invitation.rfx_id is null then
    return new;
  end if;

  -- RFX name
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = v_invitation.rfx_id;

  -- Company name: prefer billing info, fallback to active company_revision
  select bi.company_name into v_company_name
  from public.company_billing_info bi
  where bi.company_id = v_invitation.company_id;

  if v_company_name is null then
    select cr.nombre_empresa into v_company_name
    from public.company_revision cr
    where cr.company_id = v_invitation.company_id
      and coalesce(cr.is_active, false) = true
    order by cr.created_at desc
    limit 1;
  end if;

  -- Category label
  case new.category
    when 'proposal' then v_category_label := 'proposal';
    when 'offer' then v_category_label := 'offer';
    when 'other' then v_category_label := 'document';
    else v_category_label := 'document';
  end case;

  v_title := 'New document uploaded to your RFX';
  v_body  := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" uploaded a ' || v_category_label || ' for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A supplier uploaded a document to your RFX.'
  );

  -- Insert one user-scoped notification per RFX owner and editor
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    m.user_id,                                 -- auth.users.id
    'supplier_document_uploaded'::text as type,
    v_title as title,
    v_body  as body,
    'rfx'::text as target_type,
    v_invitation.rfx_id as target_id,
    ('/rfxs/candidates/' || v_invitation.rfx_id::text)::text as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.get_rfx_members(v_invitation.rfx_id) m   -- includes owner and members
  where m.user_id is not null;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_supplier_document_upload"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_supplier_document_upload"() IS 'Function is kept for potential future use, but trigger is disabled. Notifications are now sent only when invitation status changes to "submitted".';



CREATE OR REPLACE FUNCTION "public"."create_notifications_on_supplier_signed_nda"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rfx_id uuid;
  v_company_id uuid;
  v_rfx_name text;
  v_company_name text;
  v_title text;
  v_body text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- Resolve RFX and company from the invitation
  select rci.rfx_id, rci.company_id
    into v_rfx_id, v_company_id
  from public.rfx_company_invitations rci
  where rci.id = new.rfx_company_invitation_id;

  -- Load names (best-effort)
  select r.name into v_rfx_name
  from public.rfxs r
  where r.id = v_rfx_id;

  -- Prefer billing info name
  select bi.company_name into v_company_name
  from public.company_billing_info bi
  where bi.company_id = v_company_id;

  -- Fallback to latest active company_revision
  if v_company_name is null then
    select cr.nombre_empresa into v_company_name
    from public.company_revision cr
    where cr.company_id = v_company_id
      and coalesce(cr.is_active, false) = true
    order by cr.created_at desc
    limit 1;
  end if;

  v_title := 'Signed NDA uploaded';
  v_body  := coalesce(
    '"' || coalesce(v_company_name, 'A supplier') || '" uploaded a signed NDA for RFX "' || coalesce(v_rfx_name, '') || '".',
    'A signed NDA was uploaded.'
  );

  -- One notification per developer (developer_access.user_id is auth.users.id)
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    da.user_id as user_id,
    'supplier_signed_nda_uploaded'::text as type,
    v_title as title,
    v_body as body,
    'rfx'::text as target_type,
    v_rfx_id as target_id,
    '/rfx-management'::text as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from public.developer_access da
  where da.user_id is not null;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_notifications_on_supplier_signed_nda"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_notifications_on_supplier_signed_nda"() IS 'Creates in-app notifications to all developers when a supplier uploads a signed NDA for an RFX (SECURITY DEFINER).';



CREATE OR REPLACE FUNCTION "public"."create_or_reactivate_rfx_invitation"("p_rfx_id" "uuid", "p_invited_by" "uuid", "p_target_user_id" "uuid") RETURNS TABLE("invitation_id" "uuid", "invitation_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_debug_info text;
  v_result_id uuid;
  v_result_status text;
begin
  -- Log input
  v_debug_info := 'Creating/reactivating invitation for RFX ' || p_rfx_id || ' target ' || p_target_user_id;
  raise notice '%', v_debug_info;

  -- First check if user is already a member
  if exists (
    select 1 from public.rfx_members
    where rfx_id = p_rfx_id and user_id = p_target_user_id
  ) then
    raise exception 'User is already a member' using errcode = 'MBMER';
  end if;

  -- Then try to update any existing invitation to pending
  update public.rfx_invitations
  set status = 'pending',
      invited_by = p_invited_by,
      responded_at = null
  where rfx_id = p_rfx_id
    and target_user_id = p_target_user_id
    and rfx_invitations.status != 'pending'
  returning rfx_invitations.id, rfx_invitations.status
  into v_result_id, v_result_status;

  -- If no rows were updated, create new invitation
  if v_result_id is null then
    insert into public.rfx_invitations (rfx_id, invited_by, target_user_id, status)
    values (p_rfx_id, p_invited_by, p_target_user_id, 'pending')
    returning rfx_invitations.id, rfx_invitations.status
    into v_result_id, v_result_status;
  end if;

  invitation_id := v_result_id;
  invitation_status := v_result_status;
  return next;
end;
$$;


ALTER FUNCTION "public"."create_or_reactivate_rfx_invitation"("p_rfx_id" "uuid", "p_invited_by" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_rfx_approval_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text") RETURNS TABLE("notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Get all members including owner for this RFX
  -- Using the existing get_rfx_members function which returns auth.users.id as user_id
  -- Return the created notification IDs directly
  return query
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    m.user_id,  -- auth.users.id from get_rfx_members
    'rfx_approved_and_sent'::text as type,
    p_title as title,
    p_body as body,
    'rfx'::text as target_type,
    p_rfx_id as target_id,
    p_target_url as target_url,
    'both'::text as delivery_channel,
    0 as priority
  from public.get_rfx_members(p_rfx_id) m
  where m.user_id is not null
  returning id as notification_id;
end;
$$;


ALTER FUNCTION "public"."create_rfx_approval_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_rfx_approval_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text") IS 'Creates notifications for RFX owner and members when RFX is approved. Uses SECURITY DEFINER to bypass RLS. Returns array of created notification IDs.';



CREATE OR REPLACE FUNCTION "public"."create_rfx_member_invitation_notifications"("p_rfx_id" "uuid", "p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") RETURNS TABLE("notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    uid as user_id,  -- auth.users.id
    'rfx_member_invitation'::text as type,
    p_title as title,
    p_body as body,
    'rfx'::text as target_type,
    p_rfx_id as target_id,
    p_target_url as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from unnest(p_user_ids) as uid
  where uid is not null
  returning id as notification_id;
end;
$$;


ALTER FUNCTION "public"."create_rfx_member_invitation_notifications"("p_rfx_id" "uuid", "p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_rfx_member_invitation_notifications"("p_rfx_id" "uuid", "p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") IS 'Creates user-scoped in-app notifications for RFX member invitations. Uses SECURITY DEFINER to bypass RLS. Returns array of created notification IDs.';



CREATE OR REPLACE FUNCTION "public"."create_rfx_member_response_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text", "p_type" "text") RETURNS TABLE("notification_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Get all members including owner for this RFX
  -- Using the existing get_rfx_members function which returns auth.users.id as user_id
  -- Return the created notification IDs directly
  return query
  insert into public.notification_events (
    scope, user_id, type, title, body, target_type, target_id, target_url, delivery_channel, priority
  )
  select
    'user'::text as scope,
    m.user_id,  -- auth.users.id from get_rfx_members
    p_type::text as type,
    p_title as title,
    p_body as body,
    'rfx'::text as target_type,
    p_rfx_id as target_id,
    p_target_url as target_url,
    'in_app'::text as delivery_channel,
    0 as priority
  from public.get_rfx_members(p_rfx_id) m
  where m.user_id is not null
  returning id as notification_id;
end;
$$;


ALTER FUNCTION "public"."create_rfx_member_response_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text", "p_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_rfx_member_response_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text", "p_type" "text") IS 'Creates in-app notifications for all RFX members when someone accepts or declines an invitation. Uses SECURITY DEFINER to bypass RLS. Returns array of created notification IDs.';



CREATE OR REPLACE FUNCTION "public"."cron_run_process_embedding_scheduler"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Fire-and-forget: call the scheduler function via the Functions router
  perform http_send('POST', 'https://fukzxedgbszcpakqkrjf.functions.supabase.co/process-embedding-scheduler/run',
                    json_build_object('Content-Type','application/json')::json,
                    '{}');
exception when others then
  -- swallow errors to avoid cron job failing noisily
  null;
end;
$$;


ALTER FUNCTION "public"."cron_run_process_embedding_scheduler"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_app_user_id"("p_auth_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select au.id
  from public.app_user au
  where au.auth_user_id = p_auth_user_id
  limit 1
$$;


ALTER FUNCTION "public"."current_app_user_id"("p_auth_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_app_user_id"("p_auth_user_id" "uuid") IS 'Returns public.app_user.id for the given auth user (default auth.uid()).';



CREATE OR REPLACE FUNCTION "public"."deactivate_company_revisions"("p_company_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Check if user is an approved admin for this company
  IF NOT EXISTS (
    SELECT 1 
    FROM company_admin_requests car
    WHERE car.company_id = p_company_id 
    AND car.user_id = p_user_id 
    AND car.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'User is not an approved admin for this company';
  END IF;

  -- Deactivate ALL revisions for this company and clear their slugs
  -- (not just the active ones)
  UPDATE company_revision 
  SET is_active = false, slug = null
  WHERE company_id = p_company_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."deactivate_company_revisions"("p_company_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_old_public_conversation_image"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  old_filename TEXT;
  new_filename TEXT;
BEGIN
  -- Extract filename from old URL
  IF OLD.image_url IS NOT NULL AND OLD.image_url != '' THEN
    old_filename := split_part(OLD.image_url, '/', array_length(string_to_array(OLD.image_url, '/'), 1));
  END IF;
  
  -- Extract filename from new URL
  IF NEW.image_url IS NOT NULL AND NEW.image_url != '' THEN
    new_filename := split_part(NEW.image_url, '/', array_length(string_to_array(NEW.image_url, '/'), 1));
  END IF;
  
  -- Delete old file if it's different from new file and old file exists
  IF old_filename IS NOT NULL AND old_filename != '' AND (new_filename IS NULL OR new_filename != old_filename) THEN
    -- Delete from storage using the correct method
    DELETE FROM storage.objects 
    WHERE bucket_id = 'public-conversation-images' AND name = old_filename;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."delete_old_public_conversation_image"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_product_embeddings"("p_product_revision_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Delete all embeddings for this product revision
  DELETE FROM embedding 
  WHERE id_product_revision = p_product_revision_id;
END;
$$;


ALTER FUNCTION "public"."delete_product_embeddings"("p_product_revision_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_public_conversation_image"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  filename TEXT;
BEGIN
  -- Extract filename from URL
  IF OLD.image_url IS NOT NULL AND OLD.image_url != '' THEN
    filename := split_part(OLD.image_url, '/', array_length(string_to_array(OLD.image_url, '/'), 1));
    
    -- Delete from storage using the correct method
    IF filename IS NOT NULL AND filename != '' THEN
      DELETE FROM storage.objects 
      WHERE bucket_id = 'public-conversation-images' AND name = filename;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."delete_public_conversation_image"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_embedding_toggle_job"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    INSERT INTO public.embedding_toggle_jobs(company_revision_id, desired_is_active)
    VALUES (NEW.id, NEW.is_active);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_embedding_toggle_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_message_author"("p_rfx_id" "uuid", "p_message_content" "text", "p_message_timestamp" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "user_name" "text", "user_surname" "text", "user_email" "text", "sent_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Check if user has access to this RFX
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  -- Find the authorship record with matching content and closest timestamp
  return query
  select 
    rma.user_id,
    au.name as user_name,
    au.surname as user_surname,
    (u.email)::text as user_email,
    rma.sent_at
  from public.rfx_message_authorship rma
  join auth.users u on u.id = rma.user_id
  left join public.app_user au on au.auth_user_id = rma.user_id
  where rma.rfx_id = p_rfx_id
    and rma.message_content = p_message_content
  order by abs(extract(epoch from (rma.sent_at - p_message_timestamp)))
  limit 1;
end;
$$;


ALTER FUNCTION "public"."find_message_author"("p_rfx_id" "uuid", "p_message_content" "text", "p_message_timestamp" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_public_conversation_image_filename"("conversation_id" "uuid", "file_extension" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN 'conversation-' || conversation_id::TEXT || '-' || EXTRACT(EPOCH FROM NOW())::TEXT || '.' || file_extension;
END;
$$;


ALTER FUNCTION "public"."generate_public_conversation_image_filename"("conversation_id" "uuid", "file_extension" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_slug"("input_text" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  slug_text TEXT;
BEGIN
  -- Convert to lowercase, replace spaces and special characters with hyphens
  slug_text := LOWER(input_text);
  slug_text := REGEXP_REPLACE(slug_text, '[^a-z0-9]+', '-', 'g');
  slug_text := TRIM(BOTH '-' FROM slug_text);
  
  -- Ensure it's not empty
  IF slug_text = '' THEN
    slug_text := 'company';
  END IF;
  
  RETURN slug_text;
END;
$$;


ALTER FUNCTION "public"."generate_slug"("input_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_users_for_analytics"() RETURNS TABLE("id" "uuid", "email" character varying, "email_confirmed_at" timestamp with time zone, "confirmation_sent_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "confirmed_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id,
    au.email,
    au.email_confirmed_at,
    au.confirmation_sent_at,
    au.last_sign_in_at,
    au.created_at,
    au.updated_at,
    au.confirmed_at
  FROM auth.users au
  ORDER BY au.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."get_all_users_for_analytics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_announcement_creator_info"("p_user_id" "uuid", "p_rfx_id" "uuid") RETURNS TABLE("name" "text", "surname" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  -- Check if user has access to this RFX
  -- Either as RFX owner/member, or as supplier with active invitation
  if not (
    -- RFX owner or member
    exists (
      select 1
      from public.rfxs r
      where r.id = p_rfx_id
        and r.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.rfx_members m
      where m.rfx_id = p_rfx_id
        and m.user_id = auth.uid()
    )
    or exists (
      -- Supplier with active invitation (including submitted)
      select 1
      from public.rfx_company_invitations rci
      inner join public.company_admin_requests car
        on car.company_id = rci.company_id
        and car.user_id = auth.uid()
        and car.status = 'approved'
      where rci.rfx_id = p_rfx_id
        and rci.status IN ('supplier evaluating RFX', 'submitted')
    )
  ) then
    -- User doesn't have access to this RFX
    return;
  end if;

  -- Get creator info (bypassing RLS with SECURITY DEFINER)
  return query
  select 
    coalesce(au.name, '') as name,
    coalesce(au.surname, '') as surname
  from public.app_user au
  where au.auth_user_id = p_user_id;
end;
$$;


ALTER FUNCTION "public"."get_announcement_creator_info"("p_user_id" "uuid", "p_rfx_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_announcement_creator_info"("p_user_id" "uuid", "p_rfx_id" "uuid") IS 'Returns creator name and surname for an announcement if the current user has access to the RFX. Allows suppliers in rfx-viewer to see announcement creator names despite RLS restrictions on app_user.';



CREATE OR REPLACE FUNCTION "public"."get_basic_user_info"("p_user_ids" "uuid"[]) RETURNS TABLE("auth_user_id" "uuid", "email" "text", "name" "text", "surname" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select u.id as auth_user_id,
         (u.email)::text as email,
         pu.name,
         pu.surname
  from auth.users u
  left join public.app_user pu on pu.auth_user_id = u.id
  where u.id = any(p_user_ids);
end;
$$;


ALTER FUNCTION "public"."get_basic_user_info"("p_user_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_basic_user_info"("p_user_ids" "uuid"[]) IS 'Returns email and optional profile name/surname for given auth user ids';



CREATE OR REPLACE FUNCTION "public"."get_company_admin_request_processor_name"("processor_user_id" "uuid") RETURNS TABLE("name" "text", "surname" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    COALESCE(app_user.name, '') as name,
    COALESCE(app_user.surname, '') as surname
  FROM app_user
  WHERE app_user.auth_user_id = processor_user_id;
$$;


ALTER FUNCTION "public"."get_company_admin_request_processor_name"("processor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_pending_admin_requests"("p_company_id" "uuid", "p_requestor_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS TABLE("id" "uuid", "user_id" "uuid", "company_id" "uuid", "linkedin_url" "text", "comments" "text", "created_at" timestamp with time zone, "user_name" "text", "user_surname" "text", "user_email" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  is_requestor_admin boolean;
BEGIN
  -- Allow developers or approved admins for this company
  SELECT EXISTS (
    SELECT 1 FROM company_admin_requests car
    WHERE car.company_id = p_company_id
      AND car.user_id = p_requestor_user_id
      AND car.status = 'approved'
  ) INTO is_requestor_admin;

  IF NOT (is_requestor_admin OR public.has_developer_access()) THEN
    RAISE EXCEPTION 'Not authorized to list admin requests for this company';
  END IF;

  RETURN QUERY
  SELECT car.id,
         car.user_id,
         car.company_id,
         car.linkedin_url,
         car.comments,
         car.created_at,
         au.name AS user_name,
         au.surname AS user_surname,
         COALESCE(u.email, 'Email not available'::character varying) AS user_email
  FROM company_admin_requests car
  LEFT JOIN app_user au ON au.auth_user_id = car.user_id
  LEFT JOIN auth.users u ON u.id = car.user_id
  WHERE car.company_id = p_company_id
    AND car.status = 'pending'
  ORDER BY car.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."get_company_pending_admin_requests"("p_company_id" "uuid", "p_requestor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_revision_by_product_revision"("p_product_revision_id" "uuid", "p_only_active" boolean DEFAULT true) RETURNS TABLE("id_company_revision" "uuid", "company_id" "uuid", "nombre_empresa" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    select
        cr.id            as id_company_revision,
        cr.company_id,
        cr.nombre_empresa
    from product_revision pr
    join product          p  on p.id         = pr.product_id
    join company_revision cr on cr.company_id = p.company_id
    where pr.id = p_product_revision_id
      and (p_only_active = false or cr.is_active = true)
    order by cr.created_at desc               -- la revisión más reciente primero
    limit 1;                                  -- sólo una fila
$$;


ALTER FUNCTION "public"."get_company_revision_by_product_revision"("p_product_revision_id" "uuid", "p_only_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_embedding_analytics_data"() RETURNS TABLE("embedding_id" "uuid", "usage_count" integer, "positions" "text", "match_percentages" "text", "vector_similarities" "text", "embedding_text" "text", "id_product_revision" "uuid", "id_company_revision" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT 
    euc.embedding_id,
    euc.usage_count,
    euc.positions,
    euc.match_percentages,
    euc.vector_similarities,
    e.text as embedding_text,
    e.id_product_revision,
    e.id_company_revision
  FROM embedding_usage_counters euc
  JOIN embedding e ON e.id = euc.embedding_id
  WHERE e.is_active = true;
$$;


ALTER FUNCTION "public"."get_embedding_analytics_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_embedding_usage_stats"() RETURNS TABLE("total_embeddings" bigint, "total_usage_count" bigint, "most_used_embedding_id" "uuid", "most_used_count" integer, "least_used_embedding_id" "uuid", "least_used_count" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_embeddings,
        COALESCE(SUM(usage_count), 0)::BIGINT as total_usage_count,
        (SELECT embedding_id FROM embedding_usage_counters ORDER BY usage_count DESC LIMIT 1) as most_used_embedding_id,
        (SELECT usage_count FROM embedding_usage_counters ORDER BY usage_count DESC LIMIT 1) as most_used_count,
        (SELECT embedding_id FROM embedding_usage_counters ORDER BY usage_count ASC LIMIT 1) as least_used_embedding_id,
        (SELECT usage_count FROM embedding_usage_counters ORDER BY usage_count ASC LIMIT 1) as least_used_count
    FROM embedding_usage_counters;
END;
$$;


ALTER FUNCTION "public"."get_embedding_usage_stats"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_embedding_usage_stats"() IS 'Función para obtener estadísticas generales de uso de embeddings';



CREATE OR REPLACE FUNCTION "public"."get_product_revision_clean"("p_id" "uuid") RETURNS TABLE("id" "uuid", "product_name" "text", "long_description" "text", "main_category" "text", "subcategories" "text", "target_industries" "text", "key_features" "text", "use_cases" "text", "definition_score" "text", "improvement_advice" "text", "image" "text", "source_urls" "text")
    LANGUAGE "sql" STABLE
    AS $$
    select
        id,
        product_name,
        long_description,
        main_category,
        subcategories,
        target_industries,
        key_features,
        use_cases,
        definition_score,
        improvement_advice,
        image,
        source_urls
    from product_revision
    where id = p_id
      and is_active = true       -- solo productos activos
    limit 1;
$$;


ALTER FUNCTION "public"."get_product_revision_clean"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_products_by_company_revision"("p_company_revision_id" "uuid", "p_only_active" boolean DEFAULT true) RETURNS TABLE("id_product_revision" "uuid", "product_id" "uuid", "product_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select
    pr.id as id_product_revision,
    pr.product_id,
    pr.product_name
  from product_revision pr
  join product p on p.id = pr.product_id
  where p.company_id = (
    select company_id
    from company_revision
    where id = p_company_revision_id
  )
  and (not p_only_active or pr.is_active is true)
$$;


ALTER FUNCTION "public"."get_products_by_company_revision"("p_company_revision_id" "uuid", "p_only_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_conversation_image_url"("image_filename" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF image_filename IS NULL OR image_filename = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN 'https://' || current_setting('app.settings.supabase_url') || '/storage/v1/object/public/public-conversation-images/' || image_filename;
END;
$$;


ALTER FUNCTION "public"."get_public_conversation_image_url"("image_filename" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_conversations"("p_category" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "conversation_id" "uuid", "title" "text", "description" "text", "category" "text", "tags" "text"[], "is_featured" boolean, "view_count" integer, "display_order" integer, "made_public_at" timestamp with time zone, "conversation_preview" "text", "conversation_created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.conversation_id,
    COALESCE(pc.title, c.preview) as title,
    pc.description,
    pc.category,
    pc.tags,
    pc.is_featured,
    pc.view_count,
    pc.display_order,
    pc.made_public_at,
    c.preview as conversation_preview,
    c.created_at as conversation_created_at
  FROM public.public_conversations pc
  JOIN public.conversations c ON c.id = pc.conversation_id
  WHERE 
    (p_category IS NULL OR pc.category = p_category)
  ORDER BY 
    pc.is_featured DESC,
    pc.display_order ASC,
    pc.made_public_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_public_conversations"("p_category" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_conversations"("limit_count" integer DEFAULT 10, "offset_count" integer DEFAULT 0, "category_filter" "text" DEFAULT NULL::"text", "featured_only" boolean DEFAULT false) RETURNS TABLE("conversation_id" "uuid", "made_public_by" "uuid", "category" "text", "display_order" integer, "title" "text", "description" "text", "tags" "text"[], "is_featured" boolean, "view_count" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "preview" "text", "image_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.conversation_id,
    pc.made_public_by,
    pc.category,
    pc.display_order,
    pc.title,
    pc.description,
    pc.tags,
    pc.is_featured,
    pc.view_count,
    pc.created_at,
    pc.updated_at,
    COALESCE(
      pc.title,
      (SELECT cm.content 
       FROM public.chat_messages cm 
       WHERE cm.conversation_id = pc.conversation_id 
       AND cm.role = 'user' 
       ORDER BY cm.created_at ASC 
       LIMIT 1),
      'Example conversation'
    ) as preview,
    pc.image_url
  FROM public.public_conversations pc
  WHERE 
    (category_filter IS NULL OR pc.category = category_filter)
    AND (NOT featured_only OR pc.is_featured = true)
  ORDER BY 
    pc.display_order ASC,
    pc.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;


ALTER FUNCTION "public"."get_public_conversations"("limit_count" integer, "offset_count" integer, "category_filter" "text", "featured_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_rfx_basic_info_for_invited"("p_rfx_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "user_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  return query
  select r.id, r.name, r.description, r.user_id
  from public.rfxs r
  where r.id = any(p_rfx_ids)
    and exists (
      select 1
      from public.rfx_invitations i
      where i.rfx_id = r.id
        and i.target_user_id = auth.uid()
    );
end;
$$;


ALTER FUNCTION "public"."get_rfx_basic_info_for_invited"("p_rfx_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_rfx_basic_info_for_invited"("p_rfx_ids" "uuid"[]) IS 'Basic RFX fields accessible to invited users for the specified RFX ids';



CREATE OR REPLACE FUNCTION "public"."get_rfx_basic_info_for_suppliers"("p_rfx_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "creator_email" "text", "creator_name" "text", "creator_surname" "text", "sent_commit_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  return query
  select 
    r.id, 
    r.name, 
    r.description,
    r.creator_email,
    r.creator_name,
    r.creator_surname,
    r.sent_commit_id
  from public.rfxs r
  where r.id = any(p_rfx_ids)
    and exists (
      select 1
      from public.rfx_company_invitations rci
      inner join public.company_admin_requests car
        on car.company_id = rci.company_id
        and car.user_id = auth.uid()
        and car.status = 'approved'
      where rci.rfx_id = r.id
    );
end;
$$;


ALTER FUNCTION "public"."get_rfx_basic_info_for_suppliers"("p_rfx_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_rfx_basic_info_for_suppliers"("p_rfx_ids" "uuid"[]) IS 'Returns basic RFX information including creator fields and sent_commit_id for suppliers with active company invitations. Uses SECURITY DEFINER to avoid RLS recursion.';



CREATE OR REPLACE FUNCTION "public"."get_rfx_info_for_supplier"("p_rfx_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "user_id" "uuid", "sent_commit_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  -- Check if user is a supplier with active invitation (including submitted)
  if not exists (
    select 1
    from public.rfx_company_invitations rci
    inner join public.company_admin_requests car
      on car.company_id = rci.company_id
      and car.user_id = auth.uid()
      and car.status = 'approved'
    where rci.rfx_id = p_rfx_id
      and rci.status IN ('supplier evaluating RFX', 'submitted')
  ) then
    return;
  end if;

  -- Get RFX info directly (bypassing RLS)
  return query
  select r.id, r.name, r.description, r.user_id, r.sent_commit_id
  from public.rfxs r
  where r.id = p_rfx_id;
end;
$$;


ALTER FUNCTION "public"."get_rfx_info_for_supplier"("p_rfx_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_rfx_info_for_supplier"("p_rfx_id" "uuid") IS 'Returns RFX information (id, name, description, user_id, sent_commit_id) if the current user is a supplier with an active invitation (including submitted proposals). Uses SECURITY DEFINER to avoid RLS recursion.';



CREATE OR REPLACE FUNCTION "public"."get_rfx_invitations_for_owner"("p_rfx_id" "uuid") RETURNS TABLE("id" "uuid", "target_user_id" "uuid", "email" "text", "name" "text", "surname" "text", "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_debug_info text;
begin
  -- Log access check
  v_debug_info := 'Checking access for RFX ' || p_rfx_id || ' by user ' || auth.uid();
  raise notice '%', v_debug_info;

  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  -- Log found invitations
  create temp table if not exists found_invites as
  select i.id,
         i.target_user_id,
         (u.email)::text as email,
         pu.name,
         pu.surname,
         i.status,
         i.created_at
  from public.rfx_invitations i
  join auth.users u on u.id = i.target_user_id
  left join public.app_user pu on pu.auth_user_id = i.target_user_id
  where i.rfx_id = p_rfx_id
    and i.status = 'pending';

  v_debug_info := 'Found pending invitations: ' || (select count(*) from found_invites);
  raise notice '%', v_debug_info;

  return query select * from found_invites order by created_at desc;
  drop table if exists found_invites;
end;
$$;


ALTER FUNCTION "public"."get_rfx_invitations_for_owner"("p_rfx_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_rfx_members"("p_rfx_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "name" "text", "surname" "text", "role" "text", "created_at" timestamp with time zone, "rfx_owner_id" "uuid", "avatar_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner_id uuid;
begin
  -- Get RFX owner id
  select r.user_id into v_owner_id
  from public.rfxs r
  where r.id = p_rfx_id;

  -- Check if user has access (owner, member, supplier with active invitation, OR developer)
  -- Note: Suppliers with active invitation includes all acceptance statuses, not just 'supplier evaluating RFX'
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
    or exists (
      select 1 from public.rfx_company_invitations rci
      inner join public.company_admin_requests car
        on car.company_id = rci.company_id
        and car.user_id = auth.uid()
        and car.status = 'approved'
      where rci.rfx_id = p_rfx_id
        and rci.status IN (
          'supplier evaluating RFX',
          'waiting NDA signing',
          'waiting for NDA signature validation',
          'NDA signed by supplier',
          'submitted'
        )
    )
    or exists (select 1 from public.developer_access d where d.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members, owner, suppliers with active invitation, or developers only.' using errcode = 'P0001';
  end if;

  -- Return all members including owner, with owner first
  return query
  (
    -- First get owner as member
    select r.user_id,
           (u.email)::text as email,
           pu.name,
           pu.surname,
           'owner'::text as role,
           r.created_at,
           v_owner_id as rfx_owner_id,
           pu.avatar_url
    from public.rfxs r
    join auth.users u on u.id = r.user_id
    left join public.app_user pu on pu.auth_user_id = r.user_id
    where r.id = p_rfx_id
  )
  union all
  (
    -- Then get all members
    select m.user_id,
           (u.email)::text as email,
           pu.name,
           pu.surname,
           m.role,
           m.created_at,
           v_owner_id as rfx_owner_id,
           pu.avatar_url
    from public.rfx_members m
    join auth.users u on u.id = m.user_id
    left join public.app_user pu on pu.auth_user_id = m.user_id
    where m.rfx_id = p_rfx_id
  )
  order by created_at desc;
end;
$$;


ALTER FUNCTION "public"."get_rfx_members"("p_rfx_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_rfx_members"("p_rfx_id" "uuid") IS 'Returns all members for an RFX including owner, with email, name, surname, role, avatar_url and owner_id. Accessible by owner, members of the RFX, suppliers with active invitations (all acceptance statuses), or developers.';



CREATE OR REPLACE FUNCTION "public"."get_rfx_members_avatars"("p_rfx_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "avatar_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_owner_id uuid;
begin
  -- Get RFX owner id
  select r.user_id into v_owner_id
  from public.rfxs r
  where r.id = p_rfx_id;

  -- Check if user has access (owner or member)
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  -- Return all members including owner, with only essential fields for avatars
  return query
  (
    -- First get owner
    select r.user_id as user_id,
           (u.email)::text as email,
           pu.avatar_url as avatar_url
    from public.rfxs r
    join auth.users u on u.id = r.user_id
    left join public.app_user pu on pu.auth_user_id = r.user_id
    where r.id = p_rfx_id
  )
  union all
  (
    -- Then get all members ordered by creation date
    select m.user_id as user_id,
           (u.email)::text as email,
           pu.avatar_url as avatar_url
    from public.rfx_members m
    join auth.users u on u.id = m.user_id
    left join public.app_user pu on pu.auth_user_id = m.user_id
    where m.rfx_id = p_rfx_id
    order by m.created_at desc
  );
end;
$$;


ALTER FUNCTION "public"."get_rfx_members_avatars"("p_rfx_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_rfx_members_avatars"("p_rfx_id" "uuid") IS 'Returns only user_id, email, and avatar_url for RFX members (optimized for avatar display in lists)';



CREATE OR REPLACE FUNCTION "public"."get_rfx_message_authors"("p_rfx_id" "uuid", "p_message_ids" "text"[]) RETURNS TABLE("message_id" "text", "user_id" "uuid", "user_name" "text", "user_surname" "text", "user_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Check if user has access to this RFX
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  return query
  select 
    rma.message_id,
    rma.user_id,
    au.name,
    au.surname,
    (u.email)::text as user_email
  from public.rfx_message_authorship rma
  join auth.users u on u.id = rma.user_id
  left join public.app_user au on au.auth_user_id = rma.user_id
  where rma.rfx_id = p_rfx_id
    and rma.message_id = any(p_message_ids);
end;
$$;


ALTER FUNCTION "public"."get_rfx_message_authors"("p_rfx_id" "uuid", "p_message_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_rfx_sent_commit_id_for_supplier"("p_rfx_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_sent_commit_id uuid;
begin
  -- Check if user is a supplier with active invitation
  if not exists (
    select 1
    from public.rfx_company_invitations rci
    inner join public.company_admin_requests car
      on car.company_id = rci.company_id
      and car.user_id = auth.uid()
      and car.status = 'approved'
    where rci.rfx_id = p_rfx_id
      and rci.status = 'supplier evaluating RFX'
  ) then
    return null;
  end if;

  -- Get sent_commit_id directly (bypassing RLS)
  select r.sent_commit_id into v_sent_commit_id
  from public.rfxs r
  where r.id = p_rfx_id;

  return v_sent_commit_id;
end;
$$;


ALTER FUNCTION "public"."get_rfx_sent_commit_id_for_supplier"("p_rfx_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_rfx_sent_commit_id_for_supplier"("p_rfx_id" "uuid") IS 'Returns the sent_commit_id for an RFX if the current user is a supplier with an active invitation (including submitted proposals). Uses SECURITY DEFINER to avoid RLS recursion. DO NOT create a direct RLS policy on rfxs that queries rfx_company_invitations as it causes infinite recursion.';



CREATE OR REPLACE FUNCTION "public"."get_rfx_specs_commit_for_pdf"("p_commit_id" "uuid") RETURNS TABLE("description" "text", "technical_requirements" "text", "company_requirements" "text", "timeline" "jsonb", "images" "jsonb", "pdf_customization" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  -- Check if user is a developer
  if exists (
    select 1 from public.developer_access d where d.user_id = auth.uid()
  ) then
    -- Developers can access any commit
    return query
    select 
      c.description,
      c.technical_requirements,
      c.company_requirements,
      c.timeline,
      c.images,
      c.pdf_customization
    from public.rfx_specs_commits c
    where c.id = p_commit_id;
    return;
  end if;

  -- Check if user is a supplier with active invitation
  if exists (
    select 1
    from public.rfx_specs_commits c
    inner join public.rfxs r on r.id = c.rfx_id
    inner join public.rfx_company_invitations rci on rci.rfx_id = r.id
    inner join public.company_admin_requests car
      on car.company_id = rci.company_id
      and car.user_id = auth.uid()
      and car.status = 'approved'
    where c.id = p_commit_id
      and rci.status = 'supplier evaluating RFX'
  ) then
    -- Suppliers with active invitations can access commits
    return query
    select 
      c.description,
      c.technical_requirements,
      c.company_requirements,
      c.timeline,
      c.images,
      c.pdf_customization
    from public.rfx_specs_commits c
    where c.id = p_commit_id;
    return;
  end if;

  -- Check if user is owner or member of the RFX
  if exists (
    select 1
    from public.rfx_specs_commits c
    where c.id = p_commit_id
      and (
        exists (
          select 1 from public.rfxs r
          where r.id = c.rfx_id
            and r.user_id = auth.uid()
        )
        or exists (
          select 1 from public.rfx_members m
          where m.rfx_id = c.rfx_id
            and m.user_id = auth.uid()
        )
      )
  ) then
    -- Owners and members can access commits
    return query
    select 
      c.description,
      c.technical_requirements,
      c.company_requirements,
      c.timeline,
      c.images,
      c.pdf_customization
    from public.rfx_specs_commits c
    where c.id = p_commit_id;
    return;
  end if;

  -- No access
  return;
end;
$$;


ALTER FUNCTION "public"."get_rfx_specs_commit_for_pdf"("p_commit_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_rfx_specs_commit_for_pdf"("p_commit_id" "uuid") IS 'Returns RFX specs commit data for PDF generation. Allows developers, suppliers with active invitations, and RFX owners/members to access commits. Uses SECURITY DEFINER to avoid RLS issues.';



CREATE OR REPLACE FUNCTION "public"."get_rfx_specs_commits"("p_rfx_id" "uuid") RETURNS TABLE("id" "uuid", "commit_message" "text", "description" "text", "technical_requirements" "text", "company_requirements" "text", "timeline" "jsonb", "images" "jsonb", "pdf_customization" "jsonb", "committed_at" timestamp with time zone, "user_id" "uuid", "user_name" "text", "user_surname" "text", "user_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Check if user has access to this RFX
  if not (
    exists (select 1 from public.rfxs r where r.id = p_rfx_id and r.user_id = auth.uid())
    or exists (select 1 from public.rfx_members m where m.rfx_id = p_rfx_id and m.user_id = auth.uid())
  ) then
    raise exception 'Access denied. Members or owner only.' using errcode = 'P0001';
  end if;

  return query
  select 
    c.id,
    c.commit_message,
    c.description,
    c.technical_requirements,
    c.company_requirements,
    c.timeline,
    c.images,
    c.pdf_customization,
    c.committed_at,
    c.user_id,
    au.name as user_name,
    au.surname as user_surname,
    (u.email)::text as user_email
  from public.rfx_specs_commits c
  join auth.users u on u.id = c.user_id
  left join public.app_user au on au.auth_user_id = c.user_id
  where c.rfx_id = p_rfx_id
  order by c.committed_at desc;
end;
$$;


ALTER FUNCTION "public"."get_rfx_specs_commits"("p_rfx_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_info_for_company_admins"("target_user_id" "uuid") RETURNS TABLE("id" "uuid", "email" character varying, "created_at" timestamp with time zone, "name" "text", "surname" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT 
    au.id,
    au.email,
    au.created_at,
    COALESCE(app.name, '') as name,
    COALESCE(app.surname, '') as surname
  FROM auth.users au
  LEFT JOIN public.app_user app ON app.auth_user_id = au.id
  WHERE au.id = target_user_id
    AND (
      -- Allow developers
      EXISTS (
        SELECT 1 
        FROM public.developer_access da 
        WHERE da.user_id = auth.uid()
      )
      OR
      -- Allow approved company administrators to see other admins from the same companies they manage
      EXISTS (
        SELECT 1 
        FROM public.company_admin_requests car1
        WHERE car1.user_id = auth.uid() 
        AND car1.status = 'approved'
        AND car1.company_id IN (
          SELECT car2.company_id 
          FROM public.company_admin_requests car2
          WHERE car2.user_id = target_user_id
          AND car2.status = 'approved'
        )
      )
    );
$$;


ALTER FUNCTION "public"."get_user_info_for_company_admins"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_info_for_developers"("target_user_id" "uuid") RETURNS TABLE("id" "uuid", "email" character varying, "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT 
    au.id,
    au.email,
    au.created_at
  FROM auth.users au
  WHERE au.id = target_user_id
    AND EXISTS (
      SELECT 1 
      FROM public.developer_access da 
      WHERE da.user_id = auth.uid()
    );
$$;


ALTER FUNCTION "public"."get_user_info_for_developers"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_users_by_emails"("p_emails" "text"[]) RETURNS TABLE("id" "uuid", "email" "text", "name" "text", "surname" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_debug_info text;
begin
  -- Log input
  v_debug_info := 'Searching for emails: ' || array_to_string(p_emails, ', ');
  raise notice '%', v_debug_info;

  return query
  select distinct on (au.email)
         au.id,
         au.email::text as email,
         ap.name,
         ap.surname
  from auth.users au
  left join public.app_user ap on ap.auth_user_id = au.id
  where au.email = any(p_emails);
end;
$$;


ALTER FUNCTION "public"."get_users_by_emails"("p_emails" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_users_by_emails"("p_emails" "text"[]) IS 'Returns auth user ids and emails (and optional app_user name/surname) for given email array';



CREATE OR REPLACE FUNCTION "public"."get_users_with_emails_batch"("user_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "auth_user_id" "uuid", "name" "text", "surname" "text", "email" "text", "company_position" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  -- Only allow developers to call this function
  IF NOT has_developer_access() THEN
    RAISE EXCEPTION 'Access denied. Developer access required.';
  END IF;
  
  RETURN QUERY
  SELECT 
    au.id,
    au.auth_user_id,
    au.name, 
    au.surname,
    u.email,
    au.company_position
  FROM app_user au
  LEFT JOIN auth.users u ON u.id = au.auth_user_id
  WHERE au.auth_user_id = ANY(user_ids)
  ORDER BY au.name;
END;
$$;


ALTER FUNCTION "public"."get_users_with_emails_batch"("user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_verified"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.app_user (
    auth_user_id
  )
  values (
    new.id
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_user_verified"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_developer_access"("check_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.developer_access 
    WHERE user_id = check_user_id
  );
$$;


ALTER FUNCTION "public"."has_developer_access"("check_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_embedding_counter"("p_embedding_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE embedding_usage_counters 
    SET usage_count = usage_count + 1
    WHERE embedding_id = p_embedding_id;
END;
$$;


ALTER FUNCTION "public"."increment_embedding_counter"("p_embedding_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."increment_embedding_counter"("p_embedding_id" "uuid") IS 'Función para incrementar el contador de uso de un embedding de forma atómica';



CREATE OR REPLACE FUNCTION "public"."increment_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    UPDATE embedding_usage_counters 
    SET 
        usage_count = usage_count + 1,
        positions = COALESCE(positions, '') || p_positions,
        match_percentages = COALESCE(match_percentages, '') || p_matches
    WHERE embedding_id = p_embedding_id;
END;
$$;


ALTER FUNCTION "public"."increment_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_public_conversation_view_count"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.public_conversations
  SET view_count = view_count + 1
  WHERE conversation_id = p_conversation_id;
END;
$$;


ALTER FUNCTION "public"."increment_public_conversation_view_count"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_public_rfx_view_count"("p_rfx_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.public_rfxs
  set view_count = view_count + 1
  where rfx_id = p_rfx_id;
end;
$$;


ALTER FUNCTION "public"."increment_public_rfx_view_count"("p_rfx_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invalidate_rfx_validations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Invalidate all validations for this RFX when there's a change
  UPDATE rfx_validations
  SET is_valid = false
  WHERE rfx_id = NEW.rfx_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."invalidate_rfx_validations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_user"("user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(is_admin, false) 
  FROM public.app_user 
  WHERE auth_user_id = user_id;
$$;


ALTER FUNCTION "public"."is_admin_user"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM company_admin_requests 
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND status = 'approved'
  );
$$;


ALTER FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_rfx_participant"("p_rfx_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  -- Check if user is owner of RFX
  SELECT EXISTS (
    SELECT 1 FROM public.rfxs
    WHERE id = p_rfx_id
    AND user_id = p_user_id
  )
  OR
  -- Or if user is a member
  EXISTS (
    SELECT 1 FROM public.rfx_members
    WHERE rfx_id = p_rfx_id
    AND user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_rfx_participant"("p_rfx_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_rfx_participant"("p_rfx_id" "uuid", "p_user_id" "uuid") IS 'Check if a user is owner or member of an RFX - used by RLS policies to avoid recursion';



CREATE OR REPLACE FUNCTION "public"."mark_notification_archived"("p_notification_id" "uuid", "p_archived" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notification_user_state (notification_id, is_archived, archived_at)
  values (p_notification_id, p_archived, case when p_archived then now() else null end)
  on conflict (notification_id, user_id) do update
    set is_archived = excluded.is_archived,
        archived_at = excluded.archived_at,
        updated_at = now();
end;
$$;


ALTER FUNCTION "public"."mark_notification_archived"("p_notification_id" "uuid", "p_archived" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_notification_archived"("p_notification_id" "uuid", "p_archived" boolean) IS 'Upserts archived state for the current user on a notification.';



CREATE OR REPLACE FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_read" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notification_user_state (notification_id, is_read, read_at)
  values (p_notification_id, p_read, case when p_read then now() else null end)
  on conflict (notification_id, user_id) do update
    set is_read = excluded.is_read,
        read_at = excluded.read_at,
        updated_at = now();
end;
$$;


ALTER FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_read" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_read" boolean) IS 'Upserts read state for the current user on a notification.';



CREATE OR REPLACE FUNCTION "public"."mark_notification_reviewed"("p_notification_id" "uuid", "p_reviewed" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.notification_user_state (notification_id, is_reviewed, reviewed_at)
  values (p_notification_id, p_reviewed, case when p_reviewed then now() else null end)
  on conflict (notification_id, user_id) do update
    set is_reviewed = excluded.is_reviewed,
        reviewed_at = excluded.reviewed_at,
        updated_at = now();
end;
$$;


ALTER FUNCTION "public"."mark_notification_reviewed"("p_notification_id" "uuid", "p_reviewed" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_notification_reviewed"("p_notification_id" "uuid", "p_reviewed" boolean) IS 'Upserts reviewed state for the current user on a notification.';



CREATE OR REPLACE FUNCTION "public"."match_documents"("filter" "jsonb" DEFAULT '{}'::"jsonb", "match_count" integer DEFAULT 5, "query_embedding" "public"."vector" DEFAULT NULL::"public"."vector") RETURNS TABLE("content" "text", "metadata" "jsonb")
    LANGUAGE "sql" STABLE
    AS $$select
        text as content,
        jsonb_build_object(
            'id_company_revision',  e.id_company_revision,
            'id_product_revision',  e.id_product_revision
        ) as metadata
    from embedding e
    where e.is_active = true
    order by e.vector <=> query_embedding      -- menor distancia = más parecido
    limit match_count;$$;


ALTER FUNCTION "public"."match_documents"("filter" "jsonb", "match_count" integer, "query_embedding" "public"."vector") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision DEFAULT 0.78, "match_count" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "text" "text", "similarity" double precision, "id_company_revision" "uuid", "id_product_revision" "uuid")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    embedding.id,
    embedding.text,
    1 - (embedding.vector <=> query_embedding) AS similarity,
    embedding.id_company_revision,
    embedding.id_product_revision
  FROM embedding
  WHERE 
    embedding.is_active = true
    AND 1 - (embedding.vector <=> query_embedding) > match_threshold
  ORDER BY embedding.vector <=> query_embedding
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision DEFAULT 0.78, "match_count" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "text" "text", "similarity" double precision, "id_company_revision" "uuid", "id_product_revision" "uuid")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    embedding.id,
    embedding.text,
    1 - (embedding.vector <=> query_embedding) AS similarity,
    embedding.id_company_revision,
    embedding.id_product_revision
  FROM embedding
  WHERE 
    embedding.is_active = true
    AND 1 - (embedding.vector <=> query_embedding) > match_threshold
  ORDER BY embedding.vector <=> query_embedding
  LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings"("query_embedding" double precision[], "match_threshold" double precision, "match_count" integer, "vector_column" "text" DEFAULT 'vector'::"text") RETURNS TABLE("id" "uuid", "id_product_revision" "uuid", "id_company_revision" "uuid", "similarity" double precision, "text" "text")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    sql text;
BEGIN
    sql := format(
        $f$
        SELECT
            id,
            id_product_revision,
            id_company_revision,
            1 - (%1$s <=> ($1::vector)) AS similarity,
            text
        FROM embedding
        WHERE
            (1 - (%1$s <=> ($1::vector))) >= $2
        ORDER BY similarity DESC
        LIMIT $3
        $f$,
        quote_ident(vector_column)
    );

    RETURN QUERY EXECUTE sql USING query_embedding, match_threshold, match_count;
END;
$_$;


ALTER FUNCTION "public"."match_embeddings"("query_embedding" double precision[], "match_threshold" double precision, "match_count" integer, "vector_column" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings_3large"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "id_product_revision" "uuid", "id_company_revision" "uuid", "similarity" double precision, "text" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        embedding.id,
        embedding.id_product_revision,
        embedding.id_company_revision,
        1 - (embedding.vector1 <=> query_embedding) AS similarity,
        embedding.text
    FROM embedding
    WHERE (1 - (embedding.vector1 <=> query_embedding)) >= match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_embeddings_3large"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings_3small"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "id_product_revision" "uuid", "id_company_revision" "uuid", "similarity" double precision, "text" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
   BEGIN
       RETURN QUERY
       SELECT
           embedding.id,
           embedding.id_product_revision,
           embedding.id_company_revision,
           1 - (embedding.vector2 <=> query_embedding) AS similarity,
           embedding.text
       FROM embedding
       WHERE (1 - (embedding.vector2 <=> query_embedding)) >= match_threshold
       ORDER BY similarity DESC
       LIMIT match_count;
   END;
   $$;


ALTER FUNCTION "public"."match_embeddings_3small"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings_3small_balanced"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "id_product_revision" "uuid", "id_company_revision" "uuid", "similarity" double precision, "text" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
        BEGIN
            RETURN QUERY
            SELECT
                e.id,
                e.id_product_revision,
                e.id_company_revision,
                1 - (e.vector2 <=> query_embedding) AS similarity,
                e.text
            FROM embedding e
            WHERE e.vector2 IS NOT NULL
            AND (1 - (e.vector2 <=> query_embedding)) >= match_threshold
            ORDER BY e.vector2 <=> query_embedding
            LIMIT match_count;
        END;
        $$;


ALTER FUNCTION "public"."match_embeddings_3small_balanced"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings_3small_fixed"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "id_product_revision" "uuid", "id_company_revision" "uuid", "similarity" double precision, "text" "text")
    LANGUAGE "sql" STABLE
    AS $$
            SELECT
                embedding.id,
                embedding.id_product_revision,
                embedding.id_company_revision,
                1 - (embedding.vector2 <=> query_embedding) as similarity,
                embedding.text
            FROM embedding
            WHERE embedding.vector2 <=> query_embedding < (1 - match_threshold)
            ORDER BY embedding.vector2 <=> query_embedding
            LIMIT match_count;
        $$;


ALTER FUNCTION "public"."match_embeddings_3small_fixed"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings_3small_optimized"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "id_product_revision" "uuid", "id_company_revision" "uuid", "similarity" double precision, "text" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
        BEGIN
            RETURN QUERY
            SELECT
                e.id,
                e.id_product_revision,
                e.id_company_revision,
                1 - (e.vector2 <=> query_embedding) AS similarity,
                e.text
            FROM embedding e
            WHERE e.vector2 IS NOT NULL
            AND (1 - (e.vector2 <=> query_embedding)) >= match_threshold
            ORDER BY e.vector2 <=> query_embedding
            LIMIT match_count;
        END;
        $$;


ALTER FUNCTION "public"."match_embeddings_3small_optimized"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_embeddings_ada002"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "id_product_revision" "uuid", "id_company_revision" "uuid", "similarity" double precision, "text" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        embedding.id,
        embedding.id_product_revision,
        embedding.id_company_revision,
        1 - (embedding.vector <=> query_embedding) AS similarity,
        embedding.text
    FROM embedding
    WHERE (1 - (embedding.vector <=> query_embedding)) >= match_threshold
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;


ALTER FUNCTION "public"."match_embeddings_ada002"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_admin_privilege_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Allow admins to update is_admin field
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;
  
  -- Allow developers to update is_admin field
  IF public.has_developer_access() THEN
    RETURN NEW;
  END IF;
  
  -- Prevent non-admins and non-developers from changing is_admin field
  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    RAISE EXCEPTION 'Only administrators can modify admin status';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_admin_privilege_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_company_admin_request"("p_request_id" "uuid", "p_rejection_reason" "text" DEFAULT NULL::"text", "p_processor_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_company_id uuid;
  is_processor_admin boolean;
BEGIN
  -- Fetch company for authorization and lock the row
  SELECT company_id INTO v_company_id
  FROM company_admin_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin request not found';
  END IF;

  -- Allow developers or approved admins of the same company to process
  SELECT EXISTS (
    SELECT 1 FROM company_admin_requests car
    WHERE car.company_id = v_company_id
      AND car.user_id = p_processor_user_id
      AND car.status = 'approved'
  ) INTO is_processor_admin;

  IF NOT (is_processor_admin OR public.has_developer_access()) THEN
    RAISE EXCEPTION 'Not authorized to reject admin requests for this company';
  END IF;

  -- Update request status only if still pending
  UPDATE company_admin_requests
  SET status = 'rejected', processed_at = now(), processed_by = p_processor_user_id, rejection_reason = p_rejection_reason
  WHERE id = p_request_id AND status = 'pending';

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."reject_company_admin_request"("p_request_id" "uuid", "p_rejection_reason" "text", "p_processor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_company_admin"("p_user_id" "uuid", "p_company_id" "uuid", "p_removed_by" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_request_id uuid;
BEGIN
  -- Check if the removing user is an approved admin for this company (or developer)
  IF NOT (is_approved_company_admin(p_company_id, p_removed_by) OR has_developer_access()) THEN
    RAISE EXCEPTION 'Not authorized to remove admin privileges for this company';
  END IF;

  -- Get the admin request ID to update
  SELECT id INTO v_request_id
  FROM company_admin_requests
  WHERE user_id = p_user_id 
  AND company_id = p_company_id 
  AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not an approved admin for this company';
  END IF;

  -- Update the admin request status to 'rejected' instead of 'revoked'
  UPDATE company_admin_requests
  SET 
    status = 'rejected',
    processed_at = now(),
    processed_by = p_removed_by,
    rejection_reason = 'Admin privileges removed by another administrator'
  WHERE id = v_request_id;

  -- Remove admin privileges from app_user (if no other companies)
  UPDATE app_user
  SET 
    is_admin = CASE 
      WHEN EXISTS (
        SELECT 1 FROM company_admin_requests 
        WHERE user_id = p_user_id 
        AND status = 'approved' 
        AND company_id != p_company_id
      ) THEN true
      ELSE false
    END,
    company_id = CASE
      WHEN EXISTS (
        SELECT 1 FROM company_admin_requests 
        WHERE user_id = p_user_id 
        AND status = 'approved' 
        AND company_id != p_company_id
      ) THEN company_id
      ELSE NULL
    END
  WHERE auth_user_id = p_user_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."remove_company_admin"("p_user_id" "uuid", "p_company_id" "uuid", "p_removed_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_rfx_member"("p_rfx_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_debug_info text;
  v_owner_id uuid;
begin
  -- Log input
  v_debug_info := 'Removing member ' || p_user_id || ' from RFX ' || p_rfx_id;
  raise notice '%', v_debug_info;

  -- Get RFX owner
  select user_id into v_owner_id
  from public.rfxs
  where id = p_rfx_id;

  -- Check if caller is owner
  if auth.uid() != v_owner_id then
    raise exception 'Access denied. Only owner can remove members.' using errcode = 'OWNER';
  end if;

  -- Prevent owner self-removal
  if p_user_id = v_owner_id then
    raise exception 'Cannot remove owner from RFX.' using errcode = 'OWNER';
  end if;

  -- Remove member
  delete from public.rfx_members
  where rfx_id = p_rfx_id
    and user_id = p_user_id;

  -- Log result
  v_debug_info := 'Member removed successfully';
  raise notice '%', v_debug_info;
end;
$$;


ALTER FUNCTION "public"."remove_rfx_member"("p_rfx_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_company_slug"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  base_slug  text;
  final_slug text;
  counter    integer := 1;
BEGIN
  -- Si es un UPDATE y se desactiva, no tocar el slug
  IF TG_OP = 'UPDATE' AND NEW.is_active = false THEN
    RETURN NEW;
  END IF;

  -- Generar slug solo si no existe, hay nombre y el registro está activo
  IF NEW.slug IS NULL
     AND NEW.nombre_empresa IS NOT NULL
     AND NEW.is_active = true THEN

    base_slug := public.generate_slug(NEW.nombre_empresa);
    final_slug := base_slug;

    -- Asegurar unicidad del slug entre registros activos
    WHILE EXISTS (
      SELECT 1
      FROM public.company_revision
      WHERE slug = final_slug
        AND is_active = true
        AND id <> NEW.id
    ) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;

    NEW.slug := final_slug;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_company_slug"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_notification_user_state_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_notification_user_state_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_embeddings_by_revision"("p_company_revision_id" "uuid", "p_is_active" boolean) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.embedding e
  SET is_active = p_is_active
  WHERE e.id_company_revision = p_company_revision_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."toggle_embeddings_by_revision"("p_company_revision_id" "uuid", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_company_billing_info_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_company_billing_info_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_embedding_is_active"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Actualizar el campo is_active de todos los embeddings asociados a esta revisión de compañía
    UPDATE public.embedding
    SET is_active = NEW.is_active
    WHERE id_company_revision = NEW.id;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_embedding_is_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_embedding_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Actualiza el estado de todos los embeddings asociados con esta revisión de producto
  UPDATE embedding
  SET is_active = NEW.is_active
  WHERE id_product_revision = NEW.id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_embedding_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_public_conversations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_public_conversations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_public_rfxs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_public_rfxs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rfx_announcements_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_rfx_announcements_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rfx_selected_candidates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_modified_by = auth.uid();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_rfx_selected_candidates_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rfx_specs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_rfx_specs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rfx_validations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_rfx_validations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_rfxs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_rfxs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_supplier_lists_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_supplier_lists_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_type_selections_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_type_selections_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text", "p_similarities" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Insertar nuevo registro si no existe, o actualizar si existe
    INSERT INTO embedding_usage_counters (embedding_id, usage_count, positions, match_percentages, vector_similarities)
    VALUES (p_embedding_id, 1, p_positions, p_matches, p_similarities)
    ON CONFLICT (embedding_id) DO UPDATE SET
        usage_count = embedding_usage_counters.usage_count + 1,
        positions = COALESCE(embedding_usage_counters.positions, '') || p_positions,
        match_percentages = COALESCE(embedding_usage_counters.match_percentages, '') || p_matches,
        vector_similarities = COALESCE(embedding_usage_counters.vector_similarities, '') || p_similarities;
END;
$$;


ALTER FUNCTION "public"."upsert_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text", "p_similarities" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_memory_json" (
    "conversation_id" "uuid" NOT NULL,
    "memory" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_chat_state" "jsonb",
    "state_version" integer DEFAULT 1
);


ALTER TABLE "public"."agent_memory_json" OWNER TO "postgres";


COMMENT ON COLUMN "public"."agent_memory_json"."full_chat_state" IS 'Estado completo del ChatState serializado como JSON';



COMMENT ON COLUMN "public"."agent_memory_json"."state_version" IS 'Versión del esquema de estado para manejar retrocompatibilidad';



CREATE TABLE IF NOT EXISTS "public"."agent_prompt_backups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text" NOT NULL,
    "comment" "text",
    "system_prompt" "text",
    "recommendation_prompt" "text",
    "lookup_prompt" "text",
    "router_prompt" "text",
    "evaluate_product_prompt" "text",
    "router_model" "text",
    "router_temperature" double precision,
    "router_top_p" double precision,
    "router_frequency_penalty" double precision,
    "router_streaming" boolean,
    "lookup_model" "text",
    "lookup_temperature" double precision,
    "lookup_top_p" double precision,
    "lookup_frequency_penalty" double precision,
    "lookup_streaming" boolean,
    "recommendation_model" "text",
    "recommendation_temperature" double precision,
    "recommendation_top_p" double precision,
    "recommendation_frequency_penalty" double precision,
    "recommendation_streaming" boolean,
    "general_model" "text",
    "general_temperature" double precision,
    "general_top_p" double precision,
    "general_frequency_penalty" double precision,
    "general_streaming" boolean,
    "get_evaluations_model" "text",
    "get_evaluations_temperature" double precision,
    "get_evaluations_top_p" double precision,
    "get_evaluations_frequency_penalty" double precision,
    "get_evaluations_response_format" "text",
    "is_active" boolean DEFAULT false,
    "embedding_model" smallint DEFAULT '0'::smallint,
    "ai_product_completion_system_prompt" "text",
    "ai_product_completion_user_prompt" "text",
    "ai_product_completion_model" "text",
    "ai_product_completion_max_tokens" integer,
    "ai_product_completion_reasoning_effort" "text",
    "ai_product_completion_verbosity" "text",
    "ai_product_completion_language" "text",
    "ai_company_completion_system_prompt" "text",
    "ai_company_completion_user_prompt" "text",
    "ai_company_completion_model" "text",
    "ai_company_completion_max_tokens" integer,
    "ai_company_completion_reasoning_effort" "text",
    "ai_company_completion_verbosity" "text",
    "ai_company_completion_language" "text"
);


ALTER TABLE "public"."agent_prompt_backups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_prompt_backups_backup" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text" NOT NULL,
    "comment" "text",
    "system_prompt" "text",
    "recommendation_prompt" "text",
    "lookup_prompt" "text",
    "router_prompt" "text",
    "evaluate_product_prompt" "text",
    "router_model" "text",
    "router_temperature" double precision,
    "router_top_p" double precision,
    "router_frequency_penalty" double precision,
    "router_streaming" boolean,
    "lookup_model" "text",
    "lookup_temperature" double precision,
    "lookup_top_p" double precision,
    "lookup_frequency_penalty" double precision,
    "lookup_streaming" boolean,
    "recommendation_model" "text",
    "recommendation_temperature" double precision,
    "recommendation_top_p" double precision,
    "recommendation_frequency_penalty" double precision,
    "recommendation_streaming" boolean,
    "general_model" "text",
    "general_temperature" double precision,
    "general_top_p" double precision,
    "general_frequency_penalty" double precision,
    "general_streaming" boolean,
    "get_evaluations_model" "text",
    "get_evaluations_temperature" double precision,
    "get_evaluations_top_p" double precision,
    "get_evaluations_frequency_penalty" double precision,
    "get_evaluations_response_format" "text",
    "is_active" boolean DEFAULT false,
    "embedding_model" smallint DEFAULT '0'::smallint,
    "ai_product_completion_system_prompt" "text",
    "ai_product_completion_user_prompt" "text",
    "ai_product_completion_model" "text",
    "ai_product_completion_max_tokens" integer,
    "ai_product_completion_reasoning_effort" "text",
    "ai_product_completion_verbosity" "text",
    "ai_product_completion_language" "text",
    "ai_company_completion_system_prompt" "text",
    "ai_company_completion_user_prompt" "text",
    "ai_company_completion_model" "text",
    "ai_company_completion_max_tokens" integer,
    "ai_company_completion_reasoning_effort" "text",
    "ai_company_completion_verbosity" "text",
    "ai_company_completion_language" "text",
    "system_prompt_user" "text"
);


ALTER TABLE "public"."agent_prompt_backups_backup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_prompt_backups_v2" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "text" NOT NULL,
    "comment" "text",
    "system_prompt" "text",
    "recommendation_prompt" "text",
    "lookup_prompt" "text",
    "router_prompt" "text",
    "router_model" "text",
    "lookup_model" "text",
    "recommendation_model" "text",
    "general_model" "text",
    "get_evaluations_model" "text",
    "is_active" boolean DEFAULT false,
    "embedding_model" smallint DEFAULT '0'::smallint,
    "ai_product_completion_system_prompt" "text",
    "ai_product_completion_user_prompt" "text",
    "ai_product_completion_model" "text",
    "ai_product_completion_max_tokens" integer,
    "ai_product_completion_reasoning_effort" "text",
    "ai_product_completion_verbosity" "text",
    "ai_product_completion_language" "text",
    "ai_company_completion_system_prompt" "text",
    "ai_company_completion_user_prompt" "text",
    "ai_company_completion_model" "text",
    "ai_company_completion_max_tokens" integer,
    "ai_company_completion_reasoning_effort" "text",
    "ai_company_completion_verbosity" "text",
    "ai_company_completion_language" "text",
    "evaluations_system_prompt" "text",
    "evaluations_user_prompt" "text",
    "router_reasoning_effort" "text",
    "router_verbosity" "text",
    "lookup_reasoning_effort" "text",
    "lookup_verbosity" "text",
    "recommendation_reasoning_effort" "text",
    "recommendation_verbosity" "text",
    "general_reasoning_effort" "text",
    "general_verbosity" "text",
    "get_evaluations_reasoning_effort" "text",
    "get_evaluations_verbosity" "text",
    "technical_info_node_prompt" "text",
    "technical_info_node_model" "text" DEFAULT 'gpt-5-mini'::"text",
    "technical_info_node_temperature" numeric DEFAULT 0.1,
    "technical_info_node_max_tokens" integer DEFAULT 1000,
    "technical_info_node_verbosity" "text" DEFAULT 'low'::"text",
    "technical_info_node_reasoning_effort" "text" DEFAULT 'medium'::"text",
    "technical_decision_node_prompt" "text",
    "technical_decision_node_model" "text" DEFAULT 'gpt-5-mini'::"text",
    "technical_decision_node_temperature" numeric DEFAULT 0.1,
    "technical_decision_node_max_tokens" integer DEFAULT 200,
    "technical_decision_node_verbosity" "text" DEFAULT 'low'::"text",
    "technical_decision_node_reasoning_effort" "text" DEFAULT 'low'::"text",
    "company_info_node_prompt" "text",
    "company_info_node_model" "text" DEFAULT 'gpt-5-mini'::"text",
    "company_info_node_temperature" numeric DEFAULT 0.1,
    "company_info_node_max_tokens" integer DEFAULT 1000,
    "company_info_node_verbosity" "text" DEFAULT 'low'::"text",
    "company_info_node_reasoning_effort" "text" DEFAULT 'medium'::"text",
    "company_decision_node_prompt" "text",
    "company_decision_node_model" "text" DEFAULT 'gpt-5-mini'::"text",
    "company_decision_node_temperature" numeric DEFAULT 0.1,
    "company_decision_node_max_tokens" integer DEFAULT 200,
    "company_decision_node_verbosity" "text" DEFAULT 'low'::"text",
    "company_decision_node_reasoning_effort" "text" DEFAULT 'low'::"text",
    "evaluation_node_prompt" "text",
    "evaluation_node_model" "text" DEFAULT 'gpt-5-mini'::"text",
    "evaluation_node_temperature" numeric DEFAULT 0.1,
    "evaluation_node_max_tokens" integer DEFAULT 2000,
    "evaluation_node_verbosity" "text" DEFAULT 'low'::"text",
    "evaluation_node_reasoning_effort" "text" DEFAULT 'medium'::"text",
    "company_evaluation_system_prompt" "text",
    "company_evaluation_user_prompt" "text",
    "company_evaluation_model" "text" DEFAULT 'gpt-5-nano'::"text",
    "company_evaluation_temperature" numeric DEFAULT 0.1,
    "company_evaluation_max_tokens" integer DEFAULT 500,
    "company_evaluation_verbosity" "text" DEFAULT 'low'::"text",
    "company_evaluation_reasoning_effort" "text" DEFAULT 'low'::"text",
    "company_evaluation_response_format" "text" DEFAULT 'json_object'::"text",
    "rfx_conversational_system_prompt" "text",
    "propose_edits_system_prompt" "text",
    "propose_edits_default_language" "text"
);


ALTER TABLE "public"."agent_prompt_backups_v2" OWNER TO "postgres";


COMMENT ON COLUMN "public"."agent_prompt_backups_v2"."rfx_conversational_system_prompt" IS 'System prompt for the RFX conversational agent used in /ws-rfx-agent';



COMMENT ON COLUMN "public"."agent_prompt_backups_v2"."propose_edits_system_prompt" IS 'System prompt for the propose_edits tool';



COMMENT ON COLUMN "public"."agent_prompt_backups_v2"."propose_edits_default_language" IS 'Default language hint for propose_edits tool (e.g., "English", "Spanish")';



CREATE TABLE IF NOT EXISTS "public"."agent_prompts_dev" (
    "id" integer NOT NULL,
    "system_prompt" "text",
    "recommendation_prompt" "text",
    "lookup_prompt" "text",
    "router_prompt" "text",
    "evaluate_product_prompt" "text",
    "router_model" "text",
    "router_temperature" double precision,
    "router_top_p" double precision,
    "router_frequency_penalty" double precision,
    "router_streaming" boolean,
    "lookup_model" "text",
    "lookup_temperature" double precision,
    "lookup_top_p" double precision,
    "lookup_frequency_penalty" double precision,
    "lookup_streaming" boolean,
    "recommendation_model" "text",
    "recommendation_temperature" double precision,
    "recommendation_top_p" double precision,
    "recommendation_frequency_penalty" double precision,
    "recommendation_streaming" boolean,
    "general_model" "text",
    "general_temperature" double precision,
    "general_top_p" double precision,
    "general_frequency_penalty" double precision,
    "general_streaming" boolean,
    "get_evaluations_model" "text",
    "get_evaluations_temperature" double precision,
    "get_evaluations_top_p" double precision,
    "get_evaluations_frequency_penalty" double precision,
    "get_evaluations_response_format" "text"
);


ALTER TABLE "public"."agent_prompts_dev" OWNER TO "postgres";


COMMENT ON COLUMN "public"."agent_prompts_dev"."system_prompt" IS 'Prompt del nodo general';



CREATE SEQUENCE IF NOT EXISTS "public"."agent_prompts_dev_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."agent_prompts_dev_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agent_prompts_dev_id_seq" OWNED BY "public"."agent_prompts_dev"."id";



CREATE TABLE IF NOT EXISTS "public"."agent_prompts_prod" (
    "id" integer NOT NULL,
    "system_prompt" "text",
    "recommendation_prompt" "text",
    "lookup_prompt" "text",
    "router_prompt" "text",
    "evaluate_product_prompt" "text",
    "router_model" "text",
    "router_temperature" double precision,
    "router_top_p" double precision,
    "router_frequency_penalty" double precision,
    "router_streaming" boolean,
    "lookup_model" "text",
    "lookup_temperature" double precision,
    "lookup_top_p" double precision,
    "lookup_frequency_penalty" double precision,
    "lookup_streaming" boolean,
    "recommendation_model" "text",
    "recommendation_temperature" double precision,
    "recommendation_top_p" double precision,
    "recommendation_frequency_penalty" double precision,
    "recommendation_streaming" boolean,
    "general_model" "text",
    "general_temperature" double precision,
    "general_top_p" double precision,
    "general_frequency_penalty" double precision,
    "general_streaming" boolean,
    "get_evaluations_model" "text",
    "get_evaluations_temperature" double precision,
    "get_evaluations_top_p" double precision,
    "get_evaluations_frequency_penalty" double precision,
    "get_evaluations_response_format" "text"
);


ALTER TABLE "public"."agent_prompts_prod" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."agent_prompts_prod_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."agent_prompts_prod_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agent_prompts_prod_id_seq" OWNED BY "public"."agent_prompts_prod"."id";



CREATE TABLE IF NOT EXISTS "public"."app_user" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "surname" "text",
    "company_id" "uuid",
    "is_admin" boolean DEFAULT false,
    "is_verified" boolean DEFAULT false,
    "auth_user_id" "uuid",
    "company_position" "text",
    "avatar_url" "text"
);


ALTER TABLE "public"."app_user" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "sender_type" "text" NOT NULL,
    "source_type" "text",
    "content" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text", 'loading'::"text"]))),
    CONSTRAINT "chat_messages_source_type_check" CHECK (("source_type" = ANY (ARRAY['llm'::"text", 'embedding_search'::"text", 'tool'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "url_root" "text" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed" boolean DEFAULT false,
    "to_review" boolean DEFAULT false,
    "reviewed" boolean,
    "processed_v2" boolean DEFAULT false,
    "comment" "text",
    "updated_at" timestamp with time zone,
    "n_products" smallint,
    CONSTRAINT "company_role_check" CHECK (("role" = ANY (ARRAY['supplier'::"text", 'buyer'::"text"])))
);


ALTER TABLE "public"."company" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_admin_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "linkedin_url" "text" NOT NULL,
    "comments" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "processed_by" "uuid",
    "rejection_reason" "text",
    "documents" "text"[],
    CONSTRAINT "company_admin_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."company_admin_requests" OWNER TO "postgres";


COMMENT ON COLUMN "public"."company_admin_requests"."company_id" IS 'References company_revision.company_id (the invariant company identifier, not the revision id)';



COMMENT ON COLUMN "public"."company_admin_requests"."documents" IS 'Array of file paths in storage for uploaded documents';



CREATE TABLE IF NOT EXISTS "public"."company_billing_info" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "company_name" "text" NOT NULL,
    "tax_id" "text",
    "tax_type" "text",
    "address_line1" "text" NOT NULL,
    "address_line2" "text",
    "city" "text" NOT NULL,
    "state" "text",
    "postal_code" "text" NOT NULL,
    "country" "text" DEFAULT 'ES'::"text" NOT NULL,
    "billing_email" "text" NOT NULL,
    "billing_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."company_billing_info" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_cover_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "image_url" "text" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_cover_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "mime_type" "text" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_pending_list_Arturo" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "list" "text",
    "done" boolean DEFAULT false,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."company_pending_list_Arturo" OWNER TO "postgres";


ALTER TABLE "public"."company_pending_list_Arturo" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."company_pending_list_Arturo_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."company_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "comment" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "processed_by" "uuid"
);


ALTER TABLE "public"."company_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_revision" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT false,
    "nombre_empresa" "text",
    "description" "text",
    "main_activities" "text",
    "strengths" "text",
    "sectors" "text",
    "website" "text",
    "cities" "jsonb",
    "countries" "jsonb",
    "gps_coordinates" "jsonb",
    "revenues" "jsonb",
    "certifications" "jsonb",
    "score" integer,
    "score_rationale" "text",
    "cost" numeric,
    "processed" boolean,
    "slug" "text",
    "logo" "text",
    "main_customers" "jsonb" DEFAULT '[]'::"jsonb",
    "comment" "text",
    "contact_emails" "jsonb",
    "contact_phones" "jsonb",
    "embedded" boolean DEFAULT false,
    "created_by" "uuid",
    "youtube_url" "text",
    CONSTRAINT "company_revision_source_check" CHECK (("source" = ANY (ARRAY['scraped'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."company_revision" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_revision_activations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_revision_id" "uuid" NOT NULL,
    "activated_by" "uuid" NOT NULL,
    "activated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_revision_activations" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."company_revision_public" WITH ("security_invoker"='on') AS
 SELECT "company_revision"."id",
    "company_revision"."company_id",
    "company_revision"."nombre_empresa",
    "company_revision"."description",
    "company_revision"."main_activities",
    "company_revision"."strengths",
    "company_revision"."sectors",
    "company_revision"."website",
    "company_revision"."cities",
    "company_revision"."countries",
    "company_revision"."gps_coordinates",
    "company_revision"."revenues",
    "company_revision"."certifications"
   FROM "public"."company_revision";


ALTER TABLE "public"."company_revision_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ws_open" boolean DEFAULT false NOT NULL,
    "preview" "text"
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."developer_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "granted_by" "uuid"
);


ALTER TABLE "public"."developer_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."developer_company_request_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_request_id" "uuid" NOT NULL,
    "developer_user_id" "uuid" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."developer_company_request_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."developer_error_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "error_report_id" "uuid" NOT NULL,
    "developer_user_id" "uuid" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."developer_error_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."developer_feedback_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feedback_id" "uuid" NOT NULL,
    "developer_user_id" "uuid" NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."developer_feedback_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embedding" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "text" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "id_company_revision" "uuid",
    "id_product_revision" "uuid",
    "chunk_size" integer,
    "vector2" "public"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."embedding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embedding_toggle_jobs" (
    "id" bigint NOT NULL,
    "desired_is_active" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "company_revision_id" "uuid" NOT NULL
);


ALTER TABLE "public"."embedding_toggle_jobs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."embedding_toggle_jobs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."embedding_toggle_jobs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."embedding_toggle_jobs_id_seq" OWNED BY "public"."embedding_toggle_jobs"."id";



CREATE TABLE IF NOT EXISTS "public"."embedding_usage_counters" (
    "id" bigint NOT NULL,
    "embedding_id" "uuid" NOT NULL,
    "usage_count" integer DEFAULT 1 NOT NULL,
    "positions" "text" DEFAULT ''::"text",
    "match_percentages" "text" DEFAULT ''::"text",
    "vector_similarities" "text" DEFAULT ''::"text"
);


ALTER TABLE "public"."embedding_usage_counters" OWNER TO "postgres";


COMMENT ON TABLE "public"."embedding_usage_counters" IS 'Tabla para rastrear el uso de embeddings en búsquedas vectoriales';



COMMENT ON COLUMN "public"."embedding_usage_counters"."embedding_id" IS 'ID del embedding de la tabla embedding';



COMMENT ON COLUMN "public"."embedding_usage_counters"."usage_count" IS 'Número de veces que este embedding ha sido usado en resultados';



CREATE SEQUENCE IF NOT EXISTS "public"."embedding_usage_counters_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."embedding_usage_counters_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."embedding_usage_counters_id_seq" OWNED BY "public"."embedding_usage_counters"."id";



CREATE TABLE IF NOT EXISTS "public"."error_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolution_comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    CONSTRAINT "error_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."error_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evaluation_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "message_id" "text" NOT NULL,
    "user_id" "uuid",
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "evaluation_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."evaluation_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" NOT NULL,
    "user_id" "uuid",
    "company_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "target_url" "text",
    "delivery_channel" "text" DEFAULT 'in_app'::"text" NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_events_delivery_channel_check" CHECK (("delivery_channel" = ANY (ARRAY['in_app'::"text", 'email'::"text", 'both'::"text"]))),
    CONSTRAINT "notification_events_scope_check" CHECK (("scope" = ANY (ARRAY['user'::"text", 'company'::"text", 'global'::"text"]))),
    CONSTRAINT "notification_events_scope_consistency" CHECK (((("scope" = 'user'::"text") AND ("user_id" IS NOT NULL) AND ("company_id" IS NULL)) OR (("scope" = 'company'::"text") AND ("company_id" IS NOT NULL) AND ("user_id" IS NULL)) OR (("scope" = 'global'::"text") AND ("user_id" IS NULL) AND ("company_id" IS NULL))))
);


ALTER TABLE "public"."notification_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_events" IS 'Eventos de notificación de FQ Source, con alcance user/company/global.';



COMMENT ON COLUMN "public"."notification_events"."scope" IS 'Ámbito de la notificación: user, company o global.';



COMMENT ON COLUMN "public"."notification_events"."user_id" IS 'Usuario objetivo cuando scope = user.';



COMMENT ON COLUMN "public"."notification_events"."company_id" IS 'Empresa objetivo cuando scope = company.';



CREATE TABLE IF NOT EXISTS "public"."notification_user_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "read_at" timestamp with time zone,
    "is_reviewed" boolean DEFAULT false NOT NULL,
    "reviewed_at" timestamp with time zone,
    "is_archived" boolean DEFAULT false NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_user_state" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_user_state" IS 'Estado de cada notificación por usuario (leída, revisada, archivada).';



CREATE TABLE IF NOT EXISTS "public"."product" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "product_revision_id" "uuid",
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" NOT NULL,
    CONSTRAINT "product_documents_source_check" CHECK (("source" = ANY (ARRAY['manual_upload'::"text", 'auto_fill'::"text"])))
);


ALTER TABLE "public"."product_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_revision" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT false,
    "product_name" "text",
    "product_url" "text",
    "main_category" "text",
    "subcategories" "text",
    "short_description" "text",
    "long_description" "text",
    "target_industries" "text",
    "image" "text",
    "definition_score" "text",
    "improvement_advice" "text",
    "key_features" "text",
    "use_cases" "text",
    "source_urls" "text",
    "embedded" boolean DEFAULT false,
    "comment" "text",
    "created_by" "uuid",
    "youtube_url" "text",
    "pdf_url" "text",
    CONSTRAINT "product_revision_source_check" CHECK (("source" = ANY (ARRAY['scraped'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."product_revision" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_revision_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_revision_id" "uuid" NOT NULL,
    "action_by" "uuid" NOT NULL,
    "action_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action_type" "text" DEFAULT 'activation'::"text" NOT NULL,
    CONSTRAINT "check_action_type" CHECK (("action_type" = ANY (ARRAY['activation'::"text", 'deactivation'::"text"])))
);


ALTER TABLE "public"."product_revision_history" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."product_revision_public" WITH ("security_invoker"='on') AS
 SELECT "product_revision"."id",
    "product_revision"."product_id",
    "product_revision"."source",
    "product_revision"."product_name",
    "product_revision"."product_url",
    "product_revision"."main_category",
    "product_revision"."subcategories",
    "product_revision"."short_description",
    "product_revision"."long_description",
    "product_revision"."target_industries",
    "product_revision"."key_features",
    "product_revision"."use_cases",
    "product_revision"."source_urls"
   FROM "public"."product_revision";


ALTER TABLE "public"."product_revision_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prompts_webscrapping" (
    "id" bigint,
    "prompt_company_system" "text",
    "model" "text",
    "prompt_company_user" "text",
    "prompt_products1_system" "text",
    "prompt_products1_user" "text",
    "prompt_products2_system" "text",
    "prompt_products2_user" "text"
);


ALTER TABLE "public"."prompts_webscrapping" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "made_public_by" "uuid" NOT NULL,
    "made_public_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "display_order" integer DEFAULT 0,
    "title" "text",
    "description" "text",
    "tags" "text"[],
    "is_featured" boolean DEFAULT false,
    "view_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_url" "text"
);


ALTER TABLE "public"."public_conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."public_conversations" IS 'Stores references to conversations that developers have marked as public examples. Anyone can view these conversations and their messages.';



COMMENT ON COLUMN "public"."public_conversations"."category" IS 'Category for organizing examples (e.g., product_search, supplier_inquiry, rfq_example)';



COMMENT ON COLUMN "public"."public_conversations"."display_order" IS 'Lower numbers appear first in listings';



COMMENT ON COLUMN "public"."public_conversations"."is_featured" IS 'Featured examples are highlighted and shown first';



COMMENT ON COLUMN "public"."public_conversations"."image_url" IS 'URL of the image uploaded for this public conversation';



CREATE TABLE IF NOT EXISTS "public"."public_rfxs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "made_public_by" "uuid" NOT NULL,
    "made_public_at" timestamp with time zone DEFAULT "now"(),
    "category" "text",
    "display_order" integer DEFAULT 0,
    "title" "text",
    "description" "text",
    "tags" "text"[],
    "is_featured" boolean DEFAULT false,
    "view_count" integer DEFAULT 0,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."public_rfxs" OWNER TO "postgres";


COMMENT ON TABLE "public"."public_rfxs" IS 'Stores references to RFXs that developers have marked as public examples. Anyone can view these RFXs and their specs.';



CREATE TABLE IF NOT EXISTS "public"."rfx_announcement_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "announcement_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfx_announcement_attachments" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_announcement_attachments" IS 'Stores file attachments for RFX announcements';



COMMENT ON COLUMN "public"."rfx_announcement_attachments"."id" IS 'Unique identifier for the attachment';



COMMENT ON COLUMN "public"."rfx_announcement_attachments"."announcement_id" IS 'Reference to the announcement this attachment belongs to';



COMMENT ON COLUMN "public"."rfx_announcement_attachments"."file_path" IS 'Path to the file in storage bucket';



COMMENT ON COLUMN "public"."rfx_announcement_attachments"."file_name" IS 'Original file name';



COMMENT ON COLUMN "public"."rfx_announcement_attachments"."file_size" IS 'File size in bytes';



CREATE TABLE IF NOT EXISTS "public"."rfx_announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subject" "text" NOT NULL
);


ALTER TABLE "public"."rfx_announcements" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_announcements" IS 'Stores announcements/messages on the RFX bulletin board';



COMMENT ON COLUMN "public"."rfx_announcements"."id" IS 'Unique identifier for the announcement';



COMMENT ON COLUMN "public"."rfx_announcements"."rfx_id" IS 'Reference to the RFX this announcement belongs to';



COMMENT ON COLUMN "public"."rfx_announcements"."user_id" IS 'Reference to the user who created the announcement';



COMMENT ON COLUMN "public"."rfx_announcements"."message" IS 'The announcement message content';



COMMENT ON COLUMN "public"."rfx_announcements"."subject" IS 'Subject/title of the announcement (like email subject)';



CREATE TABLE IF NOT EXISTS "public"."rfx_company_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'waiting for supplier approval'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    CONSTRAINT "rfx_company_invitations_status_check" CHECK (("status" = ANY (ARRAY['waiting for supplier approval'::"text", 'waiting NDA signing'::"text", 'waiting for NDA signature validation'::"text", 'NDA signed by supplier'::"text", 'supplier evaluating RFX'::"text", 'submitted'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."rfx_company_invitations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rfx_company_invitations"."archived" IS 'Indicates if the supplier has archived this RFX invitation. Archived invitations are hidden by default but can be viewed with the "View archived" filter.';



CREATE TABLE IF NOT EXISTS "public"."rfx_developer_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "is_valid" boolean DEFAULT true NOT NULL,
    "reviewed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfx_developer_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfx_evaluation_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "evaluation_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfx_evaluation_results" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_evaluation_results" IS 'Stores historical evaluation results for RFX projects';



COMMENT ON COLUMN "public"."rfx_evaluation_results"."evaluation_data" IS 'JSONB data containing the evaluation results from tool_get_evaluations_result';



CREATE TABLE IF NOT EXISTS "public"."rfx_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "rfx_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."rfx_invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_invitations" IS 'Collaboration invitations for RFX projects';



CREATE TABLE IF NOT EXISTS "public"."rfx_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'editor'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rfx_members_role_check" CHECK (("role" = ANY (ARRAY['viewer'::"text", 'editor'::"text"])))
);


ALTER TABLE "public"."rfx_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_members" IS 'Accepted collaborators of RFX projects';



CREATE TABLE IF NOT EXISTS "public"."rfx_message_authorship" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "conversation_id" "text" NOT NULL,
    "message_content" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rfx_message_authorship" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfx_nda_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfx_nda_uploads" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_nda_uploads" IS 'Tracks NDA document uploads for RFXs (one NDA per RFX)';



COMMENT ON COLUMN "public"."rfx_nda_uploads"."rfx_id" IS 'The RFX this NDA is for';



COMMENT ON COLUMN "public"."rfx_nda_uploads"."file_path" IS 'Storage path: rfx_id/nda.pdf';



CREATE TABLE IF NOT EXISTS "public"."rfx_selected_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "selected" "jsonb" NOT NULL,
    "thresholds" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_modified_by" "uuid"
);


ALTER TABLE "public"."rfx_selected_candidates" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_selected_candidates" IS 'Stores a single shared list of selected candidates per RFX - all members can edit';



COMMENT ON COLUMN "public"."rfx_selected_candidates"."selected" IS 'Array of selected candidates with revision ids and scores';



COMMENT ON COLUMN "public"."rfx_selected_candidates"."thresholds" IS 'Thresholds (overall/technical/company) used to pre-filter selection';



COMMENT ON COLUMN "public"."rfx_selected_candidates"."last_modified_by" IS 'User who last modified this selection';



CREATE TABLE IF NOT EXISTS "public"."rfx_signed_nda_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_company_invitation_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "validated_by_fq_source" boolean DEFAULT false NOT NULL,
    "validated_by" "uuid",
    "validated_at" timestamp with time zone
);


ALTER TABLE "public"."rfx_signed_nda_uploads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rfx_signed_nda_uploads"."validated_by_fq_source" IS 'Indicates whether FQ Source has validated this signed NDA. Default is false, meaning it requires validation.';



COMMENT ON COLUMN "public"."rfx_signed_nda_uploads"."validated_by" IS 'User ID of the FQ Source reviewer who validated this NDA';



COMMENT ON COLUMN "public"."rfx_signed_nda_uploads"."validated_at" IS 'Timestamp when the NDA was validated by FQ Source';



CREATE TABLE IF NOT EXISTS "public"."rfx_specs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "description" "text",
    "technical_requirements" "text",
    "company_requirements" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "project_timeline" "jsonb",
    "image_categories" "jsonb",
    "pdf_header_bg_color" "text" DEFAULT '#1A1F2C'::"text",
    "pdf_header_text_color" "text" DEFAULT '#FFFFFF'::"text",
    "pdf_section_header_bg_color" "text" DEFAULT '#80c8f0'::"text",
    "pdf_section_header_text_color" "text" DEFAULT '#FFFFFF'::"text",
    "pdf_logo_url" "text",
    "pdf_logo_bg_color" "text" DEFAULT '#FFFFFF'::"text",
    "pdf_logo_bg_enabled" boolean DEFAULT false,
    "pdf_pages_logo_url" "text",
    "pdf_pages_logo_bg_color" "text" DEFAULT '#FFFFFF'::"text",
    "pdf_pages_logo_bg_enabled" boolean DEFAULT false,
    "pdf_pages_logo_use_header" boolean DEFAULT true,
    "base_commit_id" "uuid"
);


ALTER TABLE "public"."rfx_specs" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_specs" IS 'Stores specifications for RFX projects including technical and company requirements';



COMMENT ON COLUMN "public"."rfx_specs"."id" IS 'Unique identifier for the RFX specs';



COMMENT ON COLUMN "public"."rfx_specs"."rfx_id" IS 'Reference to the parent RFX';



COMMENT ON COLUMN "public"."rfx_specs"."description" IS 'Short description of the RFX';



COMMENT ON COLUMN "public"."rfx_specs"."technical_requirements" IS 'Free text field for technical requirements and specifications';



COMMENT ON COLUMN "public"."rfx_specs"."company_requirements" IS 'Free text field for company requirements and qualifications';



COMMENT ON COLUMN "public"."rfx_specs"."created_at" IS 'Timestamp when the specs were created';



COMMENT ON COLUMN "public"."rfx_specs"."updated_at" IS 'Timestamp when the specs were last updated';



COMMENT ON COLUMN "public"."rfx_specs"."project_timeline" IS 'JSON structure describing project milestones with absolute/relative dates';



COMMENT ON COLUMN "public"."rfx_specs"."image_categories" IS 'JSON array of image categories with image URLs for the RFX';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_header_bg_color" IS 'Hex color for the top header background on the first page';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_header_text_color" IS 'Hex color for header title and date text';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_section_header_bg_color" IS 'Hex color for section header background rectangles (default: #80c8f0)';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_section_header_text_color" IS 'Hex color for section header text';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_logo_url" IS 'Public URL for the PDF header logo (top right) stored in rfx-images bucket';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_logo_bg_color" IS 'Optional background color behind the header logo';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_logo_bg_enabled" IS 'Whether to render the header logo background color rectangle';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_pages_logo_url" IS 'Public URL for logo used on pages after the first';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_pages_logo_bg_color" IS 'Background color behind the pages header logo';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_pages_logo_bg_enabled" IS 'Whether to render background behind the pages header logo';



COMMENT ON COLUMN "public"."rfx_specs"."pdf_pages_logo_use_header" IS 'If true, reuse the first page header logo for subsequent pages';



COMMENT ON COLUMN "public"."rfx_specs"."base_commit_id" IS 'The commit ID that the current specs are based on. Used to track if there are uncommitted changes.';



CREATE TABLE IF NOT EXISTS "public"."rfx_specs_commits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "commit_message" "text" NOT NULL,
    "description" "text",
    "technical_requirements" "text",
    "company_requirements" "text",
    "committed_at" timestamp with time zone DEFAULT "now"(),
    "timeline" "jsonb",
    "images" "jsonb",
    "pdf_customization" "jsonb"
);


ALTER TABLE "public"."rfx_specs_commits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfx_supplier_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_company_invitation_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "category" "text" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rfx_supplier_documents_category_check" CHECK (("category" = ANY (ARRAY['proposal'::"text", 'offer'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."rfx_supplier_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfx_supplier_documents" IS 'Stores documents uploaded by suppliers in response to RFX invitations';



COMMENT ON COLUMN "public"."rfx_supplier_documents"."category" IS 'Document category: proposal (propuesta), offer (oferta), or other (otros documentos)';



CREATE TABLE IF NOT EXISTS "public"."rfx_validations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rfx_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "specs_commit_id" "uuid",
    "candidates_selection_timestamp" timestamp with time zone,
    "validated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_valid" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rfx_validations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rfxs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "progress_step" integer DEFAULT 0 NOT NULL,
    "creator_name" "text",
    "creator_surname" "text",
    "creator_email" "text",
    "sent_commit_id" "uuid",
    "archived" boolean DEFAULT false NOT NULL,
    CONSTRAINT "rfxs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'revision requested by buyer'::"text", 'waiting for supplier proposals'::"text", 'closed'::"text", 'cancelled'::"text", '4'::"text"])))
);


ALTER TABLE "public"."rfxs" OWNER TO "postgres";


COMMENT ON TABLE "public"."rfxs" IS 'Stores user RFX (Request for X) projects';



COMMENT ON COLUMN "public"."rfxs"."id" IS 'Unique identifier for the RFX';



COMMENT ON COLUMN "public"."rfxs"."user_id" IS 'Reference to the user who created the RFX';



COMMENT ON COLUMN "public"."rfxs"."name" IS 'Name/title of the RFX';



COMMENT ON COLUMN "public"."rfxs"."description" IS 'Detailed description of the RFX';



COMMENT ON COLUMN "public"."rfxs"."status" IS 'Current status of the RFX (draft, active, closed, cancelled)';



COMMENT ON COLUMN "public"."rfxs"."created_at" IS 'Timestamp when the RFX was created';



COMMENT ON COLUMN "public"."rfxs"."updated_at" IS 'Timestamp when the RFX was last updated';



COMMENT ON COLUMN "public"."rfxs"."progress_step" IS 'Current progress step: 0=just started, 1=specs completed, 2=candidates selected, 3=validations completed';



COMMENT ON COLUMN "public"."rfxs"."creator_name" IS 'Name of the RFX creator (cached at creation time)';



COMMENT ON COLUMN "public"."rfxs"."creator_surname" IS 'Surname of the RFX creator (cached at creation time)';



COMMENT ON COLUMN "public"."rfxs"."creator_email" IS 'Email of the RFX creator (cached at creation time)';



COMMENT ON COLUMN "public"."rfxs"."sent_commit_id" IS 'The commit ID of the RFX specs version that was sent to suppliers. This tracks which version suppliers are viewing.';



COMMENT ON COLUMN "public"."rfxs"."archived" IS 'Indicates if the RFX is archived. Archived RFXs cannot be modified and suppliers cannot upload documents.';



CREATE TABLE IF NOT EXISTS "public"."saved_companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "list_id" "uuid"
);


ALTER TABLE "public"."saved_companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "stripe_customer_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_customers" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_customers" IS 'Minimal mapping table: links company_id to stripe_customer_id. All subscription data is queried directly from Stripe.';



COMMENT ON COLUMN "public"."stripe_customers"."company_id" IS 'Company ID - foreign key to company table';



COMMENT ON COLUMN "public"."stripe_customers"."stripe_customer_id" IS 'Stripe customer ID - used to query subscription data directly from Stripe';



CREATE TABLE IF NOT EXISTS "public"."subscription" (
    "id_company" "uuid" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "is_active" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#3B82F6'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terms_acceptance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "company_name" "text" NOT NULL,
    "user_name" "text",
    "user_surname" "text",
    "client_ip" "text",
    "user_agent" "text",
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."terms_acceptance" OWNER TO "postgres";


COMMENT ON TABLE "public"."terms_acceptance" IS 'Stores user acceptance of terms and conditions and privacy policy before subscription';



COMMENT ON COLUMN "public"."terms_acceptance"."user_id" IS 'Reference to the user who accepted the terms';



COMMENT ON COLUMN "public"."terms_acceptance"."company_id" IS 'Reference to the company for which the subscription is being created';



COMMENT ON COLUMN "public"."terms_acceptance"."company_name" IS 'Name of the company at the time of acceptance';



COMMENT ON COLUMN "public"."terms_acceptance"."user_name" IS 'Name of the user at the time of acceptance';



COMMENT ON COLUMN "public"."terms_acceptance"."user_surname" IS 'Surname of the user at the time of acceptance';



COMMENT ON COLUMN "public"."terms_acceptance"."client_ip" IS 'IP address of the client at the time of acceptance';



COMMENT ON COLUMN "public"."terms_acceptance"."user_agent" IS 'User agent string of the browser at the time of acceptance';



COMMENT ON COLUMN "public"."terms_acceptance"."accepted_at" IS 'Timestamp when the terms were accepted';



CREATE TABLE IF NOT EXISTS "public"."user_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "feedback_text" "text" NOT NULL,
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL
);


ALTER TABLE "public"."user_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_type_selections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_type" "text" NOT NULL,
    "company_name" "text",
    "company_url" "text",
    "company_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_type_selections_user_type_check" CHECK (("user_type" = ANY (ARRAY['buyer'::"text", 'supplier'::"text"])))
);


ALTER TABLE "public"."user_type_selections" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_prompts_dev" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_prompts_dev_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agent_prompts_prod" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_prompts_prod_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."embedding_toggle_jobs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."embedding_toggle_jobs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."embedding_usage_counters" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."embedding_usage_counters_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agent_memory_json"
    ADD CONSTRAINT "agent_memory_json_pkey" PRIMARY KEY ("conversation_id");



ALTER TABLE ONLY "public"."agent_prompt_backups_backup"
    ADD CONSTRAINT "agent_prompt_backups_backup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_prompt_backups"
    ADD CONSTRAINT "agent_prompt_backups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_prompt_backups_v2"
    ADD CONSTRAINT "agent_prompt_backups_v2_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_prompts_dev"
    ADD CONSTRAINT "agent_prompts_dev_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_prompts_prod"
    ADD CONSTRAINT "agent_prompts_prod_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_user"
    ADD CONSTRAINT "app_user_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."app_user"
    ADD CONSTRAINT "app_user_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_admin_requests"
    ADD CONSTRAINT "company_admin_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_billing_info"
    ADD CONSTRAINT "company_billing_info_company_id_key" UNIQUE ("company_id");



ALTER TABLE ONLY "public"."company_billing_info"
    ADD CONSTRAINT "company_billing_info_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_cover_images"
    ADD CONSTRAINT "company_cover_images_company_id_key" UNIQUE ("company_id");



ALTER TABLE ONLY "public"."company_cover_images"
    ADD CONSTRAINT "company_cover_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_documents"
    ADD CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_pending_list_Arturo"
    ADD CONSTRAINT "company_pending_list_Arturo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company"
    ADD CONSTRAINT "company_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_requests"
    ADD CONSTRAINT "company_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_revision_activations"
    ADD CONSTRAINT "company_revision_activations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_revision"
    ADD CONSTRAINT "company_revision_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."developer_access"
    ADD CONSTRAINT "developer_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."developer_access"
    ADD CONSTRAINT "developer_access_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."developer_company_request_reviews"
    ADD CONSTRAINT "developer_company_request_rev_company_request_id_developer__key" UNIQUE ("company_request_id", "developer_user_id");



ALTER TABLE ONLY "public"."developer_company_request_reviews"
    ADD CONSTRAINT "developer_company_request_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."developer_error_reviews"
    ADD CONSTRAINT "developer_error_reviews_error_report_id_developer_user_id_key" UNIQUE ("error_report_id", "developer_user_id");



ALTER TABLE ONLY "public"."developer_error_reviews"
    ADD CONSTRAINT "developer_error_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."developer_feedback_reviews"
    ADD CONSTRAINT "developer_feedback_reviews_feedback_id_developer_user_id_key" UNIQUE ("feedback_id", "developer_user_id");



ALTER TABLE ONLY "public"."developer_feedback_reviews"
    ADD CONSTRAINT "developer_feedback_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."embedding"
    ADD CONSTRAINT "embedding_chunk_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."embedding_toggle_jobs"
    ADD CONSTRAINT "embedding_toggle_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."embedding_usage_counters"
    ADD CONSTRAINT "embedding_usage_counters_embedding_id_key" UNIQUE ("embedding_id");



ALTER TABLE ONLY "public"."embedding_usage_counters"
    ADD CONSTRAINT "embedding_usage_counters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."error_reports"
    ADD CONSTRAINT "error_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evaluation_ratings"
    ADD CONSTRAINT "evaluation_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_user_state"
    ADD CONSTRAINT "notification_user_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_documents"
    ADD CONSTRAINT "product_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product"
    ADD CONSTRAINT "product_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_revision_history"
    ADD CONSTRAINT "product_revision_activations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_revision"
    ADD CONSTRAINT "product_revision_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_conversations"
    ADD CONSTRAINT "public_conversations_conversation_id_key" UNIQUE ("conversation_id");



ALTER TABLE ONLY "public"."public_conversations"
    ADD CONSTRAINT "public_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_rfxs"
    ADD CONSTRAINT "public_rfxs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_rfxs"
    ADD CONSTRAINT "public_rfxs_rfx_id_key" UNIQUE ("rfx_id");



ALTER TABLE ONLY "public"."rfx_announcement_attachments"
    ADD CONSTRAINT "rfx_announcement_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_announcements"
    ADD CONSTRAINT "rfx_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_company_invitations"
    ADD CONSTRAINT "rfx_company_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_company_invitations"
    ADD CONSTRAINT "rfx_company_invitations_rfx_id_company_id_key" UNIQUE ("rfx_id", "company_id");



ALTER TABLE ONLY "public"."rfx_developer_reviews"
    ADD CONSTRAINT "rfx_developer_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_evaluation_results"
    ADD CONSTRAINT "rfx_evaluation_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_invitations"
    ADD CONSTRAINT "rfx_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_invitations"
    ADD CONSTRAINT "rfx_invitations_rfx_id_target_user_id_key" UNIQUE ("rfx_id", "target_user_id");



ALTER TABLE ONLY "public"."rfx_members"
    ADD CONSTRAINT "rfx_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_members"
    ADD CONSTRAINT "rfx_members_rfx_id_user_id_key" UNIQUE ("rfx_id", "user_id");



ALTER TABLE ONLY "public"."rfx_message_authorship"
    ADD CONSTRAINT "rfx_message_authorship_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_message_authorship"
    ADD CONSTRAINT "rfx_message_authorship_rfx_id_message_content_sent_at_key" UNIQUE ("rfx_id", "message_content", "sent_at");



ALTER TABLE ONLY "public"."rfx_nda_uploads"
    ADD CONSTRAINT "rfx_nda_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_nda_uploads"
    ADD CONSTRAINT "rfx_nda_uploads_rfx_id_key" UNIQUE ("rfx_id");



ALTER TABLE ONLY "public"."rfx_selected_candidates"
    ADD CONSTRAINT "rfx_selected_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_selected_candidates"
    ADD CONSTRAINT "rfx_selected_candidates_rfx_id_key" UNIQUE ("rfx_id");



ALTER TABLE ONLY "public"."rfx_signed_nda_uploads"
    ADD CONSTRAINT "rfx_signed_nda_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_specs_commits"
    ADD CONSTRAINT "rfx_specs_commits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_specs_commits"
    ADD CONSTRAINT "rfx_specs_commits_rfx_id_committed_at_user_id_key" UNIQUE ("rfx_id", "committed_at", "user_id");



ALTER TABLE ONLY "public"."rfx_specs"
    ADD CONSTRAINT "rfx_specs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_specs"
    ADD CONSTRAINT "rfx_specs_rfx_id_key" UNIQUE ("rfx_id");



ALTER TABLE ONLY "public"."rfx_supplier_documents"
    ADD CONSTRAINT "rfx_supplier_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_validations"
    ADD CONSTRAINT "rfx_validations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rfx_validations"
    ADD CONSTRAINT "rfx_validations_rfx_id_user_id_key" UNIQUE ("rfx_id", "user_id");



ALTER TABLE ONLY "public"."rfxs"
    ADD CONSTRAINT "rfxs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_companies"
    ADD CONSTRAINT "saved_companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_companies"
    ADD CONSTRAINT "saved_companies_user_company_list_unique" UNIQUE ("user_id", "company_id", "list_id");



ALTER TABLE ONLY "public"."stripe_customers"
    ADD CONSTRAINT "stripe_customers_company_id_key" UNIQUE ("company_id");



ALTER TABLE ONLY "public"."stripe_customers"
    ADD CONSTRAINT "stripe_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription"
    ADD CONSTRAINT "subscription_pkey" PRIMARY KEY ("id_company");



ALTER TABLE ONLY "public"."supplier_lists"
    ADD CONSTRAINT "supplier_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_lists"
    ADD CONSTRAINT "supplier_lists_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."terms_acceptance"
    ADD CONSTRAINT "terms_acceptance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_user"
    ADD CONSTRAINT "unique_auth_user_id" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_type_selections"
    ADD CONSTRAINT "user_type_selections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_type_selections"
    ADD CONSTRAINT "user_type_selections_user_id_key" UNIQUE ("user_id");



CREATE INDEX "agent_prompt_backups_v2_is_active_idx" ON "public"."agent_prompt_backups_v2" USING "btree" ("is_active");



CREATE INDEX "idx_agent_memory_json_conversation_id" ON "public"."agent_memory_json" USING "btree" ("conversation_id");



CREATE INDEX "idx_agent_memory_json_full_chat_state_gin" ON "public"."agent_memory_json" USING "gin" ("full_chat_state");



CREATE INDEX "idx_agent_memory_json_state_version" ON "public"."agent_memory_json" USING "btree" ("state_version");



CREATE INDEX "idx_agent_prompt_backups_is_active" ON "public"."agent_prompt_backups" USING "btree" ("is_active");



CREATE INDEX "idx_chatmsg_conv_time" ON "public"."chat_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_company_admin_requests_status" ON "public"."company_admin_requests" USING "btree" ("status");



CREATE INDEX "idx_company_admin_requests_user_id" ON "public"."company_admin_requests" USING "btree" ("user_id");



CREATE INDEX "idx_company_revision_activations_activated_by" ON "public"."company_revision_activations" USING "btree" ("activated_by");



CREATE INDEX "idx_company_revision_activations_revision_id" ON "public"."company_revision_activations" USING "btree" ("company_revision_id");



CREATE INDEX "idx_company_revision_active_created" ON "public"."company_revision" USING "btree" ("is_active", "created_at") WHERE ("is_active" = true);



CREATE INDEX "idx_company_revision_active_name" ON "public"."company_revision" USING "btree" ("is_active", "nombre_empresa") WHERE ("is_active" = true);



CREATE INDEX "idx_company_revision_company_id" ON "public"."company_revision" USING "btree" ("company_id");



COMMENT ON INDEX "public"."idx_company_revision_company_id" IS 'Index on company_id for efficient lookups in deactivate_company_revisions function and other company revision queries';



CREATE INDEX "idx_company_revision_created_by" ON "public"."company_revision" USING "btree" ("created_by");



CREATE UNIQUE INDEX "idx_company_revision_slug" ON "public"."company_revision" USING "btree" ("slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "idx_company_revision_slug_active" ON "public"."company_revision" USING "btree" ("slug", "is_active");



CREATE INDEX "idx_conversations_created_at" ON "public"."conversations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_conversations_preview_search" ON "public"."conversations" USING "gin" ("to_tsvector"('"english"'::"regconfig", "preview"));



CREATE INDEX "idx_conversations_user" ON "public"."conversations" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_user_id" ON "public"."conversations" USING "btree" ("user_id");



CREATE INDEX "idx_developer_error_reviews_developer_user_id" ON "public"."developer_error_reviews" USING "btree" ("developer_user_id");



CREATE INDEX "idx_developer_error_reviews_error_report_id" ON "public"."developer_error_reviews" USING "btree" ("error_report_id");



CREATE INDEX "idx_developer_error_reviews_user_error" ON "public"."developer_error_reviews" USING "btree" ("developer_user_id", "error_report_id");



CREATE INDEX "idx_developer_feedback_reviews_developer_user_id" ON "public"."developer_feedback_reviews" USING "btree" ("developer_user_id");



CREATE INDEX "idx_developer_feedback_reviews_feedback_id" ON "public"."developer_feedback_reviews" USING "btree" ("feedback_id");



CREATE INDEX "idx_embedding_id_company_revision" ON "public"."embedding" USING "btree" ("id_company_revision");



CREATE INDEX "idx_embedding_id_product_revision" ON "public"."embedding" USING "btree" ("id_product_revision");



CREATE INDEX "idx_embedding_toggle_jobs_company" ON "public"."embedding_toggle_jobs" USING "btree" ("company_revision_id");



CREATE INDEX "idx_embedding_toggle_jobs_pending" ON "public"."embedding_toggle_jobs" USING "btree" ("status", "created_at");



CREATE INDEX "idx_embedding_usage_counters_embedding_id" ON "public"."embedding_usage_counters" USING "btree" ("embedding_id");



CREATE INDEX "idx_embedding_usage_counters_usage_count" ON "public"."embedding_usage_counters" USING "btree" ("usage_count" DESC);



CREATE INDEX "idx_embedding_vector2_hnsw_max" ON "public"."embedding" USING "hnsw" ("vector2" "public"."vector_cosine_ops") WITH ("m"='32', "ef_construction"='400');



CREATE INDEX "idx_error_reports_conversation_id" ON "public"."error_reports" USING "btree" ("conversation_id");



CREATE INDEX "idx_error_reports_status" ON "public"."error_reports" USING "btree" ("status");



CREATE INDEX "idx_evaluation_ratings_conversation_id" ON "public"."evaluation_ratings" USING "btree" ("conversation_id");



CREATE INDEX "idx_evaluation_ratings_message_id" ON "public"."evaluation_ratings" USING "btree" ("message_id");



CREATE INDEX "idx_product_documents_product_id" ON "public"."product_documents" USING "btree" ("product_id");



CREATE INDEX "idx_product_documents_product_revision_id" ON "public"."product_documents" USING "btree" ("product_revision_id");



CREATE INDEX "idx_product_revision_history_action_at" ON "public"."product_revision_history" USING "btree" ("action_at" DESC);



CREATE INDEX "idx_product_revision_history_action_type" ON "public"."product_revision_history" USING "btree" ("action_type");



CREATE INDEX "idx_public_conversations_category" ON "public"."public_conversations" USING "btree" ("category");



CREATE INDEX "idx_public_conversations_conversation_id" ON "public"."public_conversations" USING "btree" ("conversation_id");



CREATE INDEX "idx_public_conversations_display_order" ON "public"."public_conversations" USING "btree" ("display_order");



CREATE INDEX "idx_public_conversations_image_url" ON "public"."public_conversations" USING "btree" ("image_url") WHERE ("image_url" IS NOT NULL);



CREATE INDEX "idx_public_conversations_is_featured" ON "public"."public_conversations" USING "btree" ("is_featured") WHERE ("is_featured" = true);



CREATE INDEX "idx_public_conversations_tags" ON "public"."public_conversations" USING "gin" ("tags");



CREATE INDEX "idx_public_rfxs_made_public_at" ON "public"."public_rfxs" USING "btree" ("made_public_at" DESC);



CREATE INDEX "idx_public_rfxs_rfx_id" ON "public"."public_rfxs" USING "btree" ("rfx_id");



CREATE INDEX "idx_revision_active" ON "public"."company_revision" USING "btree" ("company_id", "is_active");



CREATE INDEX "idx_rfx_announcement_attachments_announcement_id" ON "public"."rfx_announcement_attachments" USING "btree" ("announcement_id");



CREATE INDEX "idx_rfx_announcement_attachments_uploaded_at" ON "public"."rfx_announcement_attachments" USING "btree" ("uploaded_at" DESC);



CREATE INDEX "idx_rfx_announcements_created_at" ON "public"."rfx_announcements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_rfx_announcements_rfx_id" ON "public"."rfx_announcements" USING "btree" ("rfx_id");



CREATE INDEX "idx_rfx_company_invitations_archived" ON "public"."rfx_company_invitations" USING "btree" ("archived");



CREATE INDEX "idx_rfx_evaluation_results_created_at" ON "public"."rfx_evaluation_results" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_rfx_evaluation_results_rfx_id" ON "public"."rfx_evaluation_results" USING "btree" ("rfx_id");



CREATE INDEX "idx_rfx_evaluation_results_user_id" ON "public"."rfx_evaluation_results" USING "btree" ("user_id");



CREATE INDEX "idx_rfx_message_authorship_content" ON "public"."rfx_message_authorship" USING "btree" ("message_content");



CREATE INDEX "idx_rfx_message_authorship_conversation_id" ON "public"."rfx_message_authorship" USING "btree" ("conversation_id");



CREATE INDEX "idx_rfx_message_authorship_rfx_id" ON "public"."rfx_message_authorship" USING "btree" ("rfx_id");



CREATE INDEX "idx_rfx_message_authorship_sent_at" ON "public"."rfx_message_authorship" USING "btree" ("sent_at");



CREATE INDEX "idx_rfx_message_authorship_user_id" ON "public"."rfx_message_authorship" USING "btree" ("user_id");



CREATE INDEX "idx_rfx_nda_uploads_rfx_id" ON "public"."rfx_nda_uploads" USING "btree" ("rfx_id");



CREATE INDEX "idx_rfx_selected_candidates_rfx_id" ON "public"."rfx_selected_candidates" USING "btree" ("rfx_id");



CREATE INDEX "idx_rfx_selected_candidates_user_id" ON "public"."rfx_selected_candidates" USING "btree" ("user_id");



CREATE INDEX "idx_rfx_signed_nda_uploads_validated_at" ON "public"."rfx_signed_nda_uploads" USING "btree" ("validated_at" DESC) WHERE ("validated_by_fq_source" = true);



CREATE INDEX "idx_rfx_signed_nda_uploads_validated_by" ON "public"."rfx_signed_nda_uploads" USING "btree" ("validated_by");



CREATE INDEX "idx_rfx_signed_nda_uploads_validated_by_fq_source" ON "public"."rfx_signed_nda_uploads" USING "btree" ("validated_by_fq_source") WHERE ("validated_by_fq_source" = false);



CREATE INDEX "idx_rfx_specs_commits_committed_at" ON "public"."rfx_specs_commits" USING "btree" ("committed_at" DESC);



CREATE INDEX "idx_rfx_specs_commits_rfx_id" ON "public"."rfx_specs_commits" USING "btree" ("rfx_id");



CREATE INDEX "idx_rfx_specs_commits_user_id" ON "public"."rfx_specs_commits" USING "btree" ("user_id");



CREATE INDEX "idx_rfx_specs_rfx_id" ON "public"."rfx_specs" USING "btree" ("rfx_id");



CREATE INDEX "idx_rfx_supplier_documents_category" ON "public"."rfx_supplier_documents" USING "btree" ("category");



CREATE INDEX "idx_rfx_supplier_documents_invitation_id" ON "public"."rfx_supplier_documents" USING "btree" ("rfx_company_invitation_id");



CREATE INDEX "idx_rfx_supplier_documents_uploaded_by" ON "public"."rfx_supplier_documents" USING "btree" ("uploaded_by");



CREATE INDEX "idx_rfx_validations_is_valid" ON "public"."rfx_validations" USING "btree" ("is_valid");



CREATE INDEX "idx_rfx_validations_rfx_id" ON "public"."rfx_validations" USING "btree" ("rfx_id");



CREATE INDEX "idx_rfx_validations_user_id" ON "public"."rfx_validations" USING "btree" ("user_id");



CREATE INDEX "idx_rfxs_archived" ON "public"."rfxs" USING "btree" ("archived");



CREATE INDEX "idx_rfxs_created_at" ON "public"."rfxs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_rfxs_progress_step" ON "public"."rfxs" USING "btree" ("progress_step");



CREATE INDEX "idx_rfxs_sent_commit_id" ON "public"."rfxs" USING "btree" ("sent_commit_id");



CREATE INDEX "idx_rfxs_user_id" ON "public"."rfxs" USING "btree" ("user_id");



CREATE INDEX "idx_saved_companies_company_id" ON "public"."saved_companies" USING "btree" ("company_id");



CREATE INDEX "idx_saved_companies_list_id" ON "public"."saved_companies" USING "btree" ("list_id");



CREATE INDEX "idx_saved_companies_user_id" ON "public"."saved_companies" USING "btree" ("user_id");



CREATE INDEX "idx_supplier_lists_user_id" ON "public"."supplier_lists" USING "btree" ("user_id");



CREATE INDEX "idx_terms_acceptance_accepted_at" ON "public"."terms_acceptance" USING "btree" ("accepted_at" DESC);



CREATE INDEX "idx_terms_acceptance_company_id" ON "public"."terms_acceptance" USING "btree" ("company_id");



CREATE INDEX "idx_terms_acceptance_user_id" ON "public"."terms_acceptance" USING "btree" ("user_id");



CREATE INDEX "notification_events_company_idx" ON "public"."notification_events" USING "btree" ("company_id", "created_at" DESC);



CREATE INDEX "notification_events_scope_created_at_idx" ON "public"."notification_events" USING "btree" ("scope", "created_at" DESC);



CREATE INDEX "notification_events_user_idx" ON "public"."notification_events" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "notification_user_state_unique_idx" ON "public"."notification_user_state" USING "btree" ("notification_id", "user_id");



CREATE UNIQUE INDEX "ux_company_revision_slug_active" ON "public"."company_revision" USING "btree" ("slug") WHERE (("is_active" = true) AND ("slug" IS NOT NULL));



CREATE OR REPLACE TRIGGER "company_billing_info_updated_at" BEFORE UPDATE ON "public"."company_billing_info" FOR EACH ROW EXECUTE FUNCTION "public"."update_company_billing_info_updated_at"();



CREATE OR REPLACE TRIGGER "delete_old_public_conversation_image_trigger" BEFORE UPDATE ON "public"."public_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."delete_old_public_conversation_image"();



CREATE OR REPLACE TRIGGER "delete_public_conversation_image_trigger" BEFORE DELETE ON "public"."public_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."delete_public_conversation_image"();



CREATE OR REPLACE TRIGGER "invalidate_validations_on_candidates_change" AFTER UPDATE ON "public"."rfx_selected_candidates" FOR EACH ROW EXECUTE FUNCTION "public"."invalidate_rfx_validations"();



CREATE OR REPLACE TRIGGER "invalidate_validations_on_new_commit" AFTER INSERT ON "public"."rfx_specs_commits" FOR EACH ROW EXECUTE FUNCTION "public"."invalidate_rfx_validations"();



CREATE OR REPLACE TRIGGER "prevent_admin_escalation" BEFORE UPDATE ON "public"."app_user" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_admin_privilege_escalation"();



CREATE OR REPLACE TRIGGER "rfx_invitation_accept_trg" AFTER UPDATE ON "public"."rfx_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."_rfx_add_member_on_accept"();



CREATE OR REPLACE TRIGGER "set_public_conversations_updated_at" BEFORE UPDATE ON "public"."public_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_public_conversations_updated_at"();



CREATE OR REPLACE TRIGGER "sync_embedding_status" AFTER UPDATE OF "is_active" ON "public"."product_revision" FOR EACH ROW WHEN (("old"."is_active" IS DISTINCT FROM "new"."is_active")) EXECUTE FUNCTION "public"."update_embedding_status"();



CREATE OR REPLACE TRIGGER "trg_create_notifications_on_nda_validated" AFTER UPDATE OF "validated_by_fq_source" ON "public"."rfx_signed_nda_uploads" FOR EACH ROW EXECUTE FUNCTION "public"."create_notifications_on_nda_validated"();



CREATE OR REPLACE TRIGGER "trg_create_notifications_on_rfx_announcement" AFTER INSERT ON "public"."rfx_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."create_notifications_on_rfx_announcement"();



COMMENT ON TRIGGER "trg_create_notifications_on_rfx_announcement" ON "public"."rfx_announcements" IS 'Creates notifications for all companies related to an RFX when an announcement is posted (AFTER INSERT)';



CREATE OR REPLACE TRIGGER "trg_create_notifications_on_rfx_requirements_update" AFTER UPDATE OF "sent_commit_id" ON "public"."rfxs" FOR EACH ROW EXECUTE FUNCTION "public"."create_notifications_on_rfx_requirements_update"();



CREATE OR REPLACE TRIGGER "trg_create_notifications_on_rfx_sent" AFTER UPDATE OF "status" ON "public"."rfxs" FOR EACH ROW EXECUTE FUNCTION "public"."create_notifications_on_rfx_sent"();



CREATE OR REPLACE TRIGGER "trg_create_notifications_on_supplier_accept" AFTER UPDATE OF "status" ON "public"."rfx_company_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."create_notifications_on_supplier_accept"();



CREATE OR REPLACE TRIGGER "trg_create_notifications_on_supplier_signed_nda" AFTER INSERT ON "public"."rfx_signed_nda_uploads" FOR EACH ROW EXECUTE FUNCTION "public"."create_notifications_on_supplier_signed_nda"();



CREATE OR REPLACE TRIGGER "trg_enqueue_embedding_toggle" AFTER UPDATE OF "is_active" ON "public"."company_revision" FOR EACH ROW WHEN (("old"."is_active" IS DISTINCT FROM "new"."is_active")) EXECUTE FUNCTION "public"."enqueue_embedding_toggle_job"();



CREATE OR REPLACE TRIGGER "trg_notification_user_state_updated_at" BEFORE UPDATE ON "public"."notification_user_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_notification_user_state_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rfx_announcements_updated_at" BEFORE UPDATE ON "public"."rfx_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."update_rfx_announcements_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rfx_company_invitations_updated_at" BEFORE UPDATE ON "public"."rfx_company_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rfx_developer_reviews_updated_at" BEFORE UPDATE ON "public"."rfx_developer_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rfx_signed_nda_uploads_updated_at" BEFORE UPDATE ON "public"."rfx_signed_nda_uploads" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_company_slug" BEFORE INSERT OR UPDATE OF "nombre_empresa", "is_active", "slug" ON "public"."company_revision" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_slug"();



CREATE OR REPLACE TRIGGER "trigger_set_company_slug" BEFORE INSERT OR UPDATE ON "public"."company_revision" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_slug"();



CREATE OR REPLACE TRIGGER "update_embedding_is_active_trigger" AFTER UPDATE OF "is_active" ON "public"."company_revision" FOR EACH ROW WHEN (("old"."is_active" IS DISTINCT FROM "new"."is_active")) EXECUTE FUNCTION "public"."update_embedding_is_active"();



CREATE OR REPLACE TRIGGER "update_public_rfxs_updated_at_trigger" BEFORE UPDATE ON "public"."public_rfxs" FOR EACH ROW EXECUTE FUNCTION "public"."update_public_rfxs_updated_at"();



CREATE OR REPLACE TRIGGER "update_rfx_selected_candidates_updated_at" BEFORE UPDATE ON "public"."rfx_selected_candidates" FOR EACH ROW EXECUTE FUNCTION "public"."update_rfx_selected_candidates_updated_at"();



CREATE OR REPLACE TRIGGER "update_rfx_selected_candidates_updated_at_trigger" BEFORE UPDATE ON "public"."rfx_selected_candidates" FOR EACH ROW EXECUTE FUNCTION "public"."update_rfx_selected_candidates_updated_at"();



CREATE OR REPLACE TRIGGER "update_rfx_specs_updated_at_trigger" BEFORE UPDATE ON "public"."rfx_specs" FOR EACH ROW EXECUTE FUNCTION "public"."update_rfx_specs_updated_at"();



CREATE OR REPLACE TRIGGER "update_rfx_validations_updated_at" BEFORE UPDATE ON "public"."rfx_validations" FOR EACH ROW EXECUTE FUNCTION "public"."update_rfx_validations_updated_at"();



CREATE OR REPLACE TRIGGER "update_rfxs_updated_at_trigger" BEFORE UPDATE ON "public"."rfxs" FOR EACH ROW EXECUTE FUNCTION "public"."update_rfxs_updated_at"();



CREATE OR REPLACE TRIGGER "update_supplier_lists_updated_at" BEFORE UPDATE ON "public"."supplier_lists" FOR EACH ROW EXECUTE FUNCTION "public"."update_supplier_lists_updated_at"();



CREATE OR REPLACE TRIGGER "update_user_type_selections_updated_at" BEFORE UPDATE ON "public"."user_type_selections" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_type_selections_updated_at"();



ALTER TABLE ONLY "public"."agent_memory_json"
    ADD CONSTRAINT "agent_memory_json_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_user"
    ADD CONSTRAINT "app_user_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."app_user"
    ADD CONSTRAINT "app_user_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_admin_requests"
    ADD CONSTRAINT "company_admin_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."company_admin_requests"
    ADD CONSTRAINT "company_admin_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_billing_info"
    ADD CONSTRAINT "company_billing_info_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_billing_info"
    ADD CONSTRAINT "company_billing_info_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."company_billing_info"
    ADD CONSTRAINT "company_billing_info_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."company_cover_images"
    ADD CONSTRAINT "company_cover_images_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_requests"
    ADD CONSTRAINT "company_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."company_requests"
    ADD CONSTRAINT "company_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_revision_activations"
    ADD CONSTRAINT "company_revision_activations_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_revision_activations"
    ADD CONSTRAINT "company_revision_activations_company_revision_id_fkey" FOREIGN KEY ("company_revision_id") REFERENCES "public"."company_revision"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_revision"
    ADD CONSTRAINT "company_revision_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id");



ALTER TABLE ONLY "public"."company_revision"
    ADD CONSTRAINT "company_revision_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."developer_access"
    ADD CONSTRAINT "developer_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."developer_access"
    ADD CONSTRAINT "developer_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."developer_company_request_reviews"
    ADD CONSTRAINT "developer_company_request_reviews_company_request_id_fkey" FOREIGN KEY ("company_request_id") REFERENCES "public"."company_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."developer_error_reviews"
    ADD CONSTRAINT "developer_error_reviews_error_report_id_fkey" FOREIGN KEY ("error_report_id") REFERENCES "public"."error_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."developer_feedback_reviews"
    ADD CONSTRAINT "developer_feedback_reviews_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "public"."user_feedback"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."embedding"
    ADD CONSTRAINT "embedding_chunk_id_product_revision_fkey" FOREIGN KEY ("id_product_revision") REFERENCES "public"."product_revision"("id");



ALTER TABLE ONLY "public"."embedding"
    ADD CONSTRAINT "embedding_id_company_revision_fkey" FOREIGN KEY ("id_company_revision") REFERENCES "public"."company_revision"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."embedding_usage_counters"
    ADD CONSTRAINT "embedding_usage_counters_embedding_id_fkey" FOREIGN KEY ("embedding_id") REFERENCES "public"."embedding"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."error_reports"
    ADD CONSTRAINT "error_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."error_reports"
    ADD CONSTRAINT "error_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."company_admin_requests"
    ADD CONSTRAINT "fk_company_admin_requests_company_id" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id");



ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id");



ALTER TABLE ONLY "public"."notification_events"
    ADD CONSTRAINT "notification_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") NOT VALID;



ALTER TABLE ONLY "public"."notification_user_state"
    ADD CONSTRAINT "notification_user_state_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notification_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_user_state"
    ADD CONSTRAINT "notification_user_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") NOT VALID;



ALTER TABLE ONLY "public"."product"
    ADD CONSTRAINT "product_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id");



ALTER TABLE ONLY "public"."product_documents"
    ADD CONSTRAINT "product_documents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_documents"
    ADD CONSTRAINT "product_documents_product_revision_id_fkey" FOREIGN KEY ("product_revision_id") REFERENCES "public"."product_revision"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_documents"
    ADD CONSTRAINT "product_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_revision"
    ADD CONSTRAINT "product_revision_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."product_revision"
    ADD CONSTRAINT "product_revision_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id");



ALTER TABLE ONLY "public"."public_conversations"
    ADD CONSTRAINT "public_conversations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_conversations"
    ADD CONSTRAINT "public_conversations_made_public_by_fkey" FOREIGN KEY ("made_public_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."public_rfxs"
    ADD CONSTRAINT "public_rfxs_made_public_by_fkey" FOREIGN KEY ("made_public_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."public_rfxs"
    ADD CONSTRAINT "public_rfxs_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_announcement_attachments"
    ADD CONSTRAINT "rfx_announcement_attachments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "public"."rfx_announcements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_announcements"
    ADD CONSTRAINT "rfx_announcements_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_announcements"
    ADD CONSTRAINT "rfx_announcements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_company_invitations"
    ADD CONSTRAINT "rfx_company_invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_company_invitations"
    ADD CONSTRAINT "rfx_company_invitations_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_developer_reviews"
    ADD CONSTRAINT "rfx_developer_reviews_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_developer_reviews"
    ADD CONSTRAINT "rfx_developer_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_evaluation_results"
    ADD CONSTRAINT "rfx_evaluation_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_invitations"
    ADD CONSTRAINT "rfx_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_invitations"
    ADD CONSTRAINT "rfx_invitations_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_invitations"
    ADD CONSTRAINT "rfx_invitations_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_members"
    ADD CONSTRAINT "rfx_members_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_members"
    ADD CONSTRAINT "rfx_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_message_authorship"
    ADD CONSTRAINT "rfx_message_authorship_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_message_authorship"
    ADD CONSTRAINT "rfx_message_authorship_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_nda_uploads"
    ADD CONSTRAINT "rfx_nda_uploads_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_nda_uploads"
    ADD CONSTRAINT "rfx_nda_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rfx_selected_candidates"
    ADD CONSTRAINT "rfx_selected_candidates_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rfx_selected_candidates"
    ADD CONSTRAINT "rfx_selected_candidates_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_selected_candidates"
    ADD CONSTRAINT "rfx_selected_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_signed_nda_uploads"
    ADD CONSTRAINT "rfx_signed_nda_uploads_rfx_company_invitation_id_fkey" FOREIGN KEY ("rfx_company_invitation_id") REFERENCES "public"."rfx_company_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_signed_nda_uploads"
    ADD CONSTRAINT "rfx_signed_nda_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_signed_nda_uploads"
    ADD CONSTRAINT "rfx_signed_nda_uploads_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rfx_specs"
    ADD CONSTRAINT "rfx_specs_base_commit_id_fkey" FOREIGN KEY ("base_commit_id") REFERENCES "public"."rfx_specs_commits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rfx_specs_commits"
    ADD CONSTRAINT "rfx_specs_commits_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_specs_commits"
    ADD CONSTRAINT "rfx_specs_commits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_specs"
    ADD CONSTRAINT "rfx_specs_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_supplier_documents"
    ADD CONSTRAINT "rfx_supplier_documents_rfx_company_invitation_id_fkey" FOREIGN KEY ("rfx_company_invitation_id") REFERENCES "public"."rfx_company_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_supplier_documents"
    ADD CONSTRAINT "rfx_supplier_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rfx_validations"
    ADD CONSTRAINT "rfx_validations_rfx_id_fkey" FOREIGN KEY ("rfx_id") REFERENCES "public"."rfxs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfx_validations"
    ADD CONSTRAINT "rfx_validations_specs_commit_id_fkey" FOREIGN KEY ("specs_commit_id") REFERENCES "public"."rfx_specs_commits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rfx_validations"
    ADD CONSTRAINT "rfx_validations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rfxs"
    ADD CONSTRAINT "rfxs_sent_commit_id_fkey" FOREIGN KEY ("sent_commit_id") REFERENCES "public"."rfx_specs_commits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rfxs"
    ADD CONSTRAINT "rfxs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_companies"
    ADD CONSTRAINT "saved_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_companies"
    ADD CONSTRAINT "saved_companies_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."supplier_lists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stripe_customers"
    ADD CONSTRAINT "stripe_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription"
    ADD CONSTRAINT "subscription_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "public"."company"("id");



ALTER TABLE ONLY "public"."terms_acceptance"
    ADD CONSTRAINT "terms_acceptance_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."terms_acceptance"
    ADD CONSTRAINT "terms_acceptance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_type_selections"
    ADD CONSTRAINT "user_type_selections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Allow access to own conversations or anonymous conversations" ON "public"."conversations" FOR SELECT USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Allow authenticated users to create agent prompts" ON "public"."agent_prompts_dev" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to create backups" ON "public"."agent_prompt_backups" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to create backups v2" ON "public"."agent_prompt_backups_v2" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update agent prompts" ON "public"."agent_prompts_dev" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update backups" ON "public"."agent_prompt_backups" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update backups v2" ON "public"."agent_prompt_backups_v2" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to view agent prompts" ON "public"."agent_prompts_dev" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to view backups" ON "public"."agent_prompt_backups" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to view backups v2" ON "public"."agent_prompt_backups_v2" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow creating conversations for authenticated or anonymous use" ON "public"."conversations" FOR INSERT WITH CHECK ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Allow creating messages in accessible conversations" ON "public"."chat_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "chat_messages"."conversation_id") AND (("conversations"."user_id" IS NULL) OR ("conversations"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Allow deleting messages from accessible conversations" ON "public"."chat_messages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "chat_messages"."conversation_id") AND (("conversations"."user_id" IS NULL) OR ("conversations"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Allow deleting own conversations or anonymous conversations" ON "public"."conversations" FOR DELETE USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Allow updating messages in accessible conversations" ON "public"."chat_messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "chat_messages"."conversation_id") AND (("conversations"."user_id" IS NULL) OR ("conversations"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Allow updating own conversations or anonymous conversations" ON "public"."conversations" FOR UPDATE USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Allow viewing basic user info for conversations" ON "public"."app_user" FOR SELECT TO "authenticated" USING (("public"."has_developer_access"() OR (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE ("c"."user_id" = "app_user"."auth_user_id")))));



CREATE POLICY "Allow viewing messages from accessible conversations" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "chat_messages"."conversation_id") AND (("conversations"."user_id" IS NULL) OR ("conversations"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Anyone can view NDA metadata for public RFXs" ON "public"."rfx_nda_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_rfxs" "pr"
  WHERE ("pr"."rfx_id" = "rfx_nda_uploads"."rfx_id"))));



COMMENT ON POLICY "Anyone can view NDA metadata for public RFXs" ON "public"."rfx_nda_uploads" IS 'Allows anyone (including anonymous users) to view NDA metadata for RFXs that have been marked as public examples.';



CREATE POLICY "Anyone can view announcements for public RFXs" ON "public"."rfx_announcements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_rfxs" "pr"
  WHERE ("pr"."rfx_id" = "rfx_announcements"."rfx_id"))));



COMMENT ON POLICY "Anyone can view announcements for public RFXs" ON "public"."rfx_announcements" IS 'Allows anonymous users to read announcements when the RFX has been published as a public example.';



CREATE POLICY "Anyone can view attachments for public RFXs" ON "public"."rfx_announcement_attachments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_announcements" "a"
     JOIN "public"."public_rfxs" "pr" ON (("pr"."rfx_id" = "a"."rfx_id")))
  WHERE ("a"."id" = "rfx_announcement_attachments"."announcement_id"))));



COMMENT ON POLICY "Anyone can view attachments for public RFXs" ON "public"."rfx_announcement_attachments" IS 'Allows anonymous users to read announcement attachments when the RFX has been published as a public example.';



CREATE POLICY "Anyone can view company invitations for public RFXs" ON "public"."rfx_company_invitations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_rfxs" "pr"
  WHERE ("pr"."rfx_id" = "rfx_company_invitations"."rfx_id"))));



COMMENT ON POLICY "Anyone can view company invitations for public RFXs" ON "public"."rfx_company_invitations" IS 'Allows anonymous users to read company invitations when the RFX has been published as a public example.';



CREATE POLICY "Anyone can view evaluation results for public RFXs" ON "public"."rfx_evaluation_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_rfxs" "pr"
  WHERE ("pr"."rfx_id" = "rfx_evaluation_results"."rfx_id"))));



COMMENT ON POLICY "Anyone can view evaluation results for public RFXs" ON "public"."rfx_evaluation_results" IS 'Allows anonymous users to read evaluation results when the RFX has been published as a public example.';



CREATE POLICY "Anyone can view messages from public conversations" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_conversations" "pc"
  WHERE ("pc"."conversation_id" = "chat_messages"."conversation_id"))));



CREATE POLICY "Anyone can view public RFXs" ON "public"."rfxs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_rfxs" "pr"
  WHERE ("pr"."rfx_id" = "rfxs"."id"))));



COMMENT ON POLICY "Anyone can view public RFXs" ON "public"."rfxs" IS 'Allows anyone to read basic info for RFXs that have been marked as public examples.';



CREATE POLICY "Anyone can view public RFXs list" ON "public"."public_rfxs" FOR SELECT USING (true);



COMMENT ON POLICY "Anyone can view public RFXs list" ON "public"."public_rfxs" IS 'Allows anyone (including anonymous users) to view the list of public RFX examples.';



CREATE POLICY "Anyone can view public conversations" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_conversations"
  WHERE ("public_conversations"."conversation_id" = "conversations"."id"))));



CREATE POLICY "Anyone can view public conversations list" ON "public"."public_conversations" FOR SELECT USING (true);



CREATE POLICY "Anyone can view selected candidates for public RFXs" ON "public"."rfx_selected_candidates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_rfxs" "pr"
  WHERE ("pr"."rfx_id" = "rfx_selected_candidates"."rfx_id"))));



COMMENT ON POLICY "Anyone can view selected candidates for public RFXs" ON "public"."rfx_selected_candidates" IS 'Allows anonymous users to read selected candidates when the RFX has been published as a public example.';



CREATE POLICY "Anyone can view signed NDAs for public RFXs" ON "public"."rfx_signed_nda_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."public_rfxs" "pr" ON (("pr"."rfx_id" = "rci"."rfx_id")))
  WHERE ("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id"))));



COMMENT ON POLICY "Anyone can view signed NDAs for public RFXs" ON "public"."rfx_signed_nda_uploads" IS 'Allows anonymous users to read signed NDAs when the RFX has been published as a public example.';



CREATE POLICY "Anyone can view specs commits for public RFXs" ON "public"."rfx_specs_commits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_rfxs" "pr"
  WHERE ("pr"."rfx_id" = "rfx_specs_commits"."rfx_id"))));



COMMENT ON POLICY "Anyone can view specs commits for public RFXs" ON "public"."rfx_specs_commits" IS 'Allows anyone to read committed specifications for RFXs that have been marked as public examples.';



CREATE POLICY "Anyone can view specs for public RFXs" ON "public"."rfx_specs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_rfxs" "pr"
  WHERE ("pr"."rfx_id" = "rfx_specs"."rfx_id"))));



COMMENT ON POLICY "Anyone can view specs for public RFXs" ON "public"."rfx_specs" IS 'Allows anyone to read specifications for RFXs that have been marked as public examples.';



CREATE POLICY "Anyone can view supplier documents for public RFXs" ON "public"."rfx_supplier_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."public_rfxs" "pr" ON (("pr"."rfx_id" = "rci"."rfx_id")))
  WHERE ("rci"."id" = "rfx_supplier_documents"."rfx_company_invitation_id"))));



COMMENT ON POLICY "Anyone can view supplier documents for public RFXs" ON "public"."rfx_supplier_documents" IS 'Allows anonymous users to read supplier documents when the RFX has been published as a public example.';



CREATE POLICY "Approved company admins can create new company revisions" ON "public"."company_revision" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "company_revision"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can create product revisions for their " ON "public"."product_revision" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_revision"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can insert history entries" ON "public"."product_revision_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."product_revision" "pr"
     JOIN "public"."product" "p" ON (("p"."id" = "pr"."product_id")))
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("pr"."id" = "product_revision_history"."product_revision_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can insert product revision activations" ON "public"."product_revision_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."product_revision" "pr"
     JOIN "public"."product" "p" ON (("p"."id" = "pr"."product_id")))
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("pr"."id" = "product_revision_history"."product_revision_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can insert revision activations" ON "public"."company_revision_activations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."company_revision" "cr"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "cr"."company_id")))
  WHERE (("cr"."id" = "company_revision_activations"."company_revision_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can manage their company product revisi" ON "public"."product_revision" USING ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_revision"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can manage their company products" ON "public"."product" USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "product"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can update their company revisions" ON "public"."company_revision" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "company_revision"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "company_revision"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can view all requests for their company" ON "public"."company_admin_requests" FOR SELECT USING (("public"."is_approved_company_admin"("company_id") OR "public"."has_developer_access"()));



CREATE POLICY "Approved company admins can view all their company revisions" ON "public"."company_revision" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "company_revision"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can view their company revision activat" ON "public"."company_revision_activations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."company_revision" "cr"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "cr"."company_id")))
  WHERE (("cr"."id" = "company_revision_activations"."company_revision_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can view their history entries" ON "public"."product_revision_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."product_revision" "pr"
     JOIN "public"."product" "p" ON (("p"."id" = "pr"."product_id")))
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("pr"."id" = "product_revision_history"."product_revision_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Approved company admins can view their product revision activat" ON "public"."product_revision_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."product_revision" "pr"
     JOIN "public"."product" "p" ON (("p"."id" = "pr"."product_id")))
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("pr"."id" = "product_revision_history"."product_revision_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Authenticated users can view active company revisions" ON "public"."company_revision" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Authenticated users can view active product revisions" ON "public"."product_revision" FOR SELECT USING ((("is_active" = true) AND ("auth"."role"() = 'authenticated'::"text")));



CREATE POLICY "Authenticated users can view company documents" ON "public"."company_documents" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can view products" ON "public"."product" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Company admins can delete embeddings from their products" ON "public"."embedding" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."product_revision" "pr"
     JOIN "public"."product" "p" ON (("p"."id" = "pr"."product_id")))
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("pr"."id" = "embedding"."id_product_revision") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can delete product revisions from their company" ON "public"."product_revision" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_revision"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can delete products from their company" ON "public"."product" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "product"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can insert signed NDAs" ON "public"."rfx_signed_nda_uploads" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "rci"."company_id")))
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can manage their company documents" ON "public"."company_documents" USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "company_documents"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can manage their cover images" ON "public"."company_cover_images" USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "company_cover_images"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can update invitations" ON "public"."rfx_company_invitations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "rfx_company_invitations"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "rfx_company_invitations"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



COMMENT ON POLICY "Company admins can update invitations" ON "public"."rfx_company_invitations" IS 'Allows company admins to update RFX invitations for their company. This includes accepting invitations (changing status from "waiting for supplier approval" to acceptance statuses) and declining invitations.';



CREATE POLICY "Company admins can update signed NDAs" ON "public"."rfx_signed_nda_uploads" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "rci"."company_id")))
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "rci"."company_id")))
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can view invitations" ON "public"."rfx_company_invitations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "rfx_company_invitations"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can view signed NDAs" ON "public"."rfx_signed_nda_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "rci"."company_id")))
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Developers can create public RFXs" ON "public"."public_rfxs" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_developer_access"());



COMMENT ON POLICY "Developers can create public RFXs" ON "public"."public_rfxs" IS 'Only developers can mark RFXs as public examples.';



CREATE POLICY "Developers can create public conversations" ON "public"."public_conversations" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_developer_access"());



CREATE POLICY "Developers can create their own reviews" ON "public"."developer_company_request_reviews" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can create their own reviews" ON "public"."developer_error_reviews" FOR INSERT WITH CHECK (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can create their own reviews" ON "public"."developer_feedback_reviews" FOR INSERT WITH CHECK (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can delete public RFXs" ON "public"."public_rfxs" FOR DELETE TO "authenticated" USING ("public"."has_developer_access"());



COMMENT ON POLICY "Developers can delete public RFXs" ON "public"."public_rfxs" IS 'Only developers can remove RFXs from the public examples list.';



CREATE POLICY "Developers can delete public conversations" ON "public"."public_conversations" FOR DELETE TO "authenticated" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can insert invitations" ON "public"."rfx_company_invitations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can insert reviews" ON "public"."rfx_developer_reviews" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can manage all company documents" ON "public"."company_documents" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage all cover images" ON "public"."company_cover_images" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage all product documents" ON "public"."product_documents" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage all ratings" ON "public"."evaluation_ratings" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage companies" ON "public"."company" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage company revision activations" ON "public"."company_revision_activations" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage company revisions" ON "public"."company_revision" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage developer access" ON "public"."developer_access" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage embedding usage counters" ON "public"."embedding_usage_counters" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage embeddings" ON "public"."embedding" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage history entries" ON "public"."product_revision_history" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage product revision activations" ON "public"."product_revision_history" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage product revisions" ON "public"."product_revision" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage products" ON "public"."product" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage prompts_webscrapping" ON "public"."prompts_webscrapping" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can manage subscriptions" ON "public"."subscription" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update RFX status" ON "public"."rfxs" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



COMMENT ON POLICY "Developers can update RFX status" ON "public"."rfxs" IS 'Developers can update RFX status to move RFXs through the validation workflow (e.g., from "revision requested by buyer" to "waiting for supplier proposals")';



CREATE POLICY "Developers can update admin requests" ON "public"."company_admin_requests" FOR UPDATE USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update admin status and company assignments" ON "public"."app_user" FOR UPDATE TO "authenticated" USING ("public"."has_developer_access"()) WITH CHECK ("public"."has_developer_access"());



CREATE POLICY "Developers can update all company requests" ON "public"."company_requests" FOR UPDATE USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update error reports" ON "public"."error_reports" FOR UPDATE USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update feedback status" ON "public"."user_feedback" FOR UPDATE USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update invitations" ON "public"."rfx_company_invitations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can update own reviews" ON "public"."rfx_developer_reviews" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"()))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Developers can update public RFXs" ON "public"."public_rfxs" FOR UPDATE TO "authenticated" USING ("public"."has_developer_access"()) WITH CHECK ("public"."has_developer_access"());



COMMENT ON POLICY "Developers can update public RFXs" ON "public"."public_rfxs" IS 'Only developers can update metadata for public RFX examples.';



CREATE POLICY "Developers can update public conversations" ON "public"."public_conversations" FOR UPDATE TO "authenticated" USING ("public"."has_developer_access"()) WITH CHECK ("public"."has_developer_access"());



CREATE POLICY "Developers can update signed NDAs" ON "public"."rfx_signed_nda_uploads" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



COMMENT ON POLICY "Developers can update signed NDAs" ON "public"."rfx_signed_nda_uploads" IS 'Developers can update signed NDAs to mark them as validated (validated_by_fq_source, validated_by, validated_at)';



CREATE POLICY "Developers can update their own reviews" ON "public"."developer_company_request_reviews" FOR UPDATE TO "authenticated" USING (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can update their own reviews" ON "public"."developer_error_reviews" FOR UPDATE USING (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can update their own reviews" ON "public"."developer_feedback_reviews" FOR UPDATE USING (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can view all NDA metadata" ON "public"."rfx_nda_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



COMMENT ON POLICY "Developers can view all NDA metadata" ON "public"."rfx_nda_uploads" IS 'Developers can view all NDA metadata for RFX management purposes';



CREATE POLICY "Developers can view all RFX specs commits" ON "public"."rfx_specs_commits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



COMMENT ON POLICY "Developers can view all RFX specs commits" ON "public"."rfx_specs_commits" IS 'Allows developers to view all RFX specs commits. This is needed for the PDF generator to work in RFX Management.';



CREATE POLICY "Developers can view all RFXs" ON "public"."rfxs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can view all admin requests" ON "public"."company_admin_requests" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all app users" ON "public"."app_user" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all chat messages" ON "public"."chat_messages" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all companies" ON "public"."company" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all company requests" ON "public"."company_requests" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all conversations" ON "public"."conversations" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all embedding usage counters" ON "public"."embedding_usage_counters" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all embeddings" ON "public"."embedding" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all error reports" ON "public"."error_reports" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all error reports for filtering" ON "public"."error_reports" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all error reviews" ON "public"."developer_error_reviews" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all evaluation results" ON "public"."rfx_evaluation_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can view all feedback" ON "public"."user_feedback" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all members" ON "public"."rfx_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can view all ratings" ON "public"."evaluation_ratings" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all reviews" ON "public"."rfx_developer_reviews" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can view all rfx_company_invitations" ON "public"."rfx_company_invitations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can view all signed NDAs" ON "public"."rfx_signed_nda_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can view all terms acceptance" ON "public"."terms_acceptance" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_user"
  WHERE (("app_user"."auth_user_id" = "auth"."uid"()) AND ("app_user"."is_admin" = true)))));



CREATE POLICY "Developers can view all type selections" ON "public"."user_type_selections" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all validations" ON "public"."rfx_validations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can view developer access" ON "public"."developer_access" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view prompts_webscrapping" ON "public"."prompts_webscrapping" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view selected candidates" ON "public"."rfx_selected_candidates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."developer_access" "d"
  WHERE ("d"."user_id" = "auth"."uid"()))));



CREATE POLICY "Developers can view their own reviews" ON "public"."developer_company_request_reviews" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view their own reviews" ON "public"."developer_feedback_reviews" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Everyone can view cover images" ON "public"."company_cover_images" FOR SELECT USING (true);



CREATE POLICY "RFX owners and members can insert announcements" ON "public"."rfx_announcements" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."rfxs" "r"
  WHERE (("r"."id" = "rfx_announcements"."rfx_id") AND ("r"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members" "m"
  WHERE (("m"."rfx_id" = "rfx_announcements"."rfx_id") AND ("m"."user_id" = "auth"."uid"())))))));



CREATE POLICY "RFX owners and members can insert attachments" ON "public"."rfx_announcement_attachments" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."rfx_announcements" "a"
  WHERE (("a"."id" = "rfx_announcement_attachments"."announcement_id") AND ("a"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_announcements" "a"
  WHERE (("a"."id" = "rfx_announcement_attachments"."announcement_id") AND "public"."is_rfx_participant"("a"."rfx_id", "auth"."uid"()))))));



COMMENT ON POLICY "RFX owners and members can insert attachments" ON "public"."rfx_announcement_attachments" IS 'Users can insert attachments if they created the announcement or are participants (owner/member) of the RFX';



CREATE POLICY "RFX owners and members can insert invitations" ON "public"."rfx_company_invitations" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."rfxs" "r"
  WHERE (("r"."id" = "rfx_company_invitations"."rfx_id") AND ("r"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members" "m"
  WHERE (("m"."rfx_id" = "rfx_company_invitations"."rfx_id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "RFX owners and members can update announcements" ON "public"."rfx_announcements" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."rfxs" "r"
  WHERE (("r"."id" = "rfx_announcements"."rfx_id") AND ("r"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members" "m"
  WHERE (("m"."rfx_id" = "rfx_announcements"."rfx_id") AND ("m"."user_id" = "auth"."uid"()))))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."rfxs" "r"
  WHERE (("r"."id" = "rfx_announcements"."rfx_id") AND ("r"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members" "m"
  WHERE (("m"."rfx_id" = "rfx_announcements"."rfx_id") AND ("m"."user_id" = "auth"."uid"())))))));



CREATE POLICY "RFX owners and members can view announcements" ON "public"."rfx_announcements" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."rfxs" "r"
  WHERE (("r"."id" = "rfx_announcements"."rfx_id") AND ("r"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members" "m"
  WHERE (("m"."rfx_id" = "rfx_announcements"."rfx_id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "RFX owners and members can view attachments" ON "public"."rfx_announcement_attachments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_announcements" "a"
     JOIN "public"."rfxs" "r" ON (("r"."id" = "a"."rfx_id")))
  WHERE (("a"."id" = "rfx_announcement_attachments"."announcement_id") AND (("r"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."rfx_members" "m"
          WHERE (("m"."rfx_id" = "r"."id") AND ("m"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "RFX owners and members can view invitations" ON "public"."rfx_company_invitations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."rfxs" "r"
  WHERE (("r"."id" = "rfx_company_invitations"."rfx_id") AND ("r"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members" "m"
  WHERE (("m"."rfx_id" = "rfx_company_invitations"."rfx_id") AND ("m"."user_id" = "auth"."uid"()))))));



CREATE POLICY "RFX owners and members can view signed NDAs" ON "public"."rfx_signed_nda_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."rfxs" "r" ON (("r"."id" = "rci"."rfx_id")))
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND (("r"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."rfx_members" "m"
          WHERE (("m"."rfx_id" = "r"."id") AND ("m"."user_id" = "auth"."uid"())))))))));



COMMENT ON POLICY "RFX owners and members can view signed NDAs" ON "public"."rfx_signed_nda_uploads" IS 'Allows RFX owners and members (buyers) to view signed NDAs uploaded by suppliers for their RFX invitations';



CREATE POLICY "RFX owners can delete announcements" ON "public"."rfx_announcements" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs" "r"
  WHERE (("r"."id" = "rfx_announcements"."rfx_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "RFX owners can delete attachments" ON "public"."rfx_announcement_attachments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_announcements" "a"
     JOIN "public"."rfxs" "r" ON (("r"."id" = "a"."rfx_id")))
  WHERE (("a"."id" = "rfx_announcement_attachments"."announcement_id") AND ("r"."user_id" = "auth"."uid"())))));



CREATE POLICY "RFX participants can create shared candidate list" ON "public"."rfx_selected_candidates" FOR INSERT WITH CHECK ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



CREATE POLICY "RFX participants can delete NDA metadata" ON "public"."rfx_nda_uploads" FOR DELETE USING ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



CREATE POLICY "RFX participants can delete shared candidate list" ON "public"."rfx_selected_candidates" FOR DELETE USING ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



CREATE POLICY "RFX participants can insert NDA metadata" ON "public"."rfx_nda_uploads" FOR INSERT WITH CHECK ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



CREATE POLICY "RFX participants can update NDA metadata" ON "public"."rfx_nda_uploads" FOR UPDATE USING ("public"."is_rfx_participant"("rfx_id", "auth"."uid"())) WITH CHECK ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



CREATE POLICY "RFX participants can update shared candidate list" ON "public"."rfx_selected_candidates" FOR UPDATE USING ("public"."is_rfx_participant"("rfx_id", "auth"."uid"())) WITH CHECK ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



CREATE POLICY "RFX participants can view NDA metadata" ON "public"."rfx_nda_uploads" FOR SELECT USING ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



CREATE POLICY "RFX participants can view evaluation results" ON "public"."rfx_evaluation_results" FOR SELECT USING ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



COMMENT ON POLICY "RFX participants can view evaluation results" ON "public"."rfx_evaluation_results" IS 'All members and owners of an RFX can see evaluation results';



CREATE POLICY "RFX participants can view shared candidate list" ON "public"."rfx_selected_candidates" FOR SELECT USING ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



CREATE POLICY "RFX participants can view supplier documents" ON "public"."rfx_supplier_documents" FOR SELECT USING (("rfx_company_invitation_id" IN ( SELECT "rfx_company_invitations"."id"
   FROM "public"."rfx_company_invitations"
  WHERE ("rfx_company_invitations"."rfx_id" IN ( SELECT "rfxs"."id"
           FROM "public"."rfxs"
          WHERE (("rfxs"."user_id" = "auth"."uid"()) OR ("rfxs"."id" IN ( SELECT "rfx_members"."rfx_id"
                   FROM "public"."rfx_members"
                  WHERE ("rfx_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Suppliers can delete documents from their invitations" ON "public"."rfx_supplier_documents" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_company_invitations" "rci"
  WHERE (("rci"."id" = "rfx_supplier_documents"."rfx_company_invitation_id") AND ("rci"."company_id" IN ( SELECT "car"."company_id"
           FROM "public"."company_admin_requests" "car"
          WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))))));



COMMENT ON POLICY "Suppliers can delete documents from their invitations" ON "public"."rfx_supplier_documents" IS 'Allows any approved member of the company to delete documents from their RFX invitations, not just the user who uploaded them';



CREATE POLICY "Suppliers can delete signed NDAs for their invitations" ON "public"."rfx_signed_nda_uploads" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_company_invitations" "rci"
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("rci"."company_id" IN ( SELECT "car"."company_id"
           FROM "public"."company_admin_requests" "car"
          WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))))));



CREATE POLICY "Suppliers can insert signed NDAs for their invitations" ON "public"."rfx_signed_nda_uploads" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rfx_company_invitations" "rci"
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("rci"."company_id" IN ( SELECT "car"."company_id"
           FROM "public"."company_admin_requests" "car"
          WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))))));



CREATE POLICY "Suppliers can update signed NDAs for their invitations" ON "public"."rfx_signed_nda_uploads" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_company_invitations" "rci"
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("rci"."company_id" IN ( SELECT "car"."company_id"
           FROM "public"."company_admin_requests" "car"
          WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rfx_company_invitations" "rci"
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("rci"."company_id" IN ( SELECT "car"."company_id"
           FROM "public"."company_admin_requests" "car"
          WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))))));



CREATE POLICY "Suppliers can upload documents" ON "public"."rfx_supplier_documents" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."rfx_company_invitations" "rci"
  WHERE (("rci"."id" = "rfx_supplier_documents"."rfx_company_invitation_id") AND ("rci"."company_id" IN ( SELECT "car"."company_id"
           FROM "public"."company_admin_requests" "car"
          WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))))) AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "Suppliers can view RFX specs commits with active invitation" ON "public"."rfx_specs_commits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."company_admin_requests" "car" ON ((("car"."company_id" = "rci"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))
  WHERE (("rci"."rfx_id" = "rfx_specs_commits"."rfx_id") AND ("rci"."status" = ANY (ARRAY['supplier evaluating RFX'::"text", 'submitted'::"text"]))))));



COMMENT ON POLICY "Suppliers can view RFX specs commits with active invitation" ON "public"."rfx_specs_commits" IS 'Allows suppliers with active company invitations (including submitted proposals) to view RFX specs commits. This is needed for the PDF generator to work in the RFX viewer.';



CREATE POLICY "Suppliers can view RFX specs with active invitation" ON "public"."rfx_specs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."company_admin_requests" "car" ON ((("car"."company_id" = "rci"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))
  WHERE (("rci"."rfx_id" = "rfx_specs"."rfx_id") AND ("rci"."status" = ANY (ARRAY['supplier evaluating RFX'::"text", 'submitted'::"text"]))))));



COMMENT ON POLICY "Suppliers can view RFX specs with active invitation" ON "public"."rfx_specs" IS 'Allows suppliers with active company invitations (including submitted proposals) to view RFX specifications. This is needed for suppliers to view RFX specs in the RFX viewer.';



CREATE POLICY "Suppliers can view announcements with active invitation" ON "public"."rfx_announcements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."company_admin_requests" "car" ON ((("car"."company_id" = "rci"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))
  WHERE (("rci"."rfx_id" = "rfx_announcements"."rfx_id") AND ("rci"."status" = ANY (ARRAY['supplier evaluating RFX'::"text", 'submitted'::"text"]))))));



COMMENT ON POLICY "Suppliers can view announcements with active invitation" ON "public"."rfx_announcements" IS 'Allows suppliers with active company invitations (including submitted proposals) to view RFX announcements.';



CREATE POLICY "Suppliers can view attachments with active invitation" ON "public"."rfx_announcement_attachments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."rfx_announcements" "a"
     JOIN "public"."rfx_company_invitations" "rci" ON (("rci"."rfx_id" = "a"."rfx_id")))
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "rci"."company_id")))
  WHERE (("a"."id" = "rfx_announcement_attachments"."announcement_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text") AND ("rci"."status" = ANY (ARRAY['supplier evaluating RFX'::"text", 'submitted'::"text"]))))));



COMMENT ON POLICY "Suppliers can view attachments with active invitation" ON "public"."rfx_announcement_attachments" IS 'Allows suppliers with active company invitations (including submitted proposals) to view RFX announcement attachments.';



CREATE POLICY "Suppliers can view original NDAs for their invitations" ON "public"."rfx_nda_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rfx_company_invitations" "rci"
     JOIN "public"."company_admin_requests" "car" ON ((("car"."company_id" = "rci"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))
  WHERE ("rci"."rfx_id" = "rfx_nda_uploads"."rfx_id"))));



COMMENT ON POLICY "Suppliers can view original NDAs for their invitations" ON "public"."rfx_nda_uploads" IS 'Allows suppliers with active company invitations to view and download the original NDA uploaded by the buyer';



CREATE POLICY "Suppliers can view signed NDAs for their invitations" ON "public"."rfx_signed_nda_uploads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_company_invitations" "rci"
  WHERE (("rci"."id" = "rfx_signed_nda_uploads"."rfx_company_invitation_id") AND ("rci"."company_id" IN ( SELECT "car"."company_id"
           FROM "public"."company_admin_requests" "car"
          WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))))));



CREATE POLICY "Suppliers can view their own documents" ON "public"."rfx_supplier_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_company_invitations" "rci"
  WHERE (("rci"."id" = "rfx_supplier_documents"."rfx_company_invitation_id") AND ("rci"."company_id" IN ( SELECT "car"."company_id"
           FROM "public"."company_admin_requests" "car"
          WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text"))))))));



CREATE POLICY "Users can create commits for RFXs they have access to" ON "public"."rfx_specs_commits" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs_commits"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfx_specs_commits"."rfx_id") AND ("rfx_members"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can create error reports for their conversations" ON "public"."error_reports" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "error_reports"."conversation_id") AND (("conversations"."user_id" IS NULL) OR ("conversations"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create their own admin requests" ON "public"."company_admin_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own company requests" ON "public"."company_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own feedback" ON "public"."user_feedback" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own lists" ON "public"."supplier_lists" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own profile" ON "public"."app_user" FOR INSERT WITH CHECK (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Users can create their own ratings" ON "public"."evaluation_ratings" FOR INSERT WITH CHECK ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can create their own type selection" ON "public"."user_type_selections" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete RFX specs if owner" ON "public"."rfx_specs" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete documents from their company products" ON "public"."product_documents" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_documents"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Users can delete selected candidates for own RFX" ON "public"."rfx_selected_candidates" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_selected_candidates"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete specs for their own RFXs" ON "public"."rfx_specs" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own RFX evaluation results" ON "public"."rfx_evaluation_results" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own RFXs" ON "public"."rfxs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own lists" ON "public"."supplier_lists" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own pending admin requests" ON "public"."company_admin_requests" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text")));



CREATE POLICY "Users can delete their own validations" ON "public"."rfx_validations" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert RFX specs if owner or member" ON "public"."rfx_specs" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfx_specs"."rfx_id") AND ("rfx_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can insert message authorship for their RFXs" ON "public"."rfx_message_authorship" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_message_authorship"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfx_message_authorship"."rfx_id") AND ("rfx_members"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can insert selected candidates for own RFX" ON "public"."rfx_selected_candidates" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_selected_candidates"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert specs for their own RFXs" ON "public"."rfx_specs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own RFX evaluation results" ON "public"."rfx_evaluation_results" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own RFXs" ON "public"."rfxs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own terms acceptance" ON "public"."terms_acceptance" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own validations" ON "public"."rfx_validations" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_validations"."rfx_id") AND (("rfxs"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."rfx_members"
          WHERE (("rfx_members"."rfx_id" = "rfxs"."id") AND ("rfx_members"."user_id" = "auth"."uid"()))))))))));



CREATE POLICY "Users can remove their saved companies" ON "public"."saved_companies" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can save companies" ON "public"."saved_companies" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update RFX specs if owner or member" ON "public"."rfx_specs" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfx_specs"."rfx_id") AND ("rfx_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can update RFXs if owner or member" ON "public"."rfxs" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfxs"."id") AND ("rfx_members"."user_id" = "auth"."uid"())))))) WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfxs"."id") AND ("rfx_members"."user_id" = "auth"."uid"()))))));



COMMENT ON POLICY "Users can update RFXs if owner or member" ON "public"."rfxs" IS 'Allows both owners and members to update RFXs, needed for sending flow where members update sent_commit_id';



CREATE POLICY "Users can update selected candidates for own RFX" ON "public"."rfx_selected_candidates" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_selected_candidates"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_selected_candidates"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update specs for their own RFXs" ON "public"."rfx_specs" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own RFX evaluation results" ON "public"."rfx_evaluation_results" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own RFXs" ON "public"."rfxs" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own lists" ON "public"."supplier_lists" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own pending admin requests" ON "public"."company_admin_requests" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text"))) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile except admin status" ON "public"."app_user" FOR UPDATE USING (("auth"."uid"() = "auth_user_id")) WITH CHECK (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Users can update their own type selection" ON "public"."user_type_selections" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own validations" ON "public"."rfx_validations" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can upload documents to their company products" ON "public"."product_documents" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_documents"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Users can view RFX evaluation results" ON "public"."rfx_evaluation_results" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("user_id" IS NULL)));



COMMENT ON POLICY "Users can view RFX evaluation results" ON "public"."rfx_evaluation_results" IS 'Allows users to view their own results and legacy results with NULL user_id';



CREATE POLICY "Users can view RFX specs if owner or member" ON "public"."rfx_specs" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfx_specs"."rfx_id") AND ("rfx_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view RFXs they are members of" ON "public"."rfxs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rfx_members" "m"
  WHERE (("m"."rfx_id" = "rfxs"."id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view applicable notifications" ON "public"."notification_events" FOR SELECT USING ((("scope" = 'global'::"text") OR (("scope" = 'user'::"text") AND ("user_id" = "auth"."uid"())) OR (("scope" = 'company'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."app_user" "au_company"
  WHERE (("au_company"."auth_user_id" = "auth"."uid"()) AND ("au_company"."company_id" = "notification_events"."company_id"))))) OR (("scope" = 'company'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."user_id" = "auth"."uid"()) AND ("car"."company_id" = "notification_events"."company_id") AND ("car"."status" = 'approved'::"text")))))));



COMMENT ON POLICY "Users can view applicable notifications" ON "public"."notification_events" IS 'FIXED: Authenticated users can read global, direct (user_id = auth.uid()), company notifications; company membership via app_user or approved company_admin_requests.';



CREATE POLICY "Users can view commits for RFXs they have access to" ON "public"."rfx_specs_commits" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs_commits"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfx_specs_commits"."rfx_id") AND ("rfx_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view documents from their company products" ON "public"."product_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_documents"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Users can view error reports for their conversations" ON "public"."error_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "error_reports"."conversation_id") AND (("conversations"."user_id" IS NULL) OR ("conversations"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view message authorship for their RFXs" ON "public"."rfx_message_authorship" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_message_authorship"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."rfx_members"
  WHERE (("rfx_members"."rfx_id" = "rfx_message_authorship"."rfx_id") AND ("rfx_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view specs for their own RFXs" ON "public"."rfx_specs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_specs"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own RFXs" ON "public"."rfxs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own admin requests" ON "public"."company_admin_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own company requests" ON "public"."company_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own feedback" ON "public"."user_feedback" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own lists" ON "public"."supplier_lists" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."app_user" FOR SELECT USING (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Users can view their own ratings" ON "public"."evaluation_ratings" FOR SELECT USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can view their own saved companies" ON "public"."saved_companies" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own terms acceptance" ON "public"."terms_acceptance" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own type selection" ON "public"."user_type_selections" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their selected candidates" ON "public"."rfx_selected_candidates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_selected_candidates"."rfx_id") AND ("rfxs"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view validations for their RFXs" ON "public"."rfx_validations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rfxs"
  WHERE (("rfxs"."id" = "rfx_validations"."rfx_id") AND (("rfxs"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."rfx_members"
          WHERE (("rfx_members"."rfx_id" = "rfxs"."id") AND ("rfx_members"."user_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."agent_memory_json" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_prompt_backups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_prompt_backups_backup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_prompt_backups_v2" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_prompts_dev" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_prompts_prod" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_user" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_admin_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_billing_info" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_billing_info_insert_for_company_admins" ON "public"."company_billing_info" FOR INSERT WITH CHECK ("public"."is_approved_company_admin"("company_id"));



CREATE POLICY "company_billing_info_select_for_company_admins" ON "public"."company_billing_info" FOR SELECT USING ("public"."is_approved_company_admin"("company_id"));



CREATE POLICY "company_billing_info_update_for_company_admins" ON "public"."company_billing_info" FOR UPDATE USING ("public"."is_approved_company_admin"("company_id"));



ALTER TABLE "public"."company_cover_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_pending_list_Arturo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_revision" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_revision_activations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."developer_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."developer_company_request_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."developer_error_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."developer_feedback_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."embedding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."embedding_usage_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."error_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evaluation_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_user_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_user_state_delete_self" ON "public"."notification_user_state" FOR DELETE USING (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "notification_user_state_delete_self" ON "public"."notification_user_state" IS 'A user can delete their own notification state rows.';



CREATE POLICY "notification_user_state_insert_self" ON "public"."notification_user_state" FOR INSERT WITH CHECK ((COALESCE("user_id", "auth"."uid"()) = "auth"."uid"()));



COMMENT ON POLICY "notification_user_state_insert_self" ON "public"."notification_user_state" IS 'A user can create their own notification state rows (defaults to auth.uid()).';



CREATE POLICY "notification_user_state_select_self" ON "public"."notification_user_state" FOR SELECT USING (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "notification_user_state_select_self" ON "public"."notification_user_state" IS 'A user can read only their own notification state rows.';



CREATE POLICY "notification_user_state_update_self" ON "public"."notification_user_state" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



COMMENT ON POLICY "notification_user_state_update_self" ON "public"."notification_user_state" IS 'A user can update their own notification state rows.';



ALTER TABLE "public"."product" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_revision" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_revision_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prompts_webscrapping" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_rfxs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_announcement_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_company_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_developer_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_evaluation_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rfx_inv_insert_any_authenticated" ON "public"."rfx_invitations" FOR INSERT WITH CHECK (("auth"."uid"() = "invited_by"));



CREATE POLICY "rfx_inv_select_self_or_inviter" ON "public"."rfx_invitations" FOR SELECT USING ((("auth"."uid"() = "target_user_id") OR ("auth"."uid"() = "invited_by")));



CREATE POLICY "rfx_inv_update_invitee_only" ON "public"."rfx_invitations" FOR UPDATE USING (("auth"."uid"() = "target_user_id")) WITH CHECK (("auth"."uid"() = "target_user_id"));



ALTER TABLE "public"."rfx_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rfx_members_delete_self" ON "public"."rfx_members" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "rfx_members_insert_self" ON "public"."rfx_members" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rfx_members_select_if_participant" ON "public"."rfx_members" FOR SELECT USING ("public"."is_rfx_participant"("rfx_id", "auth"."uid"()));



COMMENT ON POLICY "rfx_members_select_if_participant" ON "public"."rfx_members" IS 'Users can see all members of RFXs they own or belong to (using security definer function to avoid recursion)';



ALTER TABLE "public"."rfx_message_authorship" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_nda_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_selected_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_signed_nda_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_specs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_specs_commits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_supplier_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfx_validations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rfxs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stripe_customers_select_for_company_admins" ON "public"."stripe_customers" FOR SELECT USING ("public"."is_approved_company_admin"("company_id"));



ALTER TABLE "public"."subscription" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."terms_acceptance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_type_selections" ENABLE ROW LEVEL SECURITY;


REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_notify_on_email_confirmed"() TO "anon";
GRANT ALL ON FUNCTION "public"."_notify_on_email_confirmed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_notify_on_email_confirmed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_rfx_add_member_on_accept"() TO "anon";
GRANT ALL ON FUNCTION "public"."_rfx_add_member_on_accept"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_rfx_add_member_on_accept"() TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_company_admin_request"("p_request_id" "uuid", "p_processor_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_company_admin_request"("p_request_id" "uuid", "p_processor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_company_admin_request"("p_request_id" "uuid", "p_processor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_increment_embedding_counters"("p_embedding_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."batch_increment_embedding_counters"("p_embedding_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_increment_embedding_counters"("p_embedding_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."call_embed_edge_function"() TO "anon";
GRANT ALL ON FUNCTION "public"."call_embed_edge_function"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."call_embed_edge_function"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_rfx_invitation"("p_invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_rfx_invitation"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_rfx_invitation"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_rfx_invitation"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_rfx_invitation_status"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_rfx_invitation_status"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rfx_invitation_status"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_company_rfx_invitation_notifications"("p_rfx_id" "uuid", "p_company_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_company_rfx_invitation_notifications"("p_rfx_id" "uuid", "p_company_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_company_rfx_invitation_notifications"("p_rfx_id" "uuid", "p_company_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_rfx_invitation_notifications"("p_rfx_id" "uuid", "p_company_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_company_invitation"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_company_invitation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_company_invitation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_nda_validated"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_nda_validated"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_nda_validated"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_announcement"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_announcement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_announcement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_requirements_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_requirements_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_requirements_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_sent"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_sent"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_sent"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_submitted"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_submitted"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_rfx_submitted"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_accept"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_accept"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_accept"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_document_upload"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_document_upload"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_document_upload"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_signed_nda"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_signed_nda"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notifications_on_supplier_signed_nda"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_or_reactivate_rfx_invitation"("p_rfx_id" "uuid", "p_invited_by" "uuid", "p_target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_or_reactivate_rfx_invitation"("p_rfx_id" "uuid", "p_invited_by" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_or_reactivate_rfx_invitation"("p_rfx_id" "uuid", "p_invited_by" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_or_reactivate_rfx_invitation"("p_rfx_id" "uuid", "p_invited_by" "uuid", "p_target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_rfx_approval_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_rfx_approval_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_rfx_approval_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rfx_approval_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_rfx_member_invitation_notifications"("p_rfx_id" "uuid", "p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_rfx_member_invitation_notifications"("p_rfx_id" "uuid", "p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_rfx_member_invitation_notifications"("p_rfx_id" "uuid", "p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rfx_member_invitation_notifications"("p_rfx_id" "uuid", "p_user_ids" "uuid"[], "p_title" "text", "p_body" "text", "p_target_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_rfx_member_response_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text", "p_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_rfx_member_response_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text", "p_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_rfx_member_response_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text", "p_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rfx_member_response_notifications"("p_rfx_id" "uuid", "p_title" "text", "p_body" "text", "p_target_url" "text", "p_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_run_process_embedding_scheduler"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_run_process_embedding_scheduler"() TO "service_role";
GRANT ALL ON FUNCTION "public"."cron_run_process_embedding_scheduler"() TO "supabase_admin";



GRANT ALL ON FUNCTION "public"."current_app_user_id"("p_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."current_app_user_id"("p_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_user_id"("p_auth_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."deactivate_company_revisions"("p_company_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_company_revisions"("p_company_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_company_revisions"("p_company_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_old_public_conversation_image"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_old_public_conversation_image"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_old_public_conversation_image"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_product_embeddings"("p_product_revision_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_product_embeddings"("p_product_revision_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_product_embeddings"("p_product_revision_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_public_conversation_image"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_public_conversation_image"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_public_conversation_image"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_embedding_toggle_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_embedding_toggle_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_embedding_toggle_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."find_message_author"("p_rfx_id" "uuid", "p_message_content" "text", "p_message_timestamp" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."find_message_author"("p_rfx_id" "uuid", "p_message_content" "text", "p_message_timestamp" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_message_author"("p_rfx_id" "uuid", "p_message_content" "text", "p_message_timestamp" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_public_conversation_image_filename"("conversation_id" "uuid", "file_extension" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_public_conversation_image_filename"("conversation_id" "uuid", "file_extension" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_public_conversation_image_filename"("conversation_id" "uuid", "file_extension" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_slug"("input_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_slug"("input_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_slug"("input_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_users_for_analytics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_users_for_analytics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_users_for_analytics"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_announcement_creator_info"("p_user_id" "uuid", "p_rfx_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_announcement_creator_info"("p_user_id" "uuid", "p_rfx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_announcement_creator_info"("p_user_id" "uuid", "p_rfx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_announcement_creator_info"("p_user_id" "uuid", "p_rfx_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_basic_user_info"("p_user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_basic_user_info"("p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_basic_user_info"("p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_basic_user_info"("p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_company_admin_request_processor_name"("processor_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_company_admin_request_processor_name"("processor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_admin_request_processor_name"("processor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_company_pending_admin_requests"("p_company_id" "uuid", "p_requestor_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_company_pending_admin_requests"("p_company_id" "uuid", "p_requestor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_pending_admin_requests"("p_company_id" "uuid", "p_requestor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_company_revision_by_product_revision"("p_product_revision_id" "uuid", "p_only_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_company_revision_by_product_revision"("p_product_revision_id" "uuid", "p_only_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_revision_by_product_revision"("p_product_revision_id" "uuid", "p_only_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_embedding_analytics_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_embedding_analytics_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_embedding_analytics_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_embedding_usage_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_embedding_usage_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_embedding_usage_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_product_revision_clean"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_revision_clean"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_revision_clean"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_products_by_company_revision"("p_company_revision_id" "uuid", "p_only_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_products_by_company_revision"("p_company_revision_id" "uuid", "p_only_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_products_by_company_revision"("p_company_revision_id" "uuid", "p_only_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_conversation_image_url"("image_filename" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_conversation_image_url"("image_filename" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_conversation_image_url"("image_filename" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_conversations"("p_category" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_conversations"("p_category" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_conversations"("p_category" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_conversations"("limit_count" integer, "offset_count" integer, "category_filter" "text", "featured_only" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_conversations"("limit_count" integer, "offset_count" integer, "category_filter" "text", "featured_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_conversations"("limit_count" integer, "offset_count" integer, "category_filter" "text", "featured_only" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rfx_basic_info_for_invited"("p_rfx_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rfx_basic_info_for_invited"("p_rfx_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_basic_info_for_invited"("p_rfx_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_basic_info_for_invited"("p_rfx_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rfx_basic_info_for_suppliers"("p_rfx_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rfx_basic_info_for_suppliers"("p_rfx_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_basic_info_for_suppliers"("p_rfx_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_basic_info_for_suppliers"("p_rfx_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rfx_info_for_supplier"("p_rfx_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rfx_info_for_supplier"("p_rfx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_info_for_supplier"("p_rfx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_info_for_supplier"("p_rfx_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rfx_invitations_for_owner"("p_rfx_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rfx_invitations_for_owner"("p_rfx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_invitations_for_owner"("p_rfx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_invitations_for_owner"("p_rfx_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rfx_members"("p_rfx_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rfx_members"("p_rfx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_members"("p_rfx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_members"("p_rfx_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rfx_members_avatars"("p_rfx_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rfx_members_avatars"("p_rfx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_members_avatars"("p_rfx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_members_avatars"("p_rfx_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_rfx_message_authors"("p_rfx_id" "uuid", "p_message_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_message_authors"("p_rfx_id" "uuid", "p_message_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_message_authors"("p_rfx_id" "uuid", "p_message_ids" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rfx_sent_commit_id_for_supplier"("p_rfx_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rfx_sent_commit_id_for_supplier"("p_rfx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_sent_commit_id_for_supplier"("p_rfx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_sent_commit_id_for_supplier"("p_rfx_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_rfx_specs_commit_for_pdf"("p_commit_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_rfx_specs_commit_for_pdf"("p_commit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_specs_commit_for_pdf"("p_commit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_specs_commit_for_pdf"("p_commit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_rfx_specs_commits"("p_rfx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_rfx_specs_commits"("p_rfx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rfx_specs_commits"("p_rfx_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_info_for_company_admins"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_info_for_company_admins"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_info_for_company_admins"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_info_for_developers"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_info_for_developers"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_info_for_developers"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_users_by_emails"("p_emails" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_users_by_emails"("p_emails" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_by_emails"("p_emails" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_by_emails"("p_emails" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_with_emails_batch"("user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_with_emails_batch"("user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_with_emails_batch"("user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_verified"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_verified"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_verified"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_developer_access"("check_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_developer_access"("check_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_developer_access"("check_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_embedding_counter"("p_embedding_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_embedding_counter"("p_embedding_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_embedding_counter"("p_embedding_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_public_conversation_view_count"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_public_conversation_view_count"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_public_conversation_view_count"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_public_rfx_view_count"("p_rfx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_public_rfx_view_count"("p_rfx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_public_rfx_view_count"("p_rfx_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."invalidate_rfx_validations"() TO "anon";
GRANT ALL ON FUNCTION "public"."invalidate_rfx_validations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invalidate_rfx_validations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_user"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_rfx_participant"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_rfx_participant"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_rfx_participant"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_notification_archived"("p_notification_id" "uuid", "p_archived" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notification_archived"("p_notification_id" "uuid", "p_archived" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_notification_archived"("p_notification_id" "uuid", "p_archived" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_archived"("p_notification_id" "uuid", "p_archived" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_read" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_read" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_read" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid", "p_read" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_notification_reviewed"("p_notification_id" "uuid", "p_reviewed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notification_reviewed"("p_notification_id" "uuid", "p_reviewed" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_notification_reviewed"("p_notification_id" "uuid", "p_reviewed" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_reviewed"("p_notification_id" "uuid", "p_reviewed" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_documents"("filter" "jsonb", "match_count" integer, "query_embedding" "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."match_documents"("filter" "jsonb", "match_count" integer, "query_embedding" "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_documents"("filter" "jsonb", "match_count" integer, "query_embedding" "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" double precision[], "match_threshold" double precision, "match_count" integer, "vector_column" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" double precision[], "match_threshold" double precision, "match_count" integer, "vector_column" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings"("query_embedding" double precision[], "match_threshold" double precision, "match_count" integer, "vector_column" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings_3large"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings_3large"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings_3large"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings_3small"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings_3small"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings_3small"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings_3small_balanced"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings_3small_balanced"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings_3small_balanced"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings_3small_fixed"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings_3small_fixed"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings_3small_fixed"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings_3small_optimized"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings_3small_optimized"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings_3small_optimized"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_embeddings_ada002"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_embeddings_ada002"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_embeddings_ada002"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_admin_privilege_escalation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_admin_privilege_escalation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_admin_privilege_escalation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_company_admin_request"("p_request_id" "uuid", "p_rejection_reason" "text", "p_processor_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_company_admin_request"("p_request_id" "uuid", "p_rejection_reason" "text", "p_processor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_company_admin_request"("p_request_id" "uuid", "p_rejection_reason" "text", "p_processor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_company_admin"("p_user_id" "uuid", "p_company_id" "uuid", "p_removed_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_company_admin"("p_user_id" "uuid", "p_company_id" "uuid", "p_removed_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_company_admin"("p_user_id" "uuid", "p_company_id" "uuid", "p_removed_by" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_rfx_member"("p_rfx_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_rfx_member"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_rfx_member"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_rfx_member"("p_rfx_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_company_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_company_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_company_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_notification_user_state_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_notification_user_state_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_notification_user_state_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_embeddings_by_revision"("p_company_revision_id" "uuid", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_embeddings_by_revision"("p_company_revision_id" "uuid", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_embeddings_by_revision"("p_company_revision_id" "uuid", "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_company_billing_info_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_company_billing_info_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_billing_info_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_embedding_is_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_embedding_is_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_embedding_is_active"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_embedding_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_embedding_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_embedding_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_public_conversations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_public_conversations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_public_conversations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_public_rfxs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_public_rfxs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_public_rfxs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rfx_announcements_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rfx_announcements_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rfx_announcements_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rfx_selected_candidates_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rfx_selected_candidates_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rfx_selected_candidates_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rfx_specs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rfx_specs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rfx_specs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rfx_validations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rfx_validations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rfx_validations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_rfxs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_rfxs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_rfxs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_supplier_lists_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_supplier_lists_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_supplier_lists_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_type_selections_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_type_selections_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_type_selections_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text", "p_similarities" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text", "p_similarities" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_embedding_counter_with_data"("p_embedding_id" "uuid", "p_positions" "text", "p_matches" "text", "p_similarities" "text") TO "service_role";



GRANT ALL ON TABLE "public"."agent_memory_json" TO "anon";
GRANT ALL ON TABLE "public"."agent_memory_json" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_memory_json" TO "service_role";



GRANT ALL ON TABLE "public"."agent_prompt_backups" TO "anon";
GRANT ALL ON TABLE "public"."agent_prompt_backups" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_prompt_backups" TO "service_role";



GRANT ALL ON TABLE "public"."agent_prompt_backups_backup" TO "anon";
GRANT ALL ON TABLE "public"."agent_prompt_backups_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_prompt_backups_backup" TO "service_role";



GRANT ALL ON TABLE "public"."agent_prompt_backups_v2" TO "anon";
GRANT ALL ON TABLE "public"."agent_prompt_backups_v2" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_prompt_backups_v2" TO "service_role";



GRANT ALL ON TABLE "public"."agent_prompts_dev" TO "anon";
GRANT ALL ON TABLE "public"."agent_prompts_dev" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_prompts_dev" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_prompts_dev_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_prompts_dev_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_prompts_dev_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agent_prompts_prod" TO "anon";
GRANT ALL ON TABLE "public"."agent_prompts_prod" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_prompts_prod" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_prompts_prod_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_prompts_prod_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_prompts_prod_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_user" TO "anon";
GRANT ALL ON TABLE "public"."app_user" TO "authenticated";
GRANT ALL ON TABLE "public"."app_user" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."company" TO "anon";
GRANT ALL ON TABLE "public"."company" TO "authenticated";
GRANT ALL ON TABLE "public"."company" TO "service_role";



GRANT ALL ON TABLE "public"."company_admin_requests" TO "anon";
GRANT ALL ON TABLE "public"."company_admin_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."company_admin_requests" TO "service_role";



GRANT ALL ON TABLE "public"."company_billing_info" TO "anon";
GRANT ALL ON TABLE "public"."company_billing_info" TO "authenticated";
GRANT ALL ON TABLE "public"."company_billing_info" TO "service_role";



GRANT ALL ON TABLE "public"."company_cover_images" TO "anon";
GRANT ALL ON TABLE "public"."company_cover_images" TO "authenticated";
GRANT ALL ON TABLE "public"."company_cover_images" TO "service_role";



GRANT ALL ON TABLE "public"."company_documents" TO "anon";
GRANT ALL ON TABLE "public"."company_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."company_documents" TO "service_role";



GRANT ALL ON TABLE "public"."company_pending_list_Arturo" TO "anon";
GRANT ALL ON TABLE "public"."company_pending_list_Arturo" TO "authenticated";
GRANT ALL ON TABLE "public"."company_pending_list_Arturo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."company_pending_list_Arturo_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."company_pending_list_Arturo_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."company_pending_list_Arturo_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."company_requests" TO "anon";
GRANT ALL ON TABLE "public"."company_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."company_requests" TO "service_role";



GRANT ALL ON TABLE "public"."company_revision" TO "anon";
GRANT ALL ON TABLE "public"."company_revision" TO "authenticated";
GRANT ALL ON TABLE "public"."company_revision" TO "service_role";



GRANT ALL ON TABLE "public"."company_revision_activations" TO "anon";
GRANT ALL ON TABLE "public"."company_revision_activations" TO "authenticated";
GRANT ALL ON TABLE "public"."company_revision_activations" TO "service_role";



GRANT ALL ON TABLE "public"."company_revision_public" TO "anon";
GRANT ALL ON TABLE "public"."company_revision_public" TO "authenticated";
GRANT ALL ON TABLE "public"."company_revision_public" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."developer_access" TO "anon";
GRANT ALL ON TABLE "public"."developer_access" TO "authenticated";
GRANT ALL ON TABLE "public"."developer_access" TO "service_role";



GRANT ALL ON TABLE "public"."developer_company_request_reviews" TO "anon";
GRANT ALL ON TABLE "public"."developer_company_request_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."developer_company_request_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."developer_error_reviews" TO "anon";
GRANT ALL ON TABLE "public"."developer_error_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."developer_error_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."developer_feedback_reviews" TO "anon";
GRANT ALL ON TABLE "public"."developer_feedback_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."developer_feedback_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."embedding" TO "anon";
GRANT ALL ON TABLE "public"."embedding" TO "authenticated";
GRANT ALL ON TABLE "public"."embedding" TO "service_role";



GRANT ALL ON TABLE "public"."embedding_toggle_jobs" TO "anon";
GRANT ALL ON TABLE "public"."embedding_toggle_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."embedding_toggle_jobs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."embedding_toggle_jobs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."embedding_toggle_jobs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."embedding_toggle_jobs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."embedding_usage_counters" TO "anon";
GRANT ALL ON TABLE "public"."embedding_usage_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."embedding_usage_counters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."embedding_usage_counters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."embedding_usage_counters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."embedding_usage_counters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."error_reports" TO "anon";
GRANT ALL ON TABLE "public"."error_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."error_reports" TO "service_role";



GRANT ALL ON TABLE "public"."evaluation_ratings" TO "anon";
GRANT ALL ON TABLE "public"."evaluation_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."evaluation_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."notification_events" TO "anon";
GRANT ALL ON TABLE "public"."notification_events" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_events" TO "service_role";



GRANT ALL ON TABLE "public"."notification_user_state" TO "anon";
GRANT ALL ON TABLE "public"."notification_user_state" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_user_state" TO "service_role";



GRANT ALL ON TABLE "public"."product" TO "anon";
GRANT ALL ON TABLE "public"."product" TO "authenticated";
GRANT ALL ON TABLE "public"."product" TO "service_role";



GRANT ALL ON TABLE "public"."product_documents" TO "anon";
GRANT ALL ON TABLE "public"."product_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."product_documents" TO "service_role";



GRANT ALL ON TABLE "public"."product_revision" TO "anon";
GRANT ALL ON TABLE "public"."product_revision" TO "authenticated";
GRANT ALL ON TABLE "public"."product_revision" TO "service_role";



GRANT ALL ON TABLE "public"."product_revision_history" TO "anon";
GRANT ALL ON TABLE "public"."product_revision_history" TO "authenticated";
GRANT ALL ON TABLE "public"."product_revision_history" TO "service_role";



GRANT ALL ON TABLE "public"."product_revision_public" TO "anon";
GRANT ALL ON TABLE "public"."product_revision_public" TO "authenticated";
GRANT ALL ON TABLE "public"."product_revision_public" TO "service_role";



GRANT ALL ON TABLE "public"."prompts_webscrapping" TO "anon";
GRANT ALL ON TABLE "public"."prompts_webscrapping" TO "authenticated";
GRANT ALL ON TABLE "public"."prompts_webscrapping" TO "service_role";



GRANT ALL ON TABLE "public"."public_conversations" TO "anon";
GRANT ALL ON TABLE "public"."public_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."public_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."public_rfxs" TO "anon";
GRANT ALL ON TABLE "public"."public_rfxs" TO "authenticated";
GRANT ALL ON TABLE "public"."public_rfxs" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_announcement_attachments" TO "anon";
GRANT ALL ON TABLE "public"."rfx_announcement_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_announcement_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_announcements" TO "anon";
GRANT ALL ON TABLE "public"."rfx_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_announcements" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_company_invitations" TO "anon";
GRANT ALL ON TABLE "public"."rfx_company_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_company_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_developer_reviews" TO "anon";
GRANT ALL ON TABLE "public"."rfx_developer_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_developer_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_evaluation_results" TO "anon";
GRANT ALL ON TABLE "public"."rfx_evaluation_results" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_evaluation_results" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_invitations" TO "anon";
GRANT ALL ON TABLE "public"."rfx_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_members" TO "anon";
GRANT ALL ON TABLE "public"."rfx_members" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_members" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_message_authorship" TO "anon";
GRANT ALL ON TABLE "public"."rfx_message_authorship" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_message_authorship" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_nda_uploads" TO "anon";
GRANT ALL ON TABLE "public"."rfx_nda_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_nda_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_selected_candidates" TO "anon";
GRANT ALL ON TABLE "public"."rfx_selected_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_selected_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_signed_nda_uploads" TO "anon";
GRANT ALL ON TABLE "public"."rfx_signed_nda_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_signed_nda_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_specs" TO "anon";
GRANT ALL ON TABLE "public"."rfx_specs" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_specs" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_specs_commits" TO "anon";
GRANT ALL ON TABLE "public"."rfx_specs_commits" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_specs_commits" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_supplier_documents" TO "anon";
GRANT ALL ON TABLE "public"."rfx_supplier_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_supplier_documents" TO "service_role";



GRANT ALL ON TABLE "public"."rfx_validations" TO "anon";
GRANT ALL ON TABLE "public"."rfx_validations" TO "authenticated";
GRANT ALL ON TABLE "public"."rfx_validations" TO "service_role";



GRANT ALL ON TABLE "public"."rfxs" TO "anon";
GRANT ALL ON TABLE "public"."rfxs" TO "authenticated";
GRANT ALL ON TABLE "public"."rfxs" TO "service_role";



GRANT ALL ON TABLE "public"."saved_companies" TO "anon";
GRANT ALL ON TABLE "public"."saved_companies" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_companies" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_customers" TO "anon";
GRANT ALL ON TABLE "public"."stripe_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_customers" TO "service_role";



GRANT ALL ON TABLE "public"."subscription" TO "anon";
GRANT ALL ON TABLE "public"."subscription" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_lists" TO "anon";
GRANT ALL ON TABLE "public"."supplier_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_lists" TO "service_role";



GRANT ALL ON TABLE "public"."terms_acceptance" TO "anon";
GRANT ALL ON TABLE "public"."terms_acceptance" TO "authenticated";
GRANT ALL ON TABLE "public"."terms_acceptance" TO "service_role";



GRANT ALL ON TABLE "public"."user_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."user_type_selections" TO "anon";
GRANT ALL ON TABLE "public"."user_type_selections" TO "authenticated";
GRANT ALL ON TABLE "public"."user_type_selections" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";







