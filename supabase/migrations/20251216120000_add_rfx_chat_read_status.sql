
-- Create table to track when a user last read a specific RFX chat thread
CREATE TABLE IF NOT EXISTS public.rfx_chat_read_status (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    rfx_id uuid REFERENCES public.rfxs(id) ON DELETE CASCADE,
    supplier_company_id uuid REFERENCES public.company(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    last_read_at timestamptz DEFAULT now(),
    UNIQUE(rfx_id, supplier_company_id, user_id)
);

-- RLS
ALTER TABLE public.rfx_chat_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own read status"
ON public.rfx_chat_read_status
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Function to get unread counts for all suppliers in a specific RFX
CREATE OR REPLACE FUNCTION public.get_rfx_supplier_unread_counts(p_rfx_id uuid)
RETURNS TABLE (
    company_id uuid,
    unread_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.supplier_company_id,
        COUNT(*) as unread_count
    FROM 
        rfx_supplier_chat_messages m
    LEFT JOIN 
        rfx_chat_read_status s ON s.rfx_id = m.rfx_id 
            AND s.supplier_company_id = m.supplier_company_id 
            AND s.user_id = auth.uid()
    WHERE 
        m.rfx_id = p_rfx_id
        -- Count if never read OR message is newer than last read
        AND (s.last_read_at IS NULL OR m.created_at > s.last_read_at)
        -- Don't count own messages as unread
        AND m.sender_user_id != auth.uid()
    GROUP BY 
        m.supplier_company_id;
END;
$$;






