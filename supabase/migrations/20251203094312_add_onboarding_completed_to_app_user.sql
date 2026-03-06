-- Add onboarding_completed field to app_user table
ALTER TABLE app_user
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE NOT NULL;

-- Add comment to explain the field
COMMENT ON COLUMN app_user.onboarding_completed IS 'Indicates if the user has completed the initial platform onboarding tour';

