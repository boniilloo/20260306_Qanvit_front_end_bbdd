-- Replace the previous role check with the new intent check.
ALTER TABLE public.user_type_selections
DROP CONSTRAINT IF EXISTS user_type_selections_user_type_check;

-- Migrate legacy onboarding values to the new intent model.
UPDATE public.user_type_selections
SET user_type = CASE
  WHEN user_type = 'buyer' THEN 'open_innovation_challenges'
  WHEN user_type = 'supplier' THEN 'company_profile_management'
  ELSE user_type
END
WHERE user_type IN ('buyer', 'supplier');

ALTER TABLE public.user_type_selections
ADD CONSTRAINT user_type_selections_user_type_check
CHECK (
  user_type = ANY (
    ARRAY[
      'open_innovation_challenges'::text,
      'company_profile_management'::text
    ]
  )
);
