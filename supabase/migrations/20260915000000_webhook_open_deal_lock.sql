-- Duas mensagens do mesmo contato chegando no mesmo instante eram processadas
-- em paralelo pelo webhook: as duas nao achavam deal aberto e as duas criavam
-- um. A busca+criacao passa a ser serializada por contato (advisory lock de
-- transacao), sem exigir unicidade na tabela (fluxos manuais e n8n podem ter
-- mais de um deal aberto por contato de proposito).
CREATE OR REPLACE FUNCTION public.webhook_open_deal(
  p_tenant uuid, p_contact uuid, p_stage bigint, p_owner uuid, p_title text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_owner uuid;
  v_resolved timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('webhook_open_deal:' || p_contact::text, 0));

  SELECT d.id, d.owner_id, d.resolved_at INTO v_id, v_owner, v_resolved
  FROM deals d
  WHERE d.contact_id = p_contact AND d.tenant_id = p_tenant AND d.status = 'open'
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('deal_id', v_id, 'created', false, 'owner_id', v_owner, 'resolved_at', v_resolved);
  END IF;

  INSERT INTO deals (title, contact_id, stage_id, owner_id, status, value, tenant_id)
  VALUES (p_title, p_contact, p_stage, p_owner, 'open', 0, p_tenant)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('deal_id', v_id, 'created', true, 'owner_id', p_owner, 'resolved_at', NULL);
END $$;

REVOKE ALL ON FUNCTION public.webhook_open_deal(uuid, uuid, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_open_deal(uuid, uuid, bigint, uuid, text) TO service_role;
