


-- Enable vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

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
    "company_evaluation_response_format" "text" DEFAULT 'json_object'::"text"
);


ALTER TABLE "public"."agent_prompt_backups_v2" OWNER TO "postgres";


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
    "vector2" "public"."vector"(1536)
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



CREATE TABLE IF NOT EXISTS "public"."saved_companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "list_id" "uuid"
);


ALTER TABLE "public"."saved_companies" OWNER TO "postgres";


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
    "color" "text" DEFAULT '#80c8f0'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."supplier_lists" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."company_cover_images"
    ADD CONSTRAINT "company_cover_images_company_id_key" UNIQUE ("company_id");



ALTER TABLE ONLY "public"."company_cover_images"
    ADD CONSTRAINT "company_cover_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_documents"
    ADD CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."saved_companies"
    ADD CONSTRAINT "saved_companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_companies"
    ADD CONSTRAINT "saved_companies_user_company_list_unique" UNIQUE ("user_id", "company_id", "list_id");



ALTER TABLE ONLY "public"."subscription"
    ADD CONSTRAINT "subscription_pkey" PRIMARY KEY ("id_company");



ALTER TABLE ONLY "public"."supplier_lists"
    ADD CONSTRAINT "supplier_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_lists"
    ADD CONSTRAINT "supplier_lists_user_id_name_key" UNIQUE ("user_id", "name");



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



CREATE INDEX "idx_revision_active" ON "public"."company_revision" USING "btree" ("company_id", "is_active");



CREATE INDEX "idx_saved_companies_company_id" ON "public"."saved_companies" USING "btree" ("company_id");



CREATE INDEX "idx_saved_companies_list_id" ON "public"."saved_companies" USING "btree" ("list_id");



CREATE INDEX "idx_saved_companies_user_id" ON "public"."saved_companies" USING "btree" ("user_id");



CREATE INDEX "idx_supplier_lists_user_id" ON "public"."supplier_lists" USING "btree" ("user_id");



CREATE UNIQUE INDEX "ux_company_revision_slug_active" ON "public"."company_revision" USING "btree" ("slug") WHERE (("is_active" = true) AND ("slug" IS NOT NULL));



CREATE OR REPLACE TRIGGER "delete_old_public_conversation_image_trigger" BEFORE UPDATE ON "public"."public_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."delete_old_public_conversation_image"();



CREATE OR REPLACE TRIGGER "delete_public_conversation_image_trigger" BEFORE DELETE ON "public"."public_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."delete_public_conversation_image"();



CREATE OR REPLACE TRIGGER "prevent_admin_escalation" BEFORE UPDATE ON "public"."app_user" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_admin_privilege_escalation"();



CREATE OR REPLACE TRIGGER "set_public_conversations_updated_at" BEFORE UPDATE ON "public"."public_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_public_conversations_updated_at"();



CREATE OR REPLACE TRIGGER "sync_embedding_status" AFTER UPDATE OF "is_active" ON "public"."product_revision" FOR EACH ROW WHEN (("old"."is_active" IS DISTINCT FROM "new"."is_active")) EXECUTE FUNCTION "public"."update_embedding_status"();



CREATE OR REPLACE TRIGGER "trg_enqueue_embedding_toggle" AFTER UPDATE OF "is_active" ON "public"."company_revision" FOR EACH ROW WHEN (("old"."is_active" IS DISTINCT FROM "new"."is_active")) EXECUTE FUNCTION "public"."enqueue_embedding_toggle_job"();



CREATE OR REPLACE TRIGGER "trg_set_company_slug" BEFORE INSERT OR UPDATE OF "nombre_empresa", "is_active", "slug" ON "public"."company_revision" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_slug"();



CREATE OR REPLACE TRIGGER "trigger_set_company_slug" BEFORE INSERT OR UPDATE ON "public"."company_revision" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_slug"();



CREATE OR REPLACE TRIGGER "update_embedding_is_active_trigger" AFTER UPDATE OF "is_active" ON "public"."company_revision" FOR EACH ROW WHEN (("old"."is_active" IS DISTINCT FROM "new"."is_active")) EXECUTE FUNCTION "public"."update_embedding_is_active"();



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



