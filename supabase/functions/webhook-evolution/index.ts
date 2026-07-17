import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// =====================================================================
// Webhook Evolution -> CRM
// Arquitetura "ingest-first": o evento bruto e gravado em webhook_events
// ANTES de qualquer processamento. Se algo falhar no meio, o evento fica
// status='error' e o cron /api/cron/webhook-retry reprocessa. A mensagem
// e salva ANTES do download de midia (midia vira UPDATE depois), entao
// midia lenta/quebrada nunca mais derruba a mensagem.
// =====================================================================

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // --- 0. Caixa-preta: registra o evento bruto ANTES de processar ---
  let body: any = null;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  const instanceName = body?.instance;
  const type = body?.type ?? body?.event;
  const data = body?.data;
  const evoMsgId = data?.key?.id ?? null;

  // Replay do cron de retry: reaproveita a linha existente em vez de criar outra.
  const replayId = req.headers.get('x-replay-event-id');
  let eventId: number | null = replayId ? Number(replayId) : null;

  if (!eventId) {
    try {
      const { data: ev } = await supabase
        .from('webhook_events')
        .insert({
          instance_name: instanceName ?? null,
          event_type: type ?? null,
          evolution_message_id: evoMsgId,
          payload: body,
        })
        .select('id')
        .single();
      eventId = ev?.id ?? null;
    } catch (e) {
      // Sem caixa-preta ainda processamos: melhor entregar do que travar.
      console.error('webhook_events insert falhou:', e);
    }
  }

  // Finaliza: atualiza a caixa-preta e responde.
  async function finish(status: string, detail: string | null, httpStatus: number, extra?: Record<string, unknown>) {
    if (eventId) {
      try {
        await supabase.from('webhook_events').update({
          status, detail, processed_at: new Date().toISOString(),
        }).eq('id', eventId);
      } catch (e) { console.error('webhook_events update falhou:', e); }
    }
    return new Response(JSON.stringify({ status, detail, ...(extra ?? {}) }), {
      status: httpStatus, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // --- 1. Identificacao da instancia ---
    let tenantId: string | null = null;
    let instanceOwnerProfileId: string | null = null;
    let instancePipelineId: number | null = null;

    if (instanceName) {
      const { data: instanceData } = await supabase
        .from('whatsapp_instances')
        .select('tenant_id, owner_profile_id, pipeline_id')
        .eq('instance_name', instanceName)
        .maybeSingle();
      if (instanceData) {
        tenantId = instanceData.tenant_id;
        instanceOwnerProfileId = instanceData.owner_profile_id;
        instancePipelineId = instanceData.pipeline_id ?? null;
      }
    }

    if (!tenantId) {
      // Instancia desconhecida: NAO e ignore silencioso — fica 'orphan' na
      // caixa-preta (recuperavel apos cadastrar/corrigir a instancia).
      console.error(`Instancia ${instanceName} nao encontrada em whatsapp_instances.`);
      return await finish('orphan', `instancia ${instanceName} desconhecida`, 200);
    }

    if (eventId) {
      // Preenche tenant na caixa-preta (ajuda debug/consulta)
      supabase.from('webhook_events').update({ tenant_id: tenantId }).eq('id', eventId).then(() => {});
    }

    // --- 2. Status de conexao ---
    if (type === 'connection.update' || type === 'CONNECTION_UPDATE') {
      const state = data?.state;
      const status = state === 'open' ? 'connected' : state === 'close' ? 'disconnected' : 'connecting';
      await supabase.from('whatsapp_instances').update({ status }).eq('instance_name', instanceName);
      return await finish('processed', `conexao -> ${status}`, 200);
    }

    // --- 3. Status de mensagem (entregue/lida) ---
    if (type === 'messages.update' || type === 'MESSAGES_UPDATE') {
      const updates = Array.isArray(data) ? data : [data];
      for (const u of updates) {
        const msgId = u?.key?.id || u?.keyId || u?.messageId;
        const rawStatusVal = u?.update?.status ?? u?.status;
        if (!msgId || rawStatusVal == null) continue;
        const rawStatus = String(rawStatusVal).toUpperCase();
        const isRead = rawStatus.includes('READ') || rawStatus.includes('PLAYED') || rawStatus === '4' || rawStatus === '5';
        const isDelivered = rawStatus.includes('DELIVERY') || rawStatus === 'DELIVERED' || rawStatus === '2' || rawStatus === '3';
        if (isRead) {
          await supabase.from('messages').update({ status: 'read' })
            .eq('evolution_message_id', msgId).eq('tenant_id', tenantId);
        } else if (isDelivered) {
          await supabase.from('messages').update({ status: 'delivered' })
            .eq('evolution_message_id', msgId).eq('tenant_id', tenantId).neq('status', 'read');
        }
      }
      return await finish('processed', 'status de mensagem', 200);
    }

    // --- 4. Filtros de mensagem ---
    if (!data || !data.key) {
      return await finish('ignored', 'evento sem key (nao e mensagem)', 200);
    }

    const isFromMe = !!data.key.fromMe;

    // Anti-flood de history sync: fromMe antigo (>10min) e replay de historico.
    if (isFromMe) {
      const ts = Number(data.messageTimestamp || 0) * 1000;
      if (ts && (Date.now() - ts) > 10 * 60 * 1000) {
        return await finish('ignored', 'fromMe antigo (history sync)', 200);
      }
    }

    // Idempotencia: mensagem ja salva -> ignora.
    if (data.key.id) {
      const { data: existingMsg } = await supabase
        .from('messages').select('id')
        .eq('evolution_message_id', data.key.id).eq('tenant_id', tenantId)
        .limit(1).maybeSingle();
      if (existingMsg) {
        return await finish('ignored', 'duplicata (ja salva)', 200);
      }
    }

    let rawId = data.key.remoteJid || '';
    if (rawId.includes('@lid') && data.key.senderPn) rawId = data.key.senderPn;

    if (rawId.includes('@g.us') || rawId.includes('broadcast') || rawId.includes('@newsletter')) {
      return await finish('ignored', 'grupo/broadcast/newsletter', 200);
    }

    const messageType = data.messageType;
    if (messageType === 'reactionMessage' || messageType === 'protocolMessage' ||
        data.message?.reactionMessage || data.message?.protocolMessage) {
      return await finish('ignored', 'reacao/protocolo', 200);
    }

    let phone = rawId.split('@')[0].replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      return await finish('ignored', `telefone invalido (${phone})`, 200);
    }

    const pushName = data.pushName || phone;

    // --- 5. Conteudo (SEM baixar midia ainda) ---
    // Midia inline (webhookBase64=true) e processada ja; fallback via API da
    // Evolution acontece DEPOIS da mensagem salva (update), nunca antes.
    let contentType = 'text';
    let content = '';
    let pendingMediaMime: string | undefined;
    let hasMedia = false;
    const textContent = data.message?.conversation || data.message?.extendedTextMessage?.text;

    if (messageType === 'imageMessage') {
      contentType = 'image'; hasMedia = true;
      pendingMediaMime = data.message?.imageMessage?.mimetype;
      content = data.message?.imageMessage?.caption || '';
    } else if (messageType === 'stickerMessage') {
      contentType = 'image'; hasMedia = true;
      pendingMediaMime = data.message?.stickerMessage?.mimetype || 'image/webp';
      content = '';
    } else if (messageType === 'audioMessage') {
      contentType = 'audio'; hasMedia = true;
      pendingMediaMime = data.message?.audioMessage?.mimetype;
    } else if (messageType === 'documentMessage' || messageType === 'documentWithCaptionMessage') {
      const doc = data.message?.documentMessage || data.message?.documentWithCaptionMessage?.message?.documentMessage;
      contentType = doc?.mimetype === 'application/pdf' ? 'pdf' : 'document';
      hasMedia = true;
      pendingMediaMime = doc?.mimetype;
      content = doc?.fileName || doc?.caption || 'Documento';
    } else if (messageType === 'videoMessage') {
      contentType = 'video'; hasMedia = true;
      pendingMediaMime = data.message?.videoMessage?.mimetype;
      content = data.message?.videoMessage?.caption || '';
    } else if (messageType === 'locationMessage') {
      contentType = 'location';
      const loc = data.message?.locationMessage;
      const lat = loc?.degreesLatitude, lng = loc?.degreesLongitude;
      content = (lat != null && lng != null)
        ? `📍 Localização: https://www.google.com/maps?q=${lat},${lng}`
        : '📍 Localização recebida';
    } else if (messageType === 'contactMessage' || messageType === 'contactsArrayMessage') {
      const c = data.message?.contactMessage;
      const display = c?.displayName || 'Contato';
      const phoneMatch = (c?.vcard || '').match(/waid=(\d+)/) || (c?.vcard || '').match(/TEL[^:]*:([+\d\s()-]+)/i);
      const num = phoneMatch ? phoneMatch[1].trim() : '';
      content = num ? `👤 Contato: ${display} (${num})` : `👤 Contato: ${display}`;
    } else {
      content = textContent || '[Mensagem não suportada]';
    }

    // Upload de bytes pro Storage (usado pelo inline e pelo fallback).
    async function uploadBytes(b64: string, mime: string | undefined): Promise<string | null> {
      try {
        const finalMime = contentType === 'audio' ? 'audio/ogg' : (mime || 'application/octet-stream');
        const binStr = atob(b64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        const ext = (finalMime.split('/')[1] || 'bin').split(';')[0] || 'bin';
        const fileName = `${tenantId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('crm-media').upload(fileName, bytes, { contentType: finalMime, upsert: false });
        if (upErr) { console.error('Storage upload falhou:', upErr); return null; }
        return supabase.storage.from('crm-media').getPublicUrl(fileName).data.publicUrl;
      } catch (e) { console.error('uploadBytes erro:', e); return null; }
    }

    // Caminho rapido: base64 inline no proprio payload (webhookBase64=true).
    let mediaUrl: string | null = null;
    if (hasMedia) {
      const inlineB64 = data.message?.base64 ?? data.base64 ?? data.message?.mediaBase64;
      if (inlineB64 && typeof inlineB64 === 'string' && inlineB64.length > 100) {
        mediaUrl = await uploadBytes(inlineB64, pendingMediaMime);
      }
    }

    // --- 6. Normalizacao de telefone + contato ---
    let canonicalPhone = phone;
    if (phone.startsWith('55') && phone.length === 12 && /^[6-9]/.test(phone.substring(4))) {
      canonicalPhone = phone.substring(0, 4) + '9' + phone.substring(4);
    }
    const searchPhones = [canonicalPhone];
    if (canonicalPhone !== phone) searchPhones.push(phone);
    if (canonicalPhone.length === 13 && canonicalPhone[4] === '9') {
      searchPhones.push(canonicalPhone.substring(0, 4) + canonicalPhone.substring(5));
    }

    const { data: candidates } = await supabase
      .from('contacts').select('id, phone, photo_url')
      .in('phone', searchPhones).eq('tenant_id', tenantId);

    let contact: { id: string; phone: string; photo_url: string | null } | null = null;
    if (candidates && candidates.length > 0) {
      contact =
        candidates.find((c) => c.phone === canonicalPhone) ??
        candidates.find((c) => c.photo_url && c.photo_url.length > 0) ??
        candidates[0];
      if (contact && contact.phone !== canonicalPhone) {
        const conflict = candidates.find((c) => c.id !== contact!.id && c.phone === canonicalPhone);
        if (!conflict) {
          await supabase.from('contacts').update({ phone: canonicalPhone }).eq('id', contact.id);
        }
      }
    }

    let contactId: string | undefined = contact?.id;
    const hasPhoto = !!(contact?.photo_url && contact.photo_url.length > 0);

    if (isFromMe && !contactId) {
      return await finish('ignored', 'fromMe sem contato existente', 200);
    }

    async function fetchProfilePictureUrl(): Promise<string | null> {
      try {
        const evoUrl = Deno.env.get('EVOLUTION_API_URL');
        const evoToken = Deno.env.get('EVOLUTION_API_TOKEN');
        if (!evoUrl || !evoToken || !instanceName) return null;
        const r = await fetch(`${evoUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evoToken },
          body: JSON.stringify({ number: phone }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) return null;
        const j = await r.json();
        const metaUrl = j?.profilePictureUrl;
        if (!metaUrl || typeof metaUrl !== 'string') return null;
        try {
          const imgResp = await fetch(metaUrl, { signal: AbortSignal.timeout(10000) });
          if (imgResp.ok) {
            const bytes = new Uint8Array(await imgResp.arrayBuffer());
            if (bytes.length > 200) {
              const fileName = `${tenantId}/avatars/${canonicalPhone}.jpg`;
              const { error: upErr } = await supabase.storage
                .from('crm-media').upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true });
              if (!upErr) return supabase.storage.from('crm-media').getPublicUrl(fileName).data.publicUrl;
            }
          }
        } catch { /* fallback abaixo */ }
        return metaUrl;
      } catch { return null; }
    }

    if (!contactId) {
      // Foto NAO bloqueia a criacao (era mais um fetch sincrono no caminho critico).
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({ name: pushName, phone: canonicalPhone, tenant_id: tenantId, photo_url: '' })
        .select().single();
      if (error) {
        // Race: outra mensagem do mesmo numero criou o contato no meio tempo.
        const { data: retry } = await supabase
          .from('contacts').select('id')
          .eq('tenant_id', tenantId).in('phone', searchPhones)
          .limit(1).maybeSingle();
        if (retry?.id) contactId = retry.id;
        else throw error;
      } else {
        contactId = newContact.id;
        // Foto em melhor esforco, depois de garantir o contato.
        fetchProfilePictureUrl().then((url) => {
          if (url) supabase.from('contacts').update({ photo_url: url }).eq('id', contactId!).then(() => {});
        }).catch(() => {});
      }
    } else if (!hasPhoto) {
      fetchProfilePictureUrl().then((url) => {
        if (url) supabase.from('contacts').update({ photo_url: url }).eq('id', contactId!).then(() => {});
      }).catch(() => {});
    }

    // --- 7. Busca ou cria deal ---
    const { data: deal } = await supabase
      .from('deals').select('id, owner_id, resolved_at')
      .eq('contact_id', contactId).eq('status', 'open').eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    let dealId = deal?.id;
    const reopened = !isFromMe && !!deal?.resolved_at;

    if (isFromMe && !dealId) {
      return await finish('ignored', 'fromMe sem conversa existente', 200);
    }

    if (!dealId) {
      const { data: inboxStageRpc } = await supabase
        .rpc('get_inbox_stage_for_instance', { p_tenant_id: tenantId, p_pipeline_id: instancePipelineId });
      let inboxStageId = (inboxStageRpc as number | string | null);
      if (inboxStageId == null) {
        const { data: defaultStageRpc } = await supabase
          .rpc('get_tenant_inbox_stage', { p_tenant_id: tenantId });
        inboxStageId = (defaultStageRpc as number | string | null);
      }

      if (inboxStageId == null) {
        // Tenant sem etapa de entrada: ERRO RECUPERAVEL (nao descarte silencioso).
        // O cron reprocessa depois que o funil for corrigido.
        console.error(`Tenant ${tenantId} sem stage de entrada (pipeline default + is_inbox).`);
        return await finish('error', 'tenant sem etapa de entrada configurada', 200);
      }

      let ownerId: string | null = null;
      if (instanceOwnerProfileId) {
        ownerId = instanceOwnerProfileId;
      } else {
        const { data: seller } = await supabase
          .from('profiles').select('id')
          .eq('is_online', true).eq('tenant_id', tenantId).limit(1).maybeSingle();
        if (seller) ownerId = seller.id;
        else {
          const { data: anyUser } = await supabase
            .from('profiles').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle();
          ownerId = anyUser?.id ?? null;
        }
      }

      const { data: newDeal, error: insertErr } = await supabase
        .from('deals')
        .insert({
          title: `Oportunidade: ${pushName}`,
          contact_id: contactId,
          stage_id: inboxStageId,
          owner_id: ownerId,
          status: 'open',
          value: 0,
          tenant_id: tenantId,
        })
        .select().single();

      if (insertErr || !newDeal) {
        console.error('Erro ao criar deal:', insertErr);
        return await finish('error', `falha ao criar deal: ${insertErr?.message}`, 500);
      }
      dealId = newDeal.id;
    } else {
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (!isFromMe && !deal!.owner_id && instanceOwnerProfileId) {
        updates.owner_id = instanceOwnerProfileId;
      }
      if (!isFromMe) {
        updates.resolved_at = null;
        updates.snoozed_until = null;
      }
      await supabase.from('deals').update(updates).eq('id', dealId);
    }

    // --- 8. SALVA A MENSAGEM (antes de qualquer fallback de midia) ---
    const { data: savedMsg, error: msgError } = await supabase.from('messages').insert({
      deal_id: dealId,
      contact_id: contactId,
      evolution_message_id: data.key.id,
      direction: isFromMe ? 'outbound' : 'inbound',
      type: contentType,
      content: content,
      media_url: mediaUrl,
      status: isFromMe ? 'sent' : 'delivered',
      tenant_id: tenantId,
      instance_name: instanceName,
    }).select('id').maybeSingle();

    if (msgError) {
      if ((msgError as any).code === '23505') {
        // Retry concorrente: outra execucao ja salvou. Benigno.
        return await finish('ignored', 'duplicata (constraint unique)', 200);
      }
      console.error('Erro ao salvar mensagem:', msgError);
      return await finish('error', `falha ao salvar mensagem: ${msgError.message}`, 500);
    }

    // --- 9. Fallback de midia (DEPOIS da mensagem salva; falha nao perde nada) ---
    let mediaNote: string | null = null;
    if (hasMedia && !mediaUrl && savedMsg?.id) {
      const evoUrl = Deno.env.get('EVOLUTION_API_URL');
      const evoToken = Deno.env.get('EVOLUTION_API_TOKEN');
      if (evoUrl && evoToken && instanceName) {
        const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
        const backoffs = [0, 2500, 4000];
        for (let i = 0; i < backoffs.length && !mediaUrl; i++) {
          if (backoffs[i] > 0) await sleep(backoffs[i]);
          try {
            const r = await fetch(`${evoUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: evoToken },
              body: JSON.stringify({ message: { key: data.key }, convertToMp4: false }),
              signal: AbortSignal.timeout(15000),
            });
            if (r.ok) {
              const j = await r.json();
              const b64 = j?.base64 ?? j?.data?.base64 ?? j?.media?.base64;
              const mt = j?.mimetype ?? j?.data?.mimetype ?? j?.media?.mimetype;
              if (b64 && typeof b64 === 'string') {
                mediaUrl = await uploadBytes(b64, mt ?? pendingMediaMime);
              }
            }
          } catch (e) { console.error(`getBase64 tentativa ${i + 1} erro:`, e); }
        }
      }

      if (mediaUrl) {
        await supabase.from('messages').update({ media_url: mediaUrl }).eq('id', savedMsg.id);
      } else {
        // Sem midia: marca o placeholder classico (so se nao ha legenda).
        mediaNote = 'midia nao baixada';
        if (!content) {
          const placeholder =
            contentType === 'audio' ? '[Áudio não baixado]' :
            contentType === 'video' ? '[Vídeo não baixado]' :
            contentType === 'image' ? '[Imagem não baixada]' : '[Mídia não baixada]';
          await supabase.from('messages').update({ content: placeholder }).eq('id', savedMsg.id);
        }
      }
    }

    // --- 10. Notificacao pro responsavel ---
    try {
      if (!isFromMe) {
        const { data: dealRow } = await supabase
          .from('deals').select('owner_id').eq('id', dealId).maybeSingle();
        const ownerId = dealRow?.owner_id;
        if (ownerId) {
          const preview = content && content.length > 0
            ? (content.length > 80 ? content.slice(0, 80) + '...' : content)
            : contentType === 'audio' ? '[Áudio]'
            : contentType === 'image' ? '[Imagem]'
            : (contentType === 'pdf' || contentType === 'document') ? '[Documento]'
            : contentType === 'video' ? '[Vídeo]'
            : '[Mídia]';
          const nowIso = new Date().toISOString();
          const title = reopened ? `🔄 ${pushName} reabriu a conversa` : `Nova mensagem de ${pushName}`;
          await supabase.from('notifications').insert({
            user_id: ownerId,
            related_lead_id: dealId,
            kind: reopened ? 'reopened' : 'message',
            title,
            message: preview,
            scheduled_for: nowIso,
            sent_at: nowIso,
            tenant_id: tenantId,
          });
        }
      }
    } catch (e) { console.error('Erro ao criar notificacao:', e); }

    return await finish('processed', mediaNote, 200, { dealId });

  } catch (error) {
    console.error('Erro Geral Webhook:', error);
    return await finish('error', String((error as Error)?.message ?? error), 500);
  }
})
