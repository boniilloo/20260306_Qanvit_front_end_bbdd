-- Create schema if not exists (handle permission errors)
do $$ begin
  create schema if not exists "net";
exception when insufficient_privilege or others then
  -- If we don't have permission or schema already exists, just continue
  null;
end $$;

-- Drop types only if they exist and we have permissions
do $$ begin
  drop type if exists "net"."http_response";
exception when insufficient_privilege or others then
  -- If we don't have permission, just continue
  null;
end $$;

do $$ begin
  drop type if exists "net"."http_response_result";
exception when insufficient_privilege or others then
  -- If we don't have permission, just continue
  null;
end $$;

set check_function_bodies = off;

-- Check if we have permissions to create functions in net schema
-- We'll handle permission errors when creating the actual function

-- Only create functions if we have permissions
-- Wrap function creation in error handling
do $$ begin
  CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb DEFAULT '{}'::jsonb, body jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(status integer, content text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'extensions'
AS $function$
DECLARE
    _request http_request;
    _response http_response;
BEGIN
    -- Create the request
    _request := row(
        'POST',
        url,
        ARRAY[(
            SELECT array_agg((key, value)::http_header)
            FROM jsonb_each_text(headers)
        )],
        body::text
    )::http_request;

    -- Make the request
    _response := http(_request);

    -- Return the response
    RETURN QUERY SELECT 
        _response.status::int,
        _response.content::text;
END;
$function$
;
exception when insufficient_privilege or others then
  -- If we don't have permission, skip all net schema functions
  raise notice 'Skipping net schema functions: insufficient permissions (%)', sqlerrm;
end $$;


drop trigger if exists "prevent_admin_escalation" on "public"."app_user";

drop trigger if exists "trg_enqueue_embedding_toggle" on "public"."company_revision";

drop trigger if exists "trg_set_company_slug" on "public"."company_revision";

drop trigger if exists "trigger_set_company_slug" on "public"."company_revision";

drop trigger if exists "update_embedding_is_active_trigger" on "public"."company_revision";

drop trigger if exists "sync_embedding_status" on "public"."product_revision";

drop trigger if exists "delete_old_public_conversation_image_trigger" on "public"."public_conversations";

drop trigger if exists "delete_public_conversation_image_trigger" on "public"."public_conversations";

drop trigger if exists "set_public_conversations_updated_at" on "public"."public_conversations";

drop trigger if exists "update_rfx_specs_updated_at_trigger" on "public"."rfx_specs";

drop trigger if exists "update_rfxs_updated_at_trigger" on "public"."rfxs";

drop trigger if exists "update_supplier_lists_updated_at" on "public"."supplier_lists";

drop trigger if exists "update_user_type_selections_updated_at" on "public"."user_type_selections";

drop policy "Allow viewing basic user info for conversations" on "public"."app_user";

drop policy "Developers can update admin status and company assignments" on "public"."app_user";

drop policy "Developers can view all app users" on "public"."app_user";

drop policy "Allow creating messages in accessible conversations" on "public"."chat_messages";

drop policy "Allow deleting messages from accessible conversations" on "public"."chat_messages";

drop policy "Allow updating messages in accessible conversations" on "public"."chat_messages";

drop policy "Allow viewing messages from accessible conversations" on "public"."chat_messages";

drop policy "Anyone can view messages from public conversations" on "public"."chat_messages";

drop policy "Developers can view all chat messages" on "public"."chat_messages";

drop policy "Developers can manage companies" on "public"."company";

drop policy "Developers can view all companies" on "public"."company";

drop policy "Approved company admins can view all requests for their company" on "public"."company_admin_requests";

drop policy "Developers can update admin requests" on "public"."company_admin_requests";

drop policy "Developers can view all admin requests" on "public"."company_admin_requests";

drop policy "Company admins can manage their cover images" on "public"."company_cover_images";

drop policy "Developers can manage all cover images" on "public"."company_cover_images";

drop policy "Company admins can manage their company documents" on "public"."company_documents";

drop policy "Developers can manage all company documents" on "public"."company_documents";

drop policy "Developers can update all company requests" on "public"."company_requests";

drop policy "Developers can view all company requests" on "public"."company_requests";

drop policy "Approved company admins can create new company revisions" on "public"."company_revision";

drop policy "Approved company admins can update their company revisions" on "public"."company_revision";

drop policy "Approved company admins can view all their company revisions" on "public"."company_revision";

drop policy "Developers can manage company revisions" on "public"."company_revision";

drop policy "Approved company admins can insert revision activations" on "public"."company_revision_activations";

drop policy "Approved company admins can view their company revision activat" on "public"."company_revision_activations";

drop policy "Developers can manage company revision activations" on "public"."company_revision_activations";

drop policy "Anyone can view public conversations" on "public"."conversations";

drop policy "Developers can view all conversations" on "public"."conversations";

drop policy "Developers can manage developer access" on "public"."developer_access";

drop policy "Developers can view developer access" on "public"."developer_access";

drop policy "Developers can create their own reviews" on "public"."developer_company_request_reviews";

drop policy "Developers can update their own reviews" on "public"."developer_company_request_reviews";

drop policy "Developers can view their own reviews" on "public"."developer_company_request_reviews";

drop policy "Developers can create their own reviews" on "public"."developer_error_reviews";

drop policy "Developers can update their own reviews" on "public"."developer_error_reviews";

drop policy "Developers can view all error reviews" on "public"."developer_error_reviews";

drop policy "Developers can create their own reviews" on "public"."developer_feedback_reviews";

drop policy "Developers can update their own reviews" on "public"."developer_feedback_reviews";

drop policy "Developers can view their own reviews" on "public"."developer_feedback_reviews";

drop policy "Company admins can delete embeddings from their products" on "public"."embedding";

drop policy "Developers can manage embeddings" on "public"."embedding";

drop policy "Developers can view all embeddings" on "public"."embedding";

drop policy "Developers can manage embedding usage counters" on "public"."embedding_usage_counters";

drop policy "Developers can view all embedding usage counters" on "public"."embedding_usage_counters";

drop policy "Developers can update error reports" on "public"."error_reports";

drop policy "Developers can view all error reports for filtering" on "public"."error_reports";

drop policy "Developers can view all error reports" on "public"."error_reports";

drop policy "Users can create error reports for their conversations" on "public"."error_reports";

drop policy "Users can view error reports for their conversations" on "public"."error_reports";

drop policy "Developers can manage all ratings" on "public"."evaluation_ratings";

drop policy "Developers can view all ratings" on "public"."evaluation_ratings";

drop policy "Approved company admins can manage their company products" on "public"."product";

drop policy "Company admins can delete products from their company" on "public"."product";

drop policy "Developers can manage products" on "public"."product";

drop policy "Developers can manage all product documents" on "public"."product_documents";

drop policy "Users can delete documents from their company products" on "public"."product_documents";

drop policy "Users can upload documents to their company products" on "public"."product_documents";

drop policy "Users can view documents from their company products" on "public"."product_documents";

drop policy "Approved company admins can create product revisions for their " on "public"."product_revision";

drop policy "Approved company admins can manage their company product revisi" on "public"."product_revision";

drop policy "Company admins can delete product revisions from their company" on "public"."product_revision";

drop policy "Developers can manage product revisions" on "public"."product_revision";

drop policy "Approved company admins can insert history entries" on "public"."product_revision_history";

drop policy "Approved company admins can insert product revision activations" on "public"."product_revision_history";

drop policy "Approved company admins can view their history entries" on "public"."product_revision_history";

drop policy "Approved company admins can view their product revision activat" on "public"."product_revision_history";

drop policy "Developers can manage history entries" on "public"."product_revision_history";

drop policy "Developers can manage product revision activations" on "public"."product_revision_history";

drop policy "Developers can manage prompts_webscrapping" on "public"."prompts_webscrapping";

drop policy "Developers can view prompts_webscrapping" on "public"."prompts_webscrapping";

drop policy "Developers can create public conversations" on "public"."public_conversations";

drop policy "Developers can delete public conversations" on "public"."public_conversations";

drop policy "Developers can update public conversations" on "public"."public_conversations";

drop policy "Users can delete specs for their own RFXs" on "public"."rfx_specs";

drop policy "Users can insert specs for their own RFXs" on "public"."rfx_specs";

drop policy "Users can update specs for their own RFXs" on "public"."rfx_specs";

drop policy "Users can view specs for their own RFXs" on "public"."rfx_specs";

drop policy "Developers can manage subscriptions" on "public"."subscription";

drop policy "Developers can update feedback status" on "public"."user_feedback";

drop policy "Developers can view all feedback" on "public"."user_feedback";

drop policy "Developers can view all type selections" on "public"."user_type_selections";

revoke delete on table "public"."agent_memory_json" from "anon";

revoke insert on table "public"."agent_memory_json" from "anon";

revoke references on table "public"."agent_memory_json" from "anon";

revoke select on table "public"."agent_memory_json" from "anon";

revoke trigger on table "public"."agent_memory_json" from "anon";

revoke truncate on table "public"."agent_memory_json" from "anon";

revoke update on table "public"."agent_memory_json" from "anon";

revoke delete on table "public"."agent_memory_json" from "authenticated";

revoke insert on table "public"."agent_memory_json" from "authenticated";

revoke references on table "public"."agent_memory_json" from "authenticated";

revoke select on table "public"."agent_memory_json" from "authenticated";

revoke trigger on table "public"."agent_memory_json" from "authenticated";

revoke truncate on table "public"."agent_memory_json" from "authenticated";

revoke update on table "public"."agent_memory_json" from "authenticated";

revoke delete on table "public"."agent_memory_json" from "service_role";

revoke insert on table "public"."agent_memory_json" from "service_role";

revoke references on table "public"."agent_memory_json" from "service_role";

revoke select on table "public"."agent_memory_json" from "service_role";

revoke trigger on table "public"."agent_memory_json" from "service_role";

revoke truncate on table "public"."agent_memory_json" from "service_role";

revoke update on table "public"."agent_memory_json" from "service_role";

revoke delete on table "public"."agent_prompt_backups" from "anon";

revoke insert on table "public"."agent_prompt_backups" from "anon";

revoke references on table "public"."agent_prompt_backups" from "anon";

revoke select on table "public"."agent_prompt_backups" from "anon";

revoke trigger on table "public"."agent_prompt_backups" from "anon";

revoke truncate on table "public"."agent_prompt_backups" from "anon";

revoke update on table "public"."agent_prompt_backups" from "anon";

revoke delete on table "public"."agent_prompt_backups" from "authenticated";

revoke insert on table "public"."agent_prompt_backups" from "authenticated";

revoke references on table "public"."agent_prompt_backups" from "authenticated";

revoke select on table "public"."agent_prompt_backups" from "authenticated";

revoke trigger on table "public"."agent_prompt_backups" from "authenticated";

revoke truncate on table "public"."agent_prompt_backups" from "authenticated";

revoke update on table "public"."agent_prompt_backups" from "authenticated";

revoke delete on table "public"."agent_prompt_backups" from "service_role";

revoke insert on table "public"."agent_prompt_backups" from "service_role";

revoke references on table "public"."agent_prompt_backups" from "service_role";

revoke select on table "public"."agent_prompt_backups" from "service_role";

revoke trigger on table "public"."agent_prompt_backups" from "service_role";

revoke truncate on table "public"."agent_prompt_backups" from "service_role";

revoke update on table "public"."agent_prompt_backups" from "service_role";

revoke delete on table "public"."agent_prompt_backups_backup" from "anon";

revoke insert on table "public"."agent_prompt_backups_backup" from "anon";

revoke references on table "public"."agent_prompt_backups_backup" from "anon";

revoke select on table "public"."agent_prompt_backups_backup" from "anon";

revoke trigger on table "public"."agent_prompt_backups_backup" from "anon";

revoke truncate on table "public"."agent_prompt_backups_backup" from "anon";

revoke update on table "public"."agent_prompt_backups_backup" from "anon";

revoke delete on table "public"."agent_prompt_backups_backup" from "authenticated";

revoke insert on table "public"."agent_prompt_backups_backup" from "authenticated";

revoke references on table "public"."agent_prompt_backups_backup" from "authenticated";

revoke select on table "public"."agent_prompt_backups_backup" from "authenticated";

revoke trigger on table "public"."agent_prompt_backups_backup" from "authenticated";

revoke truncate on table "public"."agent_prompt_backups_backup" from "authenticated";

revoke update on table "public"."agent_prompt_backups_backup" from "authenticated";

revoke delete on table "public"."agent_prompt_backups_backup" from "service_role";

revoke insert on table "public"."agent_prompt_backups_backup" from "service_role";

revoke references on table "public"."agent_prompt_backups_backup" from "service_role";

revoke select on table "public"."agent_prompt_backups_backup" from "service_role";

revoke trigger on table "public"."agent_prompt_backups_backup" from "service_role";

revoke truncate on table "public"."agent_prompt_backups_backup" from "service_role";

revoke update on table "public"."agent_prompt_backups_backup" from "service_role";

revoke delete on table "public"."agent_prompt_backups_v2" from "anon";

revoke insert on table "public"."agent_prompt_backups_v2" from "anon";

revoke references on table "public"."agent_prompt_backups_v2" from "anon";

revoke select on table "public"."agent_prompt_backups_v2" from "anon";

revoke trigger on table "public"."agent_prompt_backups_v2" from "anon";

revoke truncate on table "public"."agent_prompt_backups_v2" from "anon";

revoke update on table "public"."agent_prompt_backups_v2" from "anon";

revoke delete on table "public"."agent_prompt_backups_v2" from "authenticated";

revoke insert on table "public"."agent_prompt_backups_v2" from "authenticated";

revoke references on table "public"."agent_prompt_backups_v2" from "authenticated";

revoke select on table "public"."agent_prompt_backups_v2" from "authenticated";

revoke trigger on table "public"."agent_prompt_backups_v2" from "authenticated";

revoke truncate on table "public"."agent_prompt_backups_v2" from "authenticated";

revoke update on table "public"."agent_prompt_backups_v2" from "authenticated";

revoke delete on table "public"."agent_prompt_backups_v2" from "service_role";

revoke insert on table "public"."agent_prompt_backups_v2" from "service_role";

revoke references on table "public"."agent_prompt_backups_v2" from "service_role";

revoke select on table "public"."agent_prompt_backups_v2" from "service_role";

revoke trigger on table "public"."agent_prompt_backups_v2" from "service_role";

revoke truncate on table "public"."agent_prompt_backups_v2" from "service_role";

revoke update on table "public"."agent_prompt_backups_v2" from "service_role";

revoke delete on table "public"."agent_prompts_dev" from "anon";

revoke insert on table "public"."agent_prompts_dev" from "anon";

revoke references on table "public"."agent_prompts_dev" from "anon";

revoke select on table "public"."agent_prompts_dev" from "anon";

revoke trigger on table "public"."agent_prompts_dev" from "anon";

revoke truncate on table "public"."agent_prompts_dev" from "anon";

revoke update on table "public"."agent_prompts_dev" from "anon";

revoke delete on table "public"."agent_prompts_dev" from "authenticated";

revoke insert on table "public"."agent_prompts_dev" from "authenticated";

revoke references on table "public"."agent_prompts_dev" from "authenticated";

revoke select on table "public"."agent_prompts_dev" from "authenticated";

revoke trigger on table "public"."agent_prompts_dev" from "authenticated";

revoke truncate on table "public"."agent_prompts_dev" from "authenticated";

revoke update on table "public"."agent_prompts_dev" from "authenticated";

revoke delete on table "public"."agent_prompts_dev" from "service_role";

revoke insert on table "public"."agent_prompts_dev" from "service_role";

revoke references on table "public"."agent_prompts_dev" from "service_role";

revoke select on table "public"."agent_prompts_dev" from "service_role";

revoke trigger on table "public"."agent_prompts_dev" from "service_role";

revoke truncate on table "public"."agent_prompts_dev" from "service_role";

revoke update on table "public"."agent_prompts_dev" from "service_role";

revoke delete on table "public"."agent_prompts_prod" from "anon";

revoke insert on table "public"."agent_prompts_prod" from "anon";

revoke references on table "public"."agent_prompts_prod" from "anon";

revoke select on table "public"."agent_prompts_prod" from "anon";

revoke trigger on table "public"."agent_prompts_prod" from "anon";

revoke truncate on table "public"."agent_prompts_prod" from "anon";

revoke update on table "public"."agent_prompts_prod" from "anon";

revoke delete on table "public"."agent_prompts_prod" from "authenticated";

revoke insert on table "public"."agent_prompts_prod" from "authenticated";

revoke references on table "public"."agent_prompts_prod" from "authenticated";

revoke select on table "public"."agent_prompts_prod" from "authenticated";

revoke trigger on table "public"."agent_prompts_prod" from "authenticated";

revoke truncate on table "public"."agent_prompts_prod" from "authenticated";

revoke update on table "public"."agent_prompts_prod" from "authenticated";

revoke delete on table "public"."agent_prompts_prod" from "service_role";

revoke insert on table "public"."agent_prompts_prod" from "service_role";

revoke references on table "public"."agent_prompts_prod" from "service_role";

revoke select on table "public"."agent_prompts_prod" from "service_role";

revoke trigger on table "public"."agent_prompts_prod" from "service_role";

revoke truncate on table "public"."agent_prompts_prod" from "service_role";

revoke update on table "public"."agent_prompts_prod" from "service_role";

revoke delete on table "public"."app_user" from "anon";

revoke insert on table "public"."app_user" from "anon";

revoke references on table "public"."app_user" from "anon";

revoke select on table "public"."app_user" from "anon";

revoke trigger on table "public"."app_user" from "anon";

revoke truncate on table "public"."app_user" from "anon";

revoke update on table "public"."app_user" from "anon";

revoke delete on table "public"."app_user" from "authenticated";

revoke insert on table "public"."app_user" from "authenticated";

revoke references on table "public"."app_user" from "authenticated";

revoke select on table "public"."app_user" from "authenticated";

revoke trigger on table "public"."app_user" from "authenticated";

revoke truncate on table "public"."app_user" from "authenticated";

revoke update on table "public"."app_user" from "authenticated";

revoke delete on table "public"."app_user" from "service_role";

revoke insert on table "public"."app_user" from "service_role";

revoke references on table "public"."app_user" from "service_role";

revoke select on table "public"."app_user" from "service_role";

revoke trigger on table "public"."app_user" from "service_role";

revoke truncate on table "public"."app_user" from "service_role";

revoke update on table "public"."app_user" from "service_role";

revoke delete on table "public"."chat_messages" from "anon";

revoke insert on table "public"."chat_messages" from "anon";

revoke references on table "public"."chat_messages" from "anon";

revoke select on table "public"."chat_messages" from "anon";

revoke trigger on table "public"."chat_messages" from "anon";

revoke truncate on table "public"."chat_messages" from "anon";

revoke update on table "public"."chat_messages" from "anon";

revoke delete on table "public"."chat_messages" from "authenticated";

revoke insert on table "public"."chat_messages" from "authenticated";

revoke references on table "public"."chat_messages" from "authenticated";

revoke select on table "public"."chat_messages" from "authenticated";

revoke trigger on table "public"."chat_messages" from "authenticated";

revoke truncate on table "public"."chat_messages" from "authenticated";

revoke update on table "public"."chat_messages" from "authenticated";

revoke delete on table "public"."chat_messages" from "service_role";

revoke insert on table "public"."chat_messages" from "service_role";

revoke references on table "public"."chat_messages" from "service_role";

revoke select on table "public"."chat_messages" from "service_role";

revoke trigger on table "public"."chat_messages" from "service_role";

revoke truncate on table "public"."chat_messages" from "service_role";

revoke update on table "public"."chat_messages" from "service_role";

revoke delete on table "public"."company" from "anon";

revoke insert on table "public"."company" from "anon";

revoke references on table "public"."company" from "anon";

revoke select on table "public"."company" from "anon";

revoke trigger on table "public"."company" from "anon";

revoke truncate on table "public"."company" from "anon";

revoke update on table "public"."company" from "anon";

revoke delete on table "public"."company" from "authenticated";

revoke insert on table "public"."company" from "authenticated";

revoke references on table "public"."company" from "authenticated";

revoke select on table "public"."company" from "authenticated";

revoke trigger on table "public"."company" from "authenticated";

revoke truncate on table "public"."company" from "authenticated";

revoke update on table "public"."company" from "authenticated";

revoke delete on table "public"."company" from "service_role";

revoke insert on table "public"."company" from "service_role";

revoke references on table "public"."company" from "service_role";

revoke select on table "public"."company" from "service_role";

revoke trigger on table "public"."company" from "service_role";

revoke truncate on table "public"."company" from "service_role";

revoke update on table "public"."company" from "service_role";

revoke delete on table "public"."company_admin_requests" from "anon";

revoke insert on table "public"."company_admin_requests" from "anon";

revoke references on table "public"."company_admin_requests" from "anon";

revoke select on table "public"."company_admin_requests" from "anon";

revoke trigger on table "public"."company_admin_requests" from "anon";

revoke truncate on table "public"."company_admin_requests" from "anon";

revoke update on table "public"."company_admin_requests" from "anon";

revoke delete on table "public"."company_admin_requests" from "authenticated";

revoke insert on table "public"."company_admin_requests" from "authenticated";

revoke references on table "public"."company_admin_requests" from "authenticated";

revoke select on table "public"."company_admin_requests" from "authenticated";

revoke trigger on table "public"."company_admin_requests" from "authenticated";

revoke truncate on table "public"."company_admin_requests" from "authenticated";

revoke update on table "public"."company_admin_requests" from "authenticated";

revoke delete on table "public"."company_admin_requests" from "service_role";

revoke insert on table "public"."company_admin_requests" from "service_role";

revoke references on table "public"."company_admin_requests" from "service_role";

revoke select on table "public"."company_admin_requests" from "service_role";

revoke trigger on table "public"."company_admin_requests" from "service_role";

revoke truncate on table "public"."company_admin_requests" from "service_role";

revoke update on table "public"."company_admin_requests" from "service_role";

revoke delete on table "public"."company_cover_images" from "anon";

revoke insert on table "public"."company_cover_images" from "anon";

revoke references on table "public"."company_cover_images" from "anon";

revoke select on table "public"."company_cover_images" from "anon";

revoke trigger on table "public"."company_cover_images" from "anon";

revoke truncate on table "public"."company_cover_images" from "anon";

revoke update on table "public"."company_cover_images" from "anon";

revoke delete on table "public"."company_cover_images" from "authenticated";

revoke insert on table "public"."company_cover_images" from "authenticated";

revoke references on table "public"."company_cover_images" from "authenticated";

revoke select on table "public"."company_cover_images" from "authenticated";

revoke trigger on table "public"."company_cover_images" from "authenticated";

revoke truncate on table "public"."company_cover_images" from "authenticated";

revoke update on table "public"."company_cover_images" from "authenticated";

revoke delete on table "public"."company_cover_images" from "service_role";

revoke insert on table "public"."company_cover_images" from "service_role";

revoke references on table "public"."company_cover_images" from "service_role";

revoke select on table "public"."company_cover_images" from "service_role";

revoke trigger on table "public"."company_cover_images" from "service_role";

revoke truncate on table "public"."company_cover_images" from "service_role";

revoke update on table "public"."company_cover_images" from "service_role";

revoke delete on table "public"."company_documents" from "anon";

revoke insert on table "public"."company_documents" from "anon";

revoke references on table "public"."company_documents" from "anon";

revoke select on table "public"."company_documents" from "anon";

revoke trigger on table "public"."company_documents" from "anon";

revoke truncate on table "public"."company_documents" from "anon";

revoke update on table "public"."company_documents" from "anon";

revoke delete on table "public"."company_documents" from "authenticated";

revoke insert on table "public"."company_documents" from "authenticated";

revoke references on table "public"."company_documents" from "authenticated";

revoke select on table "public"."company_documents" from "authenticated";

revoke trigger on table "public"."company_documents" from "authenticated";

revoke truncate on table "public"."company_documents" from "authenticated";

revoke update on table "public"."company_documents" from "authenticated";

revoke delete on table "public"."company_documents" from "service_role";

revoke insert on table "public"."company_documents" from "service_role";

revoke references on table "public"."company_documents" from "service_role";

revoke select on table "public"."company_documents" from "service_role";

revoke trigger on table "public"."company_documents" from "service_role";

revoke truncate on table "public"."company_documents" from "service_role";

revoke update on table "public"."company_documents" from "service_role";

revoke delete on table "public"."company_requests" from "anon";

revoke insert on table "public"."company_requests" from "anon";

revoke references on table "public"."company_requests" from "anon";

revoke select on table "public"."company_requests" from "anon";

revoke trigger on table "public"."company_requests" from "anon";

revoke truncate on table "public"."company_requests" from "anon";

revoke update on table "public"."company_requests" from "anon";

revoke delete on table "public"."company_requests" from "authenticated";

revoke insert on table "public"."company_requests" from "authenticated";

revoke references on table "public"."company_requests" from "authenticated";

revoke select on table "public"."company_requests" from "authenticated";

revoke trigger on table "public"."company_requests" from "authenticated";

revoke truncate on table "public"."company_requests" from "authenticated";

revoke update on table "public"."company_requests" from "authenticated";

revoke delete on table "public"."company_requests" from "service_role";

revoke insert on table "public"."company_requests" from "service_role";

revoke references on table "public"."company_requests" from "service_role";

revoke select on table "public"."company_requests" from "service_role";

revoke trigger on table "public"."company_requests" from "service_role";

revoke truncate on table "public"."company_requests" from "service_role";

revoke update on table "public"."company_requests" from "service_role";

revoke delete on table "public"."company_revision" from "anon";

revoke insert on table "public"."company_revision" from "anon";

revoke references on table "public"."company_revision" from "anon";

revoke select on table "public"."company_revision" from "anon";

revoke trigger on table "public"."company_revision" from "anon";

revoke truncate on table "public"."company_revision" from "anon";

revoke update on table "public"."company_revision" from "anon";

revoke delete on table "public"."company_revision" from "authenticated";

revoke insert on table "public"."company_revision" from "authenticated";

revoke references on table "public"."company_revision" from "authenticated";

revoke select on table "public"."company_revision" from "authenticated";

revoke trigger on table "public"."company_revision" from "authenticated";

revoke truncate on table "public"."company_revision" from "authenticated";

revoke update on table "public"."company_revision" from "authenticated";

revoke delete on table "public"."company_revision" from "service_role";

revoke insert on table "public"."company_revision" from "service_role";

revoke references on table "public"."company_revision" from "service_role";

revoke select on table "public"."company_revision" from "service_role";

revoke trigger on table "public"."company_revision" from "service_role";

revoke truncate on table "public"."company_revision" from "service_role";

revoke update on table "public"."company_revision" from "service_role";

revoke delete on table "public"."company_revision_activations" from "anon";

revoke insert on table "public"."company_revision_activations" from "anon";

revoke references on table "public"."company_revision_activations" from "anon";

revoke select on table "public"."company_revision_activations" from "anon";

revoke trigger on table "public"."company_revision_activations" from "anon";

revoke truncate on table "public"."company_revision_activations" from "anon";

revoke update on table "public"."company_revision_activations" from "anon";

revoke delete on table "public"."company_revision_activations" from "authenticated";

revoke insert on table "public"."company_revision_activations" from "authenticated";

revoke references on table "public"."company_revision_activations" from "authenticated";

revoke select on table "public"."company_revision_activations" from "authenticated";

revoke trigger on table "public"."company_revision_activations" from "authenticated";

revoke truncate on table "public"."company_revision_activations" from "authenticated";

revoke update on table "public"."company_revision_activations" from "authenticated";

revoke delete on table "public"."company_revision_activations" from "service_role";

revoke insert on table "public"."company_revision_activations" from "service_role";

revoke references on table "public"."company_revision_activations" from "service_role";

revoke select on table "public"."company_revision_activations" from "service_role";

revoke trigger on table "public"."company_revision_activations" from "service_role";

revoke truncate on table "public"."company_revision_activations" from "service_role";

revoke update on table "public"."company_revision_activations" from "service_role";

revoke delete on table "public"."conversations" from "anon";

revoke insert on table "public"."conversations" from "anon";

revoke references on table "public"."conversations" from "anon";

revoke select on table "public"."conversations" from "anon";

revoke trigger on table "public"."conversations" from "anon";

revoke truncate on table "public"."conversations" from "anon";

revoke update on table "public"."conversations" from "anon";

revoke delete on table "public"."conversations" from "authenticated";

revoke insert on table "public"."conversations" from "authenticated";

revoke references on table "public"."conversations" from "authenticated";

revoke select on table "public"."conversations" from "authenticated";

revoke trigger on table "public"."conversations" from "authenticated";

revoke truncate on table "public"."conversations" from "authenticated";

revoke update on table "public"."conversations" from "authenticated";

revoke delete on table "public"."conversations" from "service_role";

revoke insert on table "public"."conversations" from "service_role";

revoke references on table "public"."conversations" from "service_role";

revoke select on table "public"."conversations" from "service_role";

revoke trigger on table "public"."conversations" from "service_role";

revoke truncate on table "public"."conversations" from "service_role";

revoke update on table "public"."conversations" from "service_role";

revoke delete on table "public"."developer_access" from "anon";

revoke insert on table "public"."developer_access" from "anon";

revoke references on table "public"."developer_access" from "anon";

revoke select on table "public"."developer_access" from "anon";

revoke trigger on table "public"."developer_access" from "anon";

revoke truncate on table "public"."developer_access" from "anon";

revoke update on table "public"."developer_access" from "anon";

revoke delete on table "public"."developer_access" from "authenticated";

revoke insert on table "public"."developer_access" from "authenticated";

revoke references on table "public"."developer_access" from "authenticated";

revoke select on table "public"."developer_access" from "authenticated";

revoke trigger on table "public"."developer_access" from "authenticated";

revoke truncate on table "public"."developer_access" from "authenticated";

revoke update on table "public"."developer_access" from "authenticated";

revoke delete on table "public"."developer_access" from "service_role";

revoke insert on table "public"."developer_access" from "service_role";

revoke references on table "public"."developer_access" from "service_role";

revoke select on table "public"."developer_access" from "service_role";

revoke trigger on table "public"."developer_access" from "service_role";

revoke truncate on table "public"."developer_access" from "service_role";

revoke update on table "public"."developer_access" from "service_role";

revoke delete on table "public"."developer_company_request_reviews" from "anon";

revoke insert on table "public"."developer_company_request_reviews" from "anon";

revoke references on table "public"."developer_company_request_reviews" from "anon";

revoke select on table "public"."developer_company_request_reviews" from "anon";

revoke trigger on table "public"."developer_company_request_reviews" from "anon";

revoke truncate on table "public"."developer_company_request_reviews" from "anon";

revoke update on table "public"."developer_company_request_reviews" from "anon";

revoke delete on table "public"."developer_company_request_reviews" from "authenticated";

revoke insert on table "public"."developer_company_request_reviews" from "authenticated";

revoke references on table "public"."developer_company_request_reviews" from "authenticated";

revoke select on table "public"."developer_company_request_reviews" from "authenticated";

revoke trigger on table "public"."developer_company_request_reviews" from "authenticated";

revoke truncate on table "public"."developer_company_request_reviews" from "authenticated";

revoke update on table "public"."developer_company_request_reviews" from "authenticated";

revoke delete on table "public"."developer_company_request_reviews" from "service_role";

revoke insert on table "public"."developer_company_request_reviews" from "service_role";

revoke references on table "public"."developer_company_request_reviews" from "service_role";

revoke select on table "public"."developer_company_request_reviews" from "service_role";

revoke trigger on table "public"."developer_company_request_reviews" from "service_role";

revoke truncate on table "public"."developer_company_request_reviews" from "service_role";

revoke update on table "public"."developer_company_request_reviews" from "service_role";

revoke delete on table "public"."developer_error_reviews" from "anon";

revoke insert on table "public"."developer_error_reviews" from "anon";

revoke references on table "public"."developer_error_reviews" from "anon";

revoke select on table "public"."developer_error_reviews" from "anon";

revoke trigger on table "public"."developer_error_reviews" from "anon";

revoke truncate on table "public"."developer_error_reviews" from "anon";

revoke update on table "public"."developer_error_reviews" from "anon";

revoke delete on table "public"."developer_error_reviews" from "authenticated";

revoke insert on table "public"."developer_error_reviews" from "authenticated";

revoke references on table "public"."developer_error_reviews" from "authenticated";

revoke select on table "public"."developer_error_reviews" from "authenticated";

revoke trigger on table "public"."developer_error_reviews" from "authenticated";

revoke truncate on table "public"."developer_error_reviews" from "authenticated";

revoke update on table "public"."developer_error_reviews" from "authenticated";

revoke delete on table "public"."developer_error_reviews" from "service_role";

revoke insert on table "public"."developer_error_reviews" from "service_role";

revoke references on table "public"."developer_error_reviews" from "service_role";

revoke select on table "public"."developer_error_reviews" from "service_role";

revoke trigger on table "public"."developer_error_reviews" from "service_role";

revoke truncate on table "public"."developer_error_reviews" from "service_role";

revoke update on table "public"."developer_error_reviews" from "service_role";

revoke delete on table "public"."developer_feedback_reviews" from "anon";

revoke insert on table "public"."developer_feedback_reviews" from "anon";

revoke references on table "public"."developer_feedback_reviews" from "anon";

revoke select on table "public"."developer_feedback_reviews" from "anon";

revoke trigger on table "public"."developer_feedback_reviews" from "anon";

revoke truncate on table "public"."developer_feedback_reviews" from "anon";

revoke update on table "public"."developer_feedback_reviews" from "anon";

revoke delete on table "public"."developer_feedback_reviews" from "authenticated";

revoke insert on table "public"."developer_feedback_reviews" from "authenticated";

revoke references on table "public"."developer_feedback_reviews" from "authenticated";

revoke select on table "public"."developer_feedback_reviews" from "authenticated";

revoke trigger on table "public"."developer_feedback_reviews" from "authenticated";

revoke truncate on table "public"."developer_feedback_reviews" from "authenticated";

revoke update on table "public"."developer_feedback_reviews" from "authenticated";

revoke delete on table "public"."developer_feedback_reviews" from "service_role";

revoke insert on table "public"."developer_feedback_reviews" from "service_role";

revoke references on table "public"."developer_feedback_reviews" from "service_role";

revoke select on table "public"."developer_feedback_reviews" from "service_role";

revoke trigger on table "public"."developer_feedback_reviews" from "service_role";

revoke truncate on table "public"."developer_feedback_reviews" from "service_role";

revoke update on table "public"."developer_feedback_reviews" from "service_role";

revoke delete on table "public"."embedding" from "anon";

revoke insert on table "public"."embedding" from "anon";

revoke references on table "public"."embedding" from "anon";

revoke select on table "public"."embedding" from "anon";

revoke trigger on table "public"."embedding" from "anon";

revoke truncate on table "public"."embedding" from "anon";

revoke update on table "public"."embedding" from "anon";

revoke delete on table "public"."embedding" from "authenticated";

revoke insert on table "public"."embedding" from "authenticated";

revoke references on table "public"."embedding" from "authenticated";

revoke select on table "public"."embedding" from "authenticated";

revoke trigger on table "public"."embedding" from "authenticated";

revoke truncate on table "public"."embedding" from "authenticated";

revoke update on table "public"."embedding" from "authenticated";

revoke delete on table "public"."embedding" from "service_role";

revoke insert on table "public"."embedding" from "service_role";

revoke references on table "public"."embedding" from "service_role";

revoke select on table "public"."embedding" from "service_role";

revoke trigger on table "public"."embedding" from "service_role";

revoke truncate on table "public"."embedding" from "service_role";

revoke update on table "public"."embedding" from "service_role";

revoke delete on table "public"."embedding_toggle_jobs" from "anon";

revoke insert on table "public"."embedding_toggle_jobs" from "anon";

revoke references on table "public"."embedding_toggle_jobs" from "anon";

revoke select on table "public"."embedding_toggle_jobs" from "anon";

revoke trigger on table "public"."embedding_toggle_jobs" from "anon";

revoke truncate on table "public"."embedding_toggle_jobs" from "anon";

revoke update on table "public"."embedding_toggle_jobs" from "anon";

revoke delete on table "public"."embedding_toggle_jobs" from "authenticated";

revoke insert on table "public"."embedding_toggle_jobs" from "authenticated";

revoke references on table "public"."embedding_toggle_jobs" from "authenticated";

revoke select on table "public"."embedding_toggle_jobs" from "authenticated";

revoke trigger on table "public"."embedding_toggle_jobs" from "authenticated";

revoke truncate on table "public"."embedding_toggle_jobs" from "authenticated";

revoke update on table "public"."embedding_toggle_jobs" from "authenticated";

revoke delete on table "public"."embedding_toggle_jobs" from "service_role";

revoke insert on table "public"."embedding_toggle_jobs" from "service_role";

revoke references on table "public"."embedding_toggle_jobs" from "service_role";

revoke select on table "public"."embedding_toggle_jobs" from "service_role";

revoke trigger on table "public"."embedding_toggle_jobs" from "service_role";

revoke truncate on table "public"."embedding_toggle_jobs" from "service_role";

revoke update on table "public"."embedding_toggle_jobs" from "service_role";

revoke delete on table "public"."embedding_usage_counters" from "anon";

revoke insert on table "public"."embedding_usage_counters" from "anon";

revoke references on table "public"."embedding_usage_counters" from "anon";

revoke select on table "public"."embedding_usage_counters" from "anon";

revoke trigger on table "public"."embedding_usage_counters" from "anon";

revoke truncate on table "public"."embedding_usage_counters" from "anon";

revoke update on table "public"."embedding_usage_counters" from "anon";

revoke delete on table "public"."embedding_usage_counters" from "authenticated";

revoke insert on table "public"."embedding_usage_counters" from "authenticated";

revoke references on table "public"."embedding_usage_counters" from "authenticated";

revoke select on table "public"."embedding_usage_counters" from "authenticated";

revoke trigger on table "public"."embedding_usage_counters" from "authenticated";

revoke truncate on table "public"."embedding_usage_counters" from "authenticated";

revoke update on table "public"."embedding_usage_counters" from "authenticated";

revoke delete on table "public"."embedding_usage_counters" from "service_role";

revoke insert on table "public"."embedding_usage_counters" from "service_role";

revoke references on table "public"."embedding_usage_counters" from "service_role";

revoke select on table "public"."embedding_usage_counters" from "service_role";

revoke trigger on table "public"."embedding_usage_counters" from "service_role";

revoke truncate on table "public"."embedding_usage_counters" from "service_role";

revoke update on table "public"."embedding_usage_counters" from "service_role";

revoke delete on table "public"."error_reports" from "anon";

revoke insert on table "public"."error_reports" from "anon";

revoke references on table "public"."error_reports" from "anon";

revoke select on table "public"."error_reports" from "anon";

revoke trigger on table "public"."error_reports" from "anon";

revoke truncate on table "public"."error_reports" from "anon";

revoke update on table "public"."error_reports" from "anon";

revoke delete on table "public"."error_reports" from "authenticated";

revoke insert on table "public"."error_reports" from "authenticated";

revoke references on table "public"."error_reports" from "authenticated";

revoke select on table "public"."error_reports" from "authenticated";

revoke trigger on table "public"."error_reports" from "authenticated";

revoke truncate on table "public"."error_reports" from "authenticated";

revoke update on table "public"."error_reports" from "authenticated";

revoke delete on table "public"."error_reports" from "service_role";

revoke insert on table "public"."error_reports" from "service_role";

revoke references on table "public"."error_reports" from "service_role";

revoke select on table "public"."error_reports" from "service_role";

revoke trigger on table "public"."error_reports" from "service_role";

revoke truncate on table "public"."error_reports" from "service_role";

revoke update on table "public"."error_reports" from "service_role";

revoke delete on table "public"."evaluation_ratings" from "anon";

revoke insert on table "public"."evaluation_ratings" from "anon";

revoke references on table "public"."evaluation_ratings" from "anon";

revoke select on table "public"."evaluation_ratings" from "anon";

revoke trigger on table "public"."evaluation_ratings" from "anon";

revoke truncate on table "public"."evaluation_ratings" from "anon";

revoke update on table "public"."evaluation_ratings" from "anon";

revoke delete on table "public"."evaluation_ratings" from "authenticated";

revoke insert on table "public"."evaluation_ratings" from "authenticated";

revoke references on table "public"."evaluation_ratings" from "authenticated";

revoke select on table "public"."evaluation_ratings" from "authenticated";

revoke trigger on table "public"."evaluation_ratings" from "authenticated";

revoke truncate on table "public"."evaluation_ratings" from "authenticated";

revoke update on table "public"."evaluation_ratings" from "authenticated";

revoke delete on table "public"."evaluation_ratings" from "service_role";

revoke insert on table "public"."evaluation_ratings" from "service_role";

revoke references on table "public"."evaluation_ratings" from "service_role";

revoke select on table "public"."evaluation_ratings" from "service_role";

revoke trigger on table "public"."evaluation_ratings" from "service_role";

revoke truncate on table "public"."evaluation_ratings" from "service_role";

revoke update on table "public"."evaluation_ratings" from "service_role";

revoke delete on table "public"."product" from "anon";

revoke insert on table "public"."product" from "anon";

revoke references on table "public"."product" from "anon";

revoke select on table "public"."product" from "anon";

revoke trigger on table "public"."product" from "anon";

revoke truncate on table "public"."product" from "anon";

revoke update on table "public"."product" from "anon";

revoke delete on table "public"."product" from "authenticated";

revoke insert on table "public"."product" from "authenticated";

revoke references on table "public"."product" from "authenticated";

revoke select on table "public"."product" from "authenticated";

revoke trigger on table "public"."product" from "authenticated";

revoke truncate on table "public"."product" from "authenticated";

revoke update on table "public"."product" from "authenticated";

revoke delete on table "public"."product" from "service_role";

revoke insert on table "public"."product" from "service_role";

revoke references on table "public"."product" from "service_role";

revoke select on table "public"."product" from "service_role";

revoke trigger on table "public"."product" from "service_role";

revoke truncate on table "public"."product" from "service_role";

revoke update on table "public"."product" from "service_role";

revoke delete on table "public"."product_documents" from "anon";

revoke insert on table "public"."product_documents" from "anon";

revoke references on table "public"."product_documents" from "anon";

revoke select on table "public"."product_documents" from "anon";

revoke trigger on table "public"."product_documents" from "anon";

revoke truncate on table "public"."product_documents" from "anon";

revoke update on table "public"."product_documents" from "anon";

revoke delete on table "public"."product_documents" from "authenticated";

revoke insert on table "public"."product_documents" from "authenticated";

revoke references on table "public"."product_documents" from "authenticated";

revoke select on table "public"."product_documents" from "authenticated";

revoke trigger on table "public"."product_documents" from "authenticated";

revoke truncate on table "public"."product_documents" from "authenticated";

revoke update on table "public"."product_documents" from "authenticated";

revoke delete on table "public"."product_documents" from "service_role";

revoke insert on table "public"."product_documents" from "service_role";

revoke references on table "public"."product_documents" from "service_role";

revoke select on table "public"."product_documents" from "service_role";

revoke trigger on table "public"."product_documents" from "service_role";

revoke truncate on table "public"."product_documents" from "service_role";

revoke update on table "public"."product_documents" from "service_role";

revoke delete on table "public"."product_revision" from "anon";

revoke insert on table "public"."product_revision" from "anon";

revoke references on table "public"."product_revision" from "anon";

revoke select on table "public"."product_revision" from "anon";

revoke trigger on table "public"."product_revision" from "anon";

revoke truncate on table "public"."product_revision" from "anon";

revoke update on table "public"."product_revision" from "anon";

revoke delete on table "public"."product_revision" from "authenticated";

revoke insert on table "public"."product_revision" from "authenticated";

revoke references on table "public"."product_revision" from "authenticated";

revoke select on table "public"."product_revision" from "authenticated";

revoke trigger on table "public"."product_revision" from "authenticated";

revoke truncate on table "public"."product_revision" from "authenticated";

revoke update on table "public"."product_revision" from "authenticated";

revoke delete on table "public"."product_revision" from "service_role";

revoke insert on table "public"."product_revision" from "service_role";

revoke references on table "public"."product_revision" from "service_role";

revoke select on table "public"."product_revision" from "service_role";

revoke trigger on table "public"."product_revision" from "service_role";

revoke truncate on table "public"."product_revision" from "service_role";

revoke update on table "public"."product_revision" from "service_role";

revoke delete on table "public"."product_revision_history" from "anon";

revoke insert on table "public"."product_revision_history" from "anon";

revoke references on table "public"."product_revision_history" from "anon";

revoke select on table "public"."product_revision_history" from "anon";

revoke trigger on table "public"."product_revision_history" from "anon";

revoke truncate on table "public"."product_revision_history" from "anon";

revoke update on table "public"."product_revision_history" from "anon";

revoke delete on table "public"."product_revision_history" from "authenticated";

revoke insert on table "public"."product_revision_history" from "authenticated";

revoke references on table "public"."product_revision_history" from "authenticated";

revoke select on table "public"."product_revision_history" from "authenticated";

revoke trigger on table "public"."product_revision_history" from "authenticated";

revoke truncate on table "public"."product_revision_history" from "authenticated";

revoke update on table "public"."product_revision_history" from "authenticated";

revoke delete on table "public"."product_revision_history" from "service_role";

revoke insert on table "public"."product_revision_history" from "service_role";

revoke references on table "public"."product_revision_history" from "service_role";

revoke select on table "public"."product_revision_history" from "service_role";

revoke trigger on table "public"."product_revision_history" from "service_role";

revoke truncate on table "public"."product_revision_history" from "service_role";

revoke update on table "public"."product_revision_history" from "service_role";

revoke delete on table "public"."prompts_webscrapping" from "anon";

revoke insert on table "public"."prompts_webscrapping" from "anon";

revoke references on table "public"."prompts_webscrapping" from "anon";

revoke select on table "public"."prompts_webscrapping" from "anon";

revoke trigger on table "public"."prompts_webscrapping" from "anon";

revoke truncate on table "public"."prompts_webscrapping" from "anon";

revoke update on table "public"."prompts_webscrapping" from "anon";

revoke delete on table "public"."prompts_webscrapping" from "authenticated";

revoke insert on table "public"."prompts_webscrapping" from "authenticated";

revoke references on table "public"."prompts_webscrapping" from "authenticated";

revoke select on table "public"."prompts_webscrapping" from "authenticated";

revoke trigger on table "public"."prompts_webscrapping" from "authenticated";

revoke truncate on table "public"."prompts_webscrapping" from "authenticated";

revoke update on table "public"."prompts_webscrapping" from "authenticated";

revoke delete on table "public"."prompts_webscrapping" from "service_role";

revoke insert on table "public"."prompts_webscrapping" from "service_role";

revoke references on table "public"."prompts_webscrapping" from "service_role";

revoke select on table "public"."prompts_webscrapping" from "service_role";

revoke trigger on table "public"."prompts_webscrapping" from "service_role";

revoke truncate on table "public"."prompts_webscrapping" from "service_role";

revoke update on table "public"."prompts_webscrapping" from "service_role";

revoke delete on table "public"."public_conversations" from "anon";

revoke insert on table "public"."public_conversations" from "anon";

revoke references on table "public"."public_conversations" from "anon";

revoke select on table "public"."public_conversations" from "anon";

revoke trigger on table "public"."public_conversations" from "anon";

revoke truncate on table "public"."public_conversations" from "anon";

revoke update on table "public"."public_conversations" from "anon";

revoke delete on table "public"."public_conversations" from "authenticated";

revoke insert on table "public"."public_conversations" from "authenticated";

revoke references on table "public"."public_conversations" from "authenticated";

revoke select on table "public"."public_conversations" from "authenticated";

revoke trigger on table "public"."public_conversations" from "authenticated";

revoke truncate on table "public"."public_conversations" from "authenticated";

revoke update on table "public"."public_conversations" from "authenticated";

revoke delete on table "public"."public_conversations" from "service_role";

revoke insert on table "public"."public_conversations" from "service_role";

revoke references on table "public"."public_conversations" from "service_role";

revoke select on table "public"."public_conversations" from "service_role";

revoke trigger on table "public"."public_conversations" from "service_role";

revoke truncate on table "public"."public_conversations" from "service_role";

revoke update on table "public"."public_conversations" from "service_role";

revoke delete on table "public"."rfx_specs" from "anon";

revoke insert on table "public"."rfx_specs" from "anon";

revoke references on table "public"."rfx_specs" from "anon";

revoke select on table "public"."rfx_specs" from "anon";

revoke trigger on table "public"."rfx_specs" from "anon";

revoke truncate on table "public"."rfx_specs" from "anon";

revoke update on table "public"."rfx_specs" from "anon";

revoke delete on table "public"."rfx_specs" from "authenticated";

revoke insert on table "public"."rfx_specs" from "authenticated";

revoke references on table "public"."rfx_specs" from "authenticated";

revoke select on table "public"."rfx_specs" from "authenticated";

revoke trigger on table "public"."rfx_specs" from "authenticated";

revoke truncate on table "public"."rfx_specs" from "authenticated";

revoke update on table "public"."rfx_specs" from "authenticated";

revoke delete on table "public"."rfx_specs" from "service_role";

revoke insert on table "public"."rfx_specs" from "service_role";

revoke references on table "public"."rfx_specs" from "service_role";

revoke select on table "public"."rfx_specs" from "service_role";

revoke trigger on table "public"."rfx_specs" from "service_role";

revoke truncate on table "public"."rfx_specs" from "service_role";

revoke update on table "public"."rfx_specs" from "service_role";

revoke delete on table "public"."rfxs" from "anon";

revoke insert on table "public"."rfxs" from "anon";

revoke references on table "public"."rfxs" from "anon";

revoke select on table "public"."rfxs" from "anon";

revoke trigger on table "public"."rfxs" from "anon";

revoke truncate on table "public"."rfxs" from "anon";

revoke update on table "public"."rfxs" from "anon";

revoke delete on table "public"."rfxs" from "authenticated";

revoke insert on table "public"."rfxs" from "authenticated";

revoke references on table "public"."rfxs" from "authenticated";

revoke select on table "public"."rfxs" from "authenticated";

revoke trigger on table "public"."rfxs" from "authenticated";

revoke truncate on table "public"."rfxs" from "authenticated";

revoke update on table "public"."rfxs" from "authenticated";

revoke delete on table "public"."rfxs" from "service_role";

revoke insert on table "public"."rfxs" from "service_role";

revoke references on table "public"."rfxs" from "service_role";

revoke select on table "public"."rfxs" from "service_role";

revoke trigger on table "public"."rfxs" from "service_role";

revoke truncate on table "public"."rfxs" from "service_role";

revoke update on table "public"."rfxs" from "service_role";

revoke delete on table "public"."saved_companies" from "anon";

revoke insert on table "public"."saved_companies" from "anon";

revoke references on table "public"."saved_companies" from "anon";

revoke select on table "public"."saved_companies" from "anon";

revoke trigger on table "public"."saved_companies" from "anon";

revoke truncate on table "public"."saved_companies" from "anon";

revoke update on table "public"."saved_companies" from "anon";

revoke delete on table "public"."saved_companies" from "authenticated";

revoke insert on table "public"."saved_companies" from "authenticated";

revoke references on table "public"."saved_companies" from "authenticated";

revoke select on table "public"."saved_companies" from "authenticated";

revoke trigger on table "public"."saved_companies" from "authenticated";

revoke truncate on table "public"."saved_companies" from "authenticated";

revoke update on table "public"."saved_companies" from "authenticated";

revoke delete on table "public"."saved_companies" from "service_role";

revoke insert on table "public"."saved_companies" from "service_role";

revoke references on table "public"."saved_companies" from "service_role";

revoke select on table "public"."saved_companies" from "service_role";

revoke trigger on table "public"."saved_companies" from "service_role";

revoke truncate on table "public"."saved_companies" from "service_role";

revoke update on table "public"."saved_companies" from "service_role";

revoke delete on table "public"."subscription" from "anon";

revoke insert on table "public"."subscription" from "anon";

revoke references on table "public"."subscription" from "anon";

revoke select on table "public"."subscription" from "anon";

revoke trigger on table "public"."subscription" from "anon";

revoke truncate on table "public"."subscription" from "anon";

revoke update on table "public"."subscription" from "anon";

revoke delete on table "public"."subscription" from "authenticated";

revoke insert on table "public"."subscription" from "authenticated";

revoke references on table "public"."subscription" from "authenticated";

revoke select on table "public"."subscription" from "authenticated";

revoke trigger on table "public"."subscription" from "authenticated";

revoke truncate on table "public"."subscription" from "authenticated";

revoke update on table "public"."subscription" from "authenticated";

revoke delete on table "public"."subscription" from "service_role";

revoke insert on table "public"."subscription" from "service_role";

revoke references on table "public"."subscription" from "service_role";

revoke select on table "public"."subscription" from "service_role";

revoke trigger on table "public"."subscription" from "service_role";

revoke truncate on table "public"."subscription" from "service_role";

revoke update on table "public"."subscription" from "service_role";

revoke delete on table "public"."supplier_lists" from "anon";

revoke insert on table "public"."supplier_lists" from "anon";

revoke references on table "public"."supplier_lists" from "anon";

revoke select on table "public"."supplier_lists" from "anon";

revoke trigger on table "public"."supplier_lists" from "anon";

revoke truncate on table "public"."supplier_lists" from "anon";

revoke update on table "public"."supplier_lists" from "anon";

revoke delete on table "public"."supplier_lists" from "authenticated";

revoke insert on table "public"."supplier_lists" from "authenticated";

revoke references on table "public"."supplier_lists" from "authenticated";

revoke select on table "public"."supplier_lists" from "authenticated";

revoke trigger on table "public"."supplier_lists" from "authenticated";

revoke truncate on table "public"."supplier_lists" from "authenticated";

revoke update on table "public"."supplier_lists" from "authenticated";

revoke delete on table "public"."supplier_lists" from "service_role";

revoke insert on table "public"."supplier_lists" from "service_role";

revoke references on table "public"."supplier_lists" from "service_role";

revoke select on table "public"."supplier_lists" from "service_role";

revoke trigger on table "public"."supplier_lists" from "service_role";

revoke truncate on table "public"."supplier_lists" from "service_role";

revoke update on table "public"."supplier_lists" from "service_role";

revoke delete on table "public"."user_feedback" from "anon";

revoke insert on table "public"."user_feedback" from "anon";

revoke references on table "public"."user_feedback" from "anon";

revoke select on table "public"."user_feedback" from "anon";

revoke trigger on table "public"."user_feedback" from "anon";

revoke truncate on table "public"."user_feedback" from "anon";

revoke update on table "public"."user_feedback" from "anon";

revoke delete on table "public"."user_feedback" from "authenticated";

revoke insert on table "public"."user_feedback" from "authenticated";

revoke references on table "public"."user_feedback" from "authenticated";

revoke select on table "public"."user_feedback" from "authenticated";

revoke trigger on table "public"."user_feedback" from "authenticated";

revoke truncate on table "public"."user_feedback" from "authenticated";

revoke update on table "public"."user_feedback" from "authenticated";

revoke delete on table "public"."user_feedback" from "service_role";

revoke insert on table "public"."user_feedback" from "service_role";

revoke references on table "public"."user_feedback" from "service_role";

revoke select on table "public"."user_feedback" from "service_role";

revoke trigger on table "public"."user_feedback" from "service_role";

revoke truncate on table "public"."user_feedback" from "service_role";

revoke update on table "public"."user_feedback" from "service_role";

revoke delete on table "public"."user_type_selections" from "anon";

revoke insert on table "public"."user_type_selections" from "anon";

revoke references on table "public"."user_type_selections" from "anon";

revoke select on table "public"."user_type_selections" from "anon";

revoke trigger on table "public"."user_type_selections" from "anon";

revoke truncate on table "public"."user_type_selections" from "anon";

revoke update on table "public"."user_type_selections" from "anon";

revoke delete on table "public"."user_type_selections" from "authenticated";

revoke insert on table "public"."user_type_selections" from "authenticated";

revoke references on table "public"."user_type_selections" from "authenticated";

revoke select on table "public"."user_type_selections" from "authenticated";

revoke trigger on table "public"."user_type_selections" from "authenticated";

revoke truncate on table "public"."user_type_selections" from "authenticated";

revoke update on table "public"."user_type_selections" from "authenticated";

revoke delete on table "public"."user_type_selections" from "service_role";

revoke insert on table "public"."user_type_selections" from "service_role";

revoke references on table "public"."user_type_selections" from "service_role";

revoke select on table "public"."user_type_selections" from "service_role";

revoke trigger on table "public"."user_type_selections" from "service_role";

revoke truncate on table "public"."user_type_selections" from "service_role";

revoke update on table "public"."user_type_selections" from "service_role";

alter table "public"."agent_memory_json" drop constraint "agent_memory_json_conversation_id_fkey";

alter table "public"."app_user" drop constraint "app_user_company_id_fkey";

alter table "public"."chat_messages" drop constraint "chat_messages_conversation_id_fkey";

alter table "public"."company_admin_requests" drop constraint "fk_company_admin_requests_company_id";

alter table "public"."company_cover_images" drop constraint "company_cover_images_company_id_fkey";

alter table "public"."company_revision" drop constraint "company_revision_company_id_fkey";

alter table "public"."company_revision_activations" drop constraint "company_revision_activations_company_revision_id_fkey";

alter table "public"."developer_company_request_reviews" drop constraint "developer_company_request_reviews_company_request_id_fkey";

alter table "public"."developer_error_reviews" drop constraint "developer_error_reviews_error_report_id_fkey";

alter table "public"."developer_feedback_reviews" drop constraint "developer_feedback_reviews_feedback_id_fkey";

alter table "public"."embedding" drop constraint "embedding_chunk_id_product_revision_fkey";

alter table "public"."embedding" drop constraint "embedding_id_company_revision_fkey";

alter table "public"."embedding_usage_counters" drop constraint "embedding_usage_counters_embedding_id_fkey";

alter table "public"."product" drop constraint "product_company_id_fkey";

alter table "public"."product_documents" drop constraint "product_documents_product_id_fkey";

alter table "public"."product_documents" drop constraint "product_documents_product_revision_id_fkey";

alter table "public"."product_revision" drop constraint "product_revision_product_id_fkey";

alter table "public"."public_conversations" drop constraint "public_conversations_conversation_id_fkey";

alter table "public"."rfx_specs" drop constraint "rfx_specs_rfx_id_fkey";

alter table "public"."saved_companies" drop constraint "saved_companies_company_id_fkey";

alter table "public"."saved_companies" drop constraint "saved_companies_list_id_fkey";

alter table "public"."subscription" drop constraint "subscription_id_company_fkey";

drop function if exists "public"."cron_run_process_embedding_scheduler"();

drop function if exists "public"."match_documents"(filter jsonb, match_count integer, query_embedding vector);

drop function if exists "public"."match_documents"(query_embedding vector, match_threshold double precision, match_count integer);

drop function if exists "public"."match_embeddings"(query_embedding vector, match_threshold double precision, match_count integer);

drop function if exists "public"."match_embeddings_3large"(query_embedding vector, match_threshold double precision, match_count integer);

drop function if exists "public"."match_embeddings_3small"(query_embedding vector, match_threshold double precision, match_count integer);

drop function if exists "public"."match_embeddings_3small_balanced"(query_embedding vector, match_threshold double precision, match_count integer);

drop function if exists "public"."match_embeddings_3small_fixed"(query_embedding vector, match_threshold double precision, match_count integer);

drop function if exists "public"."match_embeddings_3small_optimized"(query_embedding vector, match_threshold double precision, match_count integer);

drop function if exists "public"."match_embeddings_ada002"(query_embedding vector, match_threshold double precision, match_count integer);

alter table "public"."agent_prompts_dev" alter column "id" set default nextval('public.agent_prompts_dev_id_seq'::regclass);

alter table "public"."agent_prompts_prod" alter column "id" set default nextval('public.agent_prompts_prod_id_seq'::regclass);

alter table "public"."embedding" alter column "vector2" set data type public.vector(1536) using "vector2"::public.vector(1536);

alter table "public"."embedding_toggle_jobs" alter column "id" set default nextval('public.embedding_toggle_jobs_id_seq'::regclass);

alter table "public"."embedding_usage_counters" alter column "id" set default nextval('public.embedding_usage_counters_id_seq'::regclass);

alter table "public"."agent_memory_json" add constraint "agent_memory_json_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE not valid;

alter table "public"."agent_memory_json" validate constraint "agent_memory_json_conversation_id_fkey";

alter table "public"."app_user" add constraint "app_user_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.company(id) not valid;

alter table "public"."app_user" validate constraint "app_user_company_id_fkey";

alter table "public"."chat_messages" add constraint "chat_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE not valid;

alter table "public"."chat_messages" validate constraint "chat_messages_conversation_id_fkey";

alter table "public"."company_admin_requests" add constraint "fk_company_admin_requests_company_id" FOREIGN KEY (company_id) REFERENCES public.company(id) not valid;

alter table "public"."company_admin_requests" validate constraint "fk_company_admin_requests_company_id";

alter table "public"."company_cover_images" add constraint "company_cover_images_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE not valid;

alter table "public"."company_cover_images" validate constraint "company_cover_images_company_id_fkey";

alter table "public"."company_revision" add constraint "company_revision_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.company(id) not valid;

alter table "public"."company_revision" validate constraint "company_revision_company_id_fkey";

alter table "public"."company_revision_activations" add constraint "company_revision_activations_company_revision_id_fkey" FOREIGN KEY (company_revision_id) REFERENCES public.company_revision(id) ON DELETE CASCADE not valid;

alter table "public"."company_revision_activations" validate constraint "company_revision_activations_company_revision_id_fkey";

alter table "public"."developer_company_request_reviews" add constraint "developer_company_request_reviews_company_request_id_fkey" FOREIGN KEY (company_request_id) REFERENCES public.company_requests(id) ON DELETE CASCADE not valid;

alter table "public"."developer_company_request_reviews" validate constraint "developer_company_request_reviews_company_request_id_fkey";

alter table "public"."developer_error_reviews" add constraint "developer_error_reviews_error_report_id_fkey" FOREIGN KEY (error_report_id) REFERENCES public.error_reports(id) ON DELETE CASCADE not valid;

alter table "public"."developer_error_reviews" validate constraint "developer_error_reviews_error_report_id_fkey";

alter table "public"."developer_feedback_reviews" add constraint "developer_feedback_reviews_feedback_id_fkey" FOREIGN KEY (feedback_id) REFERENCES public.user_feedback(id) ON DELETE CASCADE not valid;

alter table "public"."developer_feedback_reviews" validate constraint "developer_feedback_reviews_feedback_id_fkey";

alter table "public"."embedding" add constraint "embedding_chunk_id_product_revision_fkey" FOREIGN KEY (id_product_revision) REFERENCES public.product_revision(id) not valid;

alter table "public"."embedding" validate constraint "embedding_chunk_id_product_revision_fkey";

alter table "public"."embedding" add constraint "embedding_id_company_revision_fkey" FOREIGN KEY (id_company_revision) REFERENCES public.company_revision(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."embedding" validate constraint "embedding_id_company_revision_fkey";

alter table "public"."embedding_usage_counters" add constraint "embedding_usage_counters_embedding_id_fkey" FOREIGN KEY (embedding_id) REFERENCES public.embedding(id) ON DELETE CASCADE not valid;

alter table "public"."embedding_usage_counters" validate constraint "embedding_usage_counters_embedding_id_fkey";

alter table "public"."product" add constraint "product_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.company(id) not valid;

alter table "public"."product" validate constraint "product_company_id_fkey";

alter table "public"."product_documents" add constraint "product_documents_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE CASCADE not valid;

alter table "public"."product_documents" validate constraint "product_documents_product_id_fkey";

alter table "public"."product_documents" add constraint "product_documents_product_revision_id_fkey" FOREIGN KEY (product_revision_id) REFERENCES public.product_revision(id) ON DELETE SET NULL not valid;

alter table "public"."product_documents" validate constraint "product_documents_product_revision_id_fkey";

alter table "public"."product_revision" add constraint "product_revision_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.product(id) not valid;

alter table "public"."product_revision" validate constraint "product_revision_product_id_fkey";

alter table "public"."public_conversations" add constraint "public_conversations_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE not valid;

alter table "public"."public_conversations" validate constraint "public_conversations_conversation_id_fkey";

alter table "public"."rfx_specs" add constraint "rfx_specs_rfx_id_fkey" FOREIGN KEY (rfx_id) REFERENCES public.rfxs(id) ON DELETE CASCADE not valid;

alter table "public"."rfx_specs" validate constraint "rfx_specs_rfx_id_fkey";

alter table "public"."saved_companies" add constraint "saved_companies_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public.company(id) ON DELETE CASCADE not valid;

alter table "public"."saved_companies" validate constraint "saved_companies_company_id_fkey";

alter table "public"."saved_companies" add constraint "saved_companies_list_id_fkey" FOREIGN KEY (list_id) REFERENCES public.supplier_lists(id) ON DELETE SET NULL not valid;

alter table "public"."saved_companies" validate constraint "saved_companies_list_id_fkey";

alter table "public"."subscription" add constraint "subscription_id_company_fkey" FOREIGN KEY (id_company) REFERENCES public.company(id) not valid;

alter table "public"."subscription" validate constraint "subscription_id_company_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.match_documents(filter jsonb DEFAULT '{}'::jsonb, match_count integer DEFAULT 5, query_embedding public.vector DEFAULT NULL::public.vector)
 RETURNS TABLE(content text, metadata jsonb)
 LANGUAGE sql
 STABLE
AS $function$select
        text as content,
        jsonb_build_object(
            'id_company_revision',  e.id_company_revision,
            'id_product_revision',  e.id_product_revision
        ) as metadata
    from embedding e
    where e.is_active = true
    order by e.vector <=> query_embedding      -- menor distancia = más parecido
    limit match_count;$function$
;

CREATE OR REPLACE FUNCTION public.match_documents(query_embedding public.vector, match_threshold double precision DEFAULT 0.78, match_count integer DEFAULT 10)
 RETURNS TABLE(id uuid, text text, similarity double precision, id_company_revision uuid, id_product_revision uuid)
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings(query_embedding public.vector, match_threshold double precision DEFAULT 0.78, match_count integer DEFAULT 10)
 RETURNS TABLE(id uuid, text text, similarity double precision, id_company_revision uuid, id_product_revision uuid)
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings_3large(query_embedding public.vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, id_product_revision uuid, id_company_revision uuid, similarity double precision, text text)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings_3small(query_embedding public.vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, id_product_revision uuid, id_company_revision uuid, similarity double precision, text text)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
   $function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings_3small_balanced(query_embedding public.vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, id_product_revision uuid, id_company_revision uuid, similarity double precision, text text)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
        $function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings_3small_fixed(query_embedding public.vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, id_product_revision uuid, id_company_revision uuid, similarity double precision, text text)
 LANGUAGE sql
 STABLE
AS $function$
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
        $function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings_3small_optimized(query_embedding public.vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, id_product_revision uuid, id_company_revision uuid, similarity double precision, text text)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
        $function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings_ada002(query_embedding public.vector, match_threshold double precision, match_count integer)
 RETURNS TABLE(id uuid, id_product_revision uuid, id_company_revision uuid, similarity double precision, text text)
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public._notify_on_email_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.approve_company_admin_request(p_request_id uuid, p_processor_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.batch_increment_embedding_counters(p_embedding_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.call_embed_edge_function()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

create or replace view "public"."company_revision_public" as  SELECT company_revision.id,
    company_revision.company_id,
    company_revision.nombre_empresa,
    company_revision.description,
    company_revision.main_activities,
    company_revision.strengths,
    company_revision.sectors,
    company_revision.website,
    company_revision.cities,
    company_revision.countries,
    company_revision.gps_coordinates,
    company_revision.revenues,
    company_revision.certifications
   FROM public.company_revision;


CREATE OR REPLACE FUNCTION public.deactivate_company_revisions(p_company_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_old_public_conversation_image()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.delete_product_embeddings(p_product_revision_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete all embeddings for this product revision
  DELETE FROM embedding 
  WHERE id_product_revision = p_product_revision_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_public_conversation_image()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_embedding_toggle_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    INSERT INTO public.embedding_toggle_jobs(company_revision_id, desired_is_active)
    VALUES (NEW.id, NEW.is_active);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_public_conversation_image_filename(conversation_id uuid, file_extension text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN 'conversation-' || conversation_id::TEXT || '-' || EXTRACT(EPOCH FROM NOW())::TEXT || '.' || file_extension;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_slug(input_text text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_all_users_for_analytics()
 RETURNS TABLE(id uuid, email character varying, email_confirmed_at timestamp with time zone, confirmation_sent_at timestamp with time zone, last_sign_in_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, confirmed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_company_admin_request_processor_name(processor_user_id uuid)
 RETURNS TABLE(name text, surname text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    COALESCE(app_user.name, '') as name,
    COALESCE(app_user.surname, '') as surname
  FROM app_user
  WHERE app_user.auth_user_id = processor_user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_company_pending_admin_requests(p_company_id uuid, p_requestor_user_id uuid DEFAULT auth.uid())
 RETURNS TABLE(id uuid, user_id uuid, company_id uuid, linkedin_url text, comments text, created_at timestamp with time zone, user_name text, user_surname text, user_email character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_company_revision_by_product_revision(p_product_revision_id uuid, p_only_active boolean DEFAULT true)
 RETURNS TABLE(id_company_revision uuid, company_id uuid, nombre_empresa text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_embedding_analytics_data()
 RETURNS TABLE(embedding_id uuid, usage_count integer, positions text, match_percentages text, vector_similarities text, embedding_text text, id_product_revision uuid, id_company_revision uuid)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_embedding_usage_stats()
 RETURNS TABLE(total_embeddings bigint, total_usage_count bigint, most_used_embedding_id uuid, most_used_count integer, least_used_embedding_id uuid, least_used_count integer)
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_product_revision_clean(p_id uuid)
 RETURNS TABLE(id uuid, product_name text, long_description text, main_category text, subcategories text, target_industries text, key_features text, use_cases text, definition_score text, improvement_advice text, image text, source_urls text)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_products_by_company_revision(p_company_revision_id uuid, p_only_active boolean DEFAULT true)
 RETURNS TABLE(id_product_revision uuid, product_id uuid, product_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_conversation_image_url(image_filename text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF image_filename IS NULL OR image_filename = '' THEN
    RETURN NULL;
  END IF;
  
  RETURN 'https://' || current_setting('app.settings.supabase_url') || '/storage/v1/object/public/public-conversation-images/' || image_filename;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_conversations(limit_count integer DEFAULT 10, offset_count integer DEFAULT 0, category_filter text DEFAULT NULL::text, featured_only boolean DEFAULT false)
 RETURNS TABLE(conversation_id uuid, made_public_by uuid, category text, display_order integer, title text, description text, tags text[], is_featured boolean, view_count integer, created_at timestamp with time zone, updated_at timestamp with time zone, preview text, image_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_conversations(p_category text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, conversation_id uuid, title text, description text, category text, tags text[], is_featured boolean, view_count integer, display_order integer, made_public_at timestamp with time zone, conversation_preview text, conversation_created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_info_for_company_admins(target_user_id uuid)
 RETURNS TABLE(id uuid, email character varying, created_at timestamp with time zone, name text, surname text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_info_for_developers(target_user_id uuid)
 RETURNS TABLE(id uuid, email character varying, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_users_with_emails_batch(user_ids uuid[])
 RETURNS TABLE(id uuid, auth_user_id uuid, name text, surname text, email text, company_position text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_user_verified()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.has_developer_access(check_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.developer_access 
    WHERE user_id = check_user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.increment_embedding_counter(p_embedding_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE embedding_usage_counters 
    SET usage_count = usage_count + 1
    WHERE embedding_id = p_embedding_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_embedding_counter_with_data(p_embedding_id uuid, p_positions text, p_matches text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE embedding_usage_counters 
    SET 
        usage_count = usage_count + 1,
        positions = COALESCE(positions, '') || p_positions,
        match_percentages = COALESCE(match_percentages, '') || p_matches
    WHERE embedding_id = p_embedding_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_public_conversation_view_count(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.public_conversations
  SET view_count = view_count + 1
  WHERE conversation_id = p_conversation_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(is_admin, false) 
  FROM public.app_user 
  WHERE auth_user_id = user_id;
$function$
;

CREATE OR REPLACE FUNCTION public.is_approved_company_admin(p_company_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM company_admin_requests 
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND status = 'approved'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.match_embeddings(query_embedding double precision[], match_threshold double precision, match_count integer, vector_column text DEFAULT 'vector'::text)
 RETURNS TABLE(id uuid, id_product_revision uuid, id_company_revision uuid, similarity double precision, text text)
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_admin_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

create or replace view "public"."product_revision_public" as  SELECT product_revision.id,
    product_revision.product_id,
    product_revision.source,
    product_revision.product_name,
    product_revision.product_url,
    product_revision.main_category,
    product_revision.subcategories,
    product_revision.short_description,
    product_revision.long_description,
    product_revision.target_industries,
    product_revision.key_features,
    product_revision.use_cases,
    product_revision.source_urls
   FROM public.product_revision;


CREATE OR REPLACE FUNCTION public.reject_company_admin_request(p_request_id uuid, p_rejection_reason text DEFAULT NULL::text, p_processor_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.remove_company_admin(p_user_id uuid, p_company_id uuid, p_removed_by uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_company_slug()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_embeddings_by_revision(p_company_revision_id uuid, p_is_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.embedding e
  SET is_active = p_is_active
  WHERE e.id_company_revision = p_company_revision_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_embedding_is_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Actualizar el campo is_active de todos los embeddings asociados a esta revisión de compañía
    UPDATE public.embedding
    SET is_active = NEW.is_active
    WHERE id_company_revision = NEW.id;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_embedding_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Actualiza el estado de todos los embeddings asociados con esta revisión de producto
  UPDATE embedding
  SET is_active = NEW.is_active
  WHERE id_product_revision = NEW.id;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_public_conversations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_rfx_specs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_rfxs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_supplier_lists_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_user_type_selections_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_embedding_counter_with_data(p_embedding_id uuid, p_positions text, p_matches text, p_similarities text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

create policy "Allow viewing basic user info for conversations"
on "public"."app_user"
as permissive
for select
to authenticated
using ((public.has_developer_access() OR (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE (c.user_id = app_user.auth_user_id)))));


create policy "Developers can update admin status and company assignments"
on "public"."app_user"
as permissive
for update
to authenticated
using (public.has_developer_access())
with check (public.has_developer_access());


create policy "Developers can view all app users"
on "public"."app_user"
as permissive
for select
to authenticated
using (public.has_developer_access());


create policy "Allow creating messages in accessible conversations"
on "public"."chat_messages"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = chat_messages.conversation_id) AND ((conversations.user_id IS NULL) OR (conversations.user_id = auth.uid()))))));


create policy "Allow deleting messages from accessible conversations"
on "public"."chat_messages"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = chat_messages.conversation_id) AND ((conversations.user_id IS NULL) OR (conversations.user_id = auth.uid()))))));


create policy "Allow updating messages in accessible conversations"
on "public"."chat_messages"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = chat_messages.conversation_id) AND ((conversations.user_id IS NULL) OR (conversations.user_id = auth.uid()))))));


create policy "Allow viewing messages from accessible conversations"
on "public"."chat_messages"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = chat_messages.conversation_id) AND ((conversations.user_id IS NULL) OR (conversations.user_id = auth.uid()))))));


create policy "Anyone can view messages from public conversations"
on "public"."chat_messages"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM public.public_conversations pc
  WHERE (pc.conversation_id = chat_messages.conversation_id))));


create policy "Developers can view all chat messages"
on "public"."chat_messages"
as permissive
for select
to authenticated
using (public.has_developer_access());


create policy "Developers can manage companies"
on "public"."company"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can view all companies"
on "public"."company"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Approved company admins can view all requests for their company"
on "public"."company_admin_requests"
as permissive
for select
to public
using ((public.is_approved_company_admin(company_id) OR public.has_developer_access()));


create policy "Developers can update admin requests"
on "public"."company_admin_requests"
as permissive
for update
to public
using (public.has_developer_access());


create policy "Developers can view all admin requests"
on "public"."company_admin_requests"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Company admins can manage their cover images"
on "public"."company_cover_images"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.company_id = company_cover_images.company_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Developers can manage all cover images"
on "public"."company_cover_images"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Company admins can manage their company documents"
on "public"."company_documents"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.company_id = company_documents.company_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Developers can manage all company documents"
on "public"."company_documents"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can update all company requests"
on "public"."company_requests"
as permissive
for update
to public
using (public.has_developer_access());


create policy "Developers can view all company requests"
on "public"."company_requests"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Approved company admins can create new company revisions"
on "public"."company_revision"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.company_id = company_revision.company_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Approved company admins can update their company revisions"
on "public"."company_revision"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.company_id = company_revision.company_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.company_id = company_revision.company_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Approved company admins can view all their company revisions"
on "public"."company_revision"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.company_id = company_revision.company_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Developers can manage company revisions"
on "public"."company_revision"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Approved company admins can insert revision activations"
on "public"."company_revision_activations"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM (public.company_revision cr
     JOIN public.company_admin_requests car ON ((car.company_id = cr.company_id)))
  WHERE ((cr.id = company_revision_activations.company_revision_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Approved company admins can view their company revision activat"
on "public"."company_revision_activations"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM (public.company_revision cr
     JOIN public.company_admin_requests car ON ((car.company_id = cr.company_id)))
  WHERE ((cr.id = company_revision_activations.company_revision_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Developers can manage company revision activations"
on "public"."company_revision_activations"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Anyone can view public conversations"
on "public"."conversations"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM public.public_conversations
  WHERE (public_conversations.conversation_id = conversations.id))));


create policy "Developers can view all conversations"
on "public"."conversations"
as permissive
for select
to authenticated
using (public.has_developer_access());


create policy "Developers can manage developer access"
on "public"."developer_access"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can view developer access"
on "public"."developer_access"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Developers can create their own reviews"
on "public"."developer_company_request_reviews"
as permissive
for insert
to authenticated
with check ((public.has_developer_access() AND (developer_user_id = auth.uid())));


create policy "Developers can update their own reviews"
on "public"."developer_company_request_reviews"
as permissive
for update
to authenticated
using ((public.has_developer_access() AND (developer_user_id = auth.uid())));


create policy "Developers can view their own reviews"
on "public"."developer_company_request_reviews"
as permissive
for select
to authenticated
using (public.has_developer_access());


create policy "Developers can create their own reviews"
on "public"."developer_error_reviews"
as permissive
for insert
to public
with check ((public.has_developer_access() AND (developer_user_id = auth.uid())));


create policy "Developers can update their own reviews"
on "public"."developer_error_reviews"
as permissive
for update
to public
using ((public.has_developer_access() AND (developer_user_id = auth.uid())));


create policy "Developers can view all error reviews"
on "public"."developer_error_reviews"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Developers can create their own reviews"
on "public"."developer_feedback_reviews"
as permissive
for insert
to public
with check ((public.has_developer_access() AND (developer_user_id = auth.uid())));


create policy "Developers can update their own reviews"
on "public"."developer_feedback_reviews"
as permissive
for update
to public
using ((public.has_developer_access() AND (developer_user_id = auth.uid())));


create policy "Developers can view their own reviews"
on "public"."developer_feedback_reviews"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Company admins can delete embeddings from their products"
on "public"."embedding"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM ((public.product_revision pr
     JOIN public.product p ON ((p.id = pr.product_id)))
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((pr.id = embedding.id_product_revision) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Developers can manage embeddings"
on "public"."embedding"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can view all embeddings"
on "public"."embedding"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Developers can manage embedding usage counters"
on "public"."embedding_usage_counters"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can view all embedding usage counters"
on "public"."embedding_usage_counters"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Developers can update error reports"
on "public"."error_reports"
as permissive
for update
to public
using (public.has_developer_access());


create policy "Developers can view all error reports for filtering"
on "public"."error_reports"
as permissive
for select
to authenticated
using (public.has_developer_access());


create policy "Developers can view all error reports"
on "public"."error_reports"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Users can create error reports for their conversations"
on "public"."error_reports"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = error_reports.conversation_id) AND ((conversations.user_id IS NULL) OR (conversations.user_id = auth.uid()))))));


create policy "Users can view error reports for their conversations"
on "public"."error_reports"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = error_reports.conversation_id) AND ((conversations.user_id IS NULL) OR (conversations.user_id = auth.uid()))))));


