-- Add onboarding_completed column to app_user table
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Add comment to the column
COMMENT ON COLUMN app_user.onboarding_completed IS 'Indicates whether the user has completed the onboarding tour';



