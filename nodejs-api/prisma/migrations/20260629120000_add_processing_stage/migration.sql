ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_stage VARCHAR(50) DEFAULT 'pending';
