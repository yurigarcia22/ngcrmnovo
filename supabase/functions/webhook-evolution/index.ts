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
      // Se não achou tenant, podemos tentar buscar em 'tenants' via evolution_instance_name (legacy)
      // Ou simplesmente abortar para não sujar o banco com dados sem tenant
      const { data: tenantFallback } = await supabase
        .from('tenants')
        .select('id')
        .eq('evolution_instance_name', instanceName)
        .maybeSingle();

      if (tenantFallback) {
        tenantId = tenantFallback.id;
        console.log('-> Fallback Legacy: Tenant encontrado via tabela tenants.');
      } else {
        console.error("IGORANDO MENSAGEM: Tenant não identificado.");
        return new Response(JSON.stringify({ message: 'Ignored: Unknown Tenant' }), { status: 200 });
      }
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

    // --- 2. Filtros de Mensagem ---
    // Ignora eventos que não sejam mensagens ou mensagens enviadas por mim
    if (!data || !data.key || data.key.fromMe) {
      return new Response(JSON.stringify({ message: 'Ignored: Not a message or fromMe' }), { status: 200 });
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

    // --- Helper Upload Mídia (Mantido) ---
    async function uploadMedia(url: string | null, type: string, mimetype?: string): Promise<string | null> {
      if (!url) return null;
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!response.ok) return url;

        const blob = await response.blob();
        let contentType = blob.type;

        if (type === 'audio') contentType = 'audio/ogg';
        else if (mimetype) contentType = mimetype;

        const ext = contentType.split('/')[1].split(';')[0] || 'bin';
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
    let searchPhones = [phone];
    if (phone.startsWith('55')) {
      if (phone.length === 13 && phone[4] === '9') searchPhones.push(phone.substring(0, 4) + phone.substring(5));
      else if (phone.length === 12) searchPhones.push(phone.substring(0, 4) + '9' + phone.substring(4));
    }

    let { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .in('phone', searchPhones)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    let contactId = contact?.id;

    if (!contactId) {
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({ name: pushName, phone, tenant_id: tenantId })
        .select()
        .single();
      if (error) throw error;
      contactId = newContact.id;
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
      const { data: stage } = await supabase
        .from('stages')
        .select('id')
        .eq('position', 1)
        .limit(1)
        .single();

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

        const { data: newDeal } = await supabase
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
      tenant_id: tenantId
    });

    if (msgError) console.error("Erro ao salvar mensagem:", msgError);

    return new Response(JSON.stringify({ success: true, dealId }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Erro Geral Webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})