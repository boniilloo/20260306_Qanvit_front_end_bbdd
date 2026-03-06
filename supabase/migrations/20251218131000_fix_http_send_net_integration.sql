-- Fix public.http_send to work correctly with pg_net
-- The issue is that net.http_post expects different parameters than we're passing

DROP FUNCTION IF EXISTS public.http_send(text, text, json, text);

CREATE OR REPLACE FUNCTION public.http_send(
  p_method text,
  p_url text,
  p_headers json,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text := upper(coalesce(p_method, 'POST'));
  v_headers_jsonb jsonb;
  v_body_jsonb jsonb;
  v_request_id bigint;
BEGIN
  IF v_method <> 'POST' THEN
    RAISE EXCEPTION 'public.http_send only supports POST (got %)', v_method;
  END IF;

  -- Try pg_net (Supabase's preferred HTTP client)
  IF to_regprocedure('net.http_post(text,text,jsonb,jsonb,integer)') IS NOT NULL THEN
    -- Convert headers and body to proper format
    v_headers_jsonb := coalesce(p_headers::jsonb, '{}'::jsonb);
    
    -- Parse body as jsonb if possible, otherwise wrap in quotes
    BEGIN
      v_body_jsonb := p_body::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_body_jsonb := to_jsonb(p_body);
    END;
    
    -- Call pg_net.http_post with correct signature
    -- Signature: http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 1000)
    SELECT net.http_post(
      url := p_url,
      body := v_body_jsonb,
      headers := v_headers_jsonb,
      timeout_milliseconds := 30000  -- 30 seconds timeout
    ) INTO v_request_id;
    
    RETURN;
  END IF;

  -- Fallback to pgsql-http extension (if available)
  IF to_regprocedure('http_post(text,text,text)') IS NOT NULL THEN
    PERFORM http_post(
      p_url,
      coalesce(p_body, '{}'),
      coalesce(p_headers->>'Content-Type', 'application/json')
    );
    RETURN;
  END IF;

  RAISE EXCEPTION 'No HTTP client available. Enable pg_net or pgsql-http extension.';
END;
$$;

ALTER FUNCTION public.http_send(text, text, json, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.http_send(text, text, json, text) FROM public;
GRANT EXECUTE ON FUNCTION public.http_send(text, text, json, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.http_send(text, text, json, text) TO supabase_admin;

COMMENT ON FUNCTION public.http_send(text, text, json, text) IS
  'Compatibility wrapper for HTTP POST requests. Uses pg_net (preferred) or pgsql-http extension.';