create policy "Developers can manage all ratings"
on "public"."evaluation_ratings"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can view all ratings"
on "public"."evaluation_ratings"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Approved company admins can manage their company products"
on "public"."product"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.company_id = product.company_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Company admins can delete products from their company"
on "public"."product"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.company_id = product.company_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Developers can manage products"
on "public"."product"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can manage all product documents"
on "public"."product_documents"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Users can delete documents from their company products"
on "public"."product_documents"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM (public.product p
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((p.id = product_documents.product_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Users can upload documents to their company products"
on "public"."product_documents"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM (public.product p
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((p.id = product_documents.product_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Users can view documents from their company products"
on "public"."product_documents"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM (public.product p
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((p.id = product_documents.product_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Approved company admins can create product revisions for their "
on "public"."product_revision"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM (public.product p
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((p.id = product_revision.product_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Approved company admins can manage their company product revisi"
on "public"."product_revision"
as permissive
for all
to public
using ((EXISTS ( SELECT 1
   FROM (public.product p
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((p.id = product_revision.product_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Company admins can delete product revisions from their company"
on "public"."product_revision"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM (public.product p
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((p.id = product_revision.product_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Developers can manage product revisions"
on "public"."product_revision"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Approved company admins can insert history entries"
on "public"."product_revision_history"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM ((public.product_revision pr
     JOIN public.product p ON ((p.id = pr.product_id)))
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((pr.id = product_revision_history.product_revision_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Approved company admins can insert product revision activations"
on "public"."product_revision_history"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM ((public.product_revision pr
     JOIN public.product p ON ((p.id = pr.product_id)))
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((pr.id = product_revision_history.product_revision_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Approved company admins can view their history entries"
on "public"."product_revision_history"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM ((public.product_revision pr
     JOIN public.product p ON ((p.id = pr.product_id)))
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((pr.id = product_revision_history.product_revision_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Approved company admins can view their product revision activat"
on "public"."product_revision_history"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM ((public.product_revision pr
     JOIN public.product p ON ((p.id = pr.product_id)))
     JOIN public.company_admin_requests car ON ((car.company_id = p.company_id)))
  WHERE ((pr.id = product_revision_history.product_revision_id) AND (car.user_id = auth.uid()) AND (car.status = 'approved'::text)))));


create policy "Developers can manage history entries"
on "public"."product_revision_history"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can manage product revision activations"
on "public"."product_revision_history"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can manage prompts_webscrapping"
on "public"."prompts_webscrapping"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can view prompts_webscrapping"
on "public"."prompts_webscrapping"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Developers can create public conversations"
on "public"."public_conversations"
as permissive
for insert
to authenticated
with check (public.has_developer_access());


create policy "Developers can delete public conversations"
on "public"."public_conversations"
as permissive
for delete
to authenticated
using (public.has_developer_access());


create policy "Developers can update public conversations"
on "public"."public_conversations"
as permissive
for update
to authenticated
using (public.has_developer_access())
with check (public.has_developer_access());


create policy "Users can delete specs for their own RFXs"
on "public"."rfx_specs"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM public.rfxs
  WHERE ((rfxs.id = rfx_specs.rfx_id) AND (rfxs.user_id = auth.uid())))));


create policy "Users can insert specs for their own RFXs"
on "public"."rfx_specs"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM public.rfxs
  WHERE ((rfxs.id = rfx_specs.rfx_id) AND (rfxs.user_id = auth.uid())))));


create policy "Users can update specs for their own RFXs"
on "public"."rfx_specs"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM public.rfxs
  WHERE ((rfxs.id = rfx_specs.rfx_id) AND (rfxs.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.rfxs
  WHERE ((rfxs.id = rfx_specs.rfx_id) AND (rfxs.user_id = auth.uid())))));


create policy "Users can view specs for their own RFXs"
on "public"."rfx_specs"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM public.rfxs
  WHERE ((rfxs.id = rfx_specs.rfx_id) AND (rfxs.user_id = auth.uid())))));


create policy "Developers can manage subscriptions"
on "public"."subscription"
as permissive
for all
to public
using (public.has_developer_access());


create policy "Developers can update feedback status"
on "public"."user_feedback"
as permissive
for update
to public
using (public.has_developer_access());


create policy "Developers can view all feedback"
on "public"."user_feedback"
as permissive
for select
to public
using (public.has_developer_access());


create policy "Developers can view all type selections"
on "public"."user_type_selections"
as permissive
for select
to public
using (public.has_developer_access());


CREATE TRIGGER prevent_admin_escalation BEFORE UPDATE ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_privilege_escalation();

CREATE TRIGGER trg_enqueue_embedding_toggle AFTER UPDATE OF is_active ON public.company_revision FOR EACH ROW WHEN ((old.is_active IS DISTINCT FROM new.is_active)) EXECUTE FUNCTION public.enqueue_embedding_toggle_job();

CREATE TRIGGER trg_set_company_slug BEFORE INSERT OR UPDATE OF nombre_empresa, is_active, slug ON public.company_revision FOR EACH ROW EXECUTE FUNCTION public.set_company_slug();

CREATE TRIGGER trigger_set_company_slug BEFORE INSERT OR UPDATE ON public.company_revision FOR EACH ROW EXECUTE FUNCTION public.set_company_slug();

CREATE TRIGGER update_embedding_is_active_trigger AFTER UPDATE OF is_active ON public.company_revision FOR EACH ROW WHEN ((old.is_active IS DISTINCT FROM new.is_active)) EXECUTE FUNCTION public.update_embedding_is_active();

CREATE TRIGGER sync_embedding_status AFTER UPDATE OF is_active ON public.product_revision FOR EACH ROW WHEN ((old.is_active IS DISTINCT FROM new.is_active)) EXECUTE FUNCTION public.update_embedding_status();

CREATE TRIGGER delete_old_public_conversation_image_trigger BEFORE UPDATE ON public.public_conversations FOR EACH ROW EXECUTE FUNCTION public.delete_old_public_conversation_image();

CREATE TRIGGER delete_public_conversation_image_trigger BEFORE DELETE ON public.public_conversations FOR EACH ROW EXECUTE FUNCTION public.delete_public_conversation_image();

CREATE TRIGGER set_public_conversations_updated_at BEFORE UPDATE ON public.public_conversations FOR EACH ROW EXECUTE FUNCTION public.update_public_conversations_updated_at();

CREATE TRIGGER update_rfx_specs_updated_at_trigger BEFORE UPDATE ON public.rfx_specs FOR EACH ROW EXECUTE FUNCTION public.update_rfx_specs_updated_at();

CREATE TRIGGER update_rfxs_updated_at_trigger BEFORE UPDATE ON public.rfxs FOR EACH ROW EXECUTE FUNCTION public.update_rfxs_updated_at();

CREATE TRIGGER update_supplier_lists_updated_at BEFORE UPDATE ON public.supplier_lists FOR EACH ROW EXECUTE FUNCTION public.update_supplier_lists_updated_at();

CREATE TRIGGER update_user_type_selections_updated_at BEFORE UPDATE ON public.user_type_selections FOR EACH ROW EXECUTE FUNCTION public.update_user_type_selections_updated_at();


drop trigger if exists "on_user_verified" on "auth"."users";

drop trigger if exists "trg_auth_users_email_confirmed" on "auth"."users";

CREATE TRIGGER on_user_verified AFTER UPDATE ON auth.users FOR EACH ROW WHEN (((old.confirmed_at IS NULL) AND (new.confirmed_at IS NOT NULL))) EXECUTE FUNCTION public.handle_user_verified();

CREATE TRIGGER trg_auth_users_email_confirmed AFTER UPDATE ON auth.users FOR EACH ROW WHEN (((new.email_confirmed_at IS NOT NULL) AND ((old.email_confirmed_at IS NULL) OR (old.email_confirmed_at <> new.email_confirmed_at)))) EXECUTE FUNCTION public._notify_on_email_confirmed();

drop policy "Allow developers to manage all chat documents" on "storage"."objects";

drop policy "Approved company admins can delete their company logo" on "storage"."objects";

drop policy "Approved company admins can update their company logo" on "storage"."objects";

drop policy "Approved company admins can upload their company logo" on "storage"."objects";

drop policy "Company admins can delete company documents" on "storage"."objects";

drop policy "Company admins can update company documents" on "storage"."objects";

drop policy "Company admins can upload company documents" on "storage"."objects";

drop policy "Developers can delete public conversation images" on "storage"."objects";

drop policy "Developers can download admin request documents" on "storage"."objects";

drop policy "Developers can update public conversation images" on "storage"."objects";

drop policy "Developers can upload public conversation images" on "storage"."objects";

drop policy "Developers can view admin request documents" on "storage"."objects";

drop policy "Developers can view all request documents" on "storage"."objects";


  create policy "Allow developers to manage all chat documents"
  on "storage"."objects"
  as permissive
  for all
  to public
using (((bucket_id = 'chat-documents'::text) AND public.has_developer_access()));



  create policy "Approved company admins can delete their company logo"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'company-logos'::text) AND (EXISTS ( SELECT 1
   FROM (public.company_admin_requests car
     JOIN public.company_revision cr ON ((cr.company_id = car.company_id)))
  WHERE ((car.user_id = auth.uid()) AND (car.status = 'approved'::text) AND (cr.is_active = true) AND ((storage.foldername(objects.name))[1] = (car.company_id)::text))))));



  create policy "Approved company admins can update their company logo"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'company-logos'::text) AND (EXISTS ( SELECT 1
   FROM (public.company_admin_requests car
     JOIN public.company_revision cr ON ((cr.company_id = car.company_id)))
  WHERE ((car.user_id = auth.uid()) AND (car.status = 'approved'::text) AND (cr.is_active = true) AND ((storage.foldername(objects.name))[1] = (car.company_id)::text))))));



  create policy "Approved company admins can upload their company logo"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'company-logos'::text) AND (EXISTS ( SELECT 1
   FROM (public.company_admin_requests car
     JOIN public.company_revision cr ON ((cr.company_id = car.company_id)))
  WHERE ((car.user_id = auth.uid()) AND (car.status = 'approved'::text) AND (cr.is_active = true) AND ((storage.foldername(objects.name))[1] = (car.company_id)::text))))));



  create policy "Company admins can delete company documents"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.user_id = auth.uid()) AND (car.status = 'approved'::text))))));



  create policy "Company admins can update company documents"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.user_id = auth.uid()) AND (car.status = 'approved'::text))))));



  create policy "Company admins can upload company documents"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'company-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.company_admin_requests car
  WHERE ((car.user_id = auth.uid()) AND (car.status = 'approved'::text))))));



  create policy "Developers can delete public conversation images"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'public-conversation-images'::text) AND public.has_developer_access()));



  create policy "Developers can download admin request documents"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'admin-request-docs'::text) AND (EXISTS ( SELECT 1
   FROM public.developer_access da
  WHERE (da.user_id = auth.uid())))));



  create policy "Developers can update public conversation images"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'public-conversation-images'::text) AND public.has_developer_access()));



  create policy "Developers can upload public conversation images"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'public-conversation-images'::text) AND public.has_developer_access()));



  create policy "Developers can view admin request documents"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'admin-request-docs'::text) AND (EXISTS ( SELECT 1
   FROM public.developer_access da
  WHERE (da.user_id = auth.uid())))));



  create policy "Developers can view all request documents"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'admin-request-docs'::text) AND public.has_developer_access()));



