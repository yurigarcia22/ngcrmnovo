-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Import Batches Table
CREATE TABLE IF NOT EXISTS import_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tenant_id UUID NOT NULL, -- Ensure multitenancy
    file_name TEXT,
    file_hash TEXT,
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    warning_rows INTEGER DEFAULT 0,
    mapping_json JSONB DEFAULT '{}', -- Store how columns were mapped
    defaults_json JSONB DEFAULT '{}', -- Store default values (owner, status, etc)
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'draft'))
);

-- 2. Import Row Results (for audit and detailed reporting/rollback)
CREATE TABLE IF NOT EXISTS import_row_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID REFERENCES import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_json JSONB, -- The original data from file
    normalized_json JSONB, -- The data after cleaning/mapping
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'imported', 'skipped', 'error')),
    errors TEXT[], -- Array of error messages
    warnings TEXT[], -- Array of warning messages
    lead_id UUID REFERENCES cold_leads(id) ON DELETE SET NULL, -- Link to created lead
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Custom Field Definitions (Metadata for dynamic fields)
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    entity_type TEXT DEFAULT 'cold_lead', -- Support future entities
    label TEXT NOT NULL,
    slug TEXT NOT NULL, -- internal key, e.g. "my_custom_field"
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select', 'multi_select')),
    options JSONB, -- For select/multi_select options
    is_required BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, entity_type, slug)
);

-- 4. Update Cold Leads to support custom fields
ALTER TABLE cold_leads 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- 5. RLS Policies (assuming standard RLS setup)
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_row_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

-- Policies for import_batches
CREATE POLICY "Users can view their own tenant batches" ON import_batches
    FOR SELECT USING (auth.uid() = created_by); -- Simplified, ideally check tenant_id via profile

CREATE POLICY "Users can insert their own branches" ON import_batches
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Policies for custom_field_definitions
-- (Assuming a function get_tenant_id() exists or similiar pattern, aiming for generic user access for now)
CREATE POLICY "Enable all access for authenticated users" ON custom_field_definitions
    FOR ALL USING (auth.role() = 'authenticated'); 
    
-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_import_row_batch ON import_row_results(batch_id);
CREATE INDEX IF NOT EXISTS idx_cold_leads_custom_fields ON cold_leads USING gin (custom_fields);
