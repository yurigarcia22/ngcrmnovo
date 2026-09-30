-- Limpeza diaria de registro (04h15 de Brasilia). Em 29/09/2026 o banco tinha
-- 359 MB, dos quais ~240 MB eram historico do pg_cron (669 mil linhas, nunca
-- limpas) e copia de webhooks ja processados. O plano gratis trava em 500 MB.
-- Webhook com erro NAO e apagado: ainda pode ser reprocessado.
SELECT cron.unschedule('crm-limpeza-registros')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-limpeza-registros');

SELECT cron.schedule('crm-limpeza-registros', '15 7 * * *', $$
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days';
  DELETE FROM public.webhook_events
   WHERE status IN ('processed', 'ignored') AND created_at < now() - interval '7 days';
$$);
