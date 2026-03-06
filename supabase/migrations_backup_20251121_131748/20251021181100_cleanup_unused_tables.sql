-- Drop the history table as it was only used for backup during migration
-- The data has been preserved and the migration is complete

DROP TABLE IF EXISTS rfx_selected_candidates_history CASCADE;

COMMENT ON DATABASE postgres IS 'Cleaned up temporary migration tables';

