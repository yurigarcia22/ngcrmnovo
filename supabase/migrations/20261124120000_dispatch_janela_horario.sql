-- Janela de envio por campanha (antes fixa em 8h-20h no cron).
-- Ex.: mensagem que abre com "Boa tarde" precisa sair so entre 12h e 18h.
alter table public.dispatch_campaigns add column if not exists send_hour_start integer not null default 8;
alter table public.dispatch_campaigns add column if not exists send_hour_end integer not null default 20;
alter table public.dispatch_campaigns drop constraint if exists dispatch_campaigns_janela_chk;
alter table public.dispatch_campaigns add constraint dispatch_campaigns_janela_chk
  check (send_hour_start between 0 and 23 and send_hour_end between 1 and 24 and send_hour_start < send_hour_end);
