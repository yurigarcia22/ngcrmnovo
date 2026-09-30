-- Usuario so de leitura do backup diario (pg_dump no VPS, scripts/backup/).
-- BYPASSRLS porque o pg_dump recusa tabela com RLS que filtraria linhas.
-- A senha NAO fica aqui: e definida a parte com ALTER ROLE ... PASSWORD
-- 'SCRAM-SHA-256$...' (verificador gerado fora, o texto puro nunca vai ao banco).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_leitura') THEN
    CREATE ROLE backup_leitura WITH LOGIN BYPASSRLS CONNECTION LIMIT 3;
  END IF;
END $$;

GRANT pg_read_all_data TO backup_leitura;
