-- Fix: trigger update_webinar_lead_last_interaction só deve bumpar
-- last_interaction_at quando a mensagem foi REALMENTE enviada/respondida.
-- Antes, o INSERT de mensagens 'pending' (cadência futura) também bumpava
-- last_interaction_at, o que corrompia o ordering da query
-- "Supabase Find Lead" do N8N (que usa order=last_interaction_at desc)
-- quando havia leads duplicados pelo mesmo phone.

CREATE OR REPLACE FUNCTION update_webinar_lead_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('sent', 'replied') THEN
    UPDATE webinar_campaign_leads
    SET last_interaction_at = NEW.created_at
    WHERE id = NEW.campaign_lead_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