ALTER TABLE ONLY "public"."saved_companies"
    ADD CONSTRAINT "saved_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_companies"
    ADD CONSTRAINT "saved_companies_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."supplier_lists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscription"
    ADD CONSTRAINT "subscription_id_company_fkey" FOREIGN KEY ("id_company") REFERENCES "public"."company"("id");



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



CREATE POLICY "Anyone can view messages from public conversations" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_conversations" "pc"
  WHERE ("pc"."conversation_id" = "chat_messages"."conversation_id"))));



CREATE POLICY "Anyone can view public conversations" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."public_conversations"
  WHERE ("public_conversations"."conversation_id" = "conversations"."id"))));



CREATE POLICY "Anyone can view public conversations list" ON "public"."public_conversations" FOR SELECT USING (true);



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



CREATE POLICY "Company admins can manage their company documents" ON "public"."company_documents" USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "company_documents"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Company admins can manage their cover images" ON "public"."company_cover_images" USING ((EXISTS ( SELECT 1
   FROM "public"."company_admin_requests" "car"
  WHERE (("car"."company_id" = "company_cover_images"."company_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Developers can create public conversations" ON "public"."public_conversations" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_developer_access"());



CREATE POLICY "Developers can create their own reviews" ON "public"."developer_company_request_reviews" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can create their own reviews" ON "public"."developer_error_reviews" FOR INSERT WITH CHECK (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can create their own reviews" ON "public"."developer_feedback_reviews" FOR INSERT WITH CHECK (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can delete public conversations" ON "public"."public_conversations" FOR DELETE TO "authenticated" USING ("public"."has_developer_access"());



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



CREATE POLICY "Developers can update admin requests" ON "public"."company_admin_requests" FOR UPDATE USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update admin status and company assignments" ON "public"."app_user" FOR UPDATE TO "authenticated" USING ("public"."has_developer_access"()) WITH CHECK ("public"."has_developer_access"());



CREATE POLICY "Developers can update all company requests" ON "public"."company_requests" FOR UPDATE USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update error reports" ON "public"."error_reports" FOR UPDATE USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update feedback status" ON "public"."user_feedback" FOR UPDATE USING ("public"."has_developer_access"());



CREATE POLICY "Developers can update public conversations" ON "public"."public_conversations" FOR UPDATE TO "authenticated" USING ("public"."has_developer_access"()) WITH CHECK ("public"."has_developer_access"());



CREATE POLICY "Developers can update their own reviews" ON "public"."developer_company_request_reviews" FOR UPDATE TO "authenticated" USING (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can update their own reviews" ON "public"."developer_error_reviews" FOR UPDATE USING (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



CREATE POLICY "Developers can update their own reviews" ON "public"."developer_feedback_reviews" FOR UPDATE USING (("public"."has_developer_access"() AND ("developer_user_id" = "auth"."uid"())));



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



CREATE POLICY "Developers can view all feedback" ON "public"."user_feedback" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all ratings" ON "public"."evaluation_ratings" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view all type selections" ON "public"."user_type_selections" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view developer access" ON "public"."developer_access" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view prompts_webscrapping" ON "public"."prompts_webscrapping" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view their own reviews" ON "public"."developer_company_request_reviews" FOR SELECT TO "authenticated" USING ("public"."has_developer_access"());



CREATE POLICY "Developers can view their own reviews" ON "public"."developer_feedback_reviews" FOR SELECT USING ("public"."has_developer_access"());



CREATE POLICY "Everyone can view cover images" ON "public"."company_cover_images" FOR SELECT USING (true);



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



CREATE POLICY "Users can delete documents from their company products" ON "public"."product_documents" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_documents"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Users can delete their own lists" ON "public"."supplier_lists" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own pending admin requests" ON "public"."company_admin_requests" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text")));



CREATE POLICY "Users can remove their saved companies" ON "public"."saved_companies" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can save companies" ON "public"."saved_companies" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own lists" ON "public"."supplier_lists" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own pending admin requests" ON "public"."company_admin_requests" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = 'pending'::"text"))) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile except admin status" ON "public"."app_user" FOR UPDATE USING (("auth"."uid"() = "auth_user_id")) WITH CHECK (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Users can update their own type selection" ON "public"."user_type_selections" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can upload documents to their company products" ON "public"."product_documents" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_documents"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Users can view documents from their company products" ON "public"."product_documents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."product" "p"
     JOIN "public"."company_admin_requests" "car" ON (("car"."company_id" = "p"."company_id")))
  WHERE (("p"."id" = "product_documents"."product_id") AND ("car"."user_id" = "auth"."uid"()) AND ("car"."status" = 'approved'::"text")))));



