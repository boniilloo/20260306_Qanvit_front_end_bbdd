-- Create RPC function to upsert rfx_company_keys with SECURITY DEFINER
-- This bypasses RLS issues when developers need to store encrypted keys for companies
-- The function checks developer access internally before allowing the operation

CREATE OR REPLACE FUNCTION public.upsert_rfx_company_key(
  p_rfx_id uuid,
  p_company_id uuid,
  p_encrypted_symmetric_key text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result json;
BEGIN
  -- Check if user has developer access
  IF NOT public.has_developer_access() THEN
    RAISE EXCEPTION 'Access denied. Developer access required.';
  END IF;

  -- Perform upsert
  INSERT INTO public.rfx_company_keys (
    rfx_id,
    company_id,
    encrypted_symmetric_key
  )
  VALUES (
    p_rfx_id,
    p_company_id,
    p_encrypted_symmetric_key
  )
  ON CONFLICT (rfx_id, company_id)
  DO UPDATE SET
    encrypted_symmetric_key = EXCLUDED.encrypted_symmetric_key,
    updated_at = now();

  -- Return success
  v_result := json_build_object(
    'success', true,
    'rfx_id', p_rfx_id,
    'company_id', p_company_id
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    -- Return error details
    v_result := json_build_object(
      'success', false,
      'error', SQLERRM
    );
    RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
REVOKE ALL ON FUNCTION public.upsert_rfx_company_key(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_rfx_company_key(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.upsert_rfx_company_key(uuid, uuid, text) IS 
  'Allows developers to upsert encrypted symmetric keys for companies. Uses SECURITY DEFINER to bypass RLS.';






