-- Add cold_lead_id to tasks table
ALTER TABLE tasks 
ADD COLUMN cold_lead_id UUID REFERENCES cold_leads(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX idx_tasks_cold_lead_id ON tasks(cold_lead_id);
