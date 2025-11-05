-- Add total_deviation_percent column to assignment table
-- This stores the deviation percentage for the total row in feedback/moderration reports
-- The total row deviation is assignment-level, not criterion-level

ALTER TABLE assignment 
ADD COLUMN IF NOT EXISTS total_deviation_percent NUMERIC(5, 2) DEFAULT 5.0;

COMMENT ON COLUMN assignment.total_deviation_percent IS 'Deviation percentage for total score tolerance range calculation (default 5.0)';

