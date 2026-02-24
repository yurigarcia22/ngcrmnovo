-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id BIGINT REFERENCES public.tasks(id) ON DELETE CASCADE, 
    related_lead_id UUID REFERENCES public.deals(id) ON DELETE SET NULL, -- Changed back to UUID as distinct from tasks
    
    -- kind: 'morning', 'before_30', 'before_5', 'mention', 'system'
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    scheduled_for TIMESTAMPTZ NOT NULL, -- When it should be delivered
    sent_at TIMESTAMPTZ, -- When it was pushed to realtime/delivered
    read_at TIMESTAMPTZ, -- When user saw it
    dismissed_at TIMESTAMPTZ,
    
    channel TEXT DEFAULT 'in_app', -- 'in_app', 'email', etc.
    sound_enabled_snapshot BOOLEAN DEFAULT TRUE, -- snapshot of settings at scheduling time? or just check at runtime. Keeping simple.
    meta_json JSONB,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    tenant_id UUID DEFAULT auth.uid() -- Optional usage for RLS
);

-- Index for cron polling
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_sent ON public.notifications(scheduled_for, sent_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- Create notification_settings table
CREATE TABLE IF NOT EXISTS public.notification_settings (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    
    in_app_enabled BOOLEAN DEFAULT TRUE,
    sound_enabled BOOLEAN DEFAULT TRUE,
    morning_time TIME DEFAULT '09:00:00',
    advance_30m_enabled BOOLEAN DEFAULT TRUE,
    advance_5m_enabled BOOLEAN DEFAULT TRUE,
    
    do_not_disturb_start TIME,
    do_not_disturb_end TIME,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
    ON public.notifications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
    ON public.notifications FOR UPDATE
    USING (auth.uid() = user_id);
    
-- Service Role can insert/manage all (for cron interactions)
    
-- RLS for settings
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings"
    ON public.notification_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
    ON public.notification_settings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
    ON public.notification_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_notifications_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_notifications_timestamp
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE PROCEDURE update_notifications_timestamp();
    
CREATE TRIGGER update_notification_settings_timestamp
    BEFORE UPDATE ON public.notification_settings
    FOR EACH ROW
    EXECUTE PROCEDURE update_notifications_timestamp();
