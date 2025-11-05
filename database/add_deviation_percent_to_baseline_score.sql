-- Add deviation_percent column to baseline_score table
-- This allows each criterion to have its own deviation percentage for tolerance calculation

ALTER TABLE baseline_score 
ADD COLUMN IF NOT EXISTS deviation_percent NUMERIC(5, 2) DEFAULT 5.0;

COMMENT ON COLUMN baseline_score.deviation_percent IS 'Deviation percentage for tolerance range calculation (default 5.0)';