CREATE POLICY "Users can view error reports for their conversations" ON "public"."error_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversations"
  WHERE (("conversations"."id" = "error_reports"."conversation_id") AND (("conversations"."user_id" IS NULL) OR ("conversations"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view their own admin requests" ON "public"."company_admin_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own company requests" ON "public"."company_requests" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own feedback" ON "public"."user_feedback" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own lists" ON "public"."supplier_lists" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."app_user" FOR SELECT USING (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Users can view their own ratings" ON "public"."evaluation_ratings" FOR SELECT USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Users can view their own saved companies" ON "public"."saved_companies" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own type selection" ON "public"."user_type_selections" FOR SELECT USING (("auth"."uid"() = "user_id"));



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


ALTER TABLE "public"."company_cover_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_documents" ENABLE ROW LEVEL SECURITY;


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


ALTER TABLE "public"."product" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_revision" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_revision_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prompts_webscrapping" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_type_selections" ENABLE ROW LEVEL SECURITY;


REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_notify_on_email_confirmed"() TO "anon";
GRANT ALL ON FUNCTION "public"."_notify_on_email_confirmed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_notify_on_email_confirmed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_company_admin_request"("p_request_id" "uuid", "p_processor_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_company_admin_request"("p_request_id" "uuid", "p_processor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_company_admin_request"("p_request_id" "uuid", "p_processor_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."batch_increment_embedding_counters"("p_embedding_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."batch_increment_embedding_counters"("p_embedding_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."batch_increment_embedding_counters"("p_embedding_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."call_embed_edge_function"() TO "anon";
GRANT ALL ON FUNCTION "public"."call_embed_edge_function"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."call_embed_edge_function"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cron_run_process_embedding_scheduler"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cron_run_process_embedding_scheduler"() TO "service_role";
GRANT ALL ON FUNCTION "public"."cron_run_process_embedding_scheduler"() TO "supabase_admin";



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



GRANT ALL ON FUNCTION "public"."generate_public_conversation_image_filename"("conversation_id" "uuid", "file_extension" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_public_conversation_image_filename"("conversation_id" "uuid", "file_extension" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_public_conversation_image_filename"("conversation_id" "uuid", "file_extension" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_slug"("input_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_slug"("input_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_slug"("input_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_users_for_analytics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_users_for_analytics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_users_for_analytics"() TO "service_role";



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



GRANT ALL ON FUNCTION "public"."get_user_info_for_company_admins"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_info_for_company_admins"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_info_for_company_admins"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_info_for_developers"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_info_for_developers"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_info_for_developers"("target_user_id" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."is_admin_user"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_user"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approved_company_admin"("p_company_id" "uuid", "p_user_id" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."set_company_slug"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_company_slug"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_company_slug"() TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_embeddings_by_revision"("p_company_revision_id" "uuid", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_embeddings_by_revision"("p_company_revision_id" "uuid", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_embeddings_by_revision"("p_company_revision_id" "uuid", "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_embedding_is_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_embedding_is_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_embedding_is_active"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_embedding_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_embedding_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_embedding_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_public_conversations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_public_conversations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_public_conversations_updated_at"() TO "service_role";



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



GRANT ALL ON TABLE "public"."company_cover_images" TO "anon";
GRANT ALL ON TABLE "public"."company_cover_images" TO "authenticated";
GRANT ALL ON TABLE "public"."company_cover_images" TO "service_role";



GRANT ALL ON TABLE "public"."company_documents" TO "anon";
GRANT ALL ON TABLE "public"."company_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."company_documents" TO "service_role";



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



GRANT ALL ON TABLE "public"."saved_companies" TO "anon";
GRANT ALL ON TABLE "public"."saved_companies" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_companies" TO "service_role";



GRANT ALL ON TABLE "public"."subscription" TO "anon";
GRANT ALL ON TABLE "public"."subscription" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_lists" TO "anon";
GRANT ALL ON TABLE "public"."supplier_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_lists" TO "service_role";



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







RESET ALL;
