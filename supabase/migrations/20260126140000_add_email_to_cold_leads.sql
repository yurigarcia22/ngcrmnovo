-- Add email column to cold_leads if it doesn't exist
ALTER TABLE cold_leads 
ADD COLUMN IF NOT EXISTS email text;

-- Add index for email searches
CREATE INDEX IF NOT EXISTS idx_cold_leads_email ON cold_leads(email);
