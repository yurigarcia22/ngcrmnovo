-- Job de scraping vinculado à campanha.
-- Quando o user clica "Buscar leads", a gente chama o ng-scraper-google
-- (POST /scrape/async), guarda o job_id aqui e fica pollando GET /jobs/{id}
-- até vir "done", quando inserimos as empresas em webinar_campaign_leads.

ALTER TABLE public.webinar_campaigns
  ADD COLUMN IF NOT EXISTS scraping_job_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS scraping_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS scraping_finished_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS scraping_max_per_city INTEGER NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS scraping_error TEXT NULL;
