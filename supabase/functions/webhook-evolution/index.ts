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
          const rawStatus = String(u?.update?.status ?? u?.status ?? '').toUpperCase();
          if (!msgId || !rawStatus) continue;

          if (rawStatus.includes('READ') || rawStatus.includes('PLAYED')) {
            await supabase.from('messages')
              .update({ status: 'read' })
              .eq('evolution_message_id', msgId)
              .eq('tenant_id', tenantId);
          } else if (rawStatus.includes('DELIVERY') || rawStatus === 'DELIVERED') {
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
    // Ignora eventos que não sejam mensagens ou mensagens enviadas por mim
    if (!data || !data.key || data.key.fromMe) {
      return new Response(JSON.stringify({ message: 'Ignored: Not a message or fromMe' }), { status: 200 });
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
    let phone = rawId.split('@')[0];
    phone = phone.replace(/\D/g, '');

    if (phone.length < 10 || phone.length > 15) {
      return new Response(JSON.stringify({ message: 'Ignored invalid phone' }), { status: 200 });
    }

    const pushName = data.pushName || phone;
    const messageType = data.messageType;

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

      if (!url) return null;
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) return url;

        const blob = await response.blob();
        let contentType = blob.type;

        if (type === 'audio') contentType = 'audio/ogg';
        else if (mimetype) contentType = mimetype;

        const ext = (contentType.split('/')[1] || 'bin').split(';')[0] || 'bin';
        const fileName = `${tenantId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('crm-media')
          .upload(fileName, blob, { contentType, upsert: false });

        if (uploadError) return url;

        const { data: publicUrlData } = supabase.storage
          .from('crm-media')
          .getPublicUrl(fileName);

        return publicUrlData.publicUrl;
      } catch {
        return url;
      }
    }

    // --- 4. Extração de Conteúdo ---
    let contentType = 'text';
    let content = '';
    let mediaUrl = null;
    const textContent = data.message?.conversation || data.message?.extendedTextMessage?.text;

    if (messageType === 'imageMessage') {
      contentType = 'image';
      content = data.message.imageMessage?.caption || '';
      mediaUrl = await uploadMedia(data.message.imageMessage?.url, 'image', data.message.imageMessage?.mimetype);
    } else if (messageType === 'audioMessage') {
      contentType = 'audio';
      mediaUrl = await uploadMedia(data.message.audioMessage?.url, 'audio', data.message.audioMessage?.mimetype);
      content = mediaUrl ? "" : "[Áudio]";
    } else if (messageType === 'documentMessage') {
      contentType = 'document';
      const doc = data.message.documentMessage;
      if (doc?.mimetype === 'application/pdf') contentType = 'pdf';
      mediaUrl = await uploadMedia(doc?.url, 'document', doc?.mimetype);
      content = doc?.fileName || doc?.caption || "Documento";
    } else if (messageType === 'videoMessage') {
      contentType = 'video';
      mediaUrl = await uploadMedia(data.message.videoMessage?.url, 'video', data.message.videoMessage?.mimetype);
      content = data.message.videoMessage?.caption || "";
    } else {
      content = textContent || '[Mídia Desconhecida]';
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
      if (!deal.owner_id && instanceOwnerProfileId) {
        updates.owner_id = instanceOwnerProfileId;
        console.log(`-> Roteamento: Deal Existente [${dealId}] atribuído ao Dono da Instância (${instanceOwnerProfileId})`);
      }

      await supabase.from('deals').update(updates).eq('id', dealId);
    }

    if (!dealId) {
      return new Response(JSON.stringify({ error: 'Could not create or find deal' }), { status: 500 });
    }

    // --- 7. Salva Mensagem ---
    const { error: msgError } = await supabase.from('messages').insert({
      deal_id: dealId,
      contact_id: contactId,
      evolution_message_id: data.key.id,
      direction: 'inbound',
      type: contentType,
      content: content,
      media_url: mediaUrl,
      status: 'delivered',
      tenant_id: tenantId,
      instance_name: instanceName
    });

    if (msgError) console.error("Erro ao salvar mensagem:", msgError);

    // --- 7.1 Notifica o responsavel sobre a nova mensagem do lead ---
    try {
      const { data: dealRow } = await supabase
        .from('deals').select('owner_id').eq('id', dealId).maybeSingle();
      // So notifica se a mensagem foi REALMENTE inserida. Em retry concorrente, o
      // indice unico barra a 2a mensagem (msgError) e ela nao gera notificacao.
      const ownerId = msgError ? null : dealRow?.owner_id;
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