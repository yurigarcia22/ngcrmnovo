import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    console.log('WEBHOOK PAYLOAD:', JSON.stringify(body, null, 2))
    const data = body.data

    // Ignora status ou mensagens enviadas por mim
    if (!data || data.key.fromMe) {
      return new Response(JSON.stringify({ message: 'Ignored' }), { status: 200 })
    }

    // --- 1. Limpeza Rigorosa do Telefone (Evitar Duplicidade) ---
    let rawId = data.key.remoteJid || '';

    // Correção para IDs do tipo LID (Linked Device)
    if (rawId.includes('@lid') && data.key.senderPn) {
      console.log('LID detectado. Usando senderPn:', data.key.senderPn);
      rawId = data.key.senderPn;
    }

    // Pega apenas a parte antes do @
    let phone = rawId.split('@')[0];
    // Remove TUDO que não for número (tira :, -, espaços, letras)
    phone = phone.replace(/\D/g, '');

    // Validação de Segurança
    if (phone.length < 10 || phone.length > 15) {
      console.error('Número inválido ignorado:', phone);
      return new Response(JSON.stringify({ message: 'Ignored invalid phone' }), { status: 200 });
    }

    const pushName = data.pushName || phone;
    const messageType = data.messageType;

    console.log(`Webhook recebido. Phone: ${phone}, Type: ${messageType}`);

    // --- Helper para Upload de Mídia ---
    async function uploadMedia(url: string | null, type: string, mimetype?: string): Promise<string | null> {
      if (!url) return null;
      try {
        console.log(`Baixando mídia (${type}): ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });

        if (!response.ok) {
          console.error(`Erro ao baixar mídia: ${response.status} ${response.statusText}`);
          return url; // Retorna URL original como fallback
        }

        const blob = await response.blob();

        // Determina o Content-Type correto
        let contentType = blob.type;
        if (type === 'audio') {
          contentType = 'audio/ogg'; // Força audio/ogg para áudios do WhatsApp
        } else if (mimetype) {
          contentType = mimetype;
        }

        const ext = contentType.split('/')[1].split(';')[0] || 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        console.log(`Fazendo upload para Supabase Storage. Type: ${type}, Content-Type: ${contentType}`);

        const { error: uploadError } = await supabase.storage
          .from('crm-media')
          .upload(fileName, blob, {
            contentType: contentType, // <--- O SEGREDO ESTÁ AQUI
            upsert: false
          });

        if (uploadError) {
          console.error("Erro no upload Supabase:", uploadError);
          return url; // Fallback
        }

        const { data: publicUrlData } = supabase.storage
          .from('crm-media')
          .getPublicUrl(fileName);

        console.log(`Mídia salva no Supabase: ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;

      } catch (error) {
        console.error("Erro processando mídia:", error);
        return url; // Fallback para URL original
      }
    }

    // --- 2. Classificação de Mídia ---
    let type = 'text';
    let content = '';
    let mediaUrl = null;

    // Extração básica de texto
    const textContent = data.message?.conversation || data.message?.extendedTextMessage?.text;

    if (messageType === 'imageMessage') {
      type = 'image';
      content = data.message.imageMessage?.caption || '';
      const originalUrl = data.message.imageMessage?.url || null;
      const mimetype = data.message.imageMessage?.mimetype;
      mediaUrl = await uploadMedia(originalUrl, 'image', mimetype);
    }
    else if (messageType === 'audioMessage') {
      type = 'audio';
      const originalUrl = data.message.audioMessage?.url || null;
      const mimetype = data.message.audioMessage?.mimetype;
      mediaUrl = await uploadMedia(originalUrl, 'audio', mimetype);
      // Se não tiver URL (base64), avisa no content
      content = mediaUrl ? "" : "[Áudio Recebido]";
    }
    else if (messageType === 'documentMessage') {
      type = 'document'; // Default
      const doc = data.message.documentMessage;
      const originalUrl = doc?.url || null;
      const mimetype = doc?.mimetype;

      // Refinamento para PDF
      if (mimetype === 'application/pdf') {
        type = 'pdf';
      }

      mediaUrl = await uploadMedia(originalUrl, 'document', mimetype);
      content = doc?.fileName || doc?.caption || "Documento";
    }
    else if (messageType === 'videoMessage') {
      type = 'video';
      const originalUrl = data.message.videoMessage?.url || null;
      const mimetype = data.message.videoMessage?.mimetype;
      mediaUrl = await uploadMedia(originalUrl, 'video', mimetype);
      content = data.message.videoMessage?.caption || "";
    }
    else {
      // Padrão Texto
      content = textContent || '[Mídia Desconhecida]';
    }

    // --- 3. Busca ou Cria o Contato ---
    let { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('phone', phone)
      .single()

    let contactId = contact?.id

    if (!contactId) {
      console.log("Contato não encontrado, criando novo:", phone);
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({ name: pushName, phone: phone })
        .select()
        .single()
      if (error) throw error
      contactId = newContact.id
    } else {
      console.log("Contato existente encontrado:", contactId);
    }

    // --- 4. Busca ou Cria o Negócio (Deal) ---
    // Verifica se já tem negócio ABERTO
    let { data: deal } = await supabase
      .from('deals')
      .select('id, owner_id')
      .eq('contact_id', contactId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let dealId = deal?.id
    let ownerId = deal?.owner_id

    // SE NÃO TEM NEGÓCIO ABERTO -> CRIA UM NOVO
    if (!dealId) {
      // Pega a primeira etapa (Stage 1)
      const { data: stage } = await supabase
        .from('stages')
        .select('id')
        .eq('position', 1)
        .limit(1)
        .single()

      if (!stage) throw new Error("ERRO CRITICO: Nenhuma etapa encontrada no banco.")

      // Roleta de Vendedores
      const { data: seller } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_online', true)
        .limit(1)
        .maybeSingle()

      if (!seller) {
        const { data: fallback } = await supabase.from('profiles').select('id').limit(1).single()
        ownerId = fallback?.id
      } else {
        ownerId = seller.id
      }

      // Cria o Card
      const { data: newDeal } = await supabase
        .from('deals')
        .insert({
          title: `Oportunidade: ${pushName}`,
          contact_id: contactId,
          stage_id: stage.id,
          owner_id: ownerId,
          status: 'open',
          value: 0
        })
        .select()
        .single()

      dealId = newDeal.id
      console.log("Novo Deal criado:", dealId)
    } else {
      // Se já existe, atualiza o 'updated_at' para subir no Kanban
      await supabase.from('deals').update({ updated_at: new Date() }).eq('id', dealId)
    }

    // --- 5. Salva a Mensagem ---
    console.log(`Salvando mensagem. Deal: ${dealId}, Type: ${type}`);
    const { error: msgError } = await supabase.from('messages').insert({
      deal_id: dealId,
      contact_id: contactId,
      evolution_message_id: data.key.id,
      direction: 'inbound',
      type: type,
      content: content,
      media_url: mediaUrl,
      status: 'delivered'
    })

    if (msgError) console.error("Erro ao salvar mensagem:", msgError)

    return new Response(JSON.stringify({ success: true, dealId }), { headers: { "Content-Type": "application/json" } })

  } catch (error) {
    console.error("Erro Geral:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})