import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    // console.log('WEBHOOK PAYLOAD:', JSON.stringify(body, null, 2))

    const instanceName = body.instance;
    const type = body.type;
    const data = body.data;

    // --- 0. Identificação da Instância (CRÍTICO) ---
    // Busca tenant_id e user_id dono desta instância
    let tenantId = null;
    let instanceOwnerProfileId = null;

    if (instanceName) {
      const { data: instanceData, error } = await supabase
        .from('whatsapp_instances')
        .select('tenant_id, owner_profile_id')
        .eq('instance_name', instanceName)
        .maybeSingle();

      if (instanceData) {
        tenantId = instanceData.tenant_id;
        instanceOwnerProfileId = instanceData.owner_profile_id;
        // console.log(`-> Instância ${instanceName} encontrada. Tenant: ${tenantId}, Owner: ${instanceOwnerProfileId || 'None'}`);
      } else {
        console.error(`ERRO: Instância ${instanceName} não encontrada no banco.`);
        // Tenta fallback antigo apenas se necessário, mas idealmente aborta ou loga erro
      }
    }

    if (!tenantId) {
      // Sem tenant identificado: aborta. (Fallback legacy via tenants.evolution_instance_name
      // foi removido na migration de fase 0 — coluna nao existe mais.)
      console.error(`IGNORANDO MENSAGEM: instancia ${instanceName} nao encontrada em whatsapp_instances.`);
      return new Response(JSON.stringify({ message: 'Ignored: Unknown Tenant' }), { status: 200 });
    }

    // --- 1. Tratamento de Status de Conexão ---
    if (type === 'connection.update') {
      const state = data.state; // open, close, connecting
      const status = state === 'open' ? 'connected' : state === 'close' ? 'disconnected' : 'connecting';

      console.log(`Atualizando status da instância ${instanceName} para [${status}]`);

      await supabase
        .from('whatsapp_instances')
        .update({ status: status })
        .eq('instance_name', instanceName);

      return new Response(JSON.stringify({ success: true, message: 'Status updated' }), { status: 200 });
    }

    // --- 1.5 Status de Mensagem (entregue / lida) ---
    // Atualiza o status das mensagens que ENVIAMOS (casadas por evolution_message_id).
    // Depende da Evolution enviar o evento MESSAGES_UPDATE para este webhook.
    if (type === 'messages.update' || type === 'MESSAGES_UPDATE') {
      try {
        const updates = Array.isArray(data) ? data : [data];
        for (const u of updates) {
          const msgId = u?.key?.id || u?.keyId || u?.messageId;
          const rawStatusVal = u?.update?.status ?? u?.status;
          if (!msgId || rawStatusVal == null) continue;
          const rawStatus = String(rawStatusVal).toUpperCase();

          // A Evolution/Baileys manda o status como STRING (READ, DELIVERY_ACK...)
          // OU como NUMERO (2=server ack, 3=delivery, 4=read, 5=played). Tratamos os dois.
          const isRead = rawStatus.includes('READ') || rawStatus.includes('PLAYED') ||
            rawStatus === '4' || rawStatus === '5';
          const isDelivered = rawStatus.includes('DELIVERY') || rawStatus === 'DELIVERED' ||
            rawStatus === '2' || rawStatus === '3';

          if (isRead) {
            await supabase.from('messages')
              .update({ status: 'read' })
              .eq('evolution_message_id', msgId)
              .eq('tenant_id', tenantId);
          } else if (isDelivered) {
            // Nao rebaixa uma mensagem que ja foi lida.
            await supabase.from('messages')
              .update({ status: 'delivered' })
              .eq('evolution_message_id', msgId)
              .eq('tenant_id', tenantId)
              .neq('status', 'read');
          }
        }
      } catch (e) {
        console.error('Erro ao atualizar status de mensagem:', e);
      }
      return new Response(JSON.stringify({ success: true, message: 'Message status processed' }), { status: 200 });
    }

    // --- 2. Filtros de Mensagem ---
    // Ignora eventos que nao sejam mensagens (sem key).
    if (!data || !data.key) {
      return new Response(JSON.stringify({ message: 'Ignored: Not a message' }), { status: 200 });
    }

    // fromMe = mensagem que SAIU deste numero (inclui o que voce manda pelo
    // WhatsApp Web). Tratamos como outbound, mas SO para conversas que ja existem
    // no CRM (nao criamos contato/deal novo a partir de fromMe). O que o proprio
    // CRM envia tambem volta como fromMe, mas a idempotencia abaixo barra duplicata.
    const isFromMe = !!data.key.fromMe;

    // Evita flood de historico: ao reconectar a instancia, o WhatsApp reenvia
    // mensagens antigas fromMe. Mensagem real do WhatsApp Web chega em segundos,
    // entao so processamos fromMe dos ultimos 10 minutos.
    if (isFromMe) {
      const ts = Number(data.messageTimestamp || 0) * 1000;
      if (ts && (Date.now() - ts) > 10 * 60 * 1000) {
        return new Response(JSON.stringify({ message: 'Ignored: fromMe antigo (history sync)' }), { status: 200 });
      }
    }

    // --- 2.1 Idempotencia: ignora mensagem ja salva ---
    // A Evolution as vezes reenvia o mesmo evento (retry), o que duplicava a
    // mensagem (e a notificacao). Casamos por evolution_message_id.
    if (data.key.id) {
      const { data: existingMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('evolution_message_id', data.key.id)
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();
      if (existingMsg) {
        return new Response(JSON.stringify({ message: 'Ignored: duplicate message' }), { status: 200 });
      }
    }

    // --- 3. Limpeza de Telefone ---
    let rawId = data.key.remoteJid || '';
    if (rawId.includes('@lid') && data.key.senderPn) {
      rawId = data.key.senderPn;
    }

    // O CRM e 1:1 com o lead: grupos, broadcast e status nao viram conversa.
    if (rawId.includes('@g.us') || rawId.includes('broadcast') || rawId.includes('@newsletter')) {
      return new Response(JSON.stringify({ message: 'Ignored: group/broadcast/newsletter' }), { status: 200 });
    }

    const messageType = data.messageType;

    // Reacoes (emoji), edicoes e eventos de protocolo (ex: apagar) nao geram
    // mensagem nova no CRM — senao poluem a conversa e disparam notificacao falsa.
    if (messageType === 'reactionMessage' || messageType === 'protocolMessage' ||
        data.message?.reactionMessage || data.message?.protocolMessage) {
      return new Response(JSON.stringify({ message: 'Ignored: reaction/protocol' }), { status: 200 });
    }

    let phone = rawId.split('@')[0];
    phone = phone.replace(/\D/g, '');

    if (phone.length < 10 || phone.length > 15) {
      return new Response(JSON.stringify({ message: 'Ignored invalid phone' }), { status: 200 });
    }

    const pushName = data.pushName || phone;

    // --- Helper: pega mídia DESCRIPTOGRAFADA da Evolution (base64) ---
    // Mídia recebida via WhatsApp vem encriptada na URL crua do servidor da Meta.
    // Sem este passo, as bytes salvas no Storage ficam ilegíveis (imagens/áudios quebram).
    async function fetchDecryptedBase64(): Promise<{ base64: string; mimetype?: string } | null> {
      try {
        const evoUrl = Deno.env.get('EVOLUTION_API_URL');
        const evoToken = Deno.env.get('EVOLUTION_API_TOKEN');
        if (!evoUrl || !evoToken || !instanceName) return null;
        const r = await fetch(
          `${evoUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoToken },
            body: JSON.stringify({
              message: { key: data.key, message: data.message },
              convertToMp4: false,
            }),
          },
        );
        if (!r.ok) return null;
        const j = await r.json();
        const base64 = j?.base64 ?? j?.data?.base64 ?? j?.media?.base64;
        const mimetype = j?.mimetype ?? j?.data?.mimetype ?? j?.media?.mimetype;
        if (!base64 || typeof base64 !== 'string') return null;
        return { base64, mimetype };
      } catch (e) {
        console.error('fetchDecryptedBase64 erro:', e);
        return null;
      }
    }

    // --- Helper Upload Mídia ---
    // 1) Tenta o base64 já descriptografado da Evolution (caminho confiável).
    // 2) Fallback: tenta a URL crua (pode estar encriptada, mas mantém referência).
    async function uploadMedia(url: string | null, type: string, mimetype?: string): Promise<string | null> {
      const decrypted = await fetchDecryptedBase64();
      if (decrypted?.base64) {
        try {
          const finalMime =
            type === 'audio' ? 'audio/ogg' :
            (decrypted.mimetype || mimetype || 'application/octet-stream');
          const binStr = atob(decrypted.base64);
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
          const ext = (finalMime.split('/')[1] || 'bin').split(';')[0] || 'bin';
          const fileName = `${tenantId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('crm-media')
            .upload(fileName, bytes, { contentType: finalMime, upsert: false });
          if (!upErr) {
            const { data: publicUrlData } = supabase.storage
              .from('crm-media')
              .getPublicUrl(fileName);
            return publicUrlData.publicUrl;
          }
          console.error('Falha ao salvar base64 da Evolution no Storage:', upErr);
        } catch (e) {
          console.error('Erro ao processar base64 da Evolution:', e);
        }
      }

      // Sem base64 valido da Evolution nao ha midia utilizavel: a URL crua do
      // WhatsApp e AES-encriptada (.enc) e nao abre no navegador. Retornamos null
      // para o front mostrar um placeholder, em vez de gravar uma midia quebrada.
      console.error(`uploadMedia: nao foi possivel obter midia ${type} descriptografada (instancia ${instanceName}).`);
      return null;
    }

    // --- 4. Extração de Conteúdo ---
    let contentType = 'text';
    let content = '';
    let mediaUrl = null;
    const textContent = data.message?.conversation || data.message?.extendedTextMessage?.text;

    if (messageType === 'imageMessage') {
      contentType = 'image';
      mediaUrl = await uploadMedia(data.message.imageMessage?.url, 'image', data.message.imageMessage?.mimetype);
      // Legenda quando houver; se a midia falhou, marca como nao baixada.
      content = data.message.imageMessage?.caption || (mediaUrl ? '' : '[Imagem não baixada]');
    } else if (messageType === 'stickerMessage') {
      // Figurinha: tratamos como imagem para tocar inline.
      contentType = 'image';
      mediaUrl = await uploadMedia(data.message.stickerMessage?.url, 'image', data.message.stickerMessage?.mimetype || 'image/webp');
      content = mediaUrl ? '' : '[Figurinha]';
    } else if (messageType === 'audioMessage') {
      contentType = 'audio';
      mediaUrl = await uploadMedia(data.message.audioMessage?.url, 'audio', data.message.audioMessage?.mimetype);
      content = mediaUrl ? "" : "[Áudio não baixado]";
    } else if (messageType === 'documentMessage' || messageType === 'documentWithCaptionMessage') {
      const doc = data.message.documentMessage || data.message.documentWithCaptionMessage?.message?.documentMessage;
      contentType = doc?.mimetype === 'application/pdf' ? 'pdf' : 'document';
      mediaUrl = await uploadMedia(doc?.url, 'document', doc?.mimetype);
      content = doc?.fileName || doc?.caption || "Documento";
    } else if (messageType === 'videoMessage') {
      contentType = 'video';
      mediaUrl = await uploadMedia(data.message.videoMessage?.url, 'video', data.message.videoMessage?.mimetype);
      content = data.message.videoMessage?.caption || (mediaUrl ? '' : '[Vídeo não baixado]');
    } else if (messageType === 'locationMessage') {
      // Localizacao: salva como link de mapa (type location).
      contentType = 'location';
      const loc = data.message.locationMessage;
      const lat = loc?.degreesLatitude;
      const lng = loc?.degreesLongitude;
      content = (lat != null && lng != null)
        ? `📍 Localização: https://www.google.com/maps?q=${lat},${lng}`
        : '📍 Localização recebida';
    } else if (messageType === 'contactMessage' || messageType === 'contactsArrayMessage') {
      // Contato compartilhado: extrai nome (e telefone do vCard quando houver).
      const c = data.message.contactMessage;
      const display = c?.displayName || 'Contato';
      const phoneMatch = (c?.vcard || '').match(/waid=(\d+)/) || (c?.vcard || '').match(/TEL[^:]*:([+\d\s()-]+)/i);
      const num = phoneMatch ? phoneMatch[1].trim() : '';
      content = num ? `👤 Contato: ${display} (${num})` : `👤 Contato: ${display}`;
    } else {
      content = textContent || '[Mensagem não suportada]';
    }

    // --- 5. Busca ou Cria Contato (Scoped by Tenant) ---
    // Normaliza para formato canonico BR: sempre 13 chars com nono digito.
    // Telefones do BR sem o "9" (12 chars) sao reescritos para 13.
    let canonicalPhone = phone;
    if (phone.startsWith('55') && phone.length === 12) {
      // 55 + DDD + 8 digitos -> 55 + DDD + "9" + 8 digitos
      canonicalPhone = phone.substring(0, 4) + '9' + phone.substring(4);
    }

    // Lookup tenta canonical primeiro, depois variacoes legacy.
    const searchPhones = [canonicalPhone];
    if (canonicalPhone !== phone) searchPhones.push(phone);
    if (canonicalPhone.length === 13 && canonicalPhone[4] === '9') {
      searchPhones.push(canonicalPhone.substring(0, 4) + canonicalPhone.substring(5));
    }

    // Busca todos os matches e prioriza: (1) com foto, (2) canonical, (3) qualquer
    const { data: candidates } = await supabase
      .from('contacts')
      .select('id, phone, photo_url')
      .in('phone', searchPhones)
      .eq('tenant_id', tenantId);

    let contact: { id: string; phone: string; photo_url: string | null } | null = null;
    if (candidates && candidates.length > 0) {
      contact =
        candidates.find((c) => c.phone === canonicalPhone) ??
        candidates.find((c) => c.photo_url && c.photo_url.length > 0) ??
        candidates[0];

      // Backfill: se o contact achado nao esta no formato canonico,
      // atualiza para o canonico (mantem ID, apenas normaliza o phone).
      if (contact && contact.phone !== canonicalPhone) {
        // So atualiza se nao houver conflito (canonical ja existir noutro contact)
        const conflict = candidates.find(
          (c) => c.id !== contact!.id && c.phone === canonicalPhone,
        );
        if (!conflict) {
          await supabase
            .from('contacts')
            .update({ phone: canonicalPhone })
            .eq('id', contact.id);
        }
      }
    }

    let contactId: string | undefined = contact?.id;
    const hasPhoto = !!(contact?.photo_url && contact.photo_url.length > 0);

    // fromMe (ex: mensagem mandada pelo WhatsApp Web): so puxa pra conversa que JA
    // existe. Se nao ha contato pra esse numero, ignora (nao cria contato novo).
    if (isFromMe && !contactId) {
      return new Response(JSON.stringify({ message: 'Ignored: fromMe sem contato existente' }), { status: 200 });
    }

    // Helper: pega foto de perfil do WhatsApp via Evolution API
    async function fetchProfilePictureUrl(): Promise<string | null> {
      try {
        const evoUrl = Deno.env.get('EVOLUTION_API_URL');
        const evoToken = Deno.env.get('EVOLUTION_API_TOKEN');
        if (!evoUrl || !evoToken || !instanceName) return null;

        const r = await fetch(
          `${evoUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: evoToken },
            body: JSON.stringify({ number: phone }),
          }
        );
        if (!r.ok) return null;
        const j = await r.json();
        return j?.profilePictureUrl ?? null;
      } catch {
        return null;
      }
    }

    if (!contactId) {
      // Contact novo: insere sempre no formato canonico
      const photoUrl = await fetchProfilePictureUrl();
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          name: pushName,
          phone: canonicalPhone,
          tenant_id: tenantId,
          photo_url: photoUrl ?? '',
        })
        .select()
        .single();
      if (error) throw error;
      contactId = newContact.id;
    } else if (!hasPhoto) {
      // Contact existente sem foto: tenta puxar uma vez
      const photoUrl = await fetchProfilePictureUrl();
      if (photoUrl) {
        await supabase
          .from('contacts')
          .update({ photo_url: photoUrl })
          .eq('id', contactId);
      }
    }

    // --- 6. Busca ou Cria Deal (Roteamento Multi-Agente) ---
    let { data: deal } = await supabase
      .from('deals')
      .select('id, owner_id')
      .eq('contact_id', contactId)
      .eq('status', 'open')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let dealId = deal?.id;

    // fromMe sem conversa aberta: ignora (nao cria deal a partir de mensagem que saiu).
    if (isFromMe && !dealId) {
      return new Response(JSON.stringify({ message: 'Ignored: fromMe sem conversa existente' }), { status: 200 });
    }

    // SE CRIAR NOVO DEAL
    if (!dealId) {
      // FIX CRITICO: busca a stage de entrada do pipeline DEFAULT do tenant.
      // Antes esta query rodava sem filtro de tenant, podendo atribuir deal
      // do tenant A a stage do tenant B (vazamento entre tenants).
      // get_tenant_inbox_stage retorna bigint (stages.id e bigint, nao uuid).
      const { data: inboxStageRpc } = await supabase
        .rpc('get_tenant_inbox_stage', { p_tenant_id: tenantId });

      const inboxStageId = (inboxStageRpc as number | string | null);
      const stage = inboxStageId != null ? { id: inboxStageId } : null;

      if (!stage) {
        console.error(`Tenant ${tenantId} nao tem stage de entrada configurada (pipeline default + is_inbox).`);
        return new Response(JSON.stringify({ message: 'Ignored: no inbox stage' }), { status: 200 });
      }

      if (stage) {
        let ownerId = null;

        // --- LÓGICA DE ROTEAMENTO ---
        if (instanceOwnerProfileId) {
          // Roteamento Direto (Instância com Dono)
          ownerId = instanceOwnerProfileId;
          console.log(`-> Roteamento: Deal atribuído ao Dono da Instância (${ownerId})`);
        } else {
          // Roteamento Roleta (Instância Compartilhada)
          const { data: seller } = await supabase
            .from('profiles')
            .select('id')
            .eq('is_online', true)
            .eq('tenant_id', tenantId)
            .limit(1)
            .maybeSingle();

          if (seller) {
            ownerId = seller.id;
          } else {
            // Fallback qualquer um do tenant
            const { data: anyUser } = await supabase.from('profiles').select('id').eq('tenant_id', tenantId).limit(1).single();
            ownerId = anyUser?.id;
          }
          console.log(`-> Roteamento: Roleta/Fallback (${ownerId})`);
        }

        const { data: newDeal, error: insertErr } = await supabase
          .from('deals')
          .insert({
            title: `Oportunidade: ${pushName}`,
            contact_id: contactId,
            stage_id: stage.id,
            owner_id: ownerId,
            status: 'open',
            value: 0,
            tenant_id: tenantId
          })
          .select()
          .single();

        if (insertErr || !newDeal) {
          console.error('Erro ao criar deal:', insertErr);
          return new Response(JSON.stringify({ error: insertErr?.message || 'Falha ao criar deal' }), { status: 500 });
        }

        dealId = newDeal.id;
      }
    } else {
      // Deal já existe
      const updates: any = { updated_at: new Date() };

      // Se o deal não tem dono E a instância tem dono -> Atribui
      // (so para mensagens recebidas; fromMe nao deve reatribuir a conversa).
      if (!isFromMe && !deal.owner_id && instanceOwnerProfileId) {
        updates.owner_id = instanceOwnerProfileId;
        console.log(`-> Roteamento: Deal Existente [${dealId}] atribuído ao Dono da Instância (${instanceOwnerProfileId})`);
      }

      await supabase.from('deals').update(updates).eq('id', dealId);
    }

    if (!dealId) {
      return new Response(JSON.stringify({ error: 'Could not create or find deal' }), { status: 500 });
    }

    // --- 7. Salva Mensagem ---
    // fromMe (ex: mandada pelo WhatsApp Web) -> outbound; recebida -> inbound.
    const { error: msgError } = await supabase.from('messages').insert({
      deal_id: dealId,
      contact_id: contactId,
      evolution_message_id: data.key.id,
      direction: isFromMe ? 'outbound' : 'inbound',
      type: contentType,
      content: content,
      media_url: mediaUrl,
      status: isFromMe ? 'sent' : 'delivered',
      tenant_id: tenantId,
      instance_name: instanceName
    });

    if (msgError) {
      console.error("Erro ao salvar mensagem:", msgError);
      // 23505 = violacao do indice unico (tenant_id, evolution_message_id): e uma
      // duplicata de retry concorrente que passou pelo pre-check. E benigno -> 200.
      // Qualquer outra falha (constraint/RLS/timeout) e REAL: respondemos 500 para
      // a Evolution reentregar e a mensagem do lead nao se perder silenciosamente.
      if ((msgError as any).code !== '23505') {
        return new Response(
          JSON.stringify({ error: 'Falha ao salvar mensagem', detail: msgError.message }),
          { status: 500 },
        );
      }
    }

    // --- 7.1 Notifica o responsavel sobre a nova mensagem do lead ---
    try {
      const { data: dealRow } = await supabase
        .from('deals').select('owner_id').eq('id', dealId).maybeSingle();
      // So notifica se a mensagem foi REALMENTE inserida (msgError null) E for do
      // lead (inbound). Mensagem que VOCE mandou (fromMe) nao gera notificacao.
      const ownerId = (msgError || isFromMe) ? null : dealRow?.owner_id;
      if (ownerId) {
        const preview = content && content.length > 0
          ? (content.length > 80 ? content.slice(0, 80) + '...' : content)
          : contentType === 'audio' ? '[Áudio]'
          : contentType === 'image' ? '[Imagem]'
          : (contentType === 'pdf' || contentType === 'document') ? '[Documento]'
          : contentType === 'video' ? '[Vídeo]'
          : '[Mídia]';
        const nowIso = new Date().toISOString();
        await supabase.from('notifications').insert({
          user_id: ownerId,
          related_lead_id: dealId,
          kind: 'message',
          title: `Nova mensagem de ${pushName}`,
          message: preview,
          scheduled_for: nowIso,
          sent_at: nowIso,
          tenant_id: tenantId,
        });
      }
    } catch (e) {
      console.error('Erro ao criar notificacao de mensagem:', e);
    }

    return new Response(JSON.stringify({ success: true, dealId }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Erro Geral Webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})