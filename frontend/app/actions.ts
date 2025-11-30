"use server";
import { createClient } from "@supabase/supabase-js";

export async function sendMessage(phone: string, text: string, context: { dealId: string, contactId: string }) {
    try {
        const url = process.env.EVOLUTION_API_URL;
        const token = process.env.EVOLUTION_API_TOKEN;
        const instance = process.env.EVOLUTION_INSTANCE;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Usando Service Role para bypass RLS

        const missing = [];
        if (!url) missing.push("EVOLUTION_API_URL");
        if (!token) missing.push("EVOLUTION_API_TOKEN");
        if (!instance) missing.push("EVOLUTION_INSTANCE");
        if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
        if (!supabaseKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

        if (missing.length > 0) {
            throw new Error(`Missing API credentials: ${missing.join(", ")}`);
        }

        const supabase = createClient(supabaseUrl!, supabaseKey!);

        // 1. Higienização: Apenas números
        const cleanPhone = phone.replace(/\D/g, "");

        // 2. Body com estrutura correta (options)
        const body = {
            number: cleanPhone,
            text: text,
            options: {
                delay: 1200,
                presence: "composing",
                linkPreview: true
            }
        };

        console.log('Tentando enviar para:', cleanPhone);

        const response = await fetch(`${url}/message/sendText/${encodeURIComponent(instance!)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": token || "",
            },
            body: JSON.stringify(body),
        });

        // 3. Debug melhorado
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Evolution API Error:", JSON.stringify(errorData, null, 2));
            return { success: false, error: errorData?.message || JSON.stringify(errorData) || "Failed to send message" };
        }

        const data = await response.json();

        // 4. Salvar no Supabase
        const { error: insertError } = await supabase.from("messages").insert({
            deal_id: context.dealId,
            contact_id: context.contactId,
            direction: "outbound",
            type: "text",
            content: text,
            status: "sent",
            created_at: new Date().toISOString()
        });

        if (insertError) {
            console.error("Erro ao salvar mensagem no Supabase:", insertError);
            throw new Error("Mensagem enviada, mas falhou ao salvar no histórico: " + insertError.message);
        }

        return { success: true, data };

    } catch (error: any) {
        console.error("sendMessage Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createLead(data: { name: string, phone: string, value: string }) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Normalização Rigorosa do Telefone
        let cleanPhone = data.phone.replace(/\D/g, "");

        // Garante formato com 55 para salvar
        let phoneToSave = cleanPhone;
        if (cleanPhone.length === 10 || cleanPhone.length === 11) {
            phoneToSave = "55" + cleanPhone;
        }

        // 2. Verificar/Criar Contato (Upsert Logic Robusta)
        // Busca por variações (com e sem 55) para evitar duplicatas se o banco estiver sujo
        const possiblePhones = [phoneToSave, cleanPhone];
        if (cleanPhone.startsWith("55")) {
            possiblePhones.push(cleanPhone.substring(2));
        }

        let contactId;

        const { data: existingContacts } = await supabase
            .from("contacts")
            .select("id")
            .in("phone", possiblePhones)
            .limit(1);

        if (existingContacts && existingContacts.length > 0) {
            // Encontrou existente
            contactId = existingContacts[0].id;
            console.log("Contato existente encontrado:", contactId);
        } else {
            // Não encontrou, cria novo com o formato padronizado (com 55)
            const { data: newContact, error: contactError } = await supabase
                .from("contacts")
                .insert({
                    name: data.name,
                    phone: phoneToSave,
                    photo_url: ""
                })
                .select("id")
                .single();

            if (contactError) throw new Error("Erro ao criar contato: " + contactError.message);
            contactId = newContact.id;
            console.log("Novo contato criado:", contactId);
        }

        // 3. Buscar primeira etapa (stage)
        const { data: firstStage } = await supabase
            .from("stages")
            .select("id")
            .order("position", { ascending: true })
            .limit(1)
            .single();

        if (!firstStage) throw new Error("Nenhuma etapa de funil encontrada.");

        // 4. Criar Deal
        const { error: dealError } = await supabase
            .from("deals")
            .insert({
                title: "Oportunidade: " + data.name,
                value: parseFloat(data.value) || 0,
                contact_id: contactId,
                stage_id: firstStage.id,
                status: "open"
            });

        if (dealError) throw new Error("Erro ao criar negócio: " + dealError.message);

        return { success: true };

    } catch (error: any) {
        console.error("createLead Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateDeal(dealId: string, data: any) {
    console.log("updateDeal called:", { dealId, data });
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("deals")
            .update(data)
            .eq("id", dealId);

        if (error) {
            console.error("updateDeal Supabase Error:", error);
            throw error;
        }
        console.log("updateDeal success");
        return { success: true };
    } catch (error: any) {
        console.error("updateDeal Catch Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateContact(contactId: string, data: any) {
    console.log("updateContact called:", { contactId, data });
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("contacts")
            .update(data)
            .eq("id", contactId);

        if (error) {
            console.error("updateContact Supabase Error:", error);
            throw error;
        }
        console.log("updateContact success");
        return { success: true };
    } catch (error: any) {
        console.error("updateContact Catch Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteDeal(dealId: string) {
    console.log("deleteDeal called:", dealId);
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Primeiro deleta mensagens (se não tiver cascade)
        await supabase.from("messages").delete().eq("deal_id", dealId);

        const { error } = await supabase
            .from("deals")
            .delete()
            .eq("id", dealId);

        if (error) {
            console.error("deleteDeal Supabase Error:", error);
            throw error;
        }
        console.log("deleteDeal success");
        return { success: true };
    } catch (error: any) {
        console.error("deleteDeal Catch Error:", error);
        return { success: false, error: error.message };
    }
}

export async function sendMedia(formData: FormData) {
    try {
        const file = formData.get('file') as File;
        const phone = formData.get('phone') as string;
        const dealId = formData.get('dealId') as string;
        const contactId = formData.get('contactId') as string;

        if (!file || !phone || !dealId) {
            throw new Error("Missing required fields: file, phone, dealId");
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const evolutionUrl = process.env.EVOLUTION_API_URL!;
        const evolutionToken = process.env.EVOLUTION_API_TOKEN!;
        const evolutionInstance = process.env.EVOLUTION_INSTANCE!;

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Upload para Supabase Storage
        const sanitizeFilename = (name: string) => {
            return name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "") // Remove acentos
                .replace(/[^a-zA-Z0-9._-]/g, "_"); // Substitui caracteres inválidos por _
        };
        const fileName = `${Date.now()}_${sanitizeFilename(file.name)}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('crm-media')
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) {
            console.error("Supabase Storage Error:", uploadError);
            throw new Error("Failed to upload file to storage");
        }

        // 2. Obter URL Pública
        const { data: publicUrlData } = supabase.storage
            .from('crm-media')
            .getPublicUrl(fileName);

        const mediaUrl = publicUrlData.publicUrl;
        console.log("File uploaded, public URL:", mediaUrl);

        // 3. Enviar via Evolution API
        const cleanPhone = phone.replace(/\D/g, "");
        const mediaType = file.type.startsWith('image/') ? 'image' : 'document';

        const body = {
            number: cleanPhone,
            mediatype: mediaType,
            mimetype: file.type,
            caption: "", // Removido nome do arquivo da legenda
            media: mediaUrl
        };

        const response = await fetch(`${evolutionUrl}/message/sendMedia/${encodeURIComponent(evolutionInstance)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "apikey": evolutionToken,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Evolution API Media Error:", errorData);
            throw new Error("Failed to send media via Evolution API");
        }

        const evolutionData = await response.json();

        // 4. Salvar no Banco de Dados
        const { error: insertError } = await supabase.from("messages").insert({
            deal_id: dealId,
            contact_id: contactId,
            direction: "outbound",
            type: mediaType,
            content: file.name, // Salvar nome do arquivo
            media_url: mediaUrl,
            status: "sent",
            created_at: new Date().toISOString()
        });

        if (insertError) {
            console.error("Error saving media message to DB:", insertError);
            // Não lança erro aqui para não falhar a request pro cliente, já que a msg foi enviada
        }

        return { success: true, data: evolutionData };

    } catch (error: any) {
        console.error("sendMedia Error:", error);
        return { success: false, error: error.message };
    }
}

export async function addNote(dealId: string, content: string) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("notes")
            .insert({
                deal_id: dealId,
                content: content
            });

        if (error) {
            console.error("addNote Supabase Error:", error);
            throw error;
        }

        return { success: true };
    } catch (error: any) {
        console.error("addNote Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createTask(dealId: string, description: string, dueDate: string) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("tasks")
            .insert({
                deal_id: dealId,
                description: description,
                due_date: dueDate,
                is_completed: false
            });

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("createTask Error:", error);
        return { success: false, error: error.message };
    }
}

export async function toggleTask(taskId: string, isCompleted: boolean) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("tasks")
            .update({ is_completed: isCompleted })
            .eq("id", taskId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("toggleTask Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteTask(taskId: string) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", taskId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("deleteTask Error:", error);
        return { success: false, error: error.message };
    }
}

import { revalidatePath } from "next/cache";

export async function createQuickReply(formData: FormData) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const shortcut = formData.get('shortcut') as string;
    const category = formData.get('category') as string;
    const content = formData.get('content') as string;

    if (!content || !category) {
        return { success: false, error: "Conteúdo e Categoria são obrigatórios." };
    }

    const { error } = await supabase
        .from('quick_replies')
        .insert([{ shortcut, category, content }]);

    if (error) {
        console.error("Erro ao criar resposta rápida:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function deleteQuickReply(id: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('quick_replies')
        .delete()
        .eq('id', id);

    if (error) {
        console.error("Erro ao excluir resposta rápida:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function renameQuickReplyCategory(oldName: string, newName: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (!oldName || !newName) {
        return { success: false, error: "Nome antigo e novo são obrigatórios." };
    }

    const { error } = await supabase
        .from('quick_replies')
        .update({ category: newName })
        .eq('category', oldName);

    if (error) {
        console.error("Erro ao renomear categoria:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function updateQuickReply(id: string, formData: FormData) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const shortcut = formData.get('shortcut') as string;
    const category = formData.get('category') as string;
    const content = formData.get('content') as string;

    if (!content || !category) {
        return { success: false, error: "Conteúdo e Categoria são obrigatórios." };
    }

    const { error } = await supabase
        .from('quick_replies')
        .update({ shortcut, category, content })
        .eq('id', id);

    if (error) {
        console.error("Erro ao atualizar resposta rápida:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function markAsWon(dealId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('deals')
        .update({
            status: 'won',
            closed_at: new Date().toISOString()
        })
        .eq('id', dealId);

    if (error) {
        console.error("Erro ao marcar como ganho:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
}

export async function markAsLost(dealId: string, reason: string, details: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('deals')
        .update({
            status: 'lost',
            closed_at: new Date().toISOString(),
            lost_reason: reason,
            lost_details: details
        })
        .eq('id', dealId);

    if (error) {
        console.error("Erro ao marcar como perdido:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
}


export async function recoverDeal(dealId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('deals')
        .update({
            status: 'open',
            closed_at: null,
            lost_reason: null,
            lost_details: null
        })
        .eq('id', dealId);

    if (error) {
        console.error("Erro ao recuperar lead:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
}

// --- TAGS SYSTEM ---

export async function createTag(name: string, color: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    if (!name || !color) {
        return { success: false, error: "Nome e cor são obrigatórios." };
    }

    const { error } = await supabase
        .from('tags')
        .insert([{ name, color }]);

    if (error) {
        console.error("Erro ao criar tag:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function deleteTag(tagId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

    if (error) {
        console.error("Erro ao excluir tag:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/settings');
    revalidatePath('/');
    return { success: true };
}

export async function addTagToDeal(dealId: string, tagId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('deal_tags')
        .insert([{ deal_id: dealId, tag_id: tagId }]);

    if (error) {
        // Ignora erro de duplicidade (unique constraint)
        if (error.code === '23505') return { success: true };

        console.error("Erro ao adicionar tag ao deal:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
}

export async function removeTagFromDeal(dealId: string, tagId: string) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
        .from('deal_tags')
        .delete()
        .match({ deal_id: dealId, tag_id: tagId });

    if (error) {
        console.error("Erro ao remover tag do deal:", error);
        return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
}
