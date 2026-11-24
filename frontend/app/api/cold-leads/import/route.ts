import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTenantId } from '@/app/actions';
import * as XLSX from 'xlsx';
import { ColdLeadInsert } from '@/types/cold-lead';
import { canonicalizeNichoOrDefault, nichoKey } from '@/lib/nicho';
import { canonicalPhoneOrNull, chunk, listTenantNichos } from '@/lib/cold-leads-api';

const INSERT_CHUNK = 500;

export async function POST(request: NextRequest) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(sheet) as any[];

        if (!rawData || rawData.length === 0) {
            return NextResponse.json({ error: 'Arquivo vazio ou formato inválido' }, { status: 400 });
        }

        const validLeads: ColdLeadInsert[] = [];
        const errors: string[] = [];
        let invalid = 0;
        let duplicates = 0;

        const tenantId = await getTenantId();

        // Nichos ja existentes do tenant (pra casar e nao duplicar por caixa/acento).
        // Paginado: a consulta simples cortava em 1000 linhas.
        const existingNichos = await listTenantNichos(supabase, tenantId);

        // Telefones ja vistos nesta planilha (canonico -> linha)
        const seenPhones = new Map<string, number>();

        // Expected columns: Nome, Telefone, Nicho, Site, Instagram, Google, Notas
        rawData.forEach((row, index) => {
            const lineNum = index + 2; // +1 header, +1 1-based index

            const nome = row['Nome'] || row['nome'];
            const telefoneRaw = row['Telefone'] || row['telefone'];
            const nicho = row['Nicho'] || row['nicho'];

            if (!nome || !telefoneRaw) {
                invalid++;
                errors.push(`Linha ${lineNum}: Campos obrigatórios (Nome, Telefone) faltando.`);
                return;
            }

            // Telefone no canonico (55 + DDD + numero, so digitos), igual ao banco
            const telefone = canonicalPhoneOrNull(telefoneRaw);
            if (!telefone) {
                invalid++;
                errors.push(`Linha ${lineNum}: Telefone inválido (${String(telefoneRaw).trim()}).`);
                return;
            }

            const firstLine = seenPhones.get(telefone);
            if (firstLine !== undefined) {
                duplicates++;
                errors.push(`Linha ${lineNum}: Telefone repetido na planilha (igual à linha ${firstLine}).`);
                return;
            }
            seenPhones.set(telefone, lineNum);

            // Canonicaliza: une apelidos (vet -> Veterinaria), casa com nicho existente
            // (ignora caixa/acento) ou Title Case. Vazio/lixo vira "Não informado".
            const nichoCanonico = canonicalizeNichoOrDefault(nicho ? String(nicho) : '', existingNichos);
            // se for um nicho novo, ja entra na lista pra as proximas linhas casarem
            if (!existingNichos.some((e) => nichoKey(e) === nichoKey(nichoCanonico))) {
                existingNichos.push(nichoCanonico);
            }

            // Mesmo conjunto de chaves em todas as linhas (o upsert em lote manda
            // null pra chave ausente). Sem stage_id/status: o trigger poe na etapa
            // de entrada do funil padrao e deriva o status dela.
            validLeads.push({
                tenant_id: tenantId,
                nome: String(nome).trim(),
                telefone,
                nicho: nichoCanonico,
                site_url: row['Site'] || row['site'] || null,
                instagram_url: row['Instagram'] || row['instagram'] || null,
                google_meu_negocio_url: row['Google'] || row['google'] || null,
                notas: row['Notas'] || row['notas'] || null,
                tentativas: 0
            });
        });

        if (validLeads.length === 0) {
            return NextResponse.json({
                error: 'Nenhum lead válido encontrado.',
                details: errors
            }, { status: 400 });
        }

        // Insere em blocos; telefone que ja existe no tenant e ignorado pelo indice
        // unico (tenant_id, telefone) e contado como duplicado.
        let imported = 0;
        let failed = 0;
        for (const part of chunk(validLeads, INSERT_CHUNK)) {
            const { data, error: insertError } = await supabase
                .from('cold_leads')
                .upsert(part, { onConflict: 'tenant_id,telefone', ignoreDuplicates: true })
                .select('id');

            if (insertError) {
                console.error('Import chunk error:', insertError);
                failed += part.length;
                errors.push(`Erro ao gravar um bloco de ${part.length} leads: ${insertError.message}`);
                continue;
            }
            const inserted = data?.length ?? 0;
            imported += inserted;
            duplicates += part.length - inserted;
        }

        if (imported === 0 && failed > 0) {
            return NextResponse.json({ error: 'Falha ao gravar os leads.', details: errors }, { status: 500 });
        }

        return NextResponse.json({
            message: duplicates > 0
                ? `Importação concluída. ${duplicates} lead(s) já existiam e foram ignorados.`
                : 'Importação concluída',
            totalImported: imported,
            duplicates,
            invalid,
            failed,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (err) {
        console.error('Import error:', err);
        return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 });
    }
}
